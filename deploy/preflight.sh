#!/usr/bin/env bash
# TERPGRID – Preflight: prüft Voraussetzungen und Konfiguration, ändert nichts.
# Exit 0 = bereit, 1 = mindestens ein Fehler. Warnungen brechen nicht ab.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
# shellcheck source=deploy/lib.sh
. ./lib.sh
errors=0
err() { fail "$*"; errors=$((errors + 1)); }

echo "TERPGRID Preflight – $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Werkzeuge
command -v docker >/dev/null && ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?')" || err "Docker fehlt"
docker compose version >/dev/null 2>&1 && ok "Docker Compose $(docker compose version --short 2>/dev/null)" || err "Docker-Compose-Plugin fehlt"
docker info >/dev/null 2>&1 || err "Docker-Daemon nicht erreichbar (läuft er? Rechte?)"
for t in openssl git; do command -v "$t" >/dev/null && ok "$t vorhanden" || err "$t fehlt"; done
for t in restic rsync; do command -v "$t" >/dev/null && ok "$t vorhanden" || warn "$t fehlt (für Backups nötig)"; done

# Ressourcen
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
(( mem_kb >= 1900000 )) && ok "RAM $((mem_kb / 1024)) MiB" || warn "RAM $((mem_kb / 1024)) MiB – empfohlen ≥ 2 GiB (siehe docs/DEPLOYMENT.md → Ressourcen)"
free_kb=$(df -Pk . | awk 'NR==2 {print $4}')
(( free_kb >= 5000000 )) && ok "Freier Speicher $((free_kb / 1024 / 1024)) GiB" || err "Nur $((free_kb / 1024)) MiB frei – mindestens 5 GiB nötig"
if command -v timedatectl >/dev/null; then
  timedatectl show -p NTPSynchronized --value 2>/dev/null | grep -q yes && ok "Uhrzeit synchronisiert (wichtig für 2FA)" || warn "Uhrzeit nicht per NTP synchronisiert – 2FA-Codes können fehlschlagen"
fi

# Konfiguration
if [[ -f .env ]]; then
  ok ".env vorhanden"
  [[ "$(stat -c %a .env)" =~ ^6[04]0$ ]] || warn ".env sollte nur für root lesbar sein (chmod 600)"
  domain="$(env_get TERPGRID_DOMAIN)"
  if [[ -z "$domain" || "$domain" == "terpgrid.example.org" ]]; then err "TERPGRID_DOMAIN nicht gesetzt"
  elif [[ ! "$domain" =~ ^[A-Za-z0-9.-]+$ ]]; then err "TERPGRID_DOMAIN ungültig: $domain"
  else
    ok "Domain $domain"
    if [[ "$domain" != "localhost" ]]; then
      ips="$(getent ahosts "$domain" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
      [[ -n "$ips" ]] && ok "DNS $domain → $ips(muss auf diesen Server zeigen)" || err "DNS-Eintrag für $domain nicht auflösbar – Zertifikat kann nicht ausgestellt werden"
    fi
  fi
  inv="$(env_get INVITE_ONLY)"
  [[ "$inv" == "false" ]] && warn "Öffentliche Registrierung ist aktiv (INVITE_ONLY=false)" || ok "Registrierung nur mit Einladung"
  mem="$(env_get ARGON2_MEMORY_KIB)"; [[ -z "$mem" || "$mem" -ge 19456 ]] || err "ARGON2_MEMORY_KIB unter OWASP-Minimum (19456)"
else
  err ".env fehlt – ./install.sh --secrets-only ausführen"
fi

# Secrets
if [[ -d secrets ]]; then
  [[ "$(stat -c %a secrets)" == "700" ]] && ok "secrets/ ist 0700" || err "secrets/ muss 0700 sein (chmod 700 secrets)"
  for s in postgres_password db_owner_password db_app_password master_keys hmac_secret; do
    if [[ ! -s "secrets/$s" ]]; then err "secrets/$s fehlt oder ist leer"; continue; fi
    [[ "$(stat -c %a "secrets/$s")" =~ ^4[04]4$ ]] || warn "secrets/$s: empfohlen chmod 444 (Verzeichnis schützt)"
  done
  if [[ -s secrets/master_keys ]]; then
    grep -qE '^[0-9]+:[A-Za-z0-9+/]{43}=(,[0-9]+:[A-Za-z0-9+/]{43}=)*$' secrets/master_keys && ok "master_keys-Format gültig" || err "master_keys-Format ungültig (erwartet 1:<base64 32 Byte>[,2:…])"
    cur="$(env_get MASTER_KEY_CURRENT)"; cur="${cur:-1}"
    grep -qE "(^|,)${cur}:" secrets/master_keys && ok "MASTER_KEY_CURRENT=$cur im Schlüsselring" || err "MASTER_KEY_CURRENT=$cur fehlt in master_keys"
  fi
  if [[ -s secrets/hmac_secret ]]; then
    len=$(base64 -d < secrets/hmac_secret 2>/dev/null | wc -c)
    (( len >= 32 )) && ok "hmac_secret ≥ 32 Byte" || err "hmac_secret zu kurz oder kein Base64"
  fi
else
  err "secrets/ fehlt – ./install.sh --secrets-only ausführen"
fi
[[ -f backup/backup.env ]] && ok "Backup konfiguriert (backup/backup.env)" || warn "Kein Backup konfiguriert – docs/BACKUP.md"

# Compose-Datei und Ports
docker compose config -q 2>/dev/null && ok "docker-compose.yml gültig" || err "docker-compose.yml ungültig: $(docker compose config -q 2>&1 | head -1)"
running="$(docker compose ps -q 2>/dev/null | wc -l)"
for port in "$(env_get HTTP_PORT)" "$(env_get HTTPS_PORT)"; do
  port="${port:-}"; [[ -z "$port" ]] && continue
  if (( running == 0 )) && command -v ss >/dev/null && ss -ltnH "sport = :$port" | grep -q .; then err "Port $port ist bereits belegt"; fi
done
grep -q 'docker.sock' docker-compose.yml && err "docker.sock darf nicht eingebunden werden" || ok "kein Docker-Socket eingebunden"

echo
if (( errors )); then fail "$errors Problem(e) – bitte beheben, bevor TERPGRID gestartet wird."; exit 1; fi
ok "Preflight bestanden."
