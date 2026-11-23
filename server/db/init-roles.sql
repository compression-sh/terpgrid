-- Wird einmalig als Superuser ausgeführt (Docker: /docker-entrypoint-initdb.d).
-- terpgrid_owner: besitzt das Schema, führt Migrationen aus.
-- terpgrid_app:   Laufzeitrolle der API – kein Owner, kein Superuser, kein BYPASSRLS.
-- Passwörter werden per psql-Variablen übergeben (aus Docker-Secrets), nie hier eingetragen.
CREATE ROLE terpgrid_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE terpgrid_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
