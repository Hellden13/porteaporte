@echo off
chcp 65001 >nul
color 0A
cls

echo.
echo ╔═════════════════════════════════════════════════════════════════════════╗
echo ║                    🚀 PORTEAPORTE - DEPLOYMENT 🚀                      ║
echo ║                                                                         ║
echo ║              Double-clique sur ce fichier, c'est tout!                  ║
echo ║                                                                         ║
echo ╚═════════════════════════════════════════════════════════════════════════╝
echo.

set SITE_DIR=C:\Users\User\OneDrive\Desktop\Site

echo [1/3] Correction de login.html...
echo.

REM Créer backup
if exist "%SITE_DIR%\login.html" (
    copy /Y "%SITE_DIR%\login.html" "%SITE_DIR%\login.html.backup" >nul
    echo ✓ Backup créé
)

REM Corriger login.html - Utiliser PowerShell pour les regex
powershell -Command "$content = Get-Content '%SITE_DIR%\login.html' -Raw; $content = $content -replace 'const supabase=window\.supabase\.createClient', 'const db=window.supabase.createClient'; $content = $content -replace 'supabase\.auth', 'db.auth'; $content = $content -replace 'supabase\.from', 'db.from'; Set-Content '%SITE_DIR%\login.html' $content -Encoding UTF8" >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✓ login.html corrigé ^(supabase ^→ db^)
) else (
    echo ⚠ Correction échouée - correction manuelle nécessaire
)
echo.

echo [2/3] Correction de onboarding-livreur.html...
echo.

REM Créer backup
if exist "%SITE_DIR%\onboarding-livreur.html" (
    copy /Y "%SITE_DIR%\onboarding-livreur.html" "%SITE_DIR%\onboarding-livreur.html.backup" >nul
    echo ✓ Backup créé
)

REM Corriger onboarding-livreur.html
powershell -Command "$content = Get-Content '%SITE_DIR%\onboarding-livreur.html' -Raw; $content = $content -replace \"window\.location\.href = '/compte\.html'\", \"window.location.href = '/dashboard-livreur.html'\"; Set-Content '%SITE_DIR%\onboarding-livreur.html' $content -Encoding UTF8" >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✓ onboarding-livreur.html corrigé ^(liens dashboard^)
) else (
    echo ⚠ Correction échouée - correction manuelle nécessaire
)
echo.

echo [3/3] Déploiement sur Vercel...
echo.

cd /d "%SITE_DIR%"

echo ========================================================================
echo Exécution: npx vercel --prod
echo ========================================================================
echo.

REM Déployer
npx vercel --prod

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ═════════════════════════════════════════════════════════════════════
    echo ✓ DEPLOIEMENT RÉUSSI!
    echo ═════════════════════════════════════════════════════════════════════
    echo.
    echo Teste ces URLs:
    echo   ✓ https://porteaporte.site/
    echo   ✓ https://porteaporte.site/login.html
    echo   ✓ https://porteaporte.site/test-login.html
    echo   ✓ https://porteaporte.site/suivi.html
    echo   ✓ https://porteaporte.site/livreur.html
    echo.
) else (
    echo.
    echo ═════════════════════════════════════════════════════════════════════
    echo ❌ ERREUR DEPLOIEMENT
    echo ═════════════════════════════════════════════════════════════════════
    echo.
    echo Solutions possibles:
    echo   - Vercel n'est pas installé: npm install -g vercel
    echo   - Vercel non connecté: npx vercel --auth
    echo   - Fichiers manquants dans: %SITE_DIR%
    echo.
)

pause
