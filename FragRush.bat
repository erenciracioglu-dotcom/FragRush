@echo off
setlocal
title FragRush
rem FragRush launcher (Windows): starts the small local server and opens the game
rem in a separate fullscreen Chrome window on the high-performance GPU.
cd /d "%~dp0"
set "URL=http://127.0.0.1:8777/"
where node >nul 2>nul
if errorlevel 1 (
  rem No Node.js: open the single-file build directly
  set "URL=file:///%~dp0dist/index.html"
  goto chrome
)
rem Do not start a second server if one is already running
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8777/__ping | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "FragRush server - closes itself when the game closes" /min cmd /c "node serve.mjs --auto-exit"
  powershell -NoProfile -Command "for ($i=0; $i -lt 50; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8777/__ping | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 150 } }"
)
:chrome
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --user-data-dir="%~dp0.chrome-profile" --force-high-performance-gpu --no-first-run --no-default-browser-check --hide-crash-restore-bubble --enable-logging --v=0 --start-fullscreen --app=%URL%
) else (
  start "" %URL%
)
endlocal
