#!/usr/bin/env bash
# TERPGRID – verschlüsseltes Backup mit restic.
# Sichert: PostgreSQL-Dump (Inhalte bereits mit Master-Key verschlüsselt) und den
# Dateispeicher (verschlüsselte Fotos/Dokumente). NICHT gesichert: ./secrets
# (Master-Key separat offline aufbewahren – siehe docs/BACKUP.md).
# Aufruf täglich per systemd-Timer/cron als root.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
set -a; . backup/backup.env; set +a
: "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"
STATUS=state/backup-status.json
STAGE="$(mktemp -d /var/tmp/terpgrid-backup.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
chmod 700 "$STAGE"
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
notify() { # optionaler Benachrichtigungsbefehl (z. B. ntfy/curl oder mail); erhält nur die Meldung, nie Secrets
  [[ -n "${NOTIFY_CMD:-}" ]] || return 0
  printf 'TERPGRID-Backup auf %s: %s\n' "$(hostname)" "$1" | sh -c "$NOTIFY_CMD" >/dev/null 2>&1 || echo "Benachrichtigung fehlgeschlagen" >&2
}
fail() {
  last="$(sed -nE 's/.*"lastSuccess":("[^"]*"|null).*/\1/p' "$STATUS" 2>/dev/null)"
  printf '{"ok":false,"lastSuccess":%s,"lastCheck":"%s","error":"%s"}\n' "${last:-null}" "$(now)" "$1" > "$STATUS"
  echo "Backup fehlgeschlagen: $1" >&2
  notify "FEHLGESCHLAGEN – $1"
  exit 1
}

restic cat config >/dev/null 2>&1 || restic init || fail "restic-Repository nicht erreichbar"

echo "→ Datenbank-Dump"
docker compose exec -T db pg_dump -U postgres -d terpgrid -Fc --no-password > "$STAGE/terpgrid.dump" || fail "pg_dump"
[[ -s "$STAGE/terpgrid.dump" ]] || fail "leerer Dump"

FILES="$(docker volume inspect -f '{{.Mountpoint}}' terpgrid_api-files)" || fail "Datei-Volume nicht gefunden"
echo "→ restic backup"
restic backup --tag terpgrid --host terpgrid "$STAGE/terpgrid.dump" "$FILES" || fail "restic backup"
echo "→ Aufbewahrung anwenden"
restic forget --tag terpgrid --keep-daily "${KEEP_DAILY:-7}" --keep-weekly "${KEEP_WEEKLY:-4}" --keep-monthly "${KEEP_MONTHLY:-6}" --prune || fail "restic forget"
echo "→ Integritätsprüfung (Stichprobe 5 %)"
restic check --read-data-subset=5% || fail "restic check"

printf '{"ok":true,"lastSuccess":"%s","lastCheck":"%s","dumpBytes":%s,"durationSeconds":%s}\n' "$(now)" "$(now)" "$(stat -c %s "$STAGE/terpgrid.dump")" "$SECONDS" > "$STATUS"
[[ "${NOTIFY_ON_SUCCESS:-false}" == "true" ]] && notify "erfolgreich"
echo "✓ Backup erfolgreich"
