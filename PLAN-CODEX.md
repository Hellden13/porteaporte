# PorteàPorte — Plan de continuation pour Codex
*Généré le 2026-05-16 — À lire entièrement avant de toucher au code*

---

## Contexte du projet

**PorteàPorte** est une plateforme canadienne de livraison entre particuliers (type UberEats pour colis).
- **Stack** : HTML/CSS/JS vanilla + Supabase (auth, DB, storage, realtime) + Vercel (serverless API) + Stripe (paiements)
- **URL production** : porteaporte.site
- **Dossier local** : `C:\Users\User\OneDrive\Desktop\Site\`
- **Déploiement** : `vercel --prod --yes` depuis le dossier Site
- **Limite Vercel Hobby** : 12 fonctions serverless max (on est exactement à 12)
- **CSS** : tout passe par `/assets/brand-uniform.css` avec les variables `--brand-lime`, `--brand-cyan`, `--brand-bg-dark`, `--brand-bg-surface`, `--brand-border`, `--brand-muted`, `--brand-text`
- **Supabase client** : `window.getSupabaseClient()` défini dans `/js/supabase-config.js`

---

## Mis à jour le 2026-05-16 après session Codex

---

## Ce qui est DÉJÀ fait (ne pas refaire)

| Fichier | Statut | Description |
|---|---|---|
| `login.html` | ✅ Complet | 3 tabs : Email+MDP, Phone OTP, OAuth (Google/Apple) |
| `dashboard-livreur.html` | ✅ Complet | Toggle En ligne, biométrie, streak 7j, bonus éco, commentaires BD |
| `map.html` | ✅ Complet | Carte Leaflet dark, missions filtrables, panel détail, géolocalisation |
| `index.html` | ✅ Complet | Comparateur de prix, mini-map Leaflet |
| `messagerie.html` | ✅ Complet | Chat temps réel Supabase, bulles, réponses rapides |
| `kyc.html` | ✅ Complet | 10 modes transport, docs adaptatifs, 5 étapes, upload Supabase Storage |
| `browse-missions.html` | ✅ Complet | Liste missions, badge éco, score matching |
| `admin/kyc-review.html` | ✅ Complet | Interface admin approbation/rejet KYC |
| `js/support-widget.js` | ✅ Complet | Chatbot IA injecté sur toutes les pages |
| `js/push-manager.js` | ✅ Complet | Abonnement Web Push, déclenché au toggle "En ligne" |
| `sw.js` | ✅ Complet | Service Worker pour notifications push background |
| `api/platform.js` | ✅ Complet | Router multi-endpoint — 20+ endpoints intégrés |
| `api/platform.js` — push | ✅ Complet | pushSubscribe / pushSend / deliverPush (auto-ciblage livreurs disponibles) |
| `api/platform.js` — admin | ✅ Complet | adminSetUserAccess : suspendre / réactiver / révision (protection anti-self) |
| `api/platform.js` — reviews | ✅ Complet | createReview : avis post-livraison |
| `api/platform.js` — impact | ✅ Complet | impactPublic/Admin/Application : écologie, commission, cagnotte, orgs partenaires |
| `api/platform.js` — rewards | ✅ Complet | rewardsDashboard : PorteCoins, missions, tirages, niveaux livreur |
| `api/platform.js` — draw | ✅ Complet | drawEnter / runMonthlyDraw / pickWeightedWinner : tirage mensuel pondéré |
| `api/platform.js` — adminRewards | ✅ Complet | Admin : gérer tirages et récompenses |
| `api/notifier.js` | ✅ Complet | Emails SendGrid (bienvenue, KYC, livraison, paiement...) |
| `api/stripe.js` | ✅ Complet | Stripe Checkout + escrow |
| `api/stripe-webhook.js` | ✅ Complet | Webhooks Stripe |

---

## CE QUI RESTE À FAIRE (par priorité)

---

### PRIORITÉ 0 — Nouvelles tables Supabase requises par les endpoints Codex

Ces tables sont appelées dans `platform.js` mais n'existent pas encore en base. À créer en PREMIER.

```sql
-- Notifications in-app
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  titre      TEXT        NOT NULL,
  corps      TEXT,
  lu         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, lu);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user voit ses notifs" ON notifications FOR ALL USING (auth.uid() = user_id);

-- PorteCoins ledger
CREATE TABLE IF NOT EXISTS porte_coins_transactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount     INTEGER     NOT NULL,  -- positif = crédit, négatif = débit
  reason     TEXT        NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coins_user ON porte_coins_transactions(user_id);
ALTER TABLE porte_coins_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user voit ses coins" ON porte_coins_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service insere coins" ON porte_coins_transactions FOR INSERT WITH CHECK (TRUE);

-- Missions PorteCoins (défis à accomplir)
CREATE TABLE IF NOT EXISTS missions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  reward      INTEGER     NOT NULL DEFAULT 0,
  type        TEXT,
  target      INTEGER     DEFAULT 1,
  status      TEXT        NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Progression utilisateurs sur missions
CREATE TABLE IF NOT EXISTS user_missions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id UUID        NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  progress   INTEGER     NOT NULL DEFAULT 0,
  completed  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, mission_id)
);
ALTER TABLE user_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user voit ses missions" ON user_missions FOR ALL USING (auth.uid() = user_id);

-- Tirages mensuels
CREATE TABLE IF NOT EXISTS monthly_draws (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT        NOT NULL,
  prize      TEXT,
  draw_date  TIMESTAMPTZ NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'active',  -- active | completed | cancelled
  winner_id  UUID        REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Participations aux tirages
CREATE TABLE IF NOT EXISTS draw_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id     UUID        NOT NULL REFERENCES monthly_draws(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entries     INTEGER     NOT NULL DEFAULT 1,
  cost_coins  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draw_id, user_id)
);
ALTER TABLE draw_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user voit ses participations" ON draw_entries FOR ALL USING (auth.uid() = user_id);

-- Impact écologique — paramètres
CREATE TABLE IF NOT EXISTS impact_settings (
  id                          TEXT PRIMARY KEY DEFAULT 'default',
  donation_rate_percent       NUMERIC NOT NULL DEFAULT 5,
  platform_commission_percent NUMERIC NOT NULL DEFAULT 12,
  public_note                 TEXT
);
INSERT INTO impact_settings (id, donation_rate_percent, platform_commission_percent, public_note)
  VALUES ('default', 5, 12, 'Montants estimés en direct, confirmés mensuellement.')
  ON CONFLICT (id) DO NOTHING;

-- Impact écologique — organisations partenaires
CREATE TABLE IF NOT EXISTS impact_organisations (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT    NOT NULL,
  description       TEXT,
  website_url       TEXT,
  allocation_percent NUMERIC DEFAULT 33,
  sort_order        INTEGER DEFAULT 0,
  active            BOOLEAN DEFAULT TRUE
);
-- Insérer 3 orgs par défaut
INSERT INTO impact_organisations (name, description, website_url, allocation_percent, sort_order) VALUES
  ('Arbres Canada', 'Plantation d''arbres à travers le Canada', 'https://treecanada.ca', 34, 1),
  ('Équiterre', 'Accélérateur de la transition écologique au Québec', 'https://equiterre.org', 33, 2),
  ('La Fondation David Suzuki', 'Protection de la nature et du climat', 'https://davidsuzuki.org', 33, 3)
ON CONFLICT DO NOTHING;
```

---

### PRIORITÉ 1 — Supabase : exécuter les migrations SQL

**Action** : Copier-coller dans Supabase Dashboard → SQL Editor → Run

```sql
-- 1. Colonnes manquantes dans profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS transport_mode  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS eco_bonus       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disponible      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS driver_status   TEXT    DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS streak_jours    INTEGER DEFAULT 0;

-- 2. Table kyc_submissions
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name     TEXT        NOT NULL,
  last_name      TEXT        NOT NULL,
  dob            DATE        NOT NULL,
  phone          TEXT,
  address        TEXT,
  transport_mode TEXT        NOT NULL,
  eco_bonus      INTEGER     NOT NULL DEFAULT 0,
  doc_type       TEXT        NOT NULL,
  doc1_path      TEXT,
  doc2_path      TEXT,
  selfie_path    TEXT,
  statut         TEXT        NOT NULL DEFAULT 'pending',
  soumis_le      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at    TIMESTAMPTZ,
  reviewer_id    UUID        REFERENCES auth.users(id),
  reject_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_statut  ON kyc_submissions(statut);

-- 3. Table messages
CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expediteur_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinataire_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  livraison_id    UUID,
  contenu         TEXT        NOT NULL,
  lu              BOOLEAN     NOT NULL DEFAULT FALSE,
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_expediteur   ON messages(expediteur_id);
CREATE INDEX IF NOT EXISTS idx_msg_destinataire ON messages(destinataire_id);

-- 4. Table push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint  TEXT        NOT NULL UNIQUE,
  p256dh    TEXT        NOT NULL,
  auth      TEXT        NOT NULL,
  cree_le   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- 5. RLS
ALTER TABLE kyc_submissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "livreur voit son dossier"   ON kyc_submissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "livreur soumet son dossier" ON kyc_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin lit dossiers kyc"     ON kyc_submissions FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin modifie dossiers kyc" ON kyc_submissions FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "lire ses messages"  ON messages FOR SELECT USING (auth.uid() = expediteur_id OR auth.uid() = destinataire_id);
CREATE POLICY "envoyer un message" ON messages FOR INSERT WITH CHECK (auth.uid() = expediteur_id);
CREATE POLICY "marquer lu"         ON messages FOR UPDATE USING (auth.uid() = destinataire_id);

CREATE POLICY "livreur gere ses push" ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- 6. Storage bucket kyc-documents (privé)
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', FALSE) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "livreur upload docs"  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'kyc-documents' AND auth.uid()::TEXT = (storage.foldername(name))[1]);
CREATE POLICY "livreur lit ses docs" ON storage.objects FOR SELECT  USING  (bucket_id = 'kyc-documents' AND auth.uid()::TEXT = (storage.foldername(name))[1]);
CREATE POLICY "admin lit docs kyc"   ON storage.objects FOR SELECT  USING  (bucket_id = 'kyc-documents' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

**Après SQL** : Supabase Dashboard → Database → Replication → activer `messages` pour INSERT + UPDATE (pour le chat temps réel).

---

### PRIORITÉ 2 — Variables d'environnement Vercel

**Action** : Vercel Dashboard → projet porteaporte → Settings → Environment Variables

| Variable | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | `5St-YNoXKX2vMy3sZWYgihRB697D3j_2lyYj4BQB4w4dxvkwgc6ooE2qaAUUh9yHL7oDwF2y43hHzBk-5CPRkw` |
| `VAPID_PRIVATE_KEY` | `9wF6UdVIHHK5MlIjVd9_2MFRckbSWx0y2yr2ORMRwxk` |

Redéployer après ajout : `vercel --prod --yes`

---

### PRIORITÉ 3 — Déclencher le push quand une mission est créée

**Fichier** : `api/platform.js` → fonction `createLivraison()`

Trouver l'endroit où la livraison est insérée avec succès et ajouter APRÈS l'insertion :

```javascript
// Notifier les livreurs disponibles par push
try {
  await fetch(`${ctx.sbUrl}/rest/v1/rpc/send_push_to_available`, {
    method: 'POST',
    headers: sbHeaders(ctx.sbKey),
    body: JSON.stringify({
      p_type: 'nouvelle_mission',
      p_data: JSON.stringify({
        id: livraisonId,
        ville_depart: body.ville_depart,
        ville_arrivee: body.ville_arrivee,
        prix_total: body.prix_total
      })
    })
  });
} catch (_) {}
```

**OU** plus simple — appel interne direct dans `createLivraison` après l'INSERT :

```javascript
// Envoyer push à tous les livreurs disponibles (fire & forget)
fetch('https://porteaporte.site/api/push-send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-notifier-secret': process.env.INTERNAL_API_SECRET,
    'Authorization': `Bearer ${ctx.sbKey}`
  },
  body: JSON.stringify({
    type: 'nouvelle_mission',
    data: { id: livraisonId, ville_depart: body.ville_depart, ville_arrivee: body.ville_arrivee, prix_total: body.prix_total }
  })
}).catch(() => {});
```

---

### PRIORITÉ 4 — Dashboard expéditeur (dashboard-expediteur.html)

**Fichier à modifier** : `dashboard-expediteur.html` (existe déjà mais basique)

**Ce qu'il faut ajouter/refaire** :

#### A) Créer une livraison (formulaire complet)
- Ville départ / arrivée (avec autocomplétion si possible)
- Type de colis (document, vêtements, électronique, nourriture, fragile, autre)
- Poids estimé (kg)
- Valeur déclarée ($)
- Date souhaitée
- Notes spéciales
- Bouton → appelle `/api/create-livraison`

#### B) Mes livraisons en cours
- Liste des livraisons avec statut coloré :
  - `publie` = Jaune "En attente de livreur"
  - `confirme` = Bleu "Livreur assigné"
  - `en_route` = Orange "En route"
  - `livre` = Vert "Livré — En attente de confirmation"
  - `payee` = Gris "Complété"
- Bouton "Confirmer réception" → appelle `/api/confirm-delivery`
- Bouton "Voir le livreur" → ouvre messagerie

#### C) Historique
- Livraisons passées (statut payee/annule)
- Montant payé, date, livreur

#### D) Laisser un avis
- Après confirmation → formulaire 1-5 étoiles + commentaire
- INSERT dans table `reviews` (colonnes : `reviewed_id`=livreur_id, `reviewer_id`=user_id, `rating`, `comment`, `delivery_id`)

**Pattern Supabase à utiliser** :
```javascript
const db = window.getSupabaseClient();
const { data: { session } } = await db.auth.getSession();
// Token pour les API calls :
const token = session.access_token;
```

---

### PRIORITÉ 5 — Panel admin complet

**Fichier** : `admin/` (créer `admin/dashboard.html` ou enrichir l'existant)

**Sections à créer** :

#### A) Stats business (en temps réel)
```javascript
// Données à afficher :
// - Total livraisons (toutes), cette semaine, ce mois
// - Revenus plateforme (prix_total * 0.15 = commission)
// - Livreurs actifs (disponible=true)
// - Taux de complétion (livre/total)
// - Litiges ouverts
```

#### B) Gestion utilisateurs
- Liste paginée avec filtre (livreur / expediteur / admin / suspendu)
- Colonnes : nom, email, rôle, ville, inscrit le, statut KYC, nb livraisons
- Actions : Suspendre / Réactiver / Passer admin / Voir profil

Requête Supabase (service key requise) :
```javascript
const { data } = await db.from('profiles')
  .select('id,email,prenom,nom,role,suspendu,driver_status,cree_le,ville')
  .order('cree_le', { ascending: false });
```

#### C) Gestion litiges
- Table `litiges` (à créer si n'existe pas) avec : `id`, `livraison_id`, `plaignant_id`, `type_litige`, `description`, `statut`, `resolution`, `cree_le`
- Interface : voir détail, marquer résolu, rembourser via Stripe (`/api/platform?endpoint=refund-payment`)

#### D) Contrôle KYC (déjà fait dans `admin/kyc-review.html`)
- Lien vers ce fichier depuis le panel admin

---

### PRIORITÉ 6 — Notifications dans l'app (badge + centre)

**Fichier** : ajouter dans `dashboard-livreur.html` et `dashboard-expediteur.html`

Un badge cloche 🔔 dans la topbar qui ouvre un dropdown avec les dernières notifs :

```javascript
// Charger depuis Supabase table 'notifications' (à créer)
// Structure : id, user_id, type, titre, corps, lu, cree_le
const { data: notifs } = await db.from('notifications')
  .select('*')
  .eq('user_id', session.user.id)
  .eq('lu', false)
  .order('cree_le', { ascending: false })
  .limit(10);
```

SQL à exécuter :
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type     TEXT        NOT NULL,
  titre    TEXT        NOT NULL,
  corps    TEXT,
  lu       BOOLEAN     NOT NULL DEFAULT FALSE,
  cree_le  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, lu);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user voit ses notifs" ON notifications FOR ALL USING (auth.uid() = user_id);
```

---

### PRIORITÉ 7 — GPS Tracker (gps-tracker.html)

**Fichier** : `gps-tracker.html` (existe peut-être déjà, à vérifier)

Page affichée quand le livreur est en route :
- Carte Leaflet plein écran avec position livreur en temps réel
- Bouton "Je suis arrivé" → appelle `/api/platform?endpoint=confirm-delivery`
- Mise à jour GPS toutes les 30s → `/api/platform?endpoint=gps-update`
- Visible aussi par l'expéditeur (read-only) via `/api/platform?endpoint=tracking`

---

## Architecture des fichiers importants

```
Site/
├── api/
│   ├── platform.js          ← Router principal (12 endpoints + push)
│   ├── notifier.js          ← Emails SendGrid
│   ├── stripe.js            ← Paiements Stripe
│   ├── stripe-webhook.js    ← Webhooks Stripe
│   ├── matching.js          ← Score compatibilité mission/livreur
│   ├── webauthn.js          ← Biométrie WebAuthn
│   ├── cancel-livraison.js  ← Annulation
│   ├── capture-livraison.js ← Capture paiement
│   ├── paiement-livraison.js← Paiement livreur
│   ├── maps-config.js       ← Clé Google Maps
│   ├── logger.js            ← Logs
│   └── turnstile-verify.js  ← Captcha Cloudflare
├── js/
│   ├── supabase-config.js   ← window.getSupabaseClient()
│   ├── push-manager.js      ← Web Push frontend
│   ├── support-widget.js    ← Chatbot widget
│   └── modal-helper.js      ← Modals utilitaires
├── assets/
│   └── brand-uniform.css    ← Variables CSS globales
├── sw.js                    ← Service Worker push
├── vercel.json              ← Config Vercel + rewrites
├── package.json             ← { "web-push": "^3.6.7", "@supabase/supabase-js": "^2.45.0" }
└── .vercelignore            ← Exclut save/, node_modules/
```

---

## Variables d'environnement Vercel (toutes)

| Variable | Usage |
|---|---|
| `SUPABASE_URL` | URL Supabase |
| `SUPABASE_SERVICE_KEY` | Clé service Supabase (admin) |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secret webhook Stripe |
| `SENDGRID_API_KEY` | Clé SendGrid emails |
| `FROM_EMAIL` | notifications@porteaporte.site |
| `ADMIN_EMAIL` | Email admin |
| `INTERNAL_API_SECRET` | Secret inter-services |
| `ALLOWED_ORIGIN` | https://porteaporte.site |
| `VAPID_PUBLIC_KEY` | À ajouter (voir priorité 2) |
| `VAPID_PRIVATE_KEY` | À ajouter (voir priorité 2) |

---

## Règles importantes à respecter

1. **Jamais dépasser 12 fichiers `.js` dans `/api/`** — ajouter les nouveaux endpoints dans `platform.js`
2. **Toujours utiliser `window.getSupabaseClient()`** — jamais `createClient()` directement dans les pages HTML
3. **CSS** : utiliser les variables `--brand-*` de `brand-uniform.css`, ne jamais hardcoder les couleurs
4. **Déploiement** : `vercel --prod --yes` depuis `C:\Users\User\OneDrive\Desktop\Site\`
5. **Backups** : créer `save/regression5/` avant toute grosse modification
6. **Langue** : tout le texte UI est en français canadien
7. **Sécurité** : les endpoints sensibles dans `platform.js` vérifient la session + le rôle avant d'agir

---

## Comment ajouter un endpoint à platform.js

```javascript
// 1. Ajouter le routing dans le handler (vers ligne 775) :
if (endpoint === 'mon-endpoint') return await monEndpoint(req, res, ctx, body);

// 2. Créer la fonction à la fin du fichier :
async function monEndpoint(req, res, ctx, body) {
  // ctx.session = session Supabase de l'utilisateur
  // ctx.profile = profil (role, suspendu, etc.)
  // ctx.sbUrl   = URL Supabase
  // ctx.sbKey   = clé service
  // body        = req.body
  return res.status(200).json({ ok: true });
}

// 3. Ajouter le rewrite dans vercel.json :
{ "source": "/api/mon-endpoint", "destination": "/api/platform?endpoint=mon-endpoint" }
```

---

*Ce document a été généré automatiquement par Claude Code pour permettre la continuation du développement avec un autre assistant.*
