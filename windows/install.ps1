# Instala Dynamic Island Music en Windows con una línea (sin permisos de administrador).
#
#   irm https://raw.githubusercontent.com/MoisesGuerraDev/dynamic-island-music/main/windows/install.ps1 | iex
#
# Descarga el instalador y su suma de verificación desde GitHub Releases, comprueba que coinciden y lo ejecuta
# en silencio (se instala solo para tu usuario). Descargar con PowerShell no marca el archivo como "de internet",
# así que SmartScreen no avisa. Léelo antes de ejecutarlo: son pocas líneas.
param([string]$Repo = $(if ($env:DIM_REPO) { $env:DIM_REPO } else { 'MoisesGuerraDev/dynamic-island-music' }))

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Version.Major -lt 10) { throw 'Necesitas Windows 10 u 11.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = "https://github.com/$Repo/releases/latest/download"
$tmp = Join-Path $env:TEMP 'dynamic-island-music'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$exe = Join-Path $tmp 'DynamicIslandMusic-Setup.exe'
$sum = Join-Path $tmp 'DynamicIslandMusic-Setup.exe.sha256'

try {
    Write-Host 'Descargando Dynamic Island Music…'
    Invoke-WebRequest "$base/DynamicIslandMusic-Setup.exe" -OutFile $exe -UseBasicParsing
    Invoke-WebRequest "$base/DynamicIslandMusic-Setup.exe.sha256" -OutFile $sum -UseBasicParsing

    Write-Host 'Comprobando la descarga…'
    $expected = ((Get-Content $sum -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -ne $actual) { throw 'La suma de verificación no coincide. No se instaló nada.' }

    Get-Process -Name 'Dynamic Island Music' -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host 'Instalando…'
    Start-Process -FilePath $exe -ArgumentList '/S' -Wait
    Write-Host 'Listo. La isla aparece arriba y al centro; el icono está junto al reloj.' -ForegroundColor Green
}
finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
