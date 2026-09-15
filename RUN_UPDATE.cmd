@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0UPDATE.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (echo UPDATE PASSED.) else (echo UPDATE FAILED. See logs folder.)
pause
exit /b %RC%
