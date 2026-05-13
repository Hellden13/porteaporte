@echo off
REM Script de nettoyage PorteàPorte
setlocal enabledelayedexpansion
echo.
echo ========================================
echo   NETTOYAGE SITE PORTEAPORTE
echo ========================================
echo.

set SITE_DIR=C:\Users\User\OneDrive\Desktop\Site
echo Dossier: %SITE_DIR%
echo.

if not exist "%SITE_DIR%" (
    echo ERREUR: Dossier non trouvé!
    pause
    exit /b 1
)

echo SUPPRESSION DES VIEUX FICHIERS...
echo.

set DELETED=0

for %%F in (
    404.html
    admin-dashboard.html
    cookies.html
    dashboard-expediteur.html
    assurance.html
    cgu.html
    confidentialite.html
    contact.html
    covoiturage.html
    engagement.html
    envoyer.html
    expediteur.html
    expediteur-FIXED.html
    faq.html
    DEPLOY.bat
    DEPLOY-TOTAL.bat
) do (
    if exist "%SITE_DIR%\%%F" (
        echo   ❌ Suppression: %%F
        del /F /Q "%SITE_DIR%\%%F"
        set /a DELETED+=1
    )
)

if exist "%SITE_DIR%\cd" rmdir /S /Q "%SITE_DIR%\cd" 2>nul
del /F /Q "%SITE_DIR%\*.zip" 2>nul

echo.
echo ✓ %DELETED% fichier(s) supprimé(s)
echo.
echo FICHIERS RESTANTS:
echo   ✅ index.html
echo   ✅ compte.html
echo   ✅ suivi.html
echo   ✅ publier-colis.html
echo   ✅ livreur.html
echo   ✅ dashboard-livreur.html
echo.
echo ========================================
echo   ✓ NETTOYAGE TERMINÉ!
echo ========================================
echo.

pause