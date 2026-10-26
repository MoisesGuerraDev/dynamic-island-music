# Dynamic Island Music - small Windows helper for things Electron cannot read on its own:
#   fg      app in the foreground (to label where a copied text came from)
#   qstate  is a full-screen game running (SHQueryUserNotificationState)
#   gpu     GPU load and temperature (NVIDIA through nvidia-smi, any GPU through Windows counters)
#   sysinfo PC model, GPU names, battery presence
# It answers one JSON request per line on stdin with one JSON line on stdout. It only reads local
# information about this PC. It does not touch the network or write any file.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

function Send($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 6))
    [Console]::Out.Flush()
}

try {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DimWin {
    [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
}
catch {
    Send @{ ready = $false; error = $_.Exception.Message }
    exit 1
}

$script:nvidia = $null
foreach ($p in @(
        (Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'),
        (Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVSMI\nvidia-smi.exe'))) {
    if ($p -and (Test-Path -LiteralPath $p)) { $script:nvidia = $p; break }
}

function Get-Foreground {
    $h = [DimWin]::GetForegroundWindow()
    if ($h -eq [IntPtr]::Zero) { return @{ name = ''; title = '' } }
    [uint32]$fgPid = 0
    [void][DimWin]::GetWindowThreadProcessId($h, [ref]$fgPid)
    $proc = Get-Process -Id $fgPid -ErrorAction SilentlyContinue
    if (-not $proc) { return @{ name = ''; title = '' } }
    return @{ name = '' + $proc.ProcessName; title = '' + $proc.MainWindowTitle }
}

function Get-QState {
    $s = 0
    $hr = [DimWin]::SHQueryUserNotificationState([ref]$s)
    if ($hr -ne 0) { return @{ qstate = 0 } }
    return @{ qstate = [int]$s }
}

function Get-Gpu {
    $r = @{ gpu = $null; gpuTemp = $null; gpuName = $null }
    if ($script:nvidia) {
        try {
            $line = (& $script:nvidia '--query-gpu=utilization.gpu,temperature.gpu,name' '--format=csv,noheader,nounits' 2>$null | Select-Object -First 1)
            if ($line) {
                $parts = $line.Split(',')
                $r.gpu = [double]$parts[0].Trim()
                $r.gpuTemp = [double]$parts[1].Trim()
                $r.gpuName = $parts[2].Trim()
                return $r
            }
        }
        catch { }
    }
    try {
        $rows = @(Get-CimInstance -Query "SELECT Name, UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine WHERE Name LIKE '%engtype_3D%'")
        $groups = @{}
        foreach ($row in $rows) {
            # Name looks like: pid_123_luid_0x00000000_0x0000F3D8_phys_0_eng_0_engtype_3D
            $m = [regex]::Match($row.Name, 'luid_[^_]+_[^_]+_phys_\d+_eng_\d+')
            $k = if ($m.Success) { $m.Value } else { 'x' }
            if (-not $groups.ContainsKey($k)) { $groups[$k] = 0.0 }
            $groups[$k] += [double]$row.UtilizationPercentage
        }
        if ($groups.Count -gt 0) {
            $r.gpu = [math]::Min(100.0, ($groups.Values | Measure-Object -Maximum).Maximum)
        }
    }
    catch { }
    return $r
}

function Get-SysInfo {
    $r = @{ model = $null; gpus = @(); battery = $false }
    try {
        $cs = Get-CimInstance Win32_ComputerSystem
        $r.model = (('' + $cs.Manufacturer + ' ' + $cs.Model).Trim())
    }
    catch { }
    try { $r.gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { '' + $_.Name }) } catch { }
    try { $r.battery = (@(Get-CimInstance Win32_Battery).Count -gt 0) } catch { }
    return $r
}

Send @{ ready = $true }

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Trim().Length -eq 0) { continue }
    try { $req = $line | ConvertFrom-Json } catch { continue }

    $reply = @{ id = $req.id; ok = $true }
    try {
        $data = switch ([string]$req.cmd) {
            'fg' { Get-Foreground }
            'qstate' { Get-QState }
            'gpu' { Get-Gpu }
            'sysinfo' { Get-SysInfo }
            default { @{} }
        }
        foreach ($k in $data.Keys) { $reply[$k] = $data[$k] }
    }
    catch {
        $reply.ok = $false
        $reply.error = $_.Exception.Message
    }
    Send $reply
}
