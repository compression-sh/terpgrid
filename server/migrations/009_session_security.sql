-- Phase 5.7: Anmeldemethode je Sitzung (für die Sitzungsübersicht), rein additiv.
-- Bestehende Sitzungen behalten NULL („unbekannt“).
ALTER TABLE sessions ADD COLUMN auth_method text
  CHECK (auth_method IS NULL OR auth_method IN ('password', 'totp', 'passkey', 'recovery', 'register'));
