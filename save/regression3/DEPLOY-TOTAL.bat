@echo off
REM Script ULTIME pour copier et deployer tous les fichiers PorteaPorte

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   DEPLOIEMENT TOTAL PORTEAPORTE
echo ========================================
echo.

set SITE_DIR=C:\Users\User\OneDrive\Desktop\Site
set SOURCE_DIR=%USERPROFILE%\Downloads

echo Dossier Site: %SITE_DIR%
echo.

REM Créer le dossier s'il n'existe pas
if not exist "%SITE_DIR%" mkdir "%SITE_DIR%"

REM Les fichiers à copier (depuis Downloads où les outputs ont été téléchargés)
echo [1/2] Cherchant les fichiers HTML...

REM FICHIERS CRITIQUES
set FILES=^
  expediteur-FIXED.html ^
  dashboard-livreur-FINAL.html ^
  login.html ^
  profile.html ^
  dashboard-expediteur.html ^
  dashboard-livreur.html ^
  inscription-livreur.html

set COPIED=0

for %%F in (%FILES%) do (
  if exist "%SOURCE_DIR%\%%F" (
    echo Copiant %%F...
    copy /Y "%SOURCE_DIR%\%%F" "%SITE_DIR%\%%F" >nul
    set /a COPIED+=1
  )
)

REM Renommer les fichiers FIXED en fichiers normaux
if exist "%SITE_DIR%\expediteur-FIXED.html" (
  echo Renommant expediteur-FIXED.html en expediteur.html...
  copy /Y "%SITE_DIR%\expediteur-FIXED.html" "%SITE_DIR%\expediteur.html" >nul
)

if exist "%SITE_DIR%\dashboard-livreur-FINAL.html" (
  echo Renommant dashboard-livreur-FINAL.html en dashboard-livreur.html...
  copy /Y "%SITE_DIR%\dashboard-livreur-FINAL.html" "%SITE_DIR%\dashboard-livreur.html" >nul
)

echo.
echo ✓ %COPIED% fichiers copies

echo.
echo [2/2] Deploiement sur Vercel...
echo.

cd /d "%SITE_DIR%"

REM Vercel deploy
echo Execution: npx vercel --prod
echo.

npx vercel --prod

if %ERRORLEVEL% EQU 0 (
  echo.
  echo ========================================
  echo   ✓ DEPLOIEMENT REUSSI!
  echo ========================================
  echo.
  echo URLs:
  echo   - https://porteaporte.site/
  echo   - https://porteaporte.site/expediteur.html
  echo   - https://porteaporte.site/dashboard-livreur.html
  echo.
  echo Teste maintenant!
  echo.
) else (
  echo.
  echo ✗ Erreur deploiement
  echo Verifie que Vercel est configure
  echo.
)

pause
