-- TERPGRID Schema v1 (Server). Läuft als Owner-Rolle; die App nutzt die Rolle
-- terpgrid_app (ohne Owner-Rechte, ohne BYPASSRLS).

CREATE TABLE users (
  id uuid PRIMARY KEY,
  login_name text NOT NULL UNIQUE CHECK (char_length(login_name) BETWEEN 3 AND 64 AND login_name = lower(login_name)),
  login_kind text NOT NULL CHECK (login_kind IN ('username', 'generated')),
  display_name text CHECK (display_name IS NULL OR char_length(display_name) <= 60),
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  totp_secret bytea,
  totp_enabled boolean NOT NULL DEFAULT false,
  totp_last_step bigint,
  dek_wrapped bytea NOT NULL,
  dek_key_version integer NOT NULL,
  age_confirmed_at timestamptz NOT NULL,
  storage_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE sessions (
  id bytea PRIMARY KEY,                      -- SHA-256 des Tokens; Token selbst wird nie gespeichert
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reauth_at timestamptz,
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 160),
  ip_tag text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

CREATE TABLE recovery_codes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  PRIMARY KEY (user_id, code_hash)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  token_hash bytea NOT NULL UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz
);

CREATE SEQUENCE records_seq;

CREATE TABLE records (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store text NOT NULL CHECK (store IN ('grows','plants','activities','photos','reminders','strains','journal','inventory','expenses','calculations','labReports','settings')),
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  version integer NOT NULL CHECK (version > 0),
  seq bigint NOT NULL DEFAULT nextval('records_seq'),
  deleted boolean NOT NULL DEFAULT false,
  payload bytea,
  payload_mac bytea,
  size integer NOT NULL DEFAULT 0 CHECK (size >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store, id),
  CHECK (deleted OR payload IS NOT NULL)
);
CREATE INDEX records_user_seq_idx ON records(user_id, seq);

CREATE TABLE files (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo', 'labdoc')),
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  variant text NOT NULL CHECK (variant IN ('full', 'thumb', 'doc')),
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size bigint NOT NULL CHECK (size > 0),
  storage_name text NOT NULL UNIQUE CHECK (storage_name ~ '^[a-f0-9]{48}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, id, variant)
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_tag text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_created_idx ON audit_events(created_at);
CREATE INDEX audit_type_idx ON audit_events(type, created_at);

-- Row Level Security als zweite Schutzschicht für private Inhalte
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE records FORCE ROW LEVEL SECURITY;
CREATE POLICY records_owner ON records
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
CREATE POLICY files_owner ON files
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- Rechte der App-Rolle (muss existieren – wird vom DB-Init-Skript angelegt)
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, recovery_codes, invitations, records, files TO terpgrid_app;
GRANT SELECT, INSERT, DELETE ON audit_events TO terpgrid_app;
GRANT USAGE ON SEQUENCE records_seq, audit_events_id_seq TO terpgrid_app;
