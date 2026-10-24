# Uzun sure dayaniklilik olcumu: 5 dakika boyunca sik patlamalar, 10 sn'lik ornekler (bozulma / bellek)
# Sonuc: reports\bench_soak.json (samples = 10 sn'lik ozetler, spikes = takilan kareler)
$ErrorActionPreference = 'SilentlyContinue'
$b = (Join-Path $PSScriptRoot 'bench.ps1')
& $b -Sec 300 -Q ultra -Tag soak -Extra '&soak'
"soak bitti $(Get-Date -Format s)" | Out-File -Encoding utf8 (Join-Path (Split-Path $PSScriptRoot -Parent) 'reports\suite_done.txt')
