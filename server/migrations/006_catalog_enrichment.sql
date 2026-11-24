-- 2.1: Anreicherung des Sortenkatalogs aus weiteren Quellen – mit Herkunft je Feld.
-- Öffentliche Referenzdaten (keine personenbezogenen Daten). Private Laborberichte fließen nie ein.

-- Abgleichsentscheidung je Datensatz einer externen Quelle (keine Kopie der Quelldaten)
CREATE TABLE catalog_matches (
  provider text NOT NULL CHECK (provider IN ('strainapi', 'findmyseeds')),
  provider_id text NOT NULL CHECK (length(provider_id) BETWEEN 1 AND 120),
  provider_name text NOT NULL,
  provider_breeder text,
  -- exact = Name UND Breeder stimmen überein · probable = nur zur Prüfung · ambiguous = mehrere Kandidaten
  -- rejected = durch Admin abgelehnt · none = keine Sorte im Katalog
  status text NOT NULL CHECK (status IN ('exact', 'probable', 'ambiguous', 'rejected', 'none')),
  cultivar_id text REFERENCES catalog_cultivars(id) ON DELETE SET NULL,
  candidates text[] NOT NULL DEFAULT '{}',
  reason text NOT NULL,
  decided_by text NOT NULL DEFAULT 'auto' CHECK (decided_by IN ('auto', 'admin')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_id)
);
CREATE INDEX catalog_matches_cultivar_idx ON catalog_matches(cultivar_id);
CREATE INDEX catalog_matches_status_idx ON catalog_matches(status);

-- Feldangaben einer Quelle zu einer Sorte (Originalwert + normalisierter Wert + Belegart)
CREATE TABLE catalog_claims (
  id bigserial PRIMARY KEY,
  cultivar_id text NOT NULL REFERENCES catalog_cultivars(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('terpenes', 'thc', 'cbd', 'genetics', 'aroma', 'description', 'image', 'type', 'flowering', 'seedType')),
  provider text NOT NULL,
  source_record_id text NOT NULL,
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  original jsonb NOT NULL,
  normalized jsonb NOT NULL,
  -- database = Angabe einer Datenbank/Plattform (nicht laborbestätigt); lab nur mit Probe/Labor/Datum
  evidence text NOT NULL CHECK (evidence IN ('database', 'breeder', 'lab')),
  license text NOT NULL,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  -- Zwischenspeicher gemäß Nutzungsbedingungen der Quelle: läuft ab und wird bei Bedarf neu abgerufen
  expires_at timestamptz,
  review_status text NOT NULL DEFAULT 'accepted' CHECK (review_status IN ('accepted', 'pending', 'rejected')),
  UNIQUE (cultivar_id, field, provider, source_record_id)
);
CREATE INDEX catalog_claims_cultivar_idx ON catalog_claims(cultivar_id);
CREATE INDEX catalog_claims_field_idx ON catalog_claims(field, review_status);

-- Anreicherungsläufe (fortsetzbar über checkpoint)
CREATE TABLE catalog_enrichment_runs (
  id serial PRIMARY KEY,
  provider text NOT NULL,
  dry_run boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('running', 'done', 'failed', 'aborted')),
  requested integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  matched integer NOT NULL DEFAULT 0,
  claims integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]',
  checkpoint text,
  started_by text NOT NULL DEFAULT 'cli',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'terpgrid_app') THEN
    -- Nur diese drei Tabellen sind für die Laufzeitrolle beschreibbar (Admin-gesteuerte Anreicherung);
    -- der importierte Kernkatalog bleibt für sie schreibgeschützt.
    GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_matches, catalog_claims, catalog_enrichment_runs TO terpgrid_app;
    GRANT USAGE, SELECT ON SEQUENCE catalog_claims_id_seq, catalog_enrichment_runs_id_seq TO terpgrid_app;
  END IF;
END $$;
