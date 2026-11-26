-- 5.5: Private Zusammenarbeit – Profile, Freundschaften, gemeinsame Bereiche, Kommentare,
-- Aktivität und Benachrichtigungen. Rein additiv: bestehende Tabellen (records, files,
-- users, …) und ihre RLS-Policies bleiben unverändert.
--
-- Sicherheitsmodell:
-- * Jede neue Tabelle hat Row-Level-Security (ENABLE). Die Laufzeitrolle terpgrid_app ist
--   nicht Eigentümerin und unterliegt den Policies. Kein FORCE: Die Hilfsfunktionen unten
--   laufen als Eigentümer (SECURITY DEFINER) und dürfen Mitgliedschaften prüfen, ohne
--   rekursiv an den eigenen Policies zu scheitern. Sie geben nur Wahrheitswerte/Rollen
--   oder eng begrenzte Zeilen für den aktuell angemeldeten Benutzer zurück.
-- * Inhalte sind verschlüsselt (AES-256-GCM): Bereichsinhalte mit einem eigenen
--   Bereichsschlüssel, Profilangaben mit einem eigenen Profilschlüssel, private
--   Spitznamen mit dem Kontoschlüssel des Besitzers. Klartext: nur Strukturdaten
--   (IDs, Rollen, Zeitpunkte, Zugriffsstufen, Elternbezüge).

-- ───────────── Hilfsfunktionen ─────────────

CREATE FUNCTION tg_uid() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- ───────────── Profile ─────────────

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Zufällige Social-ID (Crockford-Base32, 8 Zeichen; angezeigt als TG-XXXX-XXXX), neu erzeugbar
  social_id text NOT NULL UNIQUE CHECK (social_id ~ '^[0-9a-hjkmnp-tv-z]{8}$'),
  -- Frei wählbares Handle, getrennt vom Anmeldenamen (nie gleich – serverseitig geprüft)
  handle text UNIQUE CHECK (handle IS NULL OR handle ~ '^[a-z0-9][a-z0-9_.]{1,22}[a-z0-9]$'),
  -- Freundschaftsanfragen über Handle/Social-ID annehmen (Einladungscodes gehen immer)
  requests_enabled boolean NOT NULL DEFAULT true,
  -- Sichtbarkeit je Feld: 'private' | 'friends' (Standard privat, außer Anzeigename)
  visibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Eigener Profilschlüssel (mit Master-Key verpackt) – getrennt vom Kontoschlüssel
  key_gen integer NOT NULL DEFAULT 1 CHECK (key_gen > 0),
  key_wrapped bytea NOT NULL,
  kek_version integer NOT NULL,
  -- Verschlüsselte Profilangaben (Anzeigename, Bio, Akzent, Avatar, Favoriten, Interessen)
  payload bytea,
  -- Benachrichtigungseinstellungen je Kategorie (true/false); fehlend = an
  notify_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Freundschaften ─────────────

CREATE TABLE friendships (
  user_a uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX friendships_b_idx ON friendships(user_b);

-- Private Einstellungen je Freund (nur für den Besitzer sichtbar)
CREATE TABLE friend_settings (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Privater Spitzname, mit dem Kontoschlüssel des Besitzers verschlüsselt
  nickname bytea,
  nickname_gen integer NOT NULL DEFAULT 1,
  -- Eigenes Profil vor diesem Freund verbergen
  profile_hidden boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, friend_id),
  CHECK (owner_id <> friend_id)
);
CREATE INDEX friend_settings_friend_idx ON friend_settings(friend_id);

-- Anfragen: to_user bleibt NULL, wenn das Ziel nicht existiert, Anfragen abgeschaltet hat
-- oder den Absender blockiert – für den Absender sieht das identisch aus (keine Enumeration).
CREATE TABLE friend_requests (
  id uuid PRIMARY KEY,
  from_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user uuid REFERENCES users(id) ON DELETE CASCADE,
  -- Was der Absender eingegeben hat (Handle oder Social-ID) – nur für seine eigene Liste
  target_label text NOT NULL CHECK (char_length(target_label) BETWEEN 3 AND 40),
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz
);
CREATE UNIQUE INDEX friend_requests_one_pending ON friend_requests(from_user, target_label) WHERE status = 'pending';
CREATE INDEX friend_requests_to_idx ON friend_requests(to_user) WHERE status = 'pending';
CREATE INDEX friend_requests_from_idx ON friend_requests(from_user, created_at);

-- Einladungscodes/-links: nur Hash gespeichert, ablaufend, widerrufbar, einmalig
CREATE TABLE friend_invites (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz
);
CREATE INDEX friend_invites_creator_idx ON friend_invites(created_by);

CREATE TABLE blocks (
  blocker uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Wiedererkennung in der eigenen Liste (Name/Handle zum Zeitpunkt der Blockierung),
  -- mit dem Kontoschlüssel des Blockierenden verschlüsselt
  label bytea,
  label_gen integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
CREATE INDEX blocks_blocked_idx ON blocks(blocked);

-- ───────────── Gemeinsame Bereiche ─────────────

CREATE TABLE spaces (
  id uuid PRIMARY KEY,
  -- RESTRICT: Ein Konto mit eigenen Bereichen kann nicht still gelöscht werden
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Angebotene Eigentumsübertragung (muss vom Ziel angenommen werden)
  pending_owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('project', 'collection', 'general')),
  -- Aktuelle Schlüsselgeneration des Bereichs
  key_gen integer NOT NULL DEFAULT 1 CHECK (key_gen > 0),
  -- Verschlüsselte Metadaten (Name, Beschreibung, Akzent) und deren Generation
  meta bytea NOT NULL,
  meta_gen integer NOT NULL DEFAULT 1,
  allow_export boolean NOT NULL DEFAULT true,
  -- Speicher der Bereichsdateien (zählt zusätzlich zum Kontingent des Eigentümers)
  storage_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX spaces_owner_idx ON spaces(owner_id);

-- Unabhängige, versionierte Bereichsschlüssel (mit Master-Key verpackt)
CREATE TABLE space_keys (
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  gen integer NOT NULL CHECK (gen > 0),
  dek_wrapped bytea NOT NULL,
  kek_version integer NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'retiring', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY (space_id, gen)
);
CREATE UNIQUE INDEX space_keys_one_active ON space_keys(space_id) WHERE state = 'active';

CREATE TABLE space_members (
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
  added_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);
CREATE UNIQUE INDEX space_members_one_owner ON space_members(space_id) WHERE role = 'owner';
CREATE INDEX space_members_user_idx ON space_members(user_id);

CREATE TABLE space_invites (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  invitee uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('editor', 'commenter', 'viewer')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz
);
CREATE UNIQUE INDEX space_invites_one_pending ON space_invites(space_id, invitee) WHERE status = 'pending';
CREATE INDEX space_invites_invitee_idx ON space_invites(invitee) WHERE status = 'pending';

CREATE SEQUENCE space_records_seq;

CREATE TABLE space_records (
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  store text NOT NULL CHECK (store IN ('grows', 'plants', 'activities', 'photos', 'strains', 'journal', 'inventory', 'labReports', 'notes', 'tasks')),
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  version integer NOT NULL CHECK (version > 0),
  seq bigint NOT NULL DEFAULT nextval('space_records_seq'),
  deleted boolean NOT NULL DEFAULT false,
  payload bytea,
  payload_mac bytea,
  size integer NOT NULL DEFAULT 0 CHECK (size >= 0),
  key_gen integer NOT NULL,
  -- Zugriffsstufe (von der Wurzel geerbt) und serverseitig abgeleiteter Elternbezug
  access text NOT NULL DEFAULT 'members' CHECK (access IN ('members', 'editors', 'readonly')),
  parent_store text,
  parent_id text,
  -- Herkunft: im Bereich angelegt, geteilte Kopie oder in den Bereich verschoben
  origin text NOT NULL DEFAULT 'created' CHECK (origin IN ('created', 'copy', 'move')),
  -- War jemals für alle Mitglieder lesbar? (nur dann erhalten Kommentieren/Ansehen beim
  -- Einschränken eine inhaltslose Löschmarke – nie sichtbare Einträge bleiben unsichtbar)
  was_public boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, store, id),
  CHECK (deleted OR payload IS NOT NULL),
  CHECK ((parent_store IS NULL) = (parent_id IS NULL))
);
CREATE INDEX space_records_seq_idx ON space_records(space_id, seq);
CREATE INDEX space_records_parent_idx ON space_records(space_id, parent_store, parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX space_records_gen_idx ON space_records(space_id, key_gen);

CREATE TABLE space_files (
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo', 'labdoc')),
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  variant text NOT NULL CHECK (variant IN ('full', 'thumb', 'doc')),
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size bigint NOT NULL CHECK (size > 0),
  storage_name text NOT NULL UNIQUE CHECK (storage_name ~ '^[a-f0-9]{48}$'),
  key_gen integer NOT NULL,
  -- Zugehörige Ressource (Berechtigung der Datei = Berechtigung der Ressource)
  record_store text NOT NULL,
  record_id text NOT NULL,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, kind, id, variant)
);
CREATE INDEX space_files_record_idx ON space_files(space_id, record_store, record_id);
CREATE INDEX space_files_gen_idx ON space_files(space_id, key_gen);

CREATE TABLE space_comments (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  target_store text NOT NULL,
  target_id text NOT NULL,
  parent_id uuid REFERENCES space_comments(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  payload bytea,
  key_gen integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CHECK (deleted_at IS NOT NULL OR payload IS NOT NULL)
);
CREATE INDEX space_comments_target_idx ON space_comments(space_id, target_store, target_id, created_at);
CREATE INDEX space_comments_gen_idx ON space_comments(space_id, key_gen);

-- Aktivitätsverlauf: nur Ereignistyp, Ziel-ID und Zählwerte – nie Inhalte
CREATE TABLE space_activity (
  id bigserial PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type ~ '^[a-z]+(\.[a-z]+)*$' AND char_length(type) <= 40),
  target_store text,
  target_id text,
  subject_id uuid REFERENCES users(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX space_activity_space_idx ON space_activity(space_id, id DESC);

-- ───────────── Benachrichtigungen (nur in der App) ─────────────
-- Getrennt von Betreiber-Benachrichtigungen (NOTIFY_CMD/systemd). Keine Inhalte, nur Typ,
-- Auslöser und Verweise; die Anzeige baut der Client, Deep-Links werden beim Öffnen
-- regulär autorisiert.
CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('friends', 'invites', 'comments', 'updates', 'access')),
  type text NOT NULL CHECK (type ~ '^[a-z]+(\.[a-z]+)*$' AND char_length(type) <= 40),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  space_id uuid REFERENCES spaces(id) ON DELETE SET NULL,
  target_store text,
  target_id text,
  ref_id text CHECK (ref_id IS NULL OR char_length(ref_id) <= 80),
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz
);
CREATE INDEX notifications_user_idx ON notifications(user_id, updated_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX notifications_unread_idx ON notifications(user_id) WHERE read_at IS NULL AND dismissed_at IS NULL;

-- ───────────── Autorisierungsfunktionen (SECURITY DEFINER, eng begrenzt) ─────────────

CREATE FUNCTION tg_space_role(p_space uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT role FROM space_members WHERE space_id = p_space AND user_id = tg_uid() $$;

CREATE FUNCTION tg_can_read(p_space uuid, p_access text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT coalesce((SELECT role IN ('owner', 'editor') OR (role IN ('commenter', 'viewer') AND p_access <> 'editors')
                         FROM space_members WHERE space_id = p_space AND user_id = tg_uid()), false) $$;

CREATE FUNCTION tg_can_write(p_space uuid, p_access text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT coalesce((SELECT role = 'owner' OR (role = 'editor' AND p_access <> 'readonly')
                         FROM space_members WHERE space_id = p_space AND user_id = tg_uid()), false) $$;

-- Ressource lesbar? (für Dateien, Kommentare, Aktivität)
CREATE FUNCTION tg_record_readable(p_space uuid, p_store text, p_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT coalesce((SELECT tg_can_read(p_space, access) FROM space_records WHERE space_id = p_space AND store = p_store AND id = p_id), false) $$;

CREATE FUNCTION tg_record_writable(p_space uuid, p_store text, p_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT coalesce((SELECT tg_can_write(p_space, access) FROM space_records WHERE space_id = p_space AND store = p_store AND id = p_id AND NOT deleted), false) $$;

CREATE FUNCTION tg_is_space_owner(p_space uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT coalesce((SELECT owner_id = tg_uid() FROM spaces WHERE id = p_space), false) $$;

CREATE FUNCTION tg_are_friends(p_other uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT EXISTS (SELECT 1 FROM friendships WHERE user_a = least(tg_uid(), p_other) AND user_b = greatest(tg_uid(), p_other)) $$;

CREATE FUNCTION tg_shares_space(p_other uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT EXISTS (SELECT 1 FROM space_members a JOIN space_members b ON a.space_id = b.space_id
                       WHERE a.user_id = tg_uid() AND b.user_id = p_other) $$;

-- Blockiert in irgendeiner Richtung?
CREATE FUNCTION tg_blocked_between(p_other uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT EXISTS (SELECT 1 FROM blocks WHERE (blocker = tg_uid() AND blocked = p_other) OR (blocker = p_other AND blocked = tg_uid())) $$;

-- Profilzeile sichtbar: eigenes Profil; Freunde (sofern nicht vor ihnen verborgen);
-- Mitglieder gemeinsamer Bereiche (die App gibt ihnen nur Anzeigename/Handle/Social-ID);
-- Empfänger einer offenen Anfrage des Profilbesitzers (nur Name/Handle).
CREATE FUNCTION tg_profile_visible(p_owner uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT p_owner = tg_uid()
            OR (NOT tg_blocked_between(p_owner) AND (
                 tg_are_friends(p_owner)
              OR tg_shares_space(p_owner)
              OR EXISTS (SELECT 1 FROM friend_requests WHERE from_user = p_owner AND to_user = tg_uid() AND status = 'pending'))) $$;

CREATE FUNCTION tg_profile_hidden_from_me(p_owner uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT coalesce((SELECT profile_hidden FROM friend_settings WHERE owner_id = p_owner AND friend_id = tg_uid()), false) $$;

-- Suche nach exaktem Handle oder Social-ID. Liefert NULL, wenn kein Konto passt, das Ziel
-- Anfragen abgeschaltet hat, man sich selbst sucht oder eine Blockierung besteht.
CREATE FUNCTION tg_find_user(p_kind text, p_value text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT p.user_id FROM profiles p
        WHERE ((p_kind = 'handle' AND p.handle = p_value) OR (p_kind = 'social' AND p.social_id = p_value))
          AND p.requests_enabled AND p.user_id <> tg_uid() AND NOT tg_blocked_between(p.user_id) $$;

-- Einladungscode einlösen (atomar): prüft Ablauf, Widerruf, Einmaligkeit und Blockierung.
-- Ergebnis: Konto des Einladenden oder NULL (ungültig – ohne Grund, keine Orakel).
CREATE FUNCTION tg_redeem_friend_invite(p_hash bytea) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  me uuid := tg_uid();
  inv friend_invites%ROWTYPE;
BEGIN
  IF me IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO inv FROM friend_invites WHERE token_hash = p_hash FOR UPDATE;
  IF NOT FOUND OR inv.used_at IS NOT NULL OR inv.revoked_at IS NOT NULL OR inv.expires_at < now() OR inv.created_by = me THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM blocks WHERE (blocker = me AND blocked = inv.created_by) OR (blocker = inv.created_by AND blocked = me)) THEN RETURN NULL; END IF;
  UPDATE friend_invites SET used_at = now(), used_by = me WHERE id = inv.id;
  INSERT INTO friendships(user_a, user_b) VALUES (least(me, inv.created_by), greatest(me, inv.created_by)) ON CONFLICT DO NOTHING;
  -- Offene Anfragen zwischen beiden erledigen sich damit
  UPDATE friend_requests SET status = 'accepted', responded_at = now()
   WHERE status = 'pending' AND ((from_user = me AND to_user = inv.created_by) OR (from_user = inv.created_by AND to_user = me));
  RETURN inv.created_by;
END $$;

-- Vorschau eines gültigen Einladungscodes: Profilzeile des Einladenden (er hat den Code
-- weitergegeben; die App gibt daraus nur Anzeigename/Handle/Social-ID heraus)
CREATE FUNCTION tg_peek_friend_invite(p_hash bytea)
  RETURNS TABLE (user_id uuid, handle text, social_id text, visibility jsonb, key_gen integer, key_wrapped bytea, kek_version integer, payload bytea, expires_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT p.user_id, p.handle, p.social_id, p.visibility, p.key_gen, p.key_wrapped, p.kek_version, p.payload, i.expires_at
          FROM friend_invites i JOIN profiles p ON p.user_id = i.created_by
         WHERE i.token_hash = p_hash AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
           AND i.created_by <> tg_uid() AND NOT tg_blocked_between(i.created_by) $$;

-- Für den Anfragenden nicht (mehr) lesbare, früher öffentliche Einträge seit `p_since`
-- (nur Kennungen, keine Inhalte) – damit Clients eingeschränkte Einträge entfernen.
CREATE FUNCTION tg_hidden_space_changes(p_space uuid, p_since bigint, p_limit integer)
  RETURNS TABLE (store text, id text, seq bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT r.store, r.id, r.seq FROM space_records r
         WHERE r.space_id = p_space AND r.seq > p_since AND r.was_public
           AND tg_space_role(p_space) IS NOT NULL AND NOT tg_can_read(p_space, r.access)
         ORDER BY r.seq LIMIT p_limit $$;

CREATE FUNCTION tg_track_public() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.was_public := (TG_OP = 'UPDATE' AND OLD.was_public) OR NEW.access <> 'editors';
  RETURN NEW;
END $$;
CREATE TRIGGER space_records_public BEFORE INSERT OR UPDATE ON space_records FOR EACH ROW EXECUTE FUNCTION tg_track_public();

-- Wartung (Master-Key-Rotation, verify-data): nur Bereichs-ID und Eigentümer, damit die
-- CLI je Bereich im Kontext des Eigentümers (RLS aktiv) arbeiten kann. Keine Inhalte.
CREATE FUNCTION tg_maint_spaces() RETURNS TABLE (id uuid, owner_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT id, owner_id FROM spaces ORDER BY created_at $$;

-- Eingeladene sehen Name/Schlüssel des Bereichs, solange die Einladung offen ist
CREATE FUNCTION tg_invite_space_meta(p_invite uuid)
  RETURNS TABLE (space_id uuid, kind text, meta bytea, meta_gen integer, dek_wrapped bytea, kek_version integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT s.id, s.kind, s.meta, s.meta_gen, k.dek_wrapped, k.kek_version
          FROM space_invites i JOIN spaces s ON s.id = i.space_id JOIN space_keys k ON k.space_id = s.id AND k.gen = s.meta_gen
         WHERE i.id = p_invite AND i.invitee = tg_uid() AND i.status = 'pending' AND i.expires_at > now() $$;

-- Eigentumsübertragung annehmen (atomar): nur das angebotene Ziel, nur wenn Mitglied
CREATE FUNCTION tg_accept_transfer(p_space uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  me uuid := tg_uid();
  old_owner uuid;
BEGIN
  SELECT owner_id INTO old_owner FROM spaces WHERE id = p_space AND pending_owner_id = me FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM space_members WHERE space_id = p_space AND user_id = me) THEN RETURN false; END IF;
  UPDATE space_members SET role = 'editor', updated_at = now() WHERE space_id = p_space AND user_id = old_owner;
  UPDATE space_members SET role = 'owner', updated_at = now() WHERE space_id = p_space AND user_id = me;
  UPDATE spaces SET owner_id = me, pending_owner_id = NULL, updated_at = now() WHERE id = p_space;
  RETURN true;
END $$;

-- Benachrichtigung zustellen: Auslöser ist immer der angemeldete Benutzer. Respektiert die
-- Einstellungen des Empfängers (Kategorie „access“ ist nicht abschaltbar) und Blockierungen.
-- Gleichartige ungelesene Benachrichtigungen werden zusammengefasst (count).
CREATE FUNCTION tg_notify(p_recipient uuid, p_category text, p_type text, p_space uuid, p_target_store text, p_target_id text, p_ref text)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  me uuid := tg_uid();
  existing bigint;
BEGIN
  IF me IS NULL OR p_recipient IS NULL OR p_recipient = me THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM blocks WHERE (blocker = p_recipient AND blocked = me) OR (blocker = me AND blocked = p_recipient)) THEN RETURN; END IF;
  IF p_category <> 'access' AND EXISTS (SELECT 1 FROM profiles WHERE user_id = p_recipient AND (notify_prefs ->> p_category) = 'false') THEN RETURN; END IF;
  SELECT id INTO existing FROM notifications
   WHERE user_id = p_recipient AND type = p_type AND actor_id = me AND read_at IS NULL AND dismissed_at IS NULL
     AND space_id IS NOT DISTINCT FROM p_space AND target_store IS NOT DISTINCT FROM p_target_store AND target_id IS NOT DISTINCT FROM p_target_id
   ORDER BY id DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    UPDATE notifications SET count = count + 1, updated_at = now(), ref_id = coalesce(p_ref, ref_id) WHERE id = existing;
  ELSE
    INSERT INTO notifications(user_id, category, type, actor_id, space_id, target_store, target_id, ref_id)
    VALUES (p_recipient, p_category, p_type, me, p_space, p_target_store, p_target_id, p_ref);
  END IF;
END $$;

-- ───────────── Schutz-Trigger: unveränderliche Felder und erlaubte Statuswechsel ─────────────
-- Greifen für die Laufzeitrolle; die SECURITY-DEFINER-Funktionen (Tabelleneigentümer) sind
-- ausgenommen, weil sie ihre Regeln selbst prüfen.
CREATE FUNCTION tg_guard_friend_requests() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = (SELECT tableowner FROM pg_tables WHERE schemaname = TG_TABLE_SCHEMA AND tablename = TG_TABLE_NAME) THEN RETURN NEW; END IF;
  IF NEW.id <> OLD.id OR NEW.from_user <> OLD.from_user OR NEW.to_user IS DISTINCT FROM OLD.to_user OR NEW.target_label <> OLD.target_label
     OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'Unveränderliches Feld' USING ERRCODE = '42501';
  END IF;
  IF NEW.status <> OLD.status THEN
    IF OLD.status <> 'pending'
       OR (NEW.status IN ('accepted', 'declined') AND tg_uid() IS DISTINCT FROM OLD.to_user)
       OR (NEW.status = 'cancelled' AND tg_uid() IS DISTINCT FROM OLD.from_user) THEN
      RAISE EXCEPTION 'Statuswechsel nicht erlaubt' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER friend_requests_guard BEFORE UPDATE ON friend_requests FOR EACH ROW EXECUTE FUNCTION tg_guard_friend_requests();

CREATE FUNCTION tg_guard_space_invites() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = (SELECT tableowner FROM pg_tables WHERE schemaname = TG_TABLE_SCHEMA AND tablename = TG_TABLE_NAME) THEN RETURN NEW; END IF;
  IF NEW.id <> OLD.id OR NEW.space_id <> OLD.space_id OR NEW.invitee <> OLD.invitee OR NEW.role <> OLD.role
     OR NEW.invited_by IS DISTINCT FROM OLD.invited_by OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'Unveränderliches Feld' USING ERRCODE = '42501';
  END IF;
  IF NEW.status <> OLD.status THEN
    IF OLD.status <> 'pending'
       OR (NEW.status IN ('accepted', 'declined') AND tg_uid() IS DISTINCT FROM OLD.invitee)
       OR (NEW.status = 'revoked' AND tg_space_role(OLD.space_id) IS DISTINCT FROM 'owner') THEN
      RAISE EXCEPTION 'Statuswechsel nicht erlaubt' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER space_invites_guard BEFORE UPDATE ON space_invites FOR EACH ROW EXECUTE FUNCTION tg_guard_space_invites();

CREATE FUNCTION tg_guard_space_records() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = (SELECT tableowner FROM pg_tables WHERE schemaname = TG_TABLE_SCHEMA AND tablename = TG_TABLE_NAME) THEN RETURN NEW; END IF;
  IF NEW.space_id <> OLD.space_id OR NEW.store <> OLD.store OR NEW.id <> OLD.id OR NEW.origin <> OLD.origin
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Unveränderliches Feld' USING ERRCODE = '42501';
  END IF;
  -- Zugriffsstufen ändert nur der Eigentümer
  IF NEW.access <> OLD.access AND tg_space_role(OLD.space_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Nur der Eigentümer ändert Zugriffsstufen' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER space_records_guard BEFORE UPDATE ON space_records FOR EACH ROW EXECUTE FUNCTION tg_guard_space_records();

CREATE FUNCTION tg_guard_space_comments() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = (SELECT tableowner FROM pg_tables WHERE schemaname = TG_TABLE_SCHEMA AND tablename = TG_TABLE_NAME) THEN RETURN NEW; END IF;
  IF NEW.id <> OLD.id OR NEW.space_id <> OLD.space_id OR NEW.target_store <> OLD.target_store OR NEW.target_id <> OLD.target_id
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.author_id IS DISTINCT FROM OLD.author_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Unveränderliches Feld' USING ERRCODE = '42501';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Gelöschter Kommentar' USING ERRCODE = '42501'; END IF;
  -- Fremde Kommentare darf der Eigentümer nur entfernen, nicht umschreiben
  -- (Ausnahme: Schlüsselrotation durch den Eigentümer – gleicher Inhalt, neue Generation)
  IF tg_uid() IS DISTINCT FROM OLD.author_id AND NOT (NEW.deleted_at IS NOT NULL AND NEW.payload IS NULL)
     AND NOT (NEW.key_gen <> OLD.key_gen AND NEW.edited_at IS NOT DISTINCT FROM OLD.edited_at AND tg_space_role(OLD.space_id) = 'owner') THEN
    RAISE EXCEPTION 'Nur eigene Kommentare bearbeiten' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER space_comments_guard BEFORE UPDATE ON space_comments FOR EACH ROW EXECUTE FUNCTION tg_guard_space_comments();

CREATE FUNCTION tg_guard_space_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = (SELECT tableowner FROM pg_tables WHERE schemaname = TG_TABLE_SCHEMA AND tablename = TG_TABLE_NAME) THEN RETURN NEW; END IF;
  IF NEW.space_id <> OLD.space_id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.type <> OLD.type
     OR NEW.target_store IS DISTINCT FROM OLD.target_store OR NEW.target_id IS DISTINCT FROM OLD.target_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Unveränderliches Feld' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER space_activity_guard BEFORE UPDATE ON space_activity FOR EACH ROW EXECUTE FUNCTION tg_guard_space_activity();

-- ───────────── Row-Level-Security ─────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON profiles FOR SELECT USING (tg_profile_visible(user_id));
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (user_id = tg_uid());
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (user_id = tg_uid()) WITH CHECK (user_id = tg_uid());

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY friendships_select ON friendships FOR SELECT USING (tg_uid() IN (user_a, user_b));
-- Anlegen nur bei Annahme einer offenen Anfrage des Gegenübers (Einladungscodes: tg_redeem_friend_invite)
CREATE POLICY friendships_insert ON friendships FOR INSERT WITH CHECK (
  tg_uid() IN (user_a, user_b) AND EXISTS (
    SELECT 1 FROM friend_requests r WHERE r.status = 'pending' AND r.to_user = tg_uid()
       AND r.from_user = CASE WHEN user_a = tg_uid() THEN user_b ELSE user_a END));
CREATE POLICY friendships_delete ON friendships FOR DELETE USING (tg_uid() IN (user_a, user_b));

ALTER TABLE friend_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY friend_settings_own ON friend_settings USING (owner_id = tg_uid()) WITH CHECK (owner_id = tg_uid());

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY friend_requests_select ON friend_requests FOR SELECT USING (from_user = tg_uid() OR to_user = tg_uid());
CREATE POLICY friend_requests_insert ON friend_requests FOR INSERT WITH CHECK (from_user = tg_uid());
CREATE POLICY friend_requests_update ON friend_requests FOR UPDATE USING (from_user = tg_uid() OR to_user = tg_uid());

ALTER TABLE friend_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY friend_invites_own ON friend_invites USING (created_by = tg_uid()) WITH CHECK (created_by = tg_uid());

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocks_own ON blocks USING (blocker = tg_uid()) WITH CHECK (blocker = tg_uid());

ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY spaces_select ON spaces FOR SELECT USING (tg_space_role(id) IS NOT NULL OR owner_id = tg_uid());
CREATE POLICY spaces_insert ON spaces FOR INSERT WITH CHECK (owner_id = tg_uid());
CREATE POLICY spaces_update ON spaces FOR UPDATE USING (tg_space_role(id) = 'owner') WITH CHECK (owner_id = tg_uid());
CREATE POLICY spaces_delete ON spaces FOR DELETE USING (tg_space_role(id) = 'owner');

ALTER TABLE space_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY space_keys_select ON space_keys FOR SELECT USING (tg_space_role(space_id) IS NOT NULL OR tg_is_space_owner(space_id));
CREATE POLICY space_keys_insert ON space_keys FOR INSERT WITH CHECK (tg_is_space_owner(space_id));
CREATE POLICY space_keys_update ON space_keys FOR UPDATE USING (tg_space_role(space_id) = 'owner');

ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY space_members_select ON space_members FOR SELECT USING (tg_space_role(space_id) IS NOT NULL);
CREATE POLICY space_members_insert ON space_members FOR INSERT WITH CHECK (
     (tg_space_role(space_id) = 'owner' AND role <> 'owner')
  -- Erstes Mitglied: der Eigentümer selbst beim Anlegen
  OR (user_id = tg_uid() AND role = 'owner' AND tg_is_space_owner(space_id) AND tg_space_role(space_id) IS NULL)
  -- Annahme einer offenen Einladung mit genau dieser Rolle
  OR (user_id = tg_uid() AND role <> 'owner' AND EXISTS (
        SELECT 1 FROM space_invites i WHERE i.space_id = space_members.space_id AND i.invitee = tg_uid()
           AND i.status = 'pending' AND i.expires_at > now() AND i.role = space_members.role)));
CREATE POLICY space_members_update ON space_members FOR UPDATE USING (tg_space_role(space_id) = 'owner' AND role <> 'owner') WITH CHECK (role <> 'owner');
CREATE POLICY space_members_delete ON space_members FOR DELETE USING (
     (tg_space_role(space_id) = 'owner' AND user_id <> tg_uid())
  OR (user_id = tg_uid() AND role <> 'owner'));

ALTER TABLE space_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY space_invites_select ON space_invites FOR SELECT USING (invitee = tg_uid() OR tg_space_role(space_id) = 'owner');
CREATE POLICY space_invites_insert ON space_invites FOR INSERT WITH CHECK (tg_space_role(space_id) = 'owner' AND invited_by = tg_uid());
CREATE POLICY space_invites_update ON space_invites FOR UPDATE USING (invitee = tg_uid() OR tg_space_role(space_id) = 'owner');

ALTER TABLE space_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY space_records_select ON space_records FOR SELECT USING (tg_can_read(space_id, access));
CREATE POLICY space_records_insert ON space_records FOR INSERT WITH CHECK (tg_can_write(space_id, access));
CREATE POLICY space_records_update ON space_records FOR UPDATE USING (tg_can_write(space_id, access)) WITH CHECK (tg_can_write(space_id, access) OR tg_space_role(space_id) = 'owner');
CREATE POLICY space_records_delete ON space_records FOR DELETE USING (tg_space_role(space_id) = 'owner');

ALTER TABLE space_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY space_files_select ON space_files FOR SELECT USING (tg_record_readable(space_id, record_store, record_id));
CREATE POLICY space_files_insert ON space_files FOR INSERT WITH CHECK (tg_record_writable(space_id, record_store, record_id));
CREATE POLICY space_files_update ON space_files FOR UPDATE USING (tg_record_writable(space_id, record_store, record_id) OR tg_space_role(space_id) = 'owner');
CREATE POLICY space_files_delete ON space_files FOR DELETE USING (tg_space_role(space_id) IN ('owner', 'editor'));

ALTER TABLE space_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY space_comments_select ON space_comments FOR SELECT USING (tg_record_readable(space_id, target_store, target_id));
CREATE POLICY space_comments_insert ON space_comments FOR INSERT WITH CHECK (
  author_id = tg_uid() AND tg_space_role(space_id) IN ('owner', 'editor', 'commenter') AND tg_record_readable(space_id, target_store, target_id));
CREATE POLICY space_comments_update ON space_comments FOR UPDATE USING (
  tg_record_readable(space_id, target_store, target_id) AND (
    (author_id = tg_uid() AND tg_space_role(space_id) IN ('owner', 'editor', 'commenter')) OR tg_space_role(space_id) = 'owner'));

ALTER TABLE space_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY space_activity_select ON space_activity FOR SELECT USING (
  tg_space_role(space_id) IS NOT NULL AND (target_id IS NULL OR tg_record_readable(space_id, target_store, target_id)));
CREATE POLICY space_activity_insert ON space_activity FOR INSERT WITH CHECK (actor_id = tg_uid() AND tg_space_role(space_id) IS NOT NULL);
CREATE POLICY space_activity_update ON space_activity FOR UPDATE USING (actor_id = tg_uid() AND tg_space_role(space_id) IS NOT NULL);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- Kein INSERT für die App-Rolle: Zustellung nur über tg_notify()
CREATE POLICY notifications_select ON notifications FOR SELECT USING (user_id = tg_uid());
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (user_id = tg_uid()) WITH CHECK (user_id = tg_uid());
CREATE POLICY notifications_delete ON notifications FOR DELETE USING (user_id = tg_uid());

-- ───────────── Rechte der Laufzeitrolle ─────────────

REVOKE ALL ON FUNCTION tg_space_role(uuid), tg_can_read(uuid, text), tg_can_write(uuid, text), tg_record_readable(uuid, text, text),
  tg_record_writable(uuid, text, text), tg_is_space_owner(uuid), tg_are_friends(uuid), tg_shares_space(uuid), tg_blocked_between(uuid),
  tg_profile_visible(uuid), tg_profile_hidden_from_me(uuid), tg_find_user(text, text), tg_redeem_friend_invite(bytea), tg_peek_friend_invite(bytea),
  tg_invite_space_meta(uuid), tg_accept_transfer(uuid), tg_notify(uuid, text, text, uuid, text, text, text), tg_hidden_space_changes(uuid, bigint, integer), tg_maint_spaces() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'terpgrid_app') THEN
    GRANT SELECT, INSERT, UPDATE ON profiles, friend_requests TO terpgrid_app;
    GRANT SELECT, INSERT, DELETE ON friendships TO terpgrid_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON friend_settings, friend_invites, blocks, spaces, space_members, space_records, space_files TO terpgrid_app;
    GRANT SELECT, INSERT, UPDATE ON space_keys, space_invites, space_comments, space_activity TO terpgrid_app;
    GRANT SELECT, UPDATE, DELETE ON notifications TO terpgrid_app;
    GRANT USAGE ON SEQUENCE space_records_seq, space_activity_id_seq TO terpgrid_app;
    GRANT EXECUTE ON FUNCTION tg_uid(), tg_space_role(uuid), tg_can_read(uuid, text), tg_can_write(uuid, text), tg_record_readable(uuid, text, text),
      tg_record_writable(uuid, text, text), tg_is_space_owner(uuid), tg_are_friends(uuid), tg_shares_space(uuid), tg_blocked_between(uuid),
      tg_profile_visible(uuid), tg_profile_hidden_from_me(uuid), tg_find_user(text, text), tg_redeem_friend_invite(bytea), tg_peek_friend_invite(bytea),
      tg_invite_space_meta(uuid), tg_accept_transfer(uuid), tg_notify(uuid, text, text, uuid, text, text, text), tg_hidden_space_changes(uuid, bigint, integer), tg_maint_spaces() TO terpgrid_app;
  END IF;
END $$;
