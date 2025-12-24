@echo off
setlocal enabledelayedexpansion

:: ============================================
:: Backup Script - Assistant Bulletin
:: Copie la version actuelle vers Save/
:: ============================================

cd /d "%~dp0"

:: Configuration
set "APP_DIR=%~dp0app"
set "SAVE_DIR=%~dp0..\Save"

:: Lire la version depuis package.json (simple extraction)
for /f "tokens=2 delims=:," %%a in ('findstr /C:"\"version\"" "%APP_DIR%\package.json"') do (
    set "VERSION=%%~a"
    set "VERSION=!VERSION: =!"
    set "VERSION=!VERSION:"=!"
    goto :found_version
)
:found_version

:: Date du jour
for /f "tokens=1-3 delims=/" %%a in ('%SystemRoot%\System32\wbem\wmic.exe OS GET LocalDateTime ^| find "."') do (
    set "DT=%%a"
    set "YEAR=!DT:~0,4!"
    set "MONTH=!DT:~4,2!"
    set "DAY=!DT:~6,2!"
)
set "DATE_STR=%YEAR%-%MONTH%-%DAY%"

:: Nom du dossier de backup
set "BACKUP_NAME=v%VERSION%-%DATE_STR%"
set "BACKUP_PATH=%SAVE_DIR%\%BACKUP_NAME%"

echo.
echo ========================================
echo   BACKUP - Assistant Bulletin
echo ========================================
echo.
echo Version: v%VERSION%
echo Date: %DATE_STR%
echo Destination: %BACKUP_PATH%
echo.

:: Créer le dossier de destination
if not exist "%SAVE_DIR%" mkdir "%SAVE_DIR%"
if exist "%BACKUP_PATH%" (
    echo [WARN] Le backup %BACKUP_NAME% existe deja!
    set /p "OVERWRITE=Ecraser? (O/N): "
    if /i not "!OVERWRITE!"=="O" (
        echo Backup annule.
        exit /b 1
    )
    rmdir /s /q "%BACKUP_PATH%"
)
mkdir "%BACKUP_PATH%"

echo [1/5] Copie de src...
xcopy /E /I /Y /Q "%APP_DIR%\src" "%BACKUP_PATH%\app\src" >nul

echo [2/5] Copie de public...
xcopy /E /I /Y /Q "%APP_DIR%\public" "%BACKUP_PATH%\app\public" >nul

echo [3/5] Copie des fichiers HTML...
copy /Y "%APP_DIR%\index.html" "%BACKUP_PATH%\app\" >nul
copy /Y "%APP_DIR%\app.html" "%BACKUP_PATH%\app\" >nul

echo [4/5] Copie des configs...
copy /Y "%APP_DIR%\package.json" "%BACKUP_PATH%\app\" >nul
copy /Y "%APP_DIR%\vite.config.js" "%BACKUP_PATH%\app\" >nul
copy /Y "%APP_DIR%\.gitignore" "%BACKUP_PATH%\app\" >nul 2>nul

echo [5/5] Copie des docs et lanceurs...
copy /Y "%~dp0CHANGELOG.md" "%BACKUP_PATH%\" >nul 2>nul
copy /Y "%~dp0README.md" "%BACKUP_PATH%\" >nul 2>nul
copy /Y "%~dp0start.bat" "%BACKUP_PATH%\" >nul 2>nul
copy /Y "%~dp0launcher.vbs" "%BACKUP_PATH%\" >nul 2>nul

echo.
echo ========================================
echo   BACKUP TERMINE!
echo   %BACKUP_PATH%
echo ========================================
echo.

endlocal
