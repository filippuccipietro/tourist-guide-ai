@echo off
setlocal

set "GIT=C:\ProgramData\geerico\GitHubDesktop\app-3.6.3\resources\app\git\cmd\git.exe"
if not exist "%GIT%" set "GIT=C:\ProgramData\geerico\GitHubDesktop\app-3.5.8\resources\app\git\cmd\git.exe"

set "REPO=C:\Users\geerico\Documents\Claude\Projects\pagina di comparazione trading online\tourist-guide"

cd /d "%REPO%"

echo === Rimuovo tutti i lock files...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\refs\heads\main.lock" 2>nul

echo === Configuro git...
"%GIT%" config user.email "filippucci.pietro@gmail.com"
"%GIT%" config user.name "Pietro Filippucci"

echo === Staging src/App.jsx...
"%GIT%" add src/App.jsx

echo === Commit...
"%GIT%" commit -m "feat: sezione I miei viaggi con tab, auto-save e delete"

echo === Push...
"%GIT%" push origin main

echo.
echo === FATTO! Premi un tasto per chiudere.
pause
