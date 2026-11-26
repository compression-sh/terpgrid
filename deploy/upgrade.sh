#!/usr/bin/env bash
# TERPGRID – kontrolliertes Upgrade:
#   Preflight → Backup → Code aktualisieren → neue Images (neuer Tag, alter bleibt) →
#   Migrationen → Start → Health-Prüfung → bei Fehler geführtes Rollback.
# Überschreibt nie .env oder Secrets (nur TERPGRID_VERSION wird angepasst).
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh
[[ -f .env ]] || die "Keine .env – zuerst install.sh ausführen."
build=1; ref=""
for a in "$@"; do
  case "$a" in
    --no-build) build=0 ;;   # Images der neuen Version sind bereits vorhanden (z. B. anderswo gebaut)
    -h|--help) echo "Aufruf: ./upgrade.sh [--no-build] [git-ref]"; exit 0 ;;
    *) ref="$a" ;;
  esac
done
./preflight.sh || die "Preflight fehlgeschlagen – Upgrade abgebrochen."

prev="$(env_get TERPGRID_VERSION)"; prev="${prev:-local}"
if [[ -x backup/backup.sh && -f backup/backup.env ]]; then
  echo "→ Backup vor dem Upgrade"
  backup/backup.sh || die "Backup fehlgeschlagen – Upgrade abgebrochen (nichts geändert)."
else
  warn "Kein Backup konfiguriert. Ohne Backup ist ein Rollback nach Migrationen nicht möglich."
  read -rp "Trotzdem fortfahren? (JA eingeben) " a; [[ "$a" == "JA" ]] || exit 1
fi

echo "→ Code aktualisieren (nur Fast-Forward)"
git -C .. fetch --tags
if [[ -n "$ref" ]]; then git -C .. checkout -q "$ref"; else git -C .. pull --ff-only; fi
new="$(sed -nE 's/.*"version": *"([^"]+)".*/\1/p' ../server/package.json | head -1)"
[[ -n "$new" ]] || die "Version aus server/package.json nicht lesbar"
[[ "$new" == "$prev" ]] && warn "Version unverändert ($new) – Images werden trotzdem neu gebaut."

if (( build )); then
  echo "→ Images bauen: $new (bisher $prev – bleibt für Rollback erhalten)"
  TERPGRID_VERSION="$new" docker compose build
else
  docker image inspect "terpgrid-api:$new" "terpgrid-web:$new" >/dev/null 2>&1 || die "Images für $new fehlen (ohne --no-build ausführen)."
fi
sed -i "s/^TERPGRID_VERSION=.*/TERPGRID_VERSION=${new}/" .env
echo "$prev" > state/previous-version

echo "→ Starten (Migrationen laufen im migrate-Job)"
docker compose up -d
if wait_healthy 240; then
  ok "Upgrade auf $new erfolgreich."
  docker compose exec -T api node dist/cli.js schema-status | tail -1
  exit 0
fi

fail "Version $new ist nicht gesund gestartet."
echo "Rollback auf $prev: ./rollback.sh $prev"
echo "Hinweis: Wurden Migrationen angewendet: backup/restore.sh --version $prev <Snapshot von eben>."
exit 1
