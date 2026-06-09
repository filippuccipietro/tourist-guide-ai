@echo off
setlocal

set "GIT=C:\ProgramData\geerico\GitHubDesktop\app-3.5.8\resources\app\git\cmd\git.exe"
set "REPO=C:\Users\geerico\Documents\Claude\Projects\pagina di comparazione trading online\tourist-guide"

echo === Usando git: %GIT%
echo.

:: Entra nella cartella del repo
cd /d "%REPO%"
if errorlevel 1 (
    echo ERRORE: impossibile entrare in %REPO%
    pause
    exit /b 1
)
echo === Cartella corrente: %CD%
echo.

:: Configura identita'
"%GIT%" config user.email "filippucci.pietro@gmail.com"
"%GIT%" config user.name "Pietro Filippucci"

:: Se non e' un repo valido, reinizializza
"%GIT%" rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo Re-inizializzo il repo...
    if exist ".git" rmdir /s /q ".git"
    "%GIT%" init
)

:: Configura remote
"%GIT%" remote remove origin 2>nul
"%GIT%" remote add origin https://github.com/filippuccipietro/tourist-guide-ai.git

echo.
echo === Scarico lo stato remoto...
"%GIT%" fetch origin

echo.
echo === Allineo all'ultimo commit remoto (senza toccare i file)...
"%GIT%" reset --mixed origin/main

echo.
echo === STATUS ===
"%GIT%" status

echo.
echo === STAGING src/App.jsx ===
"%GIT%" add src/App.jsx

echo.
echo === COMMIT ===
"%GIT%" commit -m "GuidaMe: brand update, Social Kit, 4 bugfixes (maps, TTS timeout, startpoint screen, tone)"

echo.
echo === RINOMINO BRANCH in main ===
"%GIT%" branch -M main

echo.
echo === PUSH ===
"%GIT%" push -u origin main

echo.
echo === COMPLETATO! ===
pause
