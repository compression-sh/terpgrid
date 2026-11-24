-- Versionierte Datenschlüssel je Konto (Rotation des DEK).
-- Jede verschlüsselte Zeile vermerkt die Schlüsselgeneration (dek_gen), mit der sie
-- verschlüsselt wurde. Alte Generationen bleiben erhalten („retiring“ → „retired“),
-- bis keine Zeile und kein Backup sie mehr benötigt (purge-retired-keys).
CREATE TABLE user_keys (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gen integer NOT NULL CHECK (gen > 0),
  dek_wrapped bytea NOT NULL,
  kek_version integer NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'retiring', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY (user_id, gen)
);
-- Höchstens eine aktive Generation je Konto
CREATE UNIQUE INDEX user_keys_one_active ON user_keys(user_id) WHERE state = 'active';

-- Bestehende Schlüssel werden Generation 1 (unverändert, kein Neuverschlüsseln nötig)
INSERT INTO user_keys(user_id, gen, dek_wrapped, kek_version, state)
  SELECT id, 1, dek_wrapped, dek_key_version, 'active' FROM users;

-- Veraltete Kopie von Generation 1 in users: darf nach dem Purge entfallen
ALTER TABLE users ALTER COLUMN dek_wrapped DROP NOT NULL;
ALTER TABLE users ALTER COLUMN dek_key_version DROP NOT NULL;
ALTER TABLE users ADD COLUMN dek_gen integer NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN totp_dek_gen integer NOT NULL DEFAULT 1;
ALTER TABLE records ADD COLUMN dek_gen integer NOT NULL DEFAULT 1;
ALTER TABLE files ADD COLUMN dek_gen integer NOT NULL DEFAULT 1;
CREATE INDEX records_user_gen_idx ON records(user_id, dek_gen);
CREATE INDEX files_user_gen_idx ON files(user_id, dek_gen);

-- Papierkorb für ersetzte/gelöschte Datei-Blobs: Blobs werden erst nach einer Frist
-- gelöscht. So passt ein DB-Dump immer zu einem danach gesicherten Dateistand.
CREATE TABLE file_trash (
  storage_name text PRIMARY KEY CHECK (storage_name ~ '^[a-f0-9]{48}$'),
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX file_trash_deleted_idx ON file_trash(deleted_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_keys, file_trash TO terpgrid_app;
