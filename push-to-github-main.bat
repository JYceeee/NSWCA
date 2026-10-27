@echo off
setlocal
cd /d "%~dp0"

set "REMOTE_URL=https://github.com/JYceeee/NSWCA.git"
set "BRANCH=main"

where git >nul 2>nul
if errorlevel 1 (
    echo Git is not installed or not on PATH.
    goto :end
)

rem First run: turn this folder into a git repo
if not exist ".git" (
    echo Initialising git repository...
    git init
    git branch -M %BRANCH%
)

rem Make sure "origin" points at the GitHub repo
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    git remote add origin %REMOTE_URL%
) else (
    git remote set-url origin %REMOTE_URL%
)

rem Make sure we're on main (uncommitted changes come along)
for /f "delims=" %%b in ('git branch --show-current') do set "CURRENT=%%b"
if /i not "%CURRENT%"=="%BRANCH%" (
    git rev-parse --verify --quiet "refs/heads/%BRANCH%" >nul
    if errorlevel 1 (
        git switch -c %BRANCH%
    ) else (
        git switch %BRANCH%
    )
    if errorlevel 1 (
        echo.
        echo Could not switch to %BRANCH%. Check the messages above.
        goto :end
    )
)

git add -A

rem Only commit if something changed
git diff --cached --quiet
if errorlevel 1 (
    set "MSG="
    set /p "MSG=Commit message (press Enter for default): "
    call :commit
) else (
    echo No new changes to commit.
)

echo Pushing %BRANCH% to %REMOTE_URL% ...
git push -u origin %BRANCH%
if errorlevel 1 (
    echo.
    echo Push was rejected - pulling remote changes first, then retrying...
    git pull --rebase origin %BRANCH%
    if errorlevel 1 (
        echo.
        echo Pull failed, probably a merge conflict. Resolve it, then run this file again.
        goto :end
    )
    git push -u origin %BRANCH%
    if errorlevel 1 (
        echo.
        echo Push failed. Check the messages above.
        goto :end
    )
)

echo.
echo Done! Pushed %BRANCH% to %REMOTE_URL%

:end
echo.
pause
exit /b

:commit
if "%MSG%"=="" set "MSG=Update %date% %time:~0,5%"
git commit -m "%MSG%"
exit /b
