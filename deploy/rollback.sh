#!/usr/bin/env bash
# TERPGRID – Rollback auf eine frühere Version (deren Images lokal vorhanden sein müssen).
# Prüft vorher, ob das Datenbankschema zur Zielversion passt. Ist die Datenbank neuer
# (Migrationen der neueren Version), ist zuerst ein Restore des Backups nötig.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh
target="${1:-$(cat state/previous-version 2>/dev/null || true)}"
[[ -n "$target" ]] || die "Aufruf: ./rollback.sh <version>  (verfügbar: $(docker image ls terpgrid-api --format '{{.Tag}}' | tr '\n' ' '))"
docker image inspect "terpgrid-api:$target" >/dev/null 2>&1 || die "Image terpgrid-api:$target nicht vorhanden."
docker image inspect "terpgrid-web:$target" >/dev/null 2>&1 || die "Image terpgrid-web:$target nicht vorhanden."

echo "→ Schema-Kompatibilität mit $target prüfen (mit dem Programm der Zielversion)"
set +e
docker run --rm --network terpgrid_backend --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  -e NODE_ENV=production -e PUBLIC_ORIGIN="https://$(env_get TERPGRID_DOMAIN)" \
  -e DATABASE_URL="postgres://terpgrid_app@db:5432/terpgrid" -e DATABASE_PASSWORD_FILE=/run/secrets/db_app_password \
  -e MASTER_KEYS_FILE=/run/secrets/master_keys -e HMAC_SECRET_FILE=/run/secrets/hmac_secret \
  -v "$PWD/secrets/db_app_password:/run/secrets/db_app_password:ro" -v "$PWD/secrets/master_keys:/run/secrets/master_keys:ro" \
  -v "$PWD/secrets/hmac_secret:/run/secrets/hmac_secret:ro" \
  "terpgrid-api:$target" node dist/cli.js schema-status
rc=$?
set -e
if (( rc == 3 )); then
  fail "Die Datenbank enthält Migrationen, die $target nicht kennt."
  echo "Vorgehen: 1) backup/restore.sh <snapshot-von-vor-dem-upgrade>  2) ./rollback.sh $target"
  exit 1
fi
(( rc == 0 || rc == 4 )) || die "Schemaprüfung fehlgeschlagen (Exit $rc)."

sed -i "s/^TERPGRID_VERSION=.*/TERPGRID_VERSION=${target}/" .env
docker compose up -d
wait_healthy 240 || die "Rollback gestartet, aber nicht gesund – Logs: docker compose logs api"
ok "Rollback auf $target abgeschlossen."
