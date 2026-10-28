@echo off
setlocal
cd /d "%~dp0"

set "DH_USER=joyceyang"
set "DH_HOST=joyceyang.dreamhosters.com"
set "DH_DIR=/home/joyceyang/joyceyang.dreamhosters.com"

set "TAR=%SystemRoot%\System32\tar.exe"
set "SSH=%SystemRoot%\System32\OpenSSH\ssh.exe"

if not exist "%TAR%" (
    echo tar was not found at %TAR%.
    goto :end
)
if not exist "%SSH%" (
    echo ssh was not found at %SSH%. Install "OpenSSH Client" under Windows Optional Features.
    goto :end
)

echo Building the site...
call npm run build
if errorlevel 1 (
    echo.
    echo Build failed. Fix the errors above, then run this file again.
    goto :end
)

echo.
echo Uploading to %DH_HOST% - enter your DreamHost password when asked...
rem Pack dist, stream it over one ssh connection, clear old hashed assets, then unpack in the site folder
"%TAR%" -cf - -C dist . | "%SSH%" %DH_USER%@%DH_HOST% "mkdir -p '%DH_DIR%' && rm -rf '%DH_DIR%/assets' && tar -xf - -C '%DH_DIR%'"
if errorlevel 1 (
    echo.
    echo Upload failed. Check the messages above.
    goto :end
)

echo.
echo Done! Live at https://%DH_HOST%/

:end
echo.
pause
exit /b
