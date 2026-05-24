-- Migration table rides (covoiturage) — à exécuter dans Supabase SQL Editor
-- Crée la table si manquante + ajoute toutes les colonnes optionnelles

CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  start_city TEXT NOT NULL,
  end_city TEXT NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  available_seats INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'publie',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ajoute toutes les colonnes optionnelles utilisées par le formulaire publier
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS start_sector TEXT,
  ADD COLUMN IF NOT EXISTS start_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS start_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS end_sector TEXT,
  ADD COLUMN IF NOT EXISTS end_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS end_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS flexibility_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_return_trip BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_departure_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_days JSONB,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT 'berline',
  ADD COLUMN IF NOT EXISTS trunk_size TEXT DEFAULT 'moyen',
  ADD COLUMN IF NOT EXISTS accepts_pets BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepts_large_luggage BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepts_extra_stops BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepts_packages BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS package_max_kg NUMERIC DEFAULT 10,
  ADD COLUMN IF NOT EXISTS package_max_dim_cm NUMERIC DEFAULT 60,
  ADD COLUMN IF NOT EXISTS non_smoker BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS smoking_policy TEXT DEFAULT 'non_fumeur',
  ADD COLUMN IF NOT EXISTS music_policy TEXT DEFAULT 'selon_humeur',
  ADD COLUMN IF NOT EXISTS chat_policy TEXT DEFAULT 'selon_humeur',
  ADD COLUMN IF NOT EXISTS ac_available BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS women_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS child_seat_available BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS accessible BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS personal_rules TEXT,
  ADD COLUMN IF NOT EXISTS cost_per_km NUMERIC DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS total_distance_km NUMERIC,
  ADD COLUMN IF NOT EXISTS stop_points JSONB DEFAULT '[]'::jsonb;

-- Indexes utiles
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_departure ON rides(departure_time);
CREATE INDEX IF NOT EXISTS idx_rides_cities ON rides(LOWER(start_city), LOWER(end_city));

-- RLS
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;

-- Politique : lecture publique des trajets publiés
DROP POLICY IF EXISTS "Read published rides" ON rides;
CREATE POLICY "Read published rides" ON rides FOR SELECT
  USING (status IN ('publie', 'complet'));

-- Politique : driver peut tout faire sur ses propres trajets
DROP POLICY IF EXISTS "Driver manages own rides" ON rides;
CREATE POLICY "Driver manages own rides" ON rides FOR ALL
  USING (driver_id = auth.uid());

-- Vérification
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'rides' ORDER BY ordinal_position;
