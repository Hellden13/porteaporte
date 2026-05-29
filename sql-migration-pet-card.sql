-- ════════════════════════════════════════════════════════════
-- Migration : Carte d'accès animal pour les passagers
-- Le conducteur peut voir l'animal avant d'accepter la réservation
-- ════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pet_name TEXT,
  ADD COLUMN IF NOT EXISTS pet_species TEXT CHECK (pet_species IN ('chien', 'chat', 'oiseau', 'rongeur', 'autre')),
  ADD COLUMN IF NOT EXISTS pet_breed TEXT,
  ADD COLUMN IF NOT EXISTS pet_size TEXT CHECK (pet_size IN ('petit', 'moyen', 'grand')),
  ADD COLUMN IF NOT EXISTS pet_weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS pet_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS pet_photo_status TEXT DEFAULT 'none'
    CHECK (pet_photo_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS pet_vaccinated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pet_carrier BOOLEAN DEFAULT false,  -- voyage dans une cage de transport
  ADD COLUMN IF NOT EXISTS pet_notes TEXT;  -- ex : "calme, dort pendant les trajets"

CREATE INDEX IF NOT EXISTS idx_profiles_pet_pending
  ON profiles(updated_at DESC) WHERE pet_photo_status = 'pending';
