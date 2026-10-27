# Dynamic Island Music - reads and controls the system media session (SMTC) on Windows 10/11.
# It runs as a small helper that answers one JSON request per line on stdin with one JSON line on stdout.
# It only talks to the media controls of Windows (and presses the media keys when a player ignores them).
# It does not touch the network or any file.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

function Send($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 6))
    [Console]::Out.Flush()
}

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
    $null = [Windows.Storage.Streams.IRandomAccessStreamReference, Windows.Storage.Streams, ContentType=WindowsRuntime]
    $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
            $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
        })[0]

    function Await($op, [Type]$resultType) {
        $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
        if (-not $task.Wait(6000)) { throw 'La operacion tardo demasiado.' }
        return $task.Result
    }

    $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
}
catch {
    Send @{ ready = $false; error = $_.Exception.Message }
    exit 1
}

$script:coverKey = ''
$script:coverTries = 0

function Test-Match([string]$appId, [string]$prefer) {
    $id = $appId.ToLowerInvariant()
    switch ($prefer) {
        'spotify' { return $id.Contains('spotify') }
        'apple' { return ($id.Contains('applemusic') -or $id.Contains('itunes') -or $id.Contains('apple')) }
        'browser' { return ($id.Contains('chrome') -or $id.Contains('msedge') -or $id.Contains('firefox') -or $id.Contains('brave') -or $id.Contains('opera') -or $id.Contains('vivaldi')) }
        default { return $false }
    }
}

function Get-Session([string]$prefer) {
    $all = @($mgr.GetSessions())
    if ($all.Count -eq 0) { return $null }
    $pool = $all
    if ($prefer -and $prefer -ne 'auto') {
        $m = @($all | Where-Object { Test-Match $_.SourceAppUserModelId $prefer })
        if ($m.Count -gt 0) { $pool = $m }
    }
    $playing = @($pool | Where-Object { $_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' })
    if ($playing.Count -gt 0) { return $playing[0] }
    $cur = $mgr.GetCurrentSession()
    if ($cur -and ($pool | Where-Object { $_.SourceAppUserModelId -eq $cur.SourceAppUserModelId })) { return $cur }
    return $pool[0]
}

function Get-Cover($props) {
    try {
        $thumb = $props.Thumbnail
        if (-not $thumb) { return $null }
        $stream = Await ($thumb.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        try {
            $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
            $ms = New-Object System.IO.MemoryStream
            $net.CopyTo($ms)
            if ($ms.Length -eq 0) { return $null }
            $mime = $stream.ContentType
            if (-not $mime) { $mime = 'image/jpeg' }
            return 'data:' + $mime + ';base64,' + [Convert]::ToBase64String($ms.ToArray())
        }
        finally { $stream.Dispose() }
    }
    catch { return $null }
}

function Get-State([string]$prefer) {
    $s = Get-Session $prefer
    if (-not $s) { return @{ session = $false } }

    $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $pb = $s.GetPlaybackInfo()
    $tl = $s.GetTimelineProperties()
    $playing = ($pb.PlaybackStatus.ToString() -eq 'Playing')

    $pos = $tl.Position.TotalSeconds
    $dur = $tl.EndTime.TotalSeconds - $tl.StartTime.TotalSeconds
    if ($playing -and $tl.LastUpdatedTime.Year -gt 2000) {
        $rate = 1.0
        if ($null -ne $pb.PlaybackRate) { $rate = [double]$pb.PlaybackRate }
        $delta = ([DateTimeOffset]::UtcNow - $tl.LastUpdatedTime).TotalSeconds
        if ($delta -gt 0 -and $delta -lt 36000) { $pos += $delta * $rate }
    }
    if ($dur -lt 0) { $dur = 0 }
    if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }
    if ($pos -lt 0) { $pos = 0 }

    $key = '' + $props.Artist + '|' + $props.Title + '|' + $props.AlbumTitle
    $r = @{
        session  = $true
        app      = '' + $s.SourceAppUserModelId
        title    = '' + $props.Title
        artist   = '' + $props.Artist
        album    = '' + $props.AlbumTitle
        playing  = $playing
        status   = $pb.PlaybackStatus.ToString()
        position = [math]::Round($pos, 1)
        duration = [math]::Round($dur, 1)
        key      = $key
        canNext  = [bool]$pb.Controls.IsNextEnabled
        canPrev  = [bool]$pb.Controls.IsPreviousEnabled
        canSeek  = [bool]$pb.Controls.IsPlaybackPositionEnabled
    }

    if ($key -ne $script:coverKey) {
        if ($script:coverTries -lt 8) {
            $script:coverTries++
            $cover = Get-Cover $props
            if ($cover) { $r.cover = $cover; $script:coverKey = $key; $script:coverTries = 0 }
        }
    }
    return $r
}

$script:keys = $false
function Press-MediaKey([byte]$vk) {
    if (-not $script:keys) {
        Add-Type -Namespace DIM -Name Keys -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);'
        $script:keys = $true
    }
    [DIM.Keys]::keybd_event($vk, 0, 1, [UIntPtr]::Zero)
    [DIM.Keys]::keybd_event($vk, 0, 3, [UIntPtr]::Zero)
    return $true
}

function Invoke-Control([string]$cmd, [string]$prefer, $arg) {
    $s = Get-Session $prefer
    if (-not $s) { return $false }
    $before = $s.GetPlaybackInfo().PlaybackStatus.ToString()
    $ok = $false
    try {
        switch ($cmd) {
            'toggle' { $ok = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
            'play' { $ok = Await ($s.TryPlayAsync()) ([bool]) }
            'pause' { $ok = Await ($s.TryPauseAsync()) ([bool]) }
            'next' { $ok = Await ($s.TrySkipNextAsync()) ([bool]) }
            'prev' { $ok = Await ($s.TrySkipPreviousAsync()) ([bool]) }
            'seek' { return (Await ($s.TryChangePlaybackPositionAsync([long]([double]$arg * 10000000))) ([bool])) }
            default { return $false }
        }
    }
    catch { $ok = $false }
    if ($cmd -in 'toggle', 'play', 'pause') {
        # Some players accept the command and do nothing. If the state did not move, press the play/pause key.
        # Slow players take a moment to report the change, so wait for it before deciding: pressing the key too early would toggle twice.
        if ($ok) {
            $ok = $false
            for ($i = 0; $i -lt 8 -and -not $ok; $i++) {
                Start-Sleep -Milliseconds 150
                $ok = ($s.GetPlaybackInfo().PlaybackStatus.ToString() -ne $before)
            }
        }
        if (-not $ok -and -not ($cmd -eq 'play' -and $before -eq 'Playing') -and -not ($cmd -eq 'pause' -and $before -ne 'Playing')) {
            return (Press-MediaKey 0xB3)
        }
        return $ok
    }
    if (-not $ok -and $cmd -eq 'next') { return (Press-MediaKey 0xB0) }
    if (-not $ok -and $cmd -eq 'prev') { return (Press-MediaKey 0xB1) }
    return $ok
}


$script:audioReady = $false
function Initialize-Audio {
    if ($script:audioReady) { return }
    Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DIM {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }

  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr a, int b, out IntPtr c);
    int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c);
    int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  }

  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl2 session);
  }

  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int GetState(out int state);
    int GetDisplayName(out IntPtr name);
    int SetDisplayName(IntPtr name, IntPtr ctx);
    int GetIconPath(out IntPtr path);
    int SetIconPath(IntPtr path, IntPtr ctx);
    int GetGroupingParam(out Guid g);
    int SetGroupingParam(ref Guid g, IntPtr ctx);
    int RegisterAudioSessionNotification(IntPtr n);
    int UnregisterAudioSessionNotification(IntPtr n);
    int GetSessionIdentifier(out IntPtr id);
    int GetSessionInstanceIdentifier(out IntPtr id);
    int GetProcessId(out uint pid);
  }

  [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation {
    int GetPeakValue(out float peak);
  }

  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid ctx);
    int GetMasterVolume(out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  public static class Audio {
    /// Sound sessions of the programs called `names` (without .exe): [found 0/1, loudest peak 0..1, muted in the Windows mixer 0/1, changed count].
    public static double[] Query(string[] names, bool unmute) {
      double found = 0, peak = 0, muted = 0, changed = 0;
      var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
      IMMDevice device;
      enumerator.GetDefaultAudioEndpoint(0, 1, out device);
      Guid iid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
      object manager;
      device.Activate(ref iid, 23, IntPtr.Zero, out manager);
      IAudioSessionEnumerator sessions;
      ((IAudioSessionManager2)manager).GetSessionEnumerator(out sessions);
      int count;
      sessions.GetCount(out count);
      for (int i = 0; i < count; i++) {
        IAudioSessionControl2 control;
        sessions.GetSession(i, out control);
        uint pid;
        control.GetProcessId(out pid);
        string name;
        try { name = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { continue; }
        bool match = false;
        foreach (string n in names) if (name == n) match = true;
        if (!match) continue;
        found = 1;
        float p;
        ((IAudioMeterInformation)control).GetPeakValue(out p);
        if (p > peak) peak = p;
        var volume = (ISimpleAudioVolume)control;
        bool isMuted; float level;
        volume.GetMute(out isMuted);
        volume.GetMasterVolume(out level);
        if (isMuted || level < 0.02f) {
          muted = 1;
          if (unmute) {
            Guid ctx = Guid.Empty;
            volume.SetMute(false, ref ctx);
            if (level < 0.02f) volume.SetMasterVolume(1.0f, ref ctx);
            changed++;
          }
        }
      }
      return new double[] { found, peak, muted, changed };
    }
  }
}
'@
    $script:audioReady = $true
}

$script:winReady = $false
function Initialize-Win {
    if ($script:winReady) { return }
    Add-Type -Namespace DIM -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);'
    $script:winReady = $true
}

Send @{ ready = $true }

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Trim().Length -eq 0) { continue }
    try { $req = $line | ConvertFrom-Json } catch { continue }

    $reply = @{ id = $req.id; ok = $true }
    try {
        $prefer = 'auto'
        if ($req.prefer) { $prefer = [string]$req.prefer }
        if ($req.cmd -eq 'state') {
            $st = Get-State $prefer
            foreach ($k in $st.Keys) { $reply[$k] = $st[$k] }
        }
        elseif ($req.cmd -eq 'ping') { }
        elseif ($req.cmd -eq 'focus') {
            # Brings the window of the browser to the front (Windows cannot pick a tab from outside).
            Initialize-Win
            $names = [string[]]@($req.names | ForEach-Object { [string]$_ })
            $p = Get-Process -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.ProcessName.ToLowerInvariant() -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
            if ($p) {
                [void][DIM.Win]::ShowWindow($p.MainWindowHandle, 9)
                $reply.done = [DIM.Win]::SetForegroundWindow($p.MainWindowHandle)
            } else { $reply.done = $false }
        }
        elseif ($req.cmd -eq 'audio') {
            # Is the program sending sound to the speakers, and is it muted in the Windows mixer? (Only reads, unless unmute is set.)
            Initialize-Audio
            $names = [string[]]@($req.names | ForEach-Object { [string]$_ })
            $r = [DIM.Audio]::Query($names, [bool]$req.unmute)
            $reply.found = ($r[0] -eq 1)
            $reply.peak = [double]$r[1]
            $reply.muted = ($r[2] -eq 1)
            $reply.changed = [int]$r[3]
        }
        else {
            $reply.done = Invoke-Control ([string]$req.cmd) $prefer $req.arg
        }
    }
    catch {
        $reply.ok = $false
        $reply.error = $_.Exception.Message
    }
    Send $reply
}
