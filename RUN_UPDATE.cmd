@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0UPDATE.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
echo Update finished with exit code %RC%.
exit /b %RC%
