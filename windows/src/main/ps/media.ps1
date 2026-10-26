# Dynamic Island Music - reads and controls the system media session (SMTC) on Windows 10/11.
# It runs as a small helper that answers one JSON request per line on stdin with one JSON line on stdout.
# It only talks to the media controls of Windows. It does not touch the network or any file.

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

function Invoke-Control([string]$cmd, [string]$prefer, $arg) {
    $s = Get-Session $prefer
    if (-not $s) { return $false }
    switch ($cmd) {
        'toggle' { return (Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
        'play' { return (Await ($s.TryPlayAsync()) ([bool])) }
        'pause' { return (Await ($s.TryPauseAsync()) ([bool])) }
        'next' { return (Await ($s.TrySkipNextAsync()) ([bool])) }
        'prev' { return (Await ($s.TrySkipPreviousAsync()) ([bool])) }
        'seek' { return (Await ($s.TryChangePlaybackPositionAsync([long]([double]$arg * 10000000))) ([bool])) }
        default { return $false }
    }
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
