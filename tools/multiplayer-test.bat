@echo off
setlocal
title FragRush multiplayer yerel deneme
rem Yerel deneme: sinyal sunucusu (wrangler dev) + oyun sunucusu + iki Chrome penceresi (ev sahibi ve konuk, ayri profil).
cd /d D:\Projects\acer\Claude\Fps
call node build.mjs --no-docs
if exist reports\room.json del /q reports\room.json
start "FragRush sinyal (wrangler)" /min cmd /c "cd /d D:\Projects\acer\Claude\Fps\server && npx wrangler dev --port 8787 --ip 127.0.0.1"
start "FragRush sunucu" /min cmd /c "cd /d D:\Projects\acer\Claude\Fps && set PORT=8777&& node serve.mjs"
powershell -NoProfile -Command "for ($i=0; $i -lt 120; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Headers @{Origin='http://127.0.0.1:8777'} http://127.0.0.1:8787/ | Out-Null; Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8777/__ping | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 ( echo Sunucular acilamadi. & pause & exit /b 1 )
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
start "" "%CHROME%" --new-window --user-data-dir="%TEMP%\fr-test-host" --window-size=960,620 --window-position=0,0 --disable-features=WebRtcHideLocalIpsWithMdns "http://127.0.0.1:8777/?autohost=1&map=arena&bots=2&q=low"
powershell -NoProfile -Command "for ($i=0; $i -lt 120; $i++) { if (Test-Path reports\room.json) { exit 0 }; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 ( echo Oda acilamadi. & pause & exit /b 1 )
for /f "usebackq delims=" %%C in (`powershell -NoProfile -Command "(Get-Content reports\room.json -Raw | ConvertFrom-Json).code"`) do set "ROOM=%%C"
start "" "%CHROME%" --new-window --user-data-dir="%TEMP%\fr-test-guest" --window-size=960,620 --window-position=980,0 --disable-features=WebRtcHideLocalIpsWithMdns "http://127.0.0.1:8777/?room=%ROOM%&q=low"
echo Oda: %ROOM%  (konuk penceresinde KATIL dugmesine bas)
timeout /t 5 >nul
