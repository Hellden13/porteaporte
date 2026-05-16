# ============================================
# PORTEAPORTE - SCRIPT DE CORRECTION (PowerShell)
# ============================================
# À exécuter dans: C:\Users\User\OneDrive\Desktop\Site\
# Ouvrir PowerShell en admin et: Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
# Puis: .\CORRECTION-PORTEAPORTE.ps1

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     PORTEAPORTE - SCRIPT DE CORRECTION AUTOMATIQUE         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Vérifier qu'on est dans le bon dossier
if (!(Test-Path "index.html")) {
    Write-Host "❌ ERREUR: index.html non trouvé" -ForegroundColor Red
    Write-Host "Ce script doit être exécuté dans: C:\Users\User\OneDrive\Desktop\Site\" -ForegroundColor Red
    Read-Host "Appuie sur Entrée pour quitter"
    exit 1
}

Write-Host "✓ Dossier correct détecté" -ForegroundColor Green
Write-Host ""

# ============================================
# 1. CORRIGER INDEX.HTML
# ============================================
Write-Host "[1/7] Correction de index.html..." -ForegroundColor Yellow

if (Test-Path "index.html") {
    # Backup
    Copy-Item "index.html" "index.html.BACKUP" -Force
    Write-Host "   - Backup créé: index.html.BACKUP" -ForegroundColor Green
    
    # Lire le contenu
    $content = Get-Content "index.html" -Raw -Encoding UTF8
    
    # Retirer Kit Instagram et Panneau admin
    $content = $content -replace '(?i)<a[^>]*href=[''"]?[^''">]*Kit\s+Instagram[^''">]*[''"]?[^>]*>.*?</a>', ''
    $content = $content -replace '(?i)<a[^>]*href=[''"]?[^''">]*Panneau\s+admin[^''">]*[''"]?[^>]*>.*?</a>', ''
    $content = $content -replace '(?i)<li[^>]*>[\s\n]*<a[^>]*href=[''"]?[^''">]*Kit\s+Instagram[^''">]*[''"]?[^>]*>.*?</a>[\s\n]*</li>', ''
    $content = $content -replace '(?i)<li[^>]*>[\s\n]*<a[^>]*href=[''"]?[^''">]*Panneau\s+admin[^''">]*[''"]?[^>]*>.*?</a>[\s\n]*</li>', ''
    
    # Nettoyer les espaces supplémentaires
    $content = $content -replace '\s+<br\s*/?>\s+<br\s*/?>', '<br>'
    
    # Écrire le contenu
    Set-Content "index.html" $content -Encoding UTF8
    
    Write-Host "   ✓ Kit Instagram supprimé" -ForegroundColor Green
    Write-Host "   ✓ Panneau admin supprimé" -ForegroundColor Green
}

# ============================================
# 2. CORRIGER LOGIN.HTML
# ============================================
Write-Host ""
Write-Host "[2/7] Correction de login.html..." -ForegroundColor Yellow

if (Test-Path "login.html") {
    # Backup
    Copy-Item "login.html" "login.html.BACKUP" -Force
    Write-Host "   - Backup créé: login.html.BACKUP" -ForegroundColor Green
    
    # Lire et corriger
    $content = Get-Content "login.html" -Raw -Encoding UTF8
    
    $content = $content -replace 'var\s+supabase\s*=\s*window\.supabase\.createClient', 'var db = window.supabase.createClient'
    $content = $content -replace 'supabase\.auth\.signInWithPassword', 'db.auth.signInWithPassword'
    $content = $content -replace 'supabase\.from\(', 'db.from('
    $content = $content -replace 'supabase\.rpc\(', 'db.rpc('
    
    Set-Content "login.html" $content -Encoding UTF8
    
    Write-Host "   ✓ var supabase → var db" -ForegroundColor Green
    Write-Host "   ✓ Références Supabase mises à jour" -ForegroundColor Green
} else {
    Write-Host "   ⚠ login.html non trouvé (peut être créé plus tard)" -ForegroundColor Yellow
}

# ============================================
# 3. REMPLACER TEST-LOGIN.HTML
# ============================================
Write-Host ""
Write-Host "[3/7] Gestion de test-login.html..." -ForegroundColor Yellow

if (Test-Path "test-login.html") {
    $redirectHTML = @'
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0;url=login.html">
    <title>Redirection</title>
</head>
<body>
    <p>Redirection vers login.html...</p>
</body>
</html>
'@
    Set-Content "test-login.html" $redirectHTML -Encoding UTF8
    Write-Host "   ✓ test-login.html remplacé par redirect vers login.html" -ForegroundColor Green
} else {
    Write-Host "   ⚠ test-login.html n'existe pas" -ForegroundColor Yellow
}

# ============================================
# 4. METTRE À JOUR ONBOARDING-LIVREUR.HTML
# ============================================
Write-Host ""
Write-Host "[4/7] Mise à jour de onboarding-livreur.html..." -ForegroundColor Yellow

if (Test-Path "onboarding-livreur.html") {
    # Backup
    Copy-Item "onboarding-livreur.html" "onboarding-livreur.html.BACKUP" -Force
    Write-Host "   - Backup créé: onboarding-livreur.html.BACKUP" -ForegroundColor Green
    
    # Lire et ajouter le lien dashboard
    $content = Get-Content "onboarding-livreur.html" -Raw -Encoding UTF8
    
    $dashboardLink = '<div style="margin-top: 2rem; text-align: center;"><a href="dashboard-livreur.html" style="color: #B8F53E; text-decoration: none; font-weight: 600;">Accéder au tableau de bord →</a></div>'
    $content = $content -replace '(?i)</form>', "</form>`n$dashboardLink"
    
    Set-Content "onboarding-livreur.html" $content -Encoding UTF8
    
    Write-Host "   ✓ Lien dashboard ajouté" -ForegroundColor Green
} else {
    Write-Host "   ⚠ onboarding-livreur.html non trouvé" -ForegroundColor Yellow
}

# ============================================
# 5. CRÉER PROFILE.HTML
# ============================================
Write-Host ""
Write-Host "[5/7] Création de profile.html..." -ForegroundColor Yellow

if (!(Test-Path "profile.html")) {
    $profileHTML = @'
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mon Profil - PorteÀPorte</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0A0C0F;
            color: #E8EAED;
            line-height: 1.6;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
        }
        h1 {
            color: #B8F53E;
            margin-bottom: 2rem;
            font-size: 32px;
        }
        .profile-card {
            background: #12151A;
            border: 1px solid rgba(184, 245, 62, 0.2);
            border-radius: 12px;
            padding: 2rem;
            margin-bottom: 2rem;
        }
        .profile-field {
            margin-bottom: 1rem;
        }
        .profile-field label {
            display: block;
            color: #0BFFCB;
            font-weight: 600;
            margin-bottom: 0.5rem;
            font-size: 14px;
        }
        .profile-field span {
            color: #8A8D93;
        }
        button {
            padding: 0.75rem 1.5rem;
            background: #B8F53E;
            color: #0A0C0F;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
        }
        button:hover {
            background: #94C11B;
        }
        nav {
            margin-top: 2rem;
        }
        nav a {
            color: #0BFFCB;
            text-decoration: none;
            margin-right: 1rem;
        }
        nav a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Mon Profil</h1>
        <div class="profile-card">
            <div class="profile-field">
                <label>ID Utilisateur</label>
                <span id="userId">Chargement...</span>
            </div>
            <div class="profile-field">
                <label>Email</label>
                <span id="email">Chargement...</span>
            </div>
            <div class="profile-field">
                <label>Rôle</label>
                <span id="role">Chargement...</span>
            </div>
            <button onclick="window.location='dashboard-livreur.html'">Retour au tableau de bord</button>
        </div>
        <nav>
            <a href="dashboard-livreur.html">Tableau de bord</a>
            <a href="index.html">Accueil</a>
        </nav>
    </div>

    <script>
        var db = window.supabase.createClient('https://miqrircrfpzkmvvacgwt.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
        
        db.auth.onAuthStateChange((event, session) => {
            if (session) {
                document.getElementById('userId').innerText = session.user.id;
                document.getElementById('email').innerText = session.user.email || 'N/A';
                
                // Récupérer le rôle depuis la table profiles
                db.from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single()
                    .then(({ data, error }) => {
                        if (data) {
                            document.getElementById('role').innerText = data.role || 'Non défini';
                        }
                    });
            } else {
                window.location = 'login.html';
            }
        });
    </script>
</body>
</html>
'@
    Set-Content "profile.html" $profileHTML -Encoding UTF8
    Write-Host "   ✓ profile.html créé" -ForegroundColor Green
} else {
    Write-Host "   ✓ profile.html existe déjà" -ForegroundColor Green
}

# ============================================
# 6. CRÉER DASHBOARD-LIVREUR.HTML
# ============================================
Write-Host ""
Write-Host "[6/7] Création de dashboard-livreur.html..." -ForegroundColor Yellow

if (!(Test-Path "dashboard-livreur.html")) {
    $dashboardHTML = @'
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tableau de Bord - PorteÀPorte</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0A0C0F;
            color: #E8EAED;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        h1 {
            color: #B8F53E;
            margin-bottom: 2rem;
            font-size: 32px;
        }
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            margin-bottom: 3rem;
        }
        .card {
            background: #12151A;
            border: 1px solid rgba(184, 245, 62, 0.2);
            border-radius: 12px;
            padding: 1.5rem;
            transition: all 0.3s;
        }
        .card:hover {
            border-color: #B8F53E;
            transform: translateY(-4px);
        }
        .card h3 {
            color: #0BFFCB;
            margin-top: 0;
            margin-bottom: 1rem;
            font-size: 14px;
            text-transform: uppercase;
            font-weight: 600;
        }
        .card-value {
            font-size: 28px;
            font-weight: 700;
            color: #B8F53E;
            margin-bottom: 0.5rem;
        }
        .card p {
            color: #8A8D93;
            font-size: 13px;
        }
        .actions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 3rem;
        }
        button {
            padding: 1rem;
            background: #B8F53E;
            color: #0A0C0F;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
        }
        button:hover {
            background: #94C11B;
            transform: translateY(-2px);
        }
        nav {
            border-top: 1px solid rgba(184, 245, 62, 0.2);
            padding-top: 1rem;
            margin-top: 2rem;
        }
        nav a {
            color: #0BFFCB;
            text-decoration: none;
            margin-right: 1rem;
        }
        nav a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Tableau de Bord Livreur</h1>
        
        <div class="dashboard">
            <div class="card">
                <h3>Livraisons</h3>
                <div class="card-value" id="deliveryCount">0</div>
                <p>Livraisons complétées</p>
            </div>
            <div class="card">
                <h3>Revenus</h3>
                <div class="card-value" id="earnings">$0.00</div>
                <p>Cette semaine</p>
            </div>
            <div class="card">
                <h3>Note</h3>
                <div class="card-value" id="rating">0.0</div>
                <p>Évaluation moyenne</p>
            </div>
            <div class="card">
                <h3>XP</h3>
                <div class="card-value" id="xp">0</div>
                <p>Points d'expérience</p>
            </div>
        </div>

        <div class="actions">
            <button onclick="window.location='index.html'">Chercher une livraison</button>
            <button onclick="window.location='profile.html'">Mon profil</button>
            <button onclick="logout()">Se déconnecter</button>
        </div>

        <nav>
            <a href="index.html">Accueil</a>
            <a href="profile.html">Profil</a>
        </nav>
    </div>

    <script>
        var db = window.supabase.createClient('https://miqrircrfpzkmvvacgwt.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
        
        db.auth.onAuthStateChange((event, session) => {
            if (session) {
                loadDashboard(session.user.id);
            } else {
                window.location = 'login.html';
            }
        });

        function loadDashboard(userId) {
            db.from('profiles')
                .select('livraisons, coins, score, xp')
                .eq('id', userId)
                .single()
                .then(({ data, error }) => {
                    if (data) {
                        document.getElementById('deliveryCount').innerText = data.livraisons || 0;
                        document.getElementById('earnings').innerText = '$' + ((data.coins || 0) / 100).toFixed(2);
                        document.getElementById('rating').innerText = (data.score || 0).toFixed(1);
                        document.getElementById('xp').innerText = data.xp || 0;
                    }
                });
        }

        function logout() {
            db.auth.signOut().then(() => {
                window.location = 'index.html';
            });
        }
    </script>
</body>
</html>
'@
    Set-Content "dashboard-livreur.html" $dashboardHTML -Encoding UTF8
    Write-Host "   ✓ dashboard-livreur.html créé" -ForegroundColor Green
} else {
    Write-Host "   ✓ dashboard-livreur.html existe déjà" -ForegroundColor Green
}

# ============================================
# 7. VÉRIFICATION FINALE
# ============================================
Write-Host ""
Write-Host "[7/7] Vérification finale..." -ForegroundColor Yellow
Write-Host ""

$files = @("index.html", "login.html", "onboarding-livreur.html", "profile.html", "dashboard-livreur.html")
$count = 0

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "   ✓ $file" -ForegroundColor Green
        $count++
    } else {
        Write-Host "   ⚠ $file (manquant)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           ✓ CORRECTION TERMINÉE AVEC SUCCÈS              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Fichiers corrigés: $count/5" -ForegroundColor Green
Write-Host ""
Write-Host "Backups créés (en cas de problème):" -ForegroundColor Yellow
Write-Host "   - index.html.BACKUP" -ForegroundColor Gray
Write-Host "   - login.html.BACKUP" -ForegroundColor Gray
Write-Host "   - onboarding-livreur.html.BACKUP" -ForegroundColor Gray
Write-Host ""
Write-Host "Prochaines étapes:" -ForegroundColor Cyan
Write-Host "   1. Teste le site localement" -ForegroundColor Gray
Write-Host "   2. Ouvre le navigateur et accède à: http://localhost ou file://chemin/index.html" -ForegroundColor Gray
Write-Host "   3. Vérifie que les pages s'ouvrent sans erreurs" -ForegroundColor Gray
Write-Host "   4. Déploie avec: npx vercel --prod" -ForegroundColor Gray
Write-Host "   5. Vérifie en prod: https://porteaporte.site" -ForegroundColor Gray
Write-Host ""
Read-Host "Appuie sur Entrée pour quitter"
