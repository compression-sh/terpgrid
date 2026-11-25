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

## 2. Voraussetzungen und Ressourcen

* VPS mit Debian 12 / Ubuntu 24.04, ≥ 2 vCPU, ≥ 2 GB RAM, ≥ 20 GB SSD (Details unten)
* Domain mit A/AAAA-Eintrag auf den VPS (für Let's Encrypt)
* Docker Engine ≥ 24 mit Compose-Plugin, `git`, `openssl`, `restic`, `rsync`

### Gemessener Ressourcenbedarf

Gemessen auf der lokalen Test-Installation (4 vCPU Intel Xeon 2,1 GHz, Docker 29, Version 4.0.0-rc.1, 24.11.2026). Eigene Hardware kann abweichen – `docker stats` und das Admin-Dashboard zeigen die Werte im Betrieb.

| Messung | Ergebnis |
| --- | --- |
| Leerlauf RAM | API 30 MiB · PostgreSQL 73 MiB · Caddy 14 MiB (CPU ≈ 0 %) |
| Last: 4 Konten, 10 parallele Verbindungen, 400 Operationen (Sync-Push à 20 Datensätze, Pull, Upload/Download von 1-MiB-Fotos) | 2,5 s, 0 Fehler; p50/p95: Push 139/241 ms, Pull 15/41 ms, Upload 59/108 ms, Download 13/30 ms |
| Spitzen unter dieser Last | API 150 % CPU (= Limit 1,5 Kerne), 65 MiB RAM · PostgreSQL 70 % CPU, 96 MiB · Caddy 7 %, 18 MiB |
| Argon2id je Login (64 MiB, t=3) | 68 ms; max. 2 parallel → ≤ 128 MiB zusätzlicher RAM |
| AES-256-GCM | 1 KiB-Datensatz 12,5 µs · 1-MiB-Foto 1,4 ms (≈ 730 MiB/s) · Mehrgröße 29 Byte je Objekt |
| Speicher | 100 Fotos à 1 MiB → 101 MiB Volume; 2026 Datensätze → DB 60 MiB (inkl. PostgreSQL-Grundbedarf) |

**Empfehlung für eine kleine private Instanz (bis ca. 10 Personen):** 2 vCPU, 2 GB RAM (Container-Limits zusammen 1,5 GB), SSD mit Platz für Fotos × 1,1 (Papierkorb hält ersetzte Fotos `FILE_TRASH_DAYS` = 7 Tage) plus Betriebssystem/Images (≈ 3 GB). Backup-Ziel: ca. Datenmenge × 1,5 (restic dedupliziert; Aufbewahrung 7/4/6). Uploads sind auf `MAX_UPLOAD_MB` (20) und `USER_QUOTA_MB` (2048) je Konto begrenzt. Die API-Ratenbegrenzung (600 Anfragen/Min. je IP) gilt auch für mehrere Personen hinter derselben IP.

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

`install.sh` überschreibt vorhandene Secrets nie, prüft vor dem Start mit `./preflight.sh` und wartet, bis alle Dienste gesund sind. Mit `./install.sh --secrets-only` werden nur `.env` und Secrets erzeugt.

### Preflight

```bash
sudo ./preflight.sh      # ändert nichts; Exit 0 = bereit
```

Prüft: Docker/Compose, Werkzeuge (openssl, git, restic, rsync), RAM, freien Speicher, NTP-Zeit (2FA), `.env` (Domain, Rechte, Argon2-Untergrenze), DNS-Auflösung der Domain, Secrets (vorhanden, Rechte, Format von `master_keys`, aktuelle Key-Version, Länge `hmac_secret`), Backup-Konfiguration, Compose-Datei, freie Ports, kein Docker-Socket.

**Sofort danach:** `deploy/secrets/master_keys` (und `hmac_secret`) offline sichern – siehe [BACKUP.md](BACKUP.md).

### Erstes Administrationskonto

```bash
docker compose exec api node dist/cli.js invite 7 "Admin"     # Einladungslink (einmalig, 7 Tage)
# Link im Browser öffnen, Konto anlegen, Recovery-Codes sichern
docker compose exec api node dist/cli.js promote <kennung>     # Admin-Rolle (beendet Sessions)
```

Weitere Personen lädst du in der App unter **Konto → Administration → Einladungen** ein. Es gibt keinen Standard-Admin und kein Standardpasswort.

### Sortenkatalog importieren (optional, empfohlen)

```bash
sudo ./import-catalog.sh --dry-run   # Download (raw.githubusercontent.com), Prüfsumme, Qualitätsbericht
sudo ./import-catalog.sh             # Import im migrate-Container (Owner-Rolle), ca. 7 s, ~50 MB in PostgreSQL
```

Ohne Import zeigt Discover wie bisher den Live-Katalog (StrainAPI). Details, Lizenz (CC BY 4.0) und Grenzen: [CATALOG.md](CATALOG.md).

Optional zusätzlich öffentliche Laborproben (Smith et al. 2022, CC0, ca. 20 MB):

```bash
sudo ./import-samples.sh --dry-run
sudo ./import-samples.sh
```

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
| `FILE_TRASH_DAYS` | `7` | Tage, die ersetzte/gelöschte (verschlüsselte) Datei-Blobs im Papierkorb bleiben – Backup-Konsistenz |
| `WEBAUTHN_RP_ID` | Hostname der Domain | Relying-Party-ID für Passkeys (nur ändern, wenn Passkeys für eine übergeordnete Domain gelten sollen) |
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
cd /opt/terpgrid/deploy && sudo ./upgrade.sh            # neuester Stand des Branches
sudo ./upgrade.sh v4.0.0                                  # bestimmter Tag/Commit
sudo ./upgrade.sh --no-build v4.0.0                       # Images bereits vorhanden
```

Ablauf: Preflight → **Backup** (Abbruch, wenn es fehlschlägt) → `git pull --ff-only` bzw. `checkout` → Images mit neuem Versions-Tag bauen (alte bleiben für Rollback) → `migrate`-Job (transaktionale, versionierte Migrationen) → Start → Warten auf „healthy“ und `ready` (max. 4 Min.). Schlägt der Start fehl, nennt das Skript den Rollback-Befehl. Die vorherige Version steht in `state/previous-version`.

**Schema-Schutz:** Die API startet nur, wenn Datenbank und Programmversion zusammenpassen. Ist die Datenbank neuer (Migrationen einer späteren Version) oder fehlen Migrationen, beendet sie sich mit einer klaren Meldung (`docker compose logs api`). `docker compose exec api node dist/cli.js schema-status` zeigt den Stand (Exit 0 = passend, 3 = DB neuer, 4 = Migration ausstehend).

Getestet: Upgrade 3.0.0 → 4.0.0-rc.1 mit Bestandsdaten (Datensätze, Foto, 2FA) – alles lesbar, 2FA-Geheimnis aus 3.0 funktioniert, 42 s inkl. Backup.

### Rollback

```bash
sudo ./rollback.sh                 # auf state/previous-version
sudo ./rollback.sh 4.0.0-rc.1      # auf eine bestimmte, lokal vorhandene Version
```

`rollback.sh` prüft mit dem Programm der Zielversion, ob das Schema passt. Ist die Datenbank neuer, bricht es ab und verlangt einen Restore:

1. In `.env` `TERPGRID_VERSION` auf die Zielversion setzen.
2. `backup/restore.sh <snapshot-vor-dem-upgrade>` (der `migrate`-Job der Zielversion läuft dabei mit).
3. Änderungen, die nach dem Upgrade gemacht wurden, sind danach nicht mehr vorhanden.

Getestet: Rollback 4.0.0-rc.1 → 3.0.0 auf genau diesem Weg (Schema wieder 001, alle Daten von 3.0.0 entschlüsselt). Versionen vor 4.0 kennen `schema-status` nicht; `rollback.sh` bricht dann sicher ab – Rollback nur per Restore wie oben. Ein Downgrade-Skript für Migrationen gibt es bewusst nicht.

### Monitoring (ohne Tracking)

* **Admin → System Health:** API-Latenz p50/p95/p99 und Serverfehler-Rate (letzte 15 Min.), DB-Erreichbarkeit/Latenz/Größe/Verbindungen, Schemastand, API-Speicher, Datei-Papierkorb, laufende Schlüsselrotationen, Fehler von Hintergrundaufgaben, Version. Keine IP-Adressen, keine Benutzer, keine Pfade mit IDs, keine Inhalte; nur im Arbeitsspeicher (Neustart setzt zurück); nur für Admins (`/api/admin/system`).
* **Admin → Übersicht:** Backup-Frische/-Status, Speicher, Sicherheitsereignisse (7 Tage).
* **Container:** `docker compose ps` (Health/Neustarts). Alle Dienste haben `restart: unless-stopped`; getestet: API nach `kill -9` automatisch neu gestartet und wieder gesund.
* **Öffentliche Endpunkte** `/api/health` (lebt) und `/api/health/ready` (DB erreichbar) liefern nur `ok`/`unavailable`.
* **Logs und Aufbewahrung:** Container-Logs je Dienst max. 5 × 10 MB (Docker `json-file`), ohne Cookies/Tokens/Passwörter/Inhalte, Einladungs-Token geschwärzt. Audit-Ereignisse 180 Tage, IP nur als gekürzter HMAC. Sessions werden stündlich bereinigt, der Datei-Papierkorb nach `FILE_TRASH_DAYS`.

### Schlüsselrotation (Master-Key)

```bash
echo ",2:$(openssl rand -base64 32)" | sudo tee -a secrets/master_keys   # neue Version anhängen (eine Zeile!)
sed -i 's/^MASTER_KEY_CURRENT=.*/MASTER_KEY_CURRENT=2/' .env
docker compose up -d                                              # neue Konten nutzen v2
docker compose exec api node dist/cli.js rotate-keys              # alle Datenschlüssel neu verpacken
docker compose exec api node dist/cli.js verify-data
# Erst NACH einem erfolgreichen Backup + Restore-Test die alte Version aus master_keys entfernen.
```

Rotiert werden die Verpackungen der Datenschlüssel aller Generationen (KEK-Rotation); die Inhalte selbst werden dabei nicht neu verschlüsselt.

### Rotation der Datenschlüssel je Konto (DEK)

```bash
docker compose exec api node dist/cli.js rotate-user-keys <kennung>     # ein Konto
docker compose exec api node dist/cli.js rotate-user-keys --all         # alle Konten
docker compose exec api node dist/cli.js key-status                     # Generationen/Zustand
```

Erzeugt eine neue Schlüsselgeneration, verschlüsselt alle Datensätze, Dateien und das 2FA-Geheimnis in kleinen Transaktionen um und prüft danach alles; erst dann wird die alte Generation „retired“. Der Vorgang ist jederzeit abbrechbar und wird beim nächsten Aufruf fortgesetzt; neue Schreibvorgänge nutzen sofort die neue Generation. Ausgemusterte Schlüssel bleiben erhalten, weil ältere Backups sie brauchen:

```bash
docker compose exec api node dist/cli.js purge-retired-keys --min-age-days 200
```

löscht sie nur, wenn keine Zeile sie mehr nutzt **und** die Ausmusterung länger zurückliegt als die Backup-Aufbewahrung (Standard 200 Tage > 6 Monate). Grenzen: Ein Restore eines Backups von vor der Rotation braucht die alte Generation (bis zum Purge vorhanden). Ein Rollback auf eine Version vor 4.0 nach einer Rotation ist nur per Restore möglich.

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
