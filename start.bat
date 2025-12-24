@echo off
cd /d "%~dp0"

:: Get the Antigravity Access root directory (parent folder)
set "APP_ROOT=%~dp0..\"
for %%I in ("%APP_ROOT%") do set "APP_ROOT=%%~fI"
set "SHARED_MODULES=%APP_ROOT%\shared_modules"

:: Kill any process running on port 5173 or 4000
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":4000" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

:: Enter Application Directory
cd app

:: Create shared_modules folder if it doesn't exist
if not exist "%SHARED_MODULES%" mkdir "%SHARED_MODULES%"

:: Create junction if node_modules doesn't exist or is broken
if not exist "node_modules\vite" (
    echo.
    echo Verification du lien vers les modules partages...
    
    :: Remove broken junction or old folder
    if exist "node_modules" (
        rmdir "node_modules" 2>nul
        if exist "node_modules" (
            echo Suppression de l'ancien dossier node_modules...
            rmdir /s /q "node_modules" 2>nul
        )
    )
    
    :: Create junction to shared modules
    echo Creation du lien vers: %SHARED_MODULES%\node_modules
    mklink /J "node_modules" "%SHARED_MODULES%\node_modules"
)

:: Check if dependencies are installed
if not exist "node_modules\vite" (
    echo.
    echo ========================================
    echo   Installation des dependances...
    echo   Cela peut prendre 1-2 minutes.
    echo ========================================
    echo.
    
    :: Try pnpm first, fallback to npm
    where pnpm >nul 2>&1
    if %errorlevel%==0 (
        pnpm install
    ) else (
        npm install
    )
    echo.
    echo Installation terminee!
    echo.
)

:: Start the server
echo Starting Bulletin AI App...
echo.

:: Try pnpm first, fallback to npm
where pnpm >nul 2>&1
if %errorlevel%==0 (
    pnpm run dev
) else (
    npm run dev
)
