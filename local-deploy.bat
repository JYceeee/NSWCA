@echo off
setlocal
cd /d "%~dp0"

rem Runs the site on this computer with no server: full Admin access, saved in this browser only.
set "PORT=5173"
set "URL=http://localhost:%PORT%/"
set "VITE_LOCAL_ONLY=1"

netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
    echo The site is already running at %URL%
    start "" "%URL%"
    goto :end
)

if not exist "node_modules\" (
    echo Installing packages...
    call npm install
    if errorlevel 1 (
        echo.
        echo Install failed. Fix the errors above, then run this file again.
        goto :end
    )
)

echo Starting the site at %URL% - close this window or press Ctrl+C to stop it.
call npm run dev -- --port %PORT% --strictPort --open

:end
echo.
pause
