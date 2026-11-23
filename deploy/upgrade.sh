#!/usr/bin/env bash
# TERPGRID – Upgrade: Backup → Images bauen → Migrationen → Neustart.
# Rollback: siehe docs/DEPLOYMENT.md (vorheriges Image-Tag + Datenbank-Restore).
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] || { echo "Keine .env – zuerst install.sh ausführen." >&2; exit 1; }

if [[ -x backup/backup.sh && -f backup/backup.env ]]; then
  echo "→ Backup vor dem Upgrade"
  backup/backup.sh
else
  echo "WARNUNG: Kein Backup konfiguriert (backup/backup.env). Abbrechen mit Strg+C, weiter in 10 s." >&2
  sleep 10
fi
prev="$(grep -E '^TERPGRID_VERSION=' .env | cut -d= -f2)"
echo "→ Aktuelle Version: ${prev:-local}"
git -C .. pull --ff-only
new="$(node -p "require('../server/package.json').version" 2>/dev/null || echo "$prev")"
sed -i "s/^TERPGRID_VERSION=.*/TERPGRID_VERSION=${new}/" .env
echo "→ Baue Version ${new} (vorheriges Image ${prev} bleibt für Rollback erhalten)"
docker compose build
docker compose up -d
docker compose ps
echo "✓ Upgrade abgeschlossen. Bei Problemen: docs/DEPLOYMENT.md → Rollback."
