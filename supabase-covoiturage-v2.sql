-- ============================================================
-- PorteàPorte — Covoiturage v2
-- Colis, points sécuritaires, score confiance multi-dimensions
-- ============================================================

-- ── 1. COLIS DANS LES TRAJETS ────────────────────────────────
ALTER TABLE rides ADD COLUMN IF NOT EXISTS accepts_packages    BOOLEAN DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS package_max_kg      NUMERIC(5,1) DEFAULT 10;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS package_max_dim_cm  SMALLINT DEFAULT 60;  -- plus grande dimension

ALTER TABLE ride_bookings ADD COLUMN IF NOT EXISTS booking_type   TEXT DEFAULT 'passenger'
  CHECK (booking_type IN ('passenger','package','both'));
ALTER TABLE ride_bookings ADD COLUMN IF NOT EXISTS package_weight_kg   NUMERIC(5,1);
ALTER TABLE ride_bookings ADD COLUMN IF NOT EXISTS package_description TEXT;
ALTER TABLE ride_bookings ADD COLUMN IF NOT EXISTS package_fee         NUMERIC(8,2) DEFAULT 0;
ALTER TABLE ride_bookings ADD COLUMN IF NOT EXISTS pickup_point_id     UUID;
ALTER TABLE ride_bookings ADD COLUMN IF NOT EXISTS dropoff_point_id    UUID;

-- ── 2. POINTS SÉCURITAIRES D'EMBARQUEMENT ────────────────────
CREATE TABLE IF NOT EXISTS safe_meeting_points (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('tim_hortons','mcdo','walmart','canadian_tire','metro_station','bus_terminal','gas_station','mall','pharmacie','autre')),
  address     TEXT,
  city        TEXT NOT NULL,
  province    TEXT DEFAULT 'QC',
  lat         NUMERIC(10,7),
  lng         NUMERIC(10,7),
  verified    BOOLEAN DEFAULT false,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE safe_meeting_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "smp_public_read"  ON safe_meeting_points;
DROP POLICY IF EXISTS "smp_admin_write"  ON safe_meeting_points;
CREATE POLICY "smp_public_read"  ON safe_meeting_points FOR SELECT USING (active = true);
CREATE POLICY "smp_admin_write"  ON safe_meeting_points FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Index géographique
CREATE INDEX IF NOT EXISTS idx_smp_city ON safe_meeting_points(city);
CREATE INDEX IF NOT EXISTS idx_smp_type ON safe_meeting_points(type);

-- Données initiales — grandes villes QC
INSERT INTO safe_meeting_points (name, type, city, address, verified) VALUES
  ('Tim Hortons Laurier',          'tim_hortons',   'Québec',    '2900 boul. Laurier',        true),
  ('Tim Hortons Sainte-Foy',       'tim_hortons',   'Québec',    '3250 ch. des Quatre-Bourgeois', true),
  ('Walmart Beauport',             'walmart',        'Québec',    '955 boul. Raymond',         true),
  ('Centre Commercial Laurier',    'mall',           'Québec',    '2700 boul. Laurier',        true),
  ('Terminus de Sainte-Foy',       'bus_terminal',   'Québec',    '3001 ch. des Quatre-Bourgeois', true),
  ('Tim Hortons Beaubien',         'tim_hortons',   'Montréal',  '1505 rue Beaubien E',        true),
  ('Métro Berri-UQAM',             'metro_station',  'Montréal',  '109 rue Berri',             true),
  ('Métro Longueuil',              'metro_station',  'Longueuil', '1 Place Charles-Le Moyne',  true),
  ('Walmart Laval',                'walmart',        'Laval',     '3035 boul. Le Carrefour',   true),
  ('Tim Hortons Sherbrooke Centre','tim_hortons',   'Sherbrooke','2600 rue King O',            true),
  ('Tim Hortons Drummondville',    'tim_hortons',   'Drummondville','1450 boul. René-Lévesque', true),
  ('Canadian Tire Trois-Rivières', 'canadian_tire', 'Trois-Rivières','2960 boul. Jean-XXIII',  true),
  ('Walmart Chicoutimi',           'walmart',        'Saguenay',  '1390 boul. Talbot',         true),
  ('Tim Hortons Rimouski',         'tim_hortons',   'Rimouski',  '340 boul. Arthur-Buies',    true),
  ('Provigo Rouyn-Noranda',        'pharmacie',     'Rouyn-Noranda','101 av. Principale',       true)
ON CONFLICT DO NOTHING;

-- ── 3. SCORE CONFIANCE MULTI-DIMENSIONS ──────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS score_ponctualite   SMALLINT DEFAULT 0 CHECK (score_ponctualite   BETWEEN 0 AND 100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS score_fiabilite     SMALLINT DEFAULT 0 CHECK (score_fiabilite     BETWEEN 0 AND 100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS score_comportement  SMALLINT DEFAULT 0 CHECK (score_comportement  BETWEEN 0 AND 100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS taux_annulation     NUMERIC(5,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nb_trajets_chauffeur INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nb_trajets_passager  INTEGER DEFAULT 0;

-- Enrichir les reviews covoiturage avec les sous-scores
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS note_ponctualite  SMALLINT CHECK (note_ponctualite  BETWEEN 1 AND 5);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS note_fiabilite    SMALLINT CHECK (note_fiabilite    BETWEEN 1 AND 5);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS note_comportement SMALLINT CHECK (note_comportement BETWEEN 1 AND 5);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS ride_id           UUID REFERENCES rides(id) ON DELETE SET NULL;

-- Vue score confiance global calculé
CREATE OR REPLACE VIEW v_driver_scores AS
SELECT
  p.id                                                          AS user_id,
  p.prenom,
  p.score_confiance                                             AS score_global,
  p.score_ponctualite,
  p.score_fiabilite,
  p.score_comportement,
  p.taux_annulation,
  p.nb_trajets_chauffeur,
  p.nb_trajets_passager,
  COALESCE(ROUND(AVG(r.note)::numeric, 2), 0)                  AS note_moyenne,
  COUNT(r.id)                                                   AS nb_avis,
  COALESCE(ROUND(AVG(r.note_ponctualite)::numeric, 2), 0)      AS note_moy_ponctualite,
  COALESCE(ROUND(AVG(r.note_fiabilite)::numeric, 2), 0)        AS note_moy_fiabilite,
  COALESCE(ROUND(AVG(r.note_comportement)::numeric, 2), 0)     AS note_moy_comportement
FROM profiles p
LEFT JOIN reviews r ON r.driver_id = p.id
GROUP BY p.id, p.prenom, p.score_confiance, p.score_ponctualite,
         p.score_fiabilite, p.score_comportement,
         p.taux_annulation, p.nb_trajets_chauffeur, p.nb_trajets_passager;

-- ── 4. SETTINGS — frais colis ────────────────────────────────
ALTER TABLE impact_settings ADD COLUMN IF NOT EXISTS ride_fee_package_base   NUMERIC(8,2) DEFAULT 8.00;
ALTER TABLE impact_settings ADD COLUMN IF NOT EXISTS ride_fee_package_per_kg NUMERIC(8,2) DEFAULT 1.50;

-- ── 5. INDEX PERFORMANCES ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rides_packages  ON rides(accepts_packages) WHERE accepts_packages = true;
CREATE INDEX IF NOT EXISTS idx_bookings_type   ON ride_bookings(booking_type);

-- ── Vérification ─────────────────────────────────────────────
SELECT COUNT(*) AS points_securitaires FROM safe_meeting_points;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('score_ponctualite','score_fiabilite','score_comportement','taux_annulation','nb_trajets_chauffeur')
ORDER BY column_name;
