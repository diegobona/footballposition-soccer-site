@echo off
setlocal

cd /d "%~dp0"

set "HUGO=%~dp0.tools\hugo-0.152.2\hugo.exe"
set "ADMIN_URL=http://localhost:1313/admin/"

if not exist "%HUGO%" (
    echo Hugo was not found:
    echo "%HUGO%"
    echo.
    echo Please check the .tools\hugo-0.152.2 folder.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $null = Invoke-WebRequest -Uri '%ADMIN_URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
    echo Starting Hugo server...
    start "FootballPosition Hugo Server" cmd /k ""%HUGO%" server -D --bind 127.0.0.1 --port 1313 --baseURL http://localhost:1313/ --disableFastRender"
    timeout /t 3 /nobreak >nul
) else (
    echo Hugo server is already running.
)

echo Opening CMS admin...
start "" "%ADMIN_URL%"

exit /b 0
