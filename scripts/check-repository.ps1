$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Source = Join-Path $Root "src\index.template.html"
$Readable = Join-Path $Root "dist\index.html"
$SelfExtract = Join-Path $Root "dist\index.self-extract.html"
$BuildScript = Join-Path $Root "build-standalone.ps1"

& $BuildScript

$Errors = New-Object System.Collections.Generic.List[string]

foreach ($Path in @($Source, $Readable, $SelfExtract)) {
  if (-not (Test-Path $Path)) {
    $Errors.Add("Missing required file: $Path")
  }
}

if ($Errors.Count -eq 0) {
  $Text = [System.IO.File]::ReadAllText($Source, [System.Text.Encoding]::UTF8)
  if ($Text -notmatch "connect-src 'none'") { $Errors.Add("CSP must contain connect-src 'none'.") }
  if ($Text -notmatch "APP:BEGIN") { $Errors.Add("APP:BEGIN marker is missing.") }
  if ($Text -notmatch "APP:END") { $Errors.Add("APP:END marker is missing.") }
  if ($Text -notmatch "APP:HELP:BEGIN") { $Errors.Add("APP:HELP:BEGIN marker is missing.") }
  if ($Text -notmatch "Archive Explorer") { $Errors.Add("Archive Explorer title is missing.") }
  if ($Text -match "__[A-Z0-9_]+__") { $Errors.Add("Unresolved build placeholder found.") }

  $DistText = [System.IO.File]::ReadAllText($Readable, [System.Text.Encoding]::UTF8)
  if ($DistText -ne $Text) { $Errors.Add("dist/index.html is not synchronized with src/index.template.html. Run build-standalone.bat.") }
}

if ($Errors.Count -gt 0) {
  Write-Host "Repository check failed:" -ForegroundColor Red
  foreach ($Message in $Errors) { Write-Host " - $Message" -ForegroundColor Red }
  exit 1
}

Write-Host "Repository check passed." -ForegroundColor Green
