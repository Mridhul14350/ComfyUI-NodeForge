<#
.SYNOPSIS
    Replaces the locally installed ComfyUI-NodeForge with this dev copy, for testing.

.DESCRIPTION
    Copies only the runtime files of this dev copy into the installed ComfyUI
    custom node: __init__.py, nodes/ and web/. Dev-only files (tests, scripts,
    docs, AGENTS.md, .gitignore, etc.) are not copied. No backup is made.
    The installed node folder is created if it does not exist.

.EXAMPLE
    .\scripts\sync-to-comfyui.ps1
#>
[CmdletBinding()]
param(
    [string]$ComfyRoot = "G:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI",
    [string]$NodeName = "ComfyUI-NodeForge"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $ComfyRoot "custom_nodes\$NodeName"

if (-not (Test-Path (Join-Path $ComfyRoot "main.py"))) {
    throw "ComfyUI not found at '$ComfyRoot' (main.py missing)."
}

New-Item -ItemType Directory -Force -Path $target | Out-Null

# Runtime files only. Folders are mirrored so stale modules are removed;
# __pycache__ is never copied.
$folders = @("nodes", "web")
$files = @("__init__.py")

foreach ($folder in $folders) {
    $src = Join-Path $repoRoot $folder
    $dst = Join-Path $target $folder
    Write-Host "Syncing $folder\"
    robocopy $src $dst /MIR /XD __pycache__ /NFL /NDL /NJH /NJS | Out-Null
    # robocopy: 0-7 are success codes, 8+ are failures.
    if ($LASTEXITCODE -ge 8) { throw "Sync of $folder failed (robocopy exit $LASTEXITCODE)." }
}

foreach ($file in $files) {
    Write-Host "Copying $file"
    Copy-Item -Path (Join-Path $repoRoot $file) -Destination (Join-Path $target $file) -Force
}

Write-Host "Done. Restart ComfyUI to load the updated node."
