# Kisa performans olcumu: bot gozunden (fp) ve takip kamerasindan 30'ar saniye
$ErrorActionPreference = 'SilentlyContinue'
$b = (Join-Path $PSScriptRoot 'bench.ps1')
& $b -Sec 30 -Q ultra -Tag fp -Extra '&fp'
& $b -Sec 30 -Q ultra -Tag chase
"suite bitti $(Get-Date -Format s)" | Out-File -Encoding utf8 (Join-Path (Split-Path $PSScriptRoot -Parent) 'reports\suite_done.txt')
