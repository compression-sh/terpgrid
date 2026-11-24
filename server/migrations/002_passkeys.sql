-- Passkeys (WebAuthn). Öffentliche Schlüssel sind nicht geheim; die Credential-ID ist eindeutig
-- und bindet den Schlüssel an genau ein Konto (Schutz vor Credential-Substitution).
CREATE TABLE webauthn_credentials (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE CHECK (credential_id ~ '^[A-Za-z0-9_-]+$' AND char_length(credential_id) BETWEEN 16 AND 1400),
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports text[] NOT NULL DEFAULT '{}',
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  device_type text NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX webauthn_user_idx ON webauthn_credentials(user_id);

-- Zufälliger WebAuthn-User-Handle je Konto (nicht die interne Benutzer-ID)
ALTER TABLE users ADD COLUMN webauthn_user_id bytea UNIQUE;

GRANT SELECT, INSERT, UPDATE, DELETE ON webauthn_credentials TO terpgrid_app;
