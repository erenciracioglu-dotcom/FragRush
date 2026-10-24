# Soak: once calisan bench takiminin bitmesini bekler, sonra 5 dk olcer
$r = Join-Path (Split-Path $PSScriptRoot -Parent) 'reports'
$t0 = Get-Date
while (((Get-ScheduledTask -TaskName 'ENKAZ_Bench').State -eq 'Running') -and ((Get-Date) - $t0).TotalSeconds -lt 240) { Start-Sleep -Seconds 2 }
& (Join-Path $PSScriptRoot 'soak_suite.ps1')
