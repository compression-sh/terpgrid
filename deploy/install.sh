#!/usr/bin/env bash
# TERPGRID – Erstinstallation auf dem eigenen Server.
# Erzeugt Secrets (einmalig), .env, baut die Images und startet den Stack.
# Bestehende Secrets werden NIE überschrieben.
set -euo pipefail
cd "$(dirname "$0")"

die() { echo "Fehler: $*" >&2; exit 1; }
command -v docker >/dev/null || die "Docker ist nicht installiert."
docker compose version >/dev/null 2>&1 || die "Docker Compose (Plugin) fehlt."
command -v openssl >/dev/null || die "openssl fehlt."

if [[ ! -f .env ]]; then
  read -rp "Domain für TERPGRID (z. B. terpgrid.example.org): " domain
  [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || die "Ungültige Domain."
  # Image-Tag = Programmversion (wie upgrade.sh), sonst trügen neu gebaute Images einen veralteten Tag
  version="$(sed -nE 's/.*"version": *"([^"]+)".*/\1/p' ../server/package.json | head -1)"
  [[ -n "$version" ]] || die "Version aus server/package.json nicht lesbar."
  sed -e "s/^TERPGRID_DOMAIN=.*/TERPGRID_DOMAIN=${domain}/" -e "s/^TERPGRID_VERSION=.*/TERPGRID_VERSION=${version}/" .env.example > .env
  chmod 600 .env
  echo "✓ .env angelegt (Domain: ${domain}, Version: ${version})"
fi

umask 077
mkdir -p secrets state
chmod 700 secrets
gen() { # Datei, Inhalt-Befehl
  if [[ -s "secrets/$1" ]]; then echo "• secrets/$1 existiert – unverändert"; return; fi
  eval "$2" > "secrets/$1"
  # Lesbar für die Container-Benutzer; das Verzeichnis (0700) schützt vor anderen Host-Benutzern
  chmod 444 "secrets/$1"
  echo "✓ secrets/$1 erzeugt"
}
gen postgres_password 'openssl rand -base64 32 | tr -d "\n"'
gen db_owner_password 'openssl rand -base64 32 | tr -d "\n/+="'
gen db_app_password 'openssl rand -base64 32 | tr -d "\n/+="'
gen master_keys 'printf "1:%s" "$(openssl rand -base64 32)"'
gen hmac_secret 'openssl rand -base64 32 | tr -d "\n"'
[[ -f state/backup-status.json ]] || echo '{"ok":false,"lastSuccess":null,"lastCheck":null}' > state/backup-status.json
chmod 755 state && chmod 644 state/backup-status.json

cat <<'MSG'

WICHTIG – Master-Key sichern:
  secrets/master_keys verschlüsselt alle Inhalte. Geht er verloren, sind die Daten
  unwiederbringlich verloren (auch aus Backups). Kopiere ihn JETZT an einen sicheren
  Ort außerhalb des Servers (z. B. Passwort-Manager, verschlüsselter USB-Stick).
  Er ist absichtlich NICHT Teil der restic-Backups.

MSG
if [[ "${1:-}" == "--secrets-only" ]]; then
  echo "✓ Secrets und .env vorbereitet (ohne Build/Start)."
  exit 0
fi
./preflight.sh || { echo "Preflight fehlgeschlagen – bitte die Hinweise oben beheben und install.sh erneut ausführen." >&2; exit 1; }
docker compose build
docker compose up -d
# shellcheck source=deploy/lib.sh
. ./lib.sh
wait_healthy 240 || { echo "TERPGRID ist nicht gesund gestartet – docker compose logs" >&2; exit 1; }
echo "✓ TERPGRID läuft. Status: docker compose ps"
echo "Erstes Konto: docker compose exec api node dist/cli.js invite 7 \"Admin\"  → Link öffnen, registrieren,"
echo "danach:       docker compose exec api node dist/cli.js promote <kennung>"
