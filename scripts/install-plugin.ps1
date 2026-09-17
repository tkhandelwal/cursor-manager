param(
  [string]$CursorHome = (Join-Path $HOME ".cursor")
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pluginSource = Join-Path $root "plugin"
$destinationDirectory = Join-Path $CursorHome "plugins\local"
$destination = Join-Path $destinationDirectory "cursor-manager"

New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null

if (Test-Path $destination) {
  $existing = Get-Item $destination -Force
  if (-not ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "$destination exists and is not a link. Move or remove it, then run this script again."
  }
  [IO.Directory]::Delete($destination)
}

New-Item -ItemType Junction -Path $destination -Target $pluginSource | Out-Null

Write-Output "Linked Cursor Manager into $destination"
Write-Output "Reload Cursor: Command Palette -> Developer: Reload Window"
Write-Output "Then open Customize -> Plugins and enable cursor-manager (user scope)."
