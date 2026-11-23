#!/bin/sh
# Einmalige Initialisierung (nur bei leerem Datenverzeichnis, ausgeführt vom postgres-Image).
# Legt die Owner-Rolle (Migrationen) und die App-Rolle (Laufzeit, ohne BYPASSRLS) an.
# Passwörter kommen aus Docker-Secrets und erscheinen weder in Logs noch in der Prozessliste.
set -eu
OWNER_PW="$(cat /run/secrets/db_owner_password)"
APP_PW="$(cat /run/secrets/db_app_password)"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_password="$OWNER_PW" -v app_password="$APP_PW" <<'SQL'
CREATE ROLE terpgrid_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE terpgrid_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER DATABASE terpgrid OWNER TO terpgrid_owner;
REVOKE ALL ON DATABASE terpgrid FROM PUBLIC;
GRANT CONNECT ON DATABASE terpgrid TO terpgrid_app;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname terpgrid <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO terpgrid_app;
SQL
