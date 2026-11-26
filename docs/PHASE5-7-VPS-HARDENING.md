# Phase 5.7 – Härtungsleitfaden für den bestehenden VPS

Stand: 5.7.0-rc.1. Gilt für Ubuntu LTS mit Docker Compose, Caddy (im Container), nftables und CrowdSec.

**Dieser Leitfaden ändert nichts automatisch.** Alle Befehle dienen der **manuellen Prüfung**. Änderungen bitte einzeln, mit offener zweiter SSH-Sitzung und nach einem Backup vornehmen. Funktionierende Firewall-Infrastruktur (nftables + CrowdSec) **nicht** durch einen anderen Firewall-Manager (z. B. ufw) ersetzen; `DEPLOYMENT.md` nennt ufw nur für Neuinstallationen ohne bestehende Firewall.

## 1. Sicherheitsupdates

```bash
sudo apt update && apt list --upgradable
systemctl status unattended-upgrades --no-pager
cat /etc/apt/apt.conf.d/20auto-upgrades          # erwartet: Update-Package-Lists "1"; Unattended-Upgrade "1"
grep -E 'Automatic-Reboot|Origins-Pattern' -A3 /etc/apt/apt.conf.d/50unattended-upgrades
[ -f /var/run/reboot-required ] && cat /var/run/reboot-required.pkgs   # Neustart ausstehend?
```

Docker-Images aktualisieren nur über `deploy/upgrade.sh` (mit Backup). Basis-Images sind auf Versionen gepinnt (`node:22.21-alpine3.22`, `caddy:2.10.2-alpine`, `postgres:16.10-alpine3.22`).

## 2. SSH

```bash
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|maxauthtries|x11forwarding|allowusers|allowgroups) '
# Erwartet: permitrootlogin no · passwordauthentication no · kbdinteractiveauthentication no · pubkeyauthentication yes · x11forwarding no
sudo ss -tlnp | grep -E ':22\b|sshd'
last -a | head -20; sudo journalctl -u ssh --since "7 days ago" | grep -c "Failed"
```

Nur Schlüssel (ed25519), kein Root-Login, optional `AllowUsers <name>`.

## 3. nftables (bestehende Regeln prüfen, nicht ersetzen)

```bash
sudo nft list ruleset | less
sudo nft list ruleset | grep -E 'policy|dport'     # erwartet: input policy drop; erlaubt nur 22, 80, 443 (tcp) und 443 (udp, HTTP/3)
sudo ss -tulpn                                     # offene Ports des Hosts
docker compose -f deploy/docker-compose.yml port caddy 443 2>/dev/null
```

**Wichtig bei Docker:** Docker legt eigene nftables- bzw. iptables-Ketten an. Veröffentlichte Container-Ports umgehen Host-Regeln in der `input`-Kette. TERPGRID veröffentlicht nur Caddy (80/443); PostgreSQL und API haben **keinen** veröffentlichten Port und liegen im internen Netz `backend` (ohne Internet). Prüfen:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'        # nur terpgrid-caddy-1 mit 0.0.0.0:80/443
docker network inspect terpgrid_backend --format '{{.Internal}}'   # true
```

## 4. CrowdSec

```bash
sudo cscli version && sudo systemctl status crowdsec --no-pager
sudo cscli collections list | grep -E 'linux|sshd|caddy|http'
sudo cscli bouncers list                           # nftables-Bouncer aktiv?
sudo cscli decisions list | head
sudo cscli metrics | head -40
```

Caddy loggt im JSON-Format nach stdout (Cookies, Authorization, CSRF und Einladungstokens entfernt). Soll CrowdSec Caddy auswerten: Docker-Log-Quelle für den Container `terpgrid-caddy-1` in `acquis.yaml` eintragen. Diese Auswertung ist **nicht** Teil der TERPGRID-Konfiguration und wurde nicht getestet. Die API begrenzt Anmelde-, Wiederherstellungs- und Registrierungsversuche zusätzlich selbst.

## 5. Caddy und Header

```bash
curl -sI https://<domain>/ | grep -iE 'strict-transport|content-security|x-frame|referrer|permissions|cross-origin'
curl -sI https://<domain>/api/auth/config | grep -iE 'cache-control|content-security'   # erwartet: no-store, sandbox
curl -sI https://<domain>/sw.js | grep -i cache-control                                  # erwartet: no-cache
```

Bewertung 5.7 (keine Änderung nötig):
- **CSP:** `script-src 'self'`, kein `unsafe-eval`, `frame-ancestors 'none'`, `form-action 'none'`, `object-src 'none'`. `style-src 'unsafe-inline'` bleibt nötig (React-Inline-Styles für Diagramme und Fortschrittsbalken); das Risiko ist gering, da Skripte strikt beschränkt sind.
- **HSTS:** 1 Jahr, `includeSubDomains`; `preload` bewusst nicht (schwer rückgängig zu machen).
- **Permissions-Policy:** `camera=(self)` (Foto-Upload), Mikrofon und Standort aus. Passkeys funktionieren ohne eigene Freigabe (gleicher Origin).
- **COOP:** `same-origin`. Kein COEP; es würde fremde Bilder des Katalog-Proxys nicht betreffen, bringt aber ohne SharedArrayBuffer keinen Nutzen.
- **API:** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store`, CSP `sandbox` für alle API-Antworten.

## 6. Docker

```bash
docker info --format '{{.SecurityOptions}}'                  # seccomp/apparmor aktiv?
docker compose -f deploy/docker-compose.yml config | grep -E 'read_only|cap_drop|cap_add|no-new-privileges|user:|privileged'
docker inspect $(docker ps -q --filter name=terpgrid) --format '{{.Name}} user={{.Config.User}} ro={{.HostConfig.ReadonlyRootfs}} priv={{.HostConfig.Privileged}} caps={{.HostConfig.CapAdd}}'
ls -la /var/run/docker.sock; docker ps --format '{{.Names}} {{.Mounts}}' | grep -c docker.sock   # erwartet: 0
```

Stand 5.7:
- Alle Dienste laufen mit `read_only`, `cap_drop: ALL` und `no-new-privileges`.
- Benutzer: API `node`, Web `caddy`, Datenbank `70:70`. Nur Caddy hat `NET_BIND_SERVICE`.
- Kein Container ist `privileged`, keiner bindet den Docker-Socket ein.
- Ressourcenlimits (CPU, Speicher, PIDs) und Healthchecks sind gesetzt.
- Die Images werden lokal gebaut; nur die Basis-Images kommen aus Docker Hub.

## 7. PostgreSQL

```bash
docker compose exec db psql -U postgres -d terpgrid -c "\du"      # terpgrid_app: kein Superuser, kein BYPASSRLS, kein Owner
docker compose exec db psql -U postgres -d terpgrid -c "select relname, relrowsecurity from pg_class where relname in ('records','files','spaces','space_records','space_members','notifications')"
docker compose exec db psql -U postgres -c "show password_encryption"   # scram-sha-256
```

Keine Portfreigabe, Daten-Checksummen aktiv (`--data-checksums`), Migrationen nur über den `migrate`-Job mit der Owner-Rolle.

## 8. Dateirechte und Secrets

```bash
ls -ld deploy/secrets && ls -l deploy/secrets       # Verzeichnis 0700, Dateien nur für root/Betreiber lesbar
stat -c '%a %U %n' deploy/.env deploy/backup/backup.env   # 600
git -C . status --porcelain deploy/secrets deploy/.env   # nichts davon im Git (ignoriert)
```

- **Master-Key** (`secrets/master_keys`) und **HMAC-Secret** (`secrets/hmac_secret`) zusätzlich **offline** sichern: Passwortmanager oder Ausdruck im Safe.
- Ohne Master-Key sind Backups nicht entschlüsselbar. Ohne HMAC-Secret funktionieren Recovery-Codes und Einladungen nicht mehr. Beides ist im Notfalltest nachgewiesen.
- Das restic-Passwort getrennt von den Backups aufbewahren.

## 9. Backups

```bash
systemctl list-timers --all | grep terpgrid          # Backup- und Restore-Test-Timer nach Wunsch; Katalog-Refresh bleibt deaktiviert
sudo bash deploy/backup/restore-test.sh latest       # monatlich: restic check, verifizierte Wiederherstellung, Entschlüsselung aller Daten
```

## 10. DNS

```bash
dig +short A <domain>; dig +short AAAA <domain>; dig +short CAA <domain>
```

Empfohlen ist ein CAA-Eintrag, der nur Let's Encrypt erlaubt (`0 issue "letsencrypt.org"`). AAAA nur setzen, wenn IPv6 tatsächlich erreichbar ist.

## 11. Überwachung und Kapazität

```bash
df -h / /var/lib/docker; docker system df
docker compose exec api node dist/cli.js schema-status
curl -s https://<domain>/api/health/ready
journalctl -p err --since today | tail
```

In der Administration (Systemzustand) stehen Version, Schemastand, Laufzeit, Antwortzeiten, Fehlerraten und Backup-Status – ohne personenbezogene Daten. Warnschwelle für den Speicher: 80 %. Bei vollem Volume schlagen Uploads und Backups fehl.

## 12. Wiederherstellung

Ablauf, Zeiten und Grenzen: `PHASE5-7-DISASTER-RECOVERY.md` und `RUNBOOK.md`. Destruktive Wiederherstellungsschritte **nie** ungeprüft auf dem Produktivsystem ausführen; zuerst `restore-test.sh`.
