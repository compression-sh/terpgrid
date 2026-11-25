-- 5.4: Öffentliche Laborproben aus wissenschaftlichen Datensätzen (z. B. Smith et al. 2022, CC0).
-- Jede Zeile ist EINE Probe eines Handelsprodukts – kein Sortenprofil. Proben tragen nur den
-- Produktnamen der Quelle (normalisiert), keinen Breeder; die Zuordnung zu Katalogsorten erfolgt
-- ausschließlich über einen gleichlautenden Namen und wird als solche gekennzeichnet.
-- Keine personenbezogenen Daten; private Laborberichte der Nutzer fließen nie ein.

-- Schlüssel für den Namensabgleich: Namens-Slug plus Version („gelato“ + „#33“ → „gelato-33“)
CREATE FUNCTION catalog_name_key(name_slug text, version text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT CASE WHEN version IS NULL OR version = '' THEN name_slug
                    ELSE name_slug || '-' || trim(both '-' from regexp_replace(lower(version), '[^a-z0-9]+', '-', 'g')) END $$;

CREATE INDEX catalog_cultivars_name_key_idx ON catalog_cultivars (catalog_name_key(name_slug, version)) WHERE NOT auto;

CREATE TABLE catalog_sample_imports (
  id serial PRIMARY KEY,
  source text NOT NULL CHECK (source ~ '^[a-z0-9-]{2,40}$'),
  version text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('running', 'active', 'failed', 'replaced')),
  rows_total integer NOT NULL DEFAULT 0,
  accepted integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  rejected_reasons jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text
);
CREATE UNIQUE INDEX catalog_sample_imports_one_active ON catalog_sample_imports(source) WHERE status = 'active';

CREATE TABLE catalog_samples (
  source text NOT NULL,
  sample_ref text NOT NULL CHECK (length(sample_ref) BETWEEN 1 AND 60),
  -- Normalisierter Produktname der Quelle (Slug); NULL = Quelle nennt keinen Namen
  name_key text CHECK (name_key IS NULL OR name_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  region text,
  lab_ref text,
  -- Werte wie in der Quelle (Einheit je Quelle, siehe Quellenregister); fehlend = nicht gemessen
  cannabinoids jsonb NOT NULL DEFAULT '{}',
  terpenes jsonb,
  total_terpenes numeric(6, 3),
  import_id integer NOT NULL REFERENCES catalog_sample_imports(id) ON DELETE CASCADE,
  PRIMARY KEY (source, sample_ref)
);
CREATE INDEX catalog_samples_name_idx ON catalog_samples(name_key) WHERE name_key IS NOT NULL;

-- Verteilung je Quelle und Produktname (beim Import berechnet, nur aus vorhandenen Messwerten)
CREATE TABLE catalog_sample_stats (
  source text NOT NULL,
  name_key text NOT NULL,
  samples integer NOT NULL,
  terpene_samples integer NOT NULL,
  regions jsonb NOT NULL DEFAULT '{}',
  -- { "<feld>": { "n": Anzahl Proben mit Wert, "detected": Anzahl > 0, "p25", "median", "p75", "min", "max" } }
  stats jsonb NOT NULL,
  PRIMARY KEY (source, name_key)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'terpgrid_app') THEN
    GRANT SELECT ON catalog_sample_imports, catalog_samples, catalog_sample_stats TO terpgrid_app;
  END IF;
END $$;
