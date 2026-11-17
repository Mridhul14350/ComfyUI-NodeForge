<#
.SYNOPSIS
    Restarts the local ComfyUI so custom node changes are loaded.

.DESCRIPTION
    Finds the running ComfyUI python process (its command line runs ComfyUI\main.py
    from the install folder), stops it by PID, waits for the port to be released,
    then starts it again with the same arguments and PYTHONUTF8=1. Waits until
    the server answers /system_stats. Falls back to default arguments when
    ComfyUI is not running.

.EXAMPLE
    .\scripts\restart-comfyui.ps1
#>
[CmdletBinding()]
param(
    [string]$ComfyRoot = "G:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI",
    [int]$Port = 8188,
    [int]$StartupTimeoutSec = 180
)

$ErrorActionPreference = "Stop"

$python = Join-Path $ComfyRoot ".venv\Scripts\python.exe"
$workDir = Split-Path -Parent $ComfyRoot
$mainPattern = [regex]::Escape("ComfyUI\main.py")

if (-not (Test-Path $python)) { throw "ComfyUI python not found at '$python'." }

$running = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -match $mainPattern -and $_.CommandLine -match [regex]::Escape($ComfyRoot) })

$launchArgs = $null
if ($running.Count -gt 0) {
    $launchArgs = ($running[0].CommandLine -replace '^\s*"?[^"]*python(w)?\.exe"?\s*', '')
    Write-Host "Stopping ComfyUI (PID $(($running | ForEach-Object ProcessId) -join ', '))"
    foreach ($proc in $running) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        $alive = Get-Process -Id ($running | ForEach-Object ProcessId) -ErrorAction SilentlyContinue
        if (-not $alive) { break }
        Start-Sleep -Milliseconds 500
    }
} else {
    Write-Host "ComfyUI is not running; starting it with default arguments."
    $launchArgs = "-s ComfyUI\main.py"
}

$portDeadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $portDeadline) {
    $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $busy) { break }
    Start-Sleep -Milliseconds 500
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is still in use. ComfyUI was not restarted."
}

$env:PYTHONUTF8 = "1"
Write-Host "Starting: $python $launchArgs"
Start-Process -FilePath $python -ArgumentList $launchArgs -WorkingDirectory $workDir -WindowStyle Minimized | Out-Null

$url = "http://127.0.0.1:$Port/system_stats"
$deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        if ($resp.StatusCode -eq 200) {
            Write-Host "ComfyUI is up at http://127.0.0.1:$Port"
            exit 0
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}
throw "ComfyUI did not respond within $StartupTimeoutSec seconds. Check its console window."
