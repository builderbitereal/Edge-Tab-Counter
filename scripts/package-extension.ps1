param(
  [string]$OutputDirectory = "dist"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$safeVersion = $manifest.version -replace "[^0-9A-Za-z.-]", "-"
$zipName = "edge-tab-counter-v$safeVersion.zip"
$outputPath = Join-Path $root $OutputDirectory
$zipPath = Join-Path $outputPath $zipName

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$items = @(
  "manifest.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "assets",
  "src",
  "docs"
)

$existingItems = $items |
  ForEach-Object { Join-Path $root $_ } |
  Where-Object { Test-Path $_ }

Compress-Archive -Path $existingItems -DestinationPath $zipPath -Force
Write-Host "Created $zipPath"
