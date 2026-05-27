-- ════════════════════════════════════════════════════════════
-- Migration : Messagerie in-app pour covoiturage
-- À exécuter dans le SQL Editor Supabase
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ride_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id     UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ridemsg_ride       ON ride_messages(ride_id);
CREATE INDEX IF NOT EXISTS idx_ridemsg_recipient  ON ride_messages(recipient_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ridemsg_thread     ON ride_messages(ride_id, sender_id, recipient_id, created_at);

-- RLS : seuls expéditeur / destinataire / admin peuvent lire
ALTER TABLE ride_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ridemsg_read ON ride_messages;
CREATE POLICY ridemsg_read ON ride_messages
  FOR SELECT
  USING (
    sender_id = auth.uid()
    OR recipient_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS ridemsg_insert ON ride_messages;
CREATE POLICY ridemsg_insert ON ride_messages
  FOR INSERT
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS ridemsg_update_read ON ride_messages;
CREATE POLICY ridemsg_update_read ON ride_messages
  FOR UPDATE
  USING (recipient_id = auth.uid());
