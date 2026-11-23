# TERPGRID – Self-Hosting (Docker Compose)

> **Hinweis:** Diese Anleitung beschreibt die Installation auf deinem eigenen Server. TERPGRID wird nie automatisch auf einen VPS deployt.

## 1. Überblick

| Dienst | Image | Netz | Läuft als | Besonderheiten |
| --- | --- | --- | --- | --- |
| `caddy` | `terpgrid-web` (Caddy 2.10 + SPA) | `egress`, Ports 80/443 | UID 10001 | Automatisches HTTPS, HSTS, CSP, statische Dateien, Reverse Proxy `/api/*` |
| `api` | `terpgrid-api` (Node 22, Fastify) | `backend` + `egress` | UID 1000 (`node`) | Auth, Sync, Dateien, Katalog-Proxy; Master-Key als Secret-Datei |
| `migrate` | `terpgrid-api` | `backend` | UID 1000 | Einmal-Job vor jedem Start (Owner-Rolle) |
| `db` | `postgres:16.10-alpine` | `backend` (intern, **kein Internet**, kein Port nach außen) | UID 70 | RLS, getrennte Owner-/App-Rolle, Daten-Checksummen |

Alle Container: `read_only`, `cap_drop: ALL`, `no-new-privileges`, CPU-/RAM-/PID-Limits, Healthchecks, rotierende Logs, **kein Docker-Socket**. Secrets liegen als Dateien in `deploy/secrets/` (nie im Git, nie im Image).

Auf einer Test-Installation geprüft (siehe `docs/FINAL-REPORT.md`): alle Dienste „healthy“, Nicht-root-Benutzer, schreibgeschütztes Root-FS, DB aus dem `egress`-Netz nicht erreichbar, DB ohne Internet, Sicherheits-Header gesetzt.

## 2. Voraussetzungen

* VPS mit Debian 12 / Ubuntu 24.04, ≥ 1 vCPU, ≥ 2 GB RAM, ≥ 20 GB SSD
* Domain mit A/AAAA-Eintrag auf den VPS (für Let's Encrypt)
* Docker Engine ≥ 24 mit Compose-Plugin, `git`, `openssl`, `restic`, `rsync`

## 3. Host-Härtung (vor der Installation)

```bash
# Benutzer mit sudo anlegen, SSH-Schlüssel hinterlegen
adduser admin && usermod -aG sudo admin
# /etc/ssh/sshd_config.d/10-hardening.conf
#   PasswordAuthentication no
#   PermitRootLogin no
#   KbdInteractiveAuthentication no
systemctl reload ssh

# Firewall: nur SSH, HTTP, HTTPS (Docker veröffentlicht nur 80/443)
apt install ufw unattended-upgrades fail2ban
ufw default deny incoming && ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable
dpkg-reconfigure -plow unattended-upgrades     # automatische Sicherheitsupdates
```

* **Achtung Docker + ufw:** Veröffentlichte Container-Ports umgehen ufw. TERPGRID veröffentlicht nur 80/443; die Datenbank hat keinen Port.
* Zeit synchron halten (`timedatectl set-ntp true`) – wichtig für TOTP.
* Logs: `docker compose logs -f`, Journal. Die API protokolliert keine Cookies, Tokens, Passwörter oder Inhalte; IP-Adressen nur als gekürzter HMAC im Audit-Log (180 Tage Aufbewahrung).

## 4. Installation

```bash
sudo git clone https://github.com/<dein-konto>/cannabisrechner.git /opt/terpgrid
cd /opt/terpgrid/deploy
sudo ./install.sh            # fragt nach der Domain, erzeugt .env + Secrets, baut und startet
docker compose ps            # alle Dienste „healthy“?
```

`install.sh` überschreibt vorhandene Secrets nie. Mit `./install.sh --secrets-only` werden nur `.env` und Secrets erzeugt.

**Sofort danach:** `deploy/secrets/master_keys` (und `hmac_secret`) offline sichern – siehe [BACKUP.md](BACKUP.md).

### Erstes Administrationskonto

```bash
docker compose exec api node dist/cli.js invite 7 "Admin"     # Einladungslink (einmalig, 7 Tage)
# Link im Browser öffnen, Konto anlegen, Recovery-Codes sichern
docker compose exec api node dist/cli.js promote <kennung>     # Admin-Rolle (beendet Sessions)
```

Weitere Personen lädst du in der App unter **Konto → Administration → Einladungen** ein. Es gibt keinen Standard-Admin und kein Standardpasswort.

## 5. Konfiguration (`deploy/.env`)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `TERPGRID_DOMAIN` | – (Pflicht) | Öffentliche Domain; ergibt `PUBLIC_ORIGIN=https://<domain>` |
| `INVITE_ONLY` | `true` | Registrierung nur mit Einladung. `false` = öffentliche Registrierung |
| `USER_QUOTA_MB` | `2048` | Speicherkontingent je Konto (Fotos/Dokumente) |
| `MAX_UPLOAD_MB` | `20` | Maximale Dateigröße |
| `CATALOG_PROXY_ENABLED` | `true` | Sortendaten (StrainAPI/CannaLib) über den Server-Proxy |
| `MASTER_KEY_CURRENT` | `1` | Aktive Master-Key-Version |
| `TERPGRID_VERSION` | `3.0.0` | Image-Tag (Upgrade/Rollback) |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` | Nur ändern, wenn ein anderer Proxy vorgeschaltet ist |

Weitere API-Variablen (in `docker-compose.yml` gesetzt oder ergänzbar):

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `SESSION_IDLE_MINUTES` | `4320` (3 Tage) | Inaktivitäts-Timeout |
| `SESSION_ABSOLUTE_DAYS` | `30` | Absolute Session-Laufzeit |
| `REAUTH_MINUTES` | `10` | Gültigkeit einer Passwort-Bestätigung für sensible Aktionen |
| `ARGON2_MEMORY_KIB` / `ARGON2_TIME_COST` / `ARGON2_PARALLELISM` | `19456` / `2` / `1` | OWASP-Mindestwerte (niedrigere Werte werden abgelehnt) |
| `ARGON2_MAX_CONCURRENT` | `2` | Gleichzeitige Hash-Berechnungen (Schutz vor Überlast) |
| `TRUST_PROXY` | `uniquelocal` | Vertrauenswürdige Proxy-Adressen für die Client-IP |
| `*_FILE` | – | Jede Secret-Variable kann aus einer Datei gelesen werden |

Secrets (`deploy/secrets/`, Verzeichnis `0700`, Dateien `0444` damit die Container-Benutzer lesen können):

| Datei | Inhalt | Verlust bedeutet |
| --- | --- | --- |
| `master_keys` | `1:<base64 32 Byte>[,2:…]` – verpackt die Datenschlüssel aller Konten | **Totaler Datenverlust** |
| `hmac_secret` | ≥ 32 Byte – Recovery-Codes, Einladungen, IP-Tags, Kontoschlüssel | Recovery-Codes und offene Einladungen ungültig |
| `postgres_password`, `db_owner_password`, `db_app_password` | Datenbank-Rollen | per `ALTER ROLE` neu setzbar |

## 6. Betrieb

```bash
docker compose ps                     # Zustand
docker compose logs -f api            # Logs
docker compose exec api node dist/cli.js help
docker compose exec api node dist/cli.js bench-argon2   # Argon2-Laufzeit auf dieser Hardware
docker compose exec api node dist/cli.js verify-data    # alle Inhalte testweise entschlüsseln
```

### Upgrade

```bash
cd /opt/terpgrid/deploy && sudo ./upgrade.sh
```

Ablauf: Backup → `git pull --ff-only` → Images mit neuem Tag bauen → Migrationen (transaktional, versioniert) → Neustart. Das vorherige Image bleibt lokal erhalten.

### Rollback

1. In `.env` `TERPGRID_VERSION` auf die vorherige Version setzen, `git checkout <vorheriger-tag>`.
2. Enthielt das Upgrade **Datenbank-Migrationen**, die alte Version nicht mit dem neuen Schema starten: zuerst `backup/restore.sh <snapshot-vor-upgrade>` (siehe BACKUP.md), dann `docker compose up -d`.
3. Ohne Schemaänderung genügt `docker compose up -d --no-build`.

Migrationen sind additiv geplant; ein Downgrade-Skript gibt es bewusst nicht – der Restore des Snapshots vor dem Upgrade ist der dokumentierte Weg.

### Schlüsselrotation (Master-Key)

```bash
echo ",2:$(openssl rand -base64 32)" | sudo tee -a secrets/master_keys   # neue Version anhängen (eine Zeile!)
sed -i 's/^MASTER_KEY_CURRENT=.*/MASTER_KEY_CURRENT=2/' .env
docker compose up -d                                              # neue Konten nutzen v2
docker compose exec api node dist/cli.js rotate-keys              # alle Datenschlüssel neu verpacken
docker compose exec api node dist/cli.js verify-data
# Erst NACH einem erfolgreichen Backup + Restore-Test die alte Version aus master_keys entfernen.
```

Rotiert werden die Verpackungen der Datenschlüssel (KEK-Rotation); die Inhalte selbst werden dabei nicht neu verschlüsselt. Eine Rotation der Datenschlüssel je Konto ist nicht implementiert.

### Rotation weiterer Secrets

* **Datenbank-Passwörter:** `docker compose exec db psql -U postgres -c "ALTER ROLE terpgrid_app PASSWORD '…'"`, Datei in `secrets/` ersetzen, `docker compose up -d`.
* **`hmac_secret`:** Nur bei Kompromittierung. Folge: alle Recovery-Codes und offenen Einladungen werden ungültig, die lokale Konto-Datenbank im Browser wird neu angelegt (neuer Kontoschlüssel; Daten werden vom Server neu geladen – vorher sicherstellen, dass keine Änderungen ausstehen). Danach alle Nutzer bitten, neue Recovery-Codes zu erzeugen.
* **Sessions:** `docker compose exec db psql -U postgres -d terpgrid -c "TRUNCATE sessions"` meldet alle ab.

### Abhängigkeiten prüfen

```bash
npm audit && (cd server && npm audit)   # vor jedem Release; Stand bei Phase 3: 0 Befunde
```

## 7. Fehlerbehebung

| Symptom | Ursache / Lösung |
| --- | --- |
| Zertifikat wird nicht ausgestellt | DNS zeigt nicht auf den VPS oder Port 80/443 blockiert – `docker compose logs caddy` |
| `api` startet nicht, „…_FILE“-Fehler | Secret-Datei fehlt oder ist nicht lesbar (`chmod 444`, Verzeichnis `0700`) |
| „Ungültige Herkunft der Anfrage“ | Aufruf über eine andere Domain als `TERPGRID_DOMAIN` |
| 2FA-Codes werden abgelehnt | Uhrzeit von Server oder Smartphone prüfen |
| Sortendaten laden nicht | Ausgehender HTTPS-Zugriff vom VPS zu `www.strainapi.com` / `api.cannalib.org` blockiert |
