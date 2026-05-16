-- ============================================================
-- MIGRATION COVOITURAGE — PorteàPorte
-- Ordre : CREATE TABLES → ENABLE RLS → DROP POLICIES → CREATE POLICIES → INDEXES
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLES
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rides (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Localisation (secteur public, coordonnées pour calcul)
  start_city              TEXT NOT NULL,
  start_sector            TEXT,
  start_lat               NUMERIC(10,7),
  start_lng               NUMERIC(10,7),
  end_city                TEXT NOT NULL,
  end_sector              TEXT,
  end_lat                 NUMERIC(10,7),
  end_lng                 NUMERIC(10,7),
  -- Horaire
  departure_time          TIMESTAMPTZ NOT NULL,
  flexibility_minutes     INTEGER DEFAULT 0,
  is_return_trip          BOOLEAN DEFAULT FALSE,
  return_departure_time   TIMESTAMPTZ,
  is_recurring            BOOLEAN DEFAULT FALSE,
  recurrence_days         TEXT[],
  -- Véhicule
  vehicle_type            TEXT DEFAULT 'berline',
  trunk_size              TEXT DEFAULT 'moyen' CHECK (trunk_size IN ('petit','moyen','grand')),
  -- Options
  available_seats         INTEGER NOT NULL DEFAULT 1 CHECK (available_seats BETWEEN 1 AND 8),
  accepts_pets            BOOLEAN DEFAULT FALSE,
  accepts_large_luggage   BOOLEAN DEFAULT FALSE,
  accepts_extra_stops     BOOLEAN DEFAULT FALSE,
  non_smoker              BOOLEAN DEFAULT TRUE,
  women_only              BOOLEAN DEFAULT FALSE,
  child_seat_available    BOOLEAN DEFAULT FALSE,
  accessible              BOOLEAN DEFAULT FALSE,
  -- Règles et notes
  personal_rules          TEXT,
  -- Tarification
  cost_per_km             NUMERIC(5,2) DEFAULT 0.35,
  total_distance_km       NUMERIC(8,2),
  -- Statut
  status                  TEXT DEFAULT 'publie' CHECK (status IN ('publie','complet','annule','termine')),
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_stops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id     UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  stop_order  INTEGER NOT NULL,
  city        TEXT NOT NULL,
  sector      TEXT,
  lat         NUMERIC(10,7),
  lng         NUMERIC(10,7),
  eta         TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id               UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Points embarquement/débarquement (secteur public, coords privées)
  pickup_city           TEXT NOT NULL,
  pickup_sector         TEXT,
  pickup_lat            NUMERIC(10,7),
  pickup_lng            NUMERIC(10,7),
  dropoff_city          TEXT NOT NULL,
  dropoff_sector        TEXT,
  dropoff_lat           NUMERIC(10,7),
  dropoff_lng           NUMERIC(10,7),
  -- Détails réservation
  seats_reserved        INTEGER DEFAULT 1 CHECK (seats_reserved >= 1),
  has_large_luggage     BOOLEAN DEFAULT FALSE,
  has_pet               BOOLEAN DEFAULT FALSE,
  extra_stops_count     INTEGER DEFAULT 0,
  requested_detour_km   NUMERIC(6,2) DEFAULT 0,
  special_requests      TEXT,
  -- Calcul prix
  passenger_distance_km NUMERIC(8,2),
  base_share            NUMERIC(8,2),
  luggage_fee           NUMERIC(6,2) DEFAULT 0,
  pet_fee               NUMERIC(6,2) DEFAULT 0,
  stop_fee              NUMERIC(6,2) DEFAULT 0,
  detour_fee            NUMERIC(6,2) DEFAULT 0,
  platform_fee          NUMERIC(6,2) DEFAULT 0,
  driver_amount         NUMERIC(8,2),
  total_passenger       NUMERIC(8,2),
  -- Statut
  status                TEXT DEFAULT 'en_attente' CHECK (status IN ('en_attente','confirme','annule_passager','annule_chauffeur','complete')),
  confirmed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ride_id, passenger_id)
);

CREATE TABLE IF NOT EXISTS ride_price_breakdowns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES ride_bookings(id) ON DELETE CASCADE,
  -- Snapshot du calcul pour transparence
  cost_per_km     NUMERIC(5,2),
  total_distance  NUMERIC(8,2),
  total_cost_base NUMERIC(8,2),
  pax_distance    NUMERIC(8,2),
  pax_share_pct   NUMERIC(5,2),
  pax_base        NUMERIC(8,2),
  extras_detail   JSONB DEFAULT '{}',
  platform_pct    NUMERIC(5,2) DEFAULT 10,
  driver_receives NUMERIC(8,2),
  passenger_pays  NUMERIC(8,2),
  calculated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id      UUID REFERENCES rides(id) ON DELETE SET NULL,
  booking_id   UUID REFERENCES ride_bookings(id) ON DELETE SET NULL,
  reporter_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason       TEXT NOT NULL,
  details      TEXT,
  status       TEXT DEFAULT 'ouvert' CHECK (status IN ('ouvert','en_traitement','resolu','ferme')),
  admin_notes  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 2. ENABLE ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE rides                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_stops            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_bookings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_price_breakdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_reports          ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3. DROP POLICIES IF EXISTS (évite 42710)
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "rides_public_read"         ON rides;
DROP POLICY IF EXISTS "rides_driver_insert"       ON rides;
DROP POLICY IF EXISTS "rides_driver_update"       ON rides;
DROP POLICY IF EXISTS "rides_admin_all"           ON rides;

DROP POLICY IF EXISTS "stops_public_read"         ON ride_stops;
DROP POLICY IF EXISTS "stops_driver_manage"       ON ride_stops;
DROP POLICY IF EXISTS "stops_admin_all"           ON ride_stops;

DROP POLICY IF EXISTS "bookings_passenger_read"   ON ride_bookings;
DROP POLICY IF EXISTS "bookings_driver_read"      ON ride_bookings;
DROP POLICY IF EXISTS "bookings_passenger_insert" ON ride_bookings;
DROP POLICY IF EXISTS "bookings_update_parties"   ON ride_bookings;
DROP POLICY IF EXISTS "bookings_admin_all"        ON ride_bookings;

DROP POLICY IF EXISTS "breakdown_own_read"        ON ride_price_breakdowns;
DROP POLICY IF EXISTS "breakdown_admin_all"       ON ride_price_breakdowns;

DROP POLICY IF EXISTS "reports_reporter_insert"   ON ride_reports;
DROP POLICY IF EXISTS "reports_reporter_read"     ON ride_reports;
DROP POLICY IF EXISTS "reports_admin_all"         ON ride_reports;

-- ────────────────────────────────────────────────────────────
-- 4. CREATE POLICIES
-- ────────────────────────────────────────────────────────────

-- rides : lecture publique (données limitées — coords masquées par SELECT dans l'API)
CREATE POLICY "rides_public_read" ON rides
  FOR SELECT USING (status = 'publie');

-- rides : chauffeur peut insérer ses trajets
CREATE POLICY "rides_driver_insert" ON rides
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

-- rides : chauffeur peut modifier/annuler ses propres trajets
CREATE POLICY "rides_driver_update" ON rides
  FOR UPDATE USING (auth.uid() = driver_id);

-- rides : admin voit tout
CREATE POLICY "rides_admin_all" ON rides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ride_stops : lecture publique des arrêts des trajets publiés
CREATE POLICY "stops_public_read" ON ride_stops
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rides WHERE rides.id = ride_stops.ride_id AND rides.status = 'publie')
  );

-- ride_stops : chauffeur gère ses propres arrêts
CREATE POLICY "stops_driver_manage" ON ride_stops
  FOR ALL USING (
    EXISTS (SELECT 1 FROM rides WHERE rides.id = ride_stops.ride_id AND rides.driver_id = auth.uid())
  );

CREATE POLICY "stops_admin_all" ON ride_stops
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ride_bookings : passager voit ses réservations
CREATE POLICY "bookings_passenger_read" ON ride_bookings
  FOR SELECT USING (auth.uid() = passenger_id);

-- ride_bookings : chauffeur voit les réservations de ses trajets
CREATE POLICY "bookings_driver_read" ON ride_bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rides WHERE rides.id = ride_bookings.ride_id AND rides.driver_id = auth.uid())
  );

-- ride_bookings : passager peut réserver
CREATE POLICY "bookings_passenger_insert" ON ride_bookings
  FOR INSERT WITH CHECK (auth.uid() = passenger_id);

-- ride_bookings : passager ou chauffeur peut modifier le statut
CREATE POLICY "bookings_update_parties" ON ride_bookings
  FOR UPDATE USING (
    auth.uid() = passenger_id OR
    EXISTS (SELECT 1 FROM rides WHERE rides.id = ride_bookings.ride_id AND rides.driver_id = auth.uid())
  );

CREATE POLICY "bookings_admin_all" ON ride_bookings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ride_price_breakdowns : passager ou chauffeur lit son propre breakdown
CREATE POLICY "breakdown_own_read" ON ride_price_breakdowns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ride_bookings rb
      JOIN rides r ON r.id = rb.ride_id
      WHERE rb.id = ride_price_breakdowns.booking_id
        AND (rb.passenger_id = auth.uid() OR r.driver_id = auth.uid())
    )
  );

CREATE POLICY "breakdown_admin_all" ON ride_price_breakdowns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ride_reports : reporter peut insérer et lire les siens
CREATE POLICY "reports_reporter_insert" ON ride_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "reports_reporter_read" ON ride_reports
  FOR SELECT USING (auth.uid() = reporter_id);

CREATE POLICY "reports_admin_all" ON ride_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ────────────────────────────────────────────────────────────
-- 5. INDEXES
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rides_driver        ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_departure     ON rides(departure_time);
CREATE INDEX IF NOT EXISTS idx_rides_status        ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_start_city    ON rides(start_city);
CREATE INDEX IF NOT EXISTS idx_rides_end_city      ON rides(end_city);

CREATE INDEX IF NOT EXISTS idx_ride_stops_ride     ON ride_stops(ride_id, stop_order);

CREATE INDEX IF NOT EXISTS idx_bookings_ride       ON ride_bookings(ride_id);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger  ON ride_bookings(passenger_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status     ON ride_bookings(status);

CREATE INDEX IF NOT EXISTS idx_breakdown_booking   ON ride_price_breakdowns(booking_id);

CREATE INDEX IF NOT EXISTS idx_reports_ride        ON ride_reports(ride_id);
CREATE INDEX IF NOT EXISTS idx_reports_status      ON ride_reports(status);

-- ────────────────────────────────────────────────────────────
-- 6. TRIGGER updated_at automatique
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS rides_updated_at         ON rides;
DROP TRIGGER IF EXISTS ride_bookings_updated_at ON ride_bookings;

CREATE TRIGGER rides_updated_at
  BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ride_bookings_updated_at
  BEFORE UPDATE ON ride_bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();