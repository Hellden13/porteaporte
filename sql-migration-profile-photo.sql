-- ════════════════════════════════════════════════════════════
-- Migration : Photo de profil avec modération + visibilité
-- ════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS photo_status TEXT DEFAULT 'none'
    CHECK (photo_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS photo_visible_to_others BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS photo_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_moderation_reason TEXT;

-- Index pour file de modération admin
CREATE INDEX IF NOT EXISTS idx_profiles_photo_pending
  ON profiles(photo_submitted_at DESC) WHERE photo_status = 'pending';

-- Si on a déjà des photos déjà uploadées (legacy), marquer comme approved automatiquement
UPDATE profiles
SET photo_status = 'approved', photo_moderated_at = now()
WHERE photo_url IS NOT NULL AND photo_status = 'none';
