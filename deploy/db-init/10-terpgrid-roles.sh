#!/bin/sh
# Einmalige Initialisierung (nur bei leerem Datenverzeichnis, ausgeführt vom postgres-Image).
# Legt die Owner-Rolle (Migrationen) und die App-Rolle (Laufzeit, ohne BYPASSRLS) an.
# Passwörter liest psql selbst aus den Docker-Secrets (\set mit Backticks) – sie erscheinen
# daher weder in der Prozessliste (keine Kommandozeilenargumente) noch in Logs.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\set owner_password `cat /run/secrets/db_owner_password`
\set app_password `cat /run/secrets/db_app_password`
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
