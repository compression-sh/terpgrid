#!/usr/bin/env bash
# TERPGRID – Betriebsdiagnose (nur lesend, ändert nichts, gibt keine Secrets aus).
# Aufruf: ./status.sh [--verify]
#   --verify: zusätzlich alle Datensätze und Dateien testweise entschlüsseln (dauert bei großen Beständen länger)
# Exit 0 = keine Probleme, 1 = Dienste nicht gesund, 2 = Diagnose meldet Probleme.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
# shellcheck source=deploy/lib.sh
. ./lib.sh
[[ -f .env ]] || die "Keine .env – ist TERPGRID hier installiert?"
rc=0

echo "TERPGRID – Version laut .env: $(env_get TERPGRID_VERSION || echo '?') · vorherige: $(cat state/previous-version 2>/dev/null || echo '–')"
echo
echo "Container:"
docker compose ps --format '  {{.Service}}: {{.State}} {{.Health}} ({{.Image}})' 2>/dev/null || { fail "docker compose ps fehlgeschlagen"; exit 1; }
states="$(docker compose ps -a --format '{{.Service}}={{.State}}/{{.Health}}' 2>/dev/null)"
for svc in $(docker compose config --services 2>/dev/null | grep -vx migrate); do
  if grep -qE "^${svc}=running/(healthy|)$" <<<"$states"; then ok "Dienst $svc läuft"; else fail "Dienst $svc läuft nicht ($(grep -E "^${svc}=" <<<"$states" | head -1 | cut -d= -f2 || true)) – ./upgrade.sh bzw. docker compose up -d"; rc=1; fi
done
api_ready=0
if docker compose exec -T api wget -qO- http://127.0.0.1:8080/api/health/ready >/dev/null 2>&1; then ok "API bereit (Datenbank verbunden)"; api_ready=1; else fail "API nicht bereit"; rc=1; fi
echo
echo "Speicher (Host):"
df -h --output=target,size,used,avail,pcent / /var/lib/docker 2>/dev/null | sed 's/^/  /' | awk '!seen[$0]++'
for v in terpgrid_db-data terpgrid_api-files; do
  mp="$(docker volume inspect -f '{{.Mountpoint}}' "$v" 2>/dev/null)" || continue
  echo "  Volume $v: $(du -sh "$mp" 2>/dev/null | cut -f1)"
done
echo
if [[ -f state/backup-status.json ]]; then
  echo "Backup-Status (state/backup-status.json): $(cat state/backup-status.json)"
else
  warn "Noch kein Backup-Status (backup/backup.sh lief noch nie oder ist nicht eingerichtet)"
fi
echo
if (( api_ready )); then
  docker compose exec -T api node dist/cli.js status "$@"
  s=$?
  (( s != 0 && rc == 0 )) && rc=2
fi
exit "$rc"
