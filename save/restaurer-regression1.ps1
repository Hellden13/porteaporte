# ============================================================
#  RESTAURATION - regression1
#  Restaure le site complet depuis la sauvegarde regression1
#  Double-clic pour executer (ou via PowerShell)
# ============================================================

$backup = "C:\Users\User\OneDrive\Desktop\Site\save\regression1"
$site   = "C:\Users\User\OneDrive\Desktop\Site"

Write-Host ""
Write-Host "======================================" -ForegroundColor Yellow
Write-Host "  RESTAURATION - regression1" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Source  : $backup" -ForegroundColor Cyan
Write-Host "Cible   : $site" -ForegroundColor Cyan
Write-Host ""

# Verification que la sauvegarde existe
if (-not (Test-Path $backup)) {
    Write-Host "ERREUR : Le dossier de sauvegarde est introuvable." -ForegroundColor Red
    Write-Host "Chemin attendu : $backup" -ForegroundColor Red
    pause
    exit 1
}

# Confirmation avant d'ecraser
$confirm = Read-Host "Es-tu sur de vouloir restaurer? Cela va ecraser les fichiers actuels. (oui/non)"
if ($confirm -ne "oui") {
    Write-Host "Restauration annulee." -ForegroundColor Yellow
    pause
    exit 0
}

Write-Host ""
Write-Host "Restauration en cours..." -ForegroundColor Green

# Copier tous les fichiers de la sauvegarde vers le site (sauf le dossier save)
Get-ChildItem -Path $backup -Exclude "save" | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $site -Recurse -Force
}

$count = (Get-ChildItem -Path $backup -Recurse -File).Count
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  RESTAURATION TERMINEE" -ForegroundColor Green
Write-Host "  $count fichiers restaures" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Le site a ete restaure a l'etat de regression1." -ForegroundColor Cyan
Write-Host "Lance 'npx vercel --prod' depuis le dossier Site pour redéployer." -ForegroundColor Cyan
Write-Host ""
pause
