$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Source = Join-Path $Root "src\index.template.html"
$Dist = Join-Path $Root "dist"
$Readable = Join-Path $Dist "index.html"
$SelfExtract = Join-Path $Dist "index.self-extract.html"
$Report = Join-Path $Dist "build-size-report.json"
$NoJekyll = Join-Path $Dist ".nojekyll"

if (-not (Test-Path $Source)) {
  throw "Source not found: $Source"
}
if (-not (Test-Path $Dist)) {
  New-Item -ItemType Directory -Path $Dist | Out-Null
}

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Html = [System.IO.File]::ReadAllText($Source, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($Readable, $Html, $Utf8NoBom)

$HtmlBytes = $Utf8NoBom.GetBytes($Html)
$Memory = New-Object System.IO.MemoryStream
$Gzip = New-Object System.IO.Compression.GZipStream($Memory, [System.IO.Compression.CompressionMode]::Compress, $true)
$Gzip.Write($HtmlBytes, 0, $HtmlBytes.Length)
$Gzip.Dispose()
$CompressedBytes = $Memory.ToArray()
$Memory.Dispose()
$Payload = [Convert]::ToBase64String($CompressedBytes)

$Loader = @'
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>Archive Explorer</title>
</head>
<body>
<script>
(async()=>{try{
const b=atob("__PAYLOAD__"),a=new Uint8Array(b.length);
for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);
const s=new Blob([a]).stream().pipeThrough(new DecompressionStream("gzip"));
const h=await new Response(s).text();
document.open();document.write(h);document.close();
}catch(e){document.body.textContent="Archive Explorer could not start in this browser.";console.error(e)}})();
</script>
</body>
</html>
'@
$Loader = $Loader.Replace("__PAYLOAD__", $Payload)
[System.IO.File]::WriteAllText($SelfExtract, $Loader, $Utf8NoBom)

$ReadableBytes = (Get-Item $Readable).Length
$SelfBytes = (Get-Item $SelfExtract).Length
$ReportObject = [ordered]@{
  generatedAt = (Get-Date).ToString("o")
  readable = [ordered]@{
    path = "dist/index.html"
    bytes = $ReadableBytes
    mb = [Math]::Round($ReadableBytes / 1MB, 3)
  }
  selfExtract = [ordered]@{
    path = "dist/index.self-extract.html"
    bytes = $SelfBytes
    mb = [Math]::Round($SelfBytes / 1MB, 3)
  }
  gzipPayloadBytes = $CompressedBytes.Length
}
$Json = $ReportObject | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($Report, $Json, $Utf8NoBom)
[System.IO.File]::WriteAllText($NoJekyll, "", $Utf8NoBom)

Write-Host "Built:"
Write-Host "  $Readable ($ReadableBytes bytes)"
Write-Host "  $SelfExtract ($SelfBytes bytes)"
Write-Host "  $Report"
