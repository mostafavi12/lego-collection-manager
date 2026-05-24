@echo off
setlocal EnableExtensions

REM ZIP root = folder containing this .bat file
set "LCM_INSTALL_ROOT=%~dp0"
set "LCM_INSTALL_ROOT=%LCM_INSTALL_ROOT:~0,-1%"

set "LCM_SERVER_DIR=%LCM_INSTALL_ROOT%\lcm-server"
set "LCM_SERVER_EXE=%LCM_SERVER_DIR%\lcm-server.exe"

if not exist "%LCM_SERVER_EXE%" (
  echo.
  echo ERROR: Server executable not found:
  echo   %LCM_SERVER_EXE%
  echo.
  pause
  exit /b 1
)

if not exist "%LCM_INSTALL_ROOT%\data" mkdir "%LCM_INSTALL_ROOT%\data"

cd /d "%LCM_SERVER_DIR%"
start "LEGO Collection Manager" "%LCM_SERVER_EXE%"

echo.
echo LEGO Collection Manager is starting.
echo Your browser should open shortly at http://127.0.0.1:8000/
echo.
echo Keep this window open while using the app. Close it to stop the server.
echo.
pause
