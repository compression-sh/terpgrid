#!/usr/bin/env bash
# TERPGRID – Restore-Test in einer isolierten Umgebung (berührt die Produktion NICHT).
# Stellt einen Snapshot in Wegwerf-Containern ohne Netzwerkzugang wieder her und
# entschlüsselt testweise alle Datensätze und Dateien mit dem Master-Key.
# Empfehlung: monatlich ausführen. Aufruf: backup/restore-test.sh [snapshot|latest]
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . backup/backup.env; [[ -f .env ]] && . ./.env; set +a
SNAP="${1:-latest}"
ID="tg-restoretest-$$"
WORK="$(mktemp -d /var/tmp/terpgrid-restoretest.XXXXXX)"
cleanup() {
  docker rm -f "$ID-db" >/dev/null 2>&1 || true
  docker network rm "$ID" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
chmod 700 "$WORK"

echo "→ Snapshot ${SNAP} wiederherstellen"
restic restore "$SNAP" --tag terpgrid --target "$WORK/restore" >/dev/null
DUMP="$(find "$WORK/restore" -name terpgrid.dump | head -1)"
FILES_SRC="$(find "$WORK/restore" -path '*/_data' -type d | head -1)"
[[ -s "$DUMP" ]] || { echo "✗ Kein Datenbank-Dump im Snapshot" >&2; exit 1; }
echo "  Dump: $(du -h "$DUMP" | cut -f1) · Dateien: $(find "${FILES_SRC:-/nonexistent}" -type f 2>/dev/null | wc -l)"

mkdir -p "$WORK/secrets"
openssl rand -hex 16 > "$WORK/secrets/db_owner_password"
openssl rand -hex 16 > "$WORK/secrets/db_app_password"
chmod 444 "$WORK/secrets/"*

docker network create --internal "$ID" >/dev/null
docker run -d --name "$ID-db" --network "$ID" --user 70:70 \
  -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e POSTGRES_DB=terpgrid \
  -v "$PWD/db-init:/docker-entrypoint-initdb.d:ro" \
  -v "$WORK/secrets/db_owner_password:/run/secrets/db_owner_password:ro" \
  -v "$WORK/secrets/db_app_password:/run/secrets/db_app_password:ro" \
  postgres:16.10-alpine3.22 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$ID-db" pg_isready -U postgres -d terpgrid -h 127.0.0.1 >/dev/null 2>&1 && docker exec "$ID-db" psql -U postgres -tAc "select 1 from pg_roles where rolname='terpgrid_app'" 2>/dev/null | grep -q 1 && break
  sleep 1
done
echo "→ Datenbank einspielen"
docker exec -i "$ID-db" pg_restore -U postgres -d terpgrid --exit-on-error < "$DUMP"
docker exec "$ID-db" psql -U postgres -d terpgrid -tAc "select 'Konten: '||(select count(*) from users)||' · Datensätze: '||(select count(*) from records where not deleted)||' · Dateien (DB): '||(select count(*) from files)||' · Migrationen: '||(select string_agg(version, ',') from schema_migrations)"
# Öffentlicher Sortenkatalog (regenerierbar – notfalls mit import-catalog.sh neu importieren)
docker exec "$ID-db" psql -U postgres -d terpgrid -tAc "select case when to_regclass('catalog_imports') is null then 'Katalog: nicht vorhanden (vor 5.0)' else 'Katalog: '||(select count(*) from catalog_cultivars)||' Sorten · '||(select count(*) from catalog_breeders)||' Breeder · '||(select count(*) from catalog_listings)||' Angebote · Version '||coalesce((select left(version,12) from catalog_imports where status='active'),'–') end"
# Gemeinsame Bereiche (5.5) – Inhalte sind mit eigenen Bereichsschlüsseln verschlüsselt; verify-data prüft sie unten
docker exec "$ID-db" psql -U postgres -d terpgrid -tAc "select case when to_regclass('spaces') is null then 'Zusammenarbeit: nicht vorhanden (vor 5.5)' else 'Zusammenarbeit: '||(select count(*) from spaces)||' Bereiche · '||(select count(*) from space_members)||' Mitgliedschaften · '||(select count(*) from space_records where not deleted)||' Einträge · '||(select count(*) from space_files)||' Dateien · '||(select count(*) from friendships)||' Freundschaften' end"
# Öffentliche Laborproben (5.4, regenerierbar mit import-samples.sh)
docker exec "$ID-db" psql -U postgres -d terpgrid -tAc "select case when to_regclass('catalog_samples') is null then 'Laborproben: nicht vorhanden (vor 5.4)' else 'Laborproben: '||(select count(*) from catalog_samples)||' · Produktnamen: '||(select count(*) from catalog_sample_stats) end"

echo "→ Entschlüsselung prüfen (Master-Key aus ./secrets)"
docker run --rm --network "$ID" --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  -e NODE_ENV=production -e PUBLIC_ORIGIN="https://${TERPGRID_DOMAIN:-restore.test}" \
  -e DATABASE_URL="postgres://terpgrid_app@$ID-db:5432/terpgrid" -e DATABASE_PASSWORD_FILE=/run/secrets/db_app_password \
  -e MASTER_KEYS_FILE=/run/secrets/master_keys -e MASTER_KEY_CURRENT="${MASTER_KEY_CURRENT:-1}" -e HMAC_SECRET_FILE=/run/secrets/hmac_secret \
  -e FILE_STORAGE_DIR=/data/files \
  -v "$WORK/secrets/db_app_password:/run/secrets/db_app_password:ro" \
  -v "$PWD/secrets/master_keys:/run/secrets/master_keys:ro" -v "$PWD/secrets/hmac_secret:/run/secrets/hmac_secret:ro" \
  -v "${FILES_SRC:-$WORK/empty}:/data/files:ro" \
  "terpgrid-api:${TERPGRID_VERSION:-local}" node dist/cli.js verify-data
echo "✓ Restore-Test erfolgreich: Snapshot ist vollständig und mit dem Master-Key lesbar."
