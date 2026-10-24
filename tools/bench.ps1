# ENKAZ performans olcumu: sunucuyu acar, ayri Chrome profiliyle bench sayfasini calistirir.
param([int]$Sec = 30, [string]$Q = 'ultra', [string]$Extra = '', [string]$Flags = '--force-high-performance-gpu', [string]$Tag = '')
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$log = Join-Path $root 'reports\bench_log.txt'
New-Item -ItemType Directory -Force (Join-Path $root 'reports') | Out-Null
function Ping { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8777/__ping | Out-Null; return $true } catch { return $false } }
if (-not (Ping)) {
  Start-Process -FilePath 'node' -ArgumentList 'serve.mjs' -WorkingDirectory $root -WindowStyle Minimized
  for ($i = 0; $i -lt 50 -and -not (Ping); $i++) { Start-Sleep -Milliseconds 200 }
}
if ($Tag -eq '') { $Tag = $Q }
Remove-Item (Join-Path $root "reports\bench_$Tag.json") -ErrorAction SilentlyContinue
$prof = Join-Path $root '.bench-profile'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$url = "http://127.0.0.1:8777/?bench=$Sec&q=$Q&tag=$Tag$Extra"
$cargs = @("--user-data-dir=`"$prof`"") + ($Flags -split ' ' | Where-Object { $_ }) + @('--no-first-run', '--no-default-browser-check', '--new-window', '--start-maximized', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', $url)
Start-Process -FilePath $chrome -ArgumentList $cargs
"$(Get-Date -Format s) basladi $url" | Out-File -Append -Encoding utf8 $log
$deadline = (Get-Date).AddSeconds($Sec + 60)
while ((Get-Date) -lt $deadline) {
  if (Test-Path (Join-Path $root "reports\bench_$Tag.json")) { break }
  Start-Sleep -Seconds 2
}
Start-Sleep -Seconds 1
Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -like '*bench-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
"$(Get-Date -Format s) bitti" | Out-File -Append -Encoding utf8 $log
