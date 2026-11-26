#!/usr/bin/env bash
# TERPGRID – Wiederherstellung aus restic (PRODUKTION: ersetzt aktuelle Daten!).
# Vorher immer restore-test.sh ausführen.
# Aufruf: backup/restore.sh [--version <version>] [snapshot-id|latest]
#   --version: nach der Wiederherstellung mit dieser (älteren) Version starten – für ein Rollback
#              über Migrationen hinweg. Ohne diese Option würde die aktuelle Version ihre neueren
#              Migrationen sofort wieder auf den wiederhergestellten Stand anwenden.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . backup/backup.env; set +a
TARGET=""
SNAP="latest"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) TARGET="${2:?--version braucht eine Version}"; shift 2 ;;
    *) SNAP="$1"; shift ;;
  esac
done
if [[ -n "$TARGET" ]]; then
  docker image inspect "terpgrid-api:$TARGET" "terpgrid-web:$TARGET" >/dev/null 2>&1 || { echo "Images für $TARGET fehlen." >&2; exit 1; }
fi
read -rp "Aktuelle Datenbank und Dateien werden durch Snapshot '${SNAP}' ersetzt. Fortfahren? (JA eingeben) " ok
[[ "$ok" == "JA" ]] || exit 1
WORK="$(mktemp -d /var/tmp/terpgrid-restore.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
restic restore "$SNAP" --tag terpgrid --target "$WORK" --verify
DUMP="$(find "$WORK" -name terpgrid.dump | head -1)"
FILES_SRC="$(dirname "$(find "$WORK" -path '*/_data' -type d | head -1)")/_data"
[[ -s "$DUMP" ]] || { echo "Dump nicht gefunden" >&2; exit 1; }

docker compose stop api caddy
docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS terpgrid WITH (FORCE)" -c "CREATE DATABASE terpgrid OWNER terpgrid_owner"
docker compose exec -T db pg_restore -U postgres -d terpgrid --exit-on-error < "$DUMP"
docker compose exec -T db psql -U postgres -d terpgrid -c "REVOKE ALL ON DATABASE terpgrid FROM PUBLIC" -c "GRANT CONNECT ON DATABASE terpgrid TO terpgrid_app"
FILES="$(docker volume inspect -f '{{.Mountpoint}}' terpgrid_api-files)"
rsync -a --delete "$FILES_SRC/" "$FILES/"
if [[ -n "$TARGET" ]]; then
  sed -i "s/^TERPGRID_VERSION=.*/TERPGRID_VERSION=${TARGET}/" .env
  echo "→ Start mit Version $TARGET (Rollback)"
fi
docker compose up -d
docker compose exec -T api node dist/cli.js verify-data
echo "✓ Wiederherstellung abgeschlossen."
