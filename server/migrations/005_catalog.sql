-- Phase 5: Lokal indexierter Sortenkatalog (CI-Strains-Pro, CC BY 4.0).
-- Öffentliche Referenzdaten – keine personenbezogenen Daten, daher ohne RLS.
-- Schreiben nur durch die Owner-Rolle (CLI import-catalog), die Laufzeitrolle darf nur lesen.

-- pg_trgm ist seit PostgreSQL 13 eine „trusted“ Extension (Datenbank-Owner darf sie anlegen).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE catalog_imports (
  id serial PRIMARY KEY,
  source text NOT NULL,
  version text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('active', 'superseded')),
  report jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_imports_one_active ON catalog_imports(source) WHERE status = 'active';

CREATE TABLE catalog_breeders (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9]{1,80}$'),
  name text NOT NULL,
  variants text[] NOT NULL DEFAULT '{}',
  is_seed_bank boolean NOT NULL DEFAULT false,
  collab_members text[] NOT NULL DEFAULT '{}',
  seed_banks text[] NOT NULL DEFAULT '{}',
  cultivar_count integer NOT NULL DEFAULT 0,
  listing_count integer NOT NULL DEFAULT 0,
  import_id integer NOT NULL REFERENCES catalog_imports(id)
);
CREATE INDEX catalog_breeders_name_trgm ON catalog_breeders USING gin (lower(name) gin_trgm_ops);

CREATE TABLE catalog_cultivars (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$' AND length(id) <= 260),
  breeder_id text NOT NULL REFERENCES catalog_breeders(id),
  name text NOT NULL,
  name_lower text NOT NULL,
  name_slug text NOT NULL,
  version text,
  auto boolean NOT NULL DEFAULT false,
  aliases text[] NOT NULL DEFAULT '{}',
  seed_types text[] NOT NULL DEFAULT '{}',
  genetics_type text,
  thc_min numeric(4,1),
  thc_max numeric(4,1),
  cbd_max numeric(4,1),
  has_lineage boolean NOT NULL DEFAULT false,
  parent_slugs text[] NOT NULL DEFAULT '{}',
  terpenes text[] NOT NULL DEFAULT '{}',
  "values" jsonb NOT NULL,
  conflicts text[] NOT NULL DEFAULT '{}',
  seed_banks text[] NOT NULL DEFAULT '{}',
  listing_count integer NOT NULL,
  search tsvector NOT NULL,
  import_id integer NOT NULL REFERENCES catalog_imports(id)
);
CREATE INDEX catalog_cultivars_breeder_idx ON catalog_cultivars(breeder_id, name_lower);
CREATE INDEX catalog_cultivars_name_trgm ON catalog_cultivars USING gin (name_lower gin_trgm_ops);
CREATE INDEX catalog_cultivars_search_idx ON catalog_cultivars USING gin (search);
CREATE INDEX catalog_cultivars_slug_idx ON catalog_cultivars(name_slug);
CREATE INDEX catalog_cultivars_parents_idx ON catalog_cultivars USING gin (parent_slugs);
CREATE INDEX catalog_cultivars_name_idx ON catalog_cultivars(name_lower, id);

CREATE TABLE catalog_listings (
  id uuid PRIMARY KEY,
  cultivar_id text NOT NULL REFERENCES catalog_cultivars(id) ON DELETE CASCADE,
  seed_bank text NOT NULL,
  breeder_raw text NOT NULL,
  name_original text NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  scraped_at date,
  "values" jsonb NOT NULL,
  rejected jsonb NOT NULL DEFAULT '{}',
  import_id integer NOT NULL REFERENCES catalog_imports(id)
);
CREATE INDEX catalog_listings_cultivar_idx ON catalog_listings(cultivar_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'terpgrid_app') THEN
    GRANT SELECT ON catalog_imports, catalog_breeders, catalog_cultivars, catalog_listings TO terpgrid_app;
  END IF;
END $$;
