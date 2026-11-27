# Phase 5.9 – Upgrade, Rollback und Disaster Recovery (isoliert getestet)

Stand: 5.9.0-rc.1.

**Testumgebung:**
- Isolierte Docker-Compose-Installationen mit den Skripten und Dockerfiles dieses Repositorys. Die Images sind identisch bis auf das Proxy-Zertifikat der Sandbox beim Bauen.
- Daten:
  - Katalog: 16.710 Sorten und 89.923 Laborproben.
  - Konto `restore_user`: 108 Datensätze, 6 Fotos, Academy-Fortschritt, Laborberichte.
  - Zweites Konto mit Freundschaft.
  - Gemeinsamer Bereich: 76 Einträge, 8 Dateien, Kommentar, Benachrichtigungen.
- **Keine Produktionsdaten, keine Änderung am Produktionsserver.**

**Prüfsummen** (md5 über die Datenbank, vor und nach jedem Schritt):

| Kurzname | Umfang |
| --- | --- |
| *privat* | Chiffrat, MAC, Version und Sequenz aller Datensätze sowie Dateimetadaten |
| *Zugangsdaten* | Passwort-Hash, 2FA-Geheimnis (verschlüsselt), Rolle, Status |
| *Schlüssel* | verpackte Datenschlüssel und Generationen |
| *Zusammenarbeit* | Bereiche, Mitgliedschaften, Einträge, Kommentare, Benachrichtigungen |
| *Katalog/Proben* | alle Sorten-IDs, THC-Werte, Eltern, alle Proben mit Messwerten |

Zusätzlich SHA-256 über alle Datei-Blobs.

## 1. Verschlüsselung ruhender Daten (Klartextsuche)

**Vorgehen:**
1. Synthetischer Marker in einen privaten Journal-Eintrag und einen Kommentar im gemeinsamen Bereich.
2. Gegenprobe: Über die API ist der Marker entschlüsselt lesbar.
3. Nach `CHECKPOINT` wurde nach dem Marker gesucht.

| Ort | Treffer |
| --- | --- |
| PostgreSQL-Datendateien (Volume, roh) | **0** |
| `pg_dump` als Klartext-SQL | **0** |
| Dateispeicher (Volume) | **0** |
| Container-Logs (db, api, caddy) | **0** |
| `/tmp` im API-Container | **0** |
| restic-Repository | **0** |
| Reste in `/var/tmp` nach Backup und Restore | **keine** (Staging wird entfernt) |

- Das ist **serverseitige Verschlüsselung** (AES-256-GCM, Schlüssel je Konto und Bereich, verpackt mit dem Master-Key).
- Es ist **keine** Ende-zu-Ende-Verschlüsselung: Wer Server und Master-Key kontrolliert, kann entschlüsseln (`SECURITY.md`).

## 2. Upgrade und Rollback

| Prüfung | 5.8.0-rc.1 → 5.9 | 5.7.0-rc.1 → 5.9 |
| --- | --- | --- |
| **Unterbrochen** | während des Image-Baus (Strg+C an die Prozessgruppe) | beim Umschalten der Container |
| Zustand danach | alte Version läuft weiter, `.env` unverändert, API bereit | `.env` = 5.9, nur DB läuft (API und Caddy aus) |
| Daten nach dem Abbruch | alle Prüfsummen ✓ | alle Prüfsummen ✓ |
| **Upgrade** (erneut ausgeführt) | ✓ in 44 s (Preflight und Backup inklusive, Images vorab gebaut) | ✓ in 39 s |
| Prüfsummen nach dem Upgrade | privat, Zugangsdaten, Schlüssel, Zusammenarbeit, Katalog/Proben ✓ | ✓ |
| Funktion | Fotos 6/6 bytegleich, fremde Daten nicht sichtbar, Academy-Fortschritt erhalten, Mitglied liest Bereich und Foto, Rolle „Kommentieren“ darf nicht schreiben (403) | ✓ identisch |
| `status.sh --verify` | ✓ keine Probleme, Entschlüsselung 0 Fehler | ✓ |
| **Nicht unterstützter Rollback** auf 5.4.0-rc.1 | Exit 1: „Die Datenbank enthält Migrationen, die 5.4.0-rc.1 nicht kennt“ mit Restore-Anleitung; Version unverändert, API bereit | ✓ identisch |
| **Erlaubter Rollback** auf die Ausgangsversion | ✓ Prüfsummen unverändert | ✓ |
| **Roll-forward** aus gesundem Zustand | ✓ | ✓ in 41 s; **Ausfallzeit 4,3 s** (10 von 176 Proben ohne 200, Probe alle 250 ms über Caddy) |
| **Fehlgeschlagene Migration** (Testversion mit `010_failtest.sql`: Tabelle anlegen, dann Division durch null) | – (Lauf durch eigenen Skriptfehler abgebrochen, siehe unten) | `upgrade.sh` Exit 1 nach 8 s; Schema unverändert (9 Migrationen, Testtabelle **nicht** vorhanden → transaktional); API während des Fehlschlags aus; `rollback.sh 5.9.0-rc.1` stellt in 33 s wieder her; Prüfsummen ✓ |
| Hintergrund-Timer aktiv | 0 | 0 |

**Dabei gefundene und behobene Mängel:**

| ID | Befund | Behebung | Nachweis |
| --- | --- | --- | --- |
| S-4 | Nach einem beim Umschalten unterbrochenen Upgrade lief Caddy beim zweiten Versuch nicht. Docker Compose hatte nur einen umbenannten Container im Zustand „created“ angelegt. `upgrade.sh` meldete trotzdem „erfolgreich“, weil `wait_healthy` nur vorhandene Container prüfte. | `wait_healthy` prüft alle Dauerdienste aus `docker-compose.yml` und startet nicht laufende einmal nach. `status.sh` meldet jeden Dienst einzeln. | reproduziert; danach 2 Fälle (Container nur angelegt, Container fehlt) automatisch behoben |
| S-5 | Bei fehlgeschlagener Migration brach `upgrade.sh` an `docker compose up -d` ab (`set -e`), ohne Fehlerausgabe der Migration und ohne Rollback-Hinweis | Fehlschlag wird abgefangen, Ausgabe zeigt „Migration 010_failtest.sql fehlgeschlagen: division by zero“ und `./rollback.sh <vorherige>` | Gegentest |
| S-7 | `upgrade.sh` aktualisiert sich per `git pull` selbst, während es läuft (Bash liest zeilenweise nach) | Skript in `{ … }` geklammert, wird vor der Ausführung vollständig eingelesen | Syntaxprüfung; wirksam ab Upgrades **aus** 5.9 |

**Hinweis zum Weg 5.7/5.8 → 5.9:**
- Es läuft noch das `lib.sh` der alten Version, weil es vor dem `git pull` geladen wird.
- S-4 kann dort also noch auftreten.
- Deshalb nach dem Upgrade immer `./status.sh` ausführen (`UPGRADE-5.9.md`).

**Ablauf des ersten 5.8-Laufs (offen dokumentiert):**
- Schritt 5 brach durch einen Fehler im Testskript ab: Ich hatte das Skript bearbeitet, während es lief.
- Die fehlgeschlagene Migration ist deshalb nur im 5.7-Lauf belegt.
- Ebenfalls im 5.8-Lauf war die Ausfallmessung ungültig: Der Proben-Loop endete vorzeitig. Die 4,3 s stammen aus dem 5.7-Lauf mit einem eigenständigen Prober.

## 3. Disaster Recovery: Totalverlust und frische Installation

Zweimal durchgeführt: mit dem Stand `0896f87` (nach dem 5.8-Upgrade) und mit dem endgültigen Stand `d2901c5` (nach dem 5.7-Upgrade).

**Ablauf:**
1. `backup/backup.sh`.
2. `master_keys`, `hmac_secret`, `.env` und `backup.env` in eine „Offline-Sicherung“ kopieren.
3. `docker compose down -v`, Installationsverzeichnis löschen. Danach: 0 Container, 0 Volumes.
4. Nach **RUNBOOK §3**:
   1. frischer Clone, gleiche Version;
   2. Schlüssel aus der Sicherung;
   3. `install.sh --secrets-only` (neue DB-Passwörter);
   4. `preflight.sh` ✓;
   5. `docker compose up -d`;
   6. `backup/restore-test.sh latest`;
   7. `backup/restore.sh latest`.

| Ergebnis | 1. Übung | 2. Übung (endgültig) |
| --- | --- | --- |
| Leere Instanz gesund nach | 47 s | 44 s |
| `restore-test.sh` | ✓ 9,5 s | ✓ 8,2 s |
| `restore.sh` (inkl. `verify-data`) | ✓ 8,7 s | ✓ 8,0 s |
| Prüfsummen gegen den Stand vor dem Verlust | privat, Zugangsdaten, Schlüssel, Zusammenarbeit, Katalog/Proben, **SHA-256 aller Blobs** ✓ | ✓ |
| Anmeldung mit Passwort (bestehende Zugangsdaten) | ✓ | ✓ |
| Private Daten, Fotos bytegleich, Academy-Fortschritt, Laborberichte | ✓ | ✓ |
| Gemeinsamer Bereich lesbar, Rechte unverändert (Kommentieren → 403 beim Schreiben) | ✓ | ✓ |
| Katalog und Laborproben | 16.710 / 494 / 21.210 Angebote / 89.923 Proben ✓ | ✓ |
| `status.sh --verify` | Entschlüsselung 0 Fehler; meldet korrekt „Backup: noch kein Lauf“ auf dem neuen Server | ✓ |

## 4. Deployment-Audit (laufende Instanz)

| Prüfung | Ergebnis |
| --- | --- |
| Alle Container | Root-Dateisystem nur lesbar, `cap_drop: ALL`, `no-new-privileges`, nicht privilegiert, `restart: unless-stopped`, Healthcheck „healthy“, Logs json-file 10 MB × 5 |
| Benutzer | API `node`, DB `70:70`, Caddy `caddy` (nur `NET_BIND_SERVICE`) |
| Limits | API 1,5 CPU / 768 MB, DB 1 CPU / 512 MB, Caddy 1 CPU / 256 MB, je 200 Prozesse |
| Netze | `backend` intern (ohne Internet; Probe aus dem DB-Container: kein Internet), `egress` nur für Caddy und den Katalog-Proxy der API |
| Veröffentlichte Ports | nur Caddy 80/443 (TCP, UDP für HTTP/3); PostgreSQL und API **nicht** veröffentlicht |
| Secrets | `secrets/` 0700, Dateien 0444, `.env` und `backup.env` 0600; in der API nur `*_FILE`-Pfade, keine Klartext-Umgebungsvariablen; kein Schlüsselmaterial im Image; kein Docker-Socket |
| Dateirechte | Datei-Volume 0700 `node`; Anwendungscode für `node` nicht schreibbar |
| TLS / Header | TLS 1.3; HTTP → 308 HTTPS; HSTS, CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP; API zusätzlich `sandbox`-CSP und CORP; kein `Server`-Header |
| Hintergrundjobs, Web-Push | keine Timer aktiv, keine Push-Konfiguration |

Die Firewall (nftables, CrowdSec) bleibt unberührt. TERPGRID veröffentlicht nur 80/443 (`PHASE5-7-VPS-HARDENING.md`).

## 5. Messwerte (kleiner Bestand)

| Messung | Wert |
| --- | --- |
| Datenbank (mit Katalog und Proben) / Datei-Volume | 94 MB / 0,7 MB |
| Dump (custom format, komprimiert) | 7,8–8,1 MB |
| `backup.sh` (Dump, restic, Aufbewahrung, 5-%-Prüfung) | 5,2–5,8 s |
| RAM-Spitze beim Backup | Host +144 MiB, DB-Container 150 MiB |
| restic-Repository nach 4–6 Snapshots | 16–19 MB (dedupliziert) |
| `restic check --read-data` vollständig | 0,7 s |
| `restore-test.sh` / `restore.sh` | 8–10 s / 8–9 s; RAM-Spitze Host +108–162 MiB |
| Platzbedarf beim Restore | Dump plus Dateien im Staging-Verzeichnis `/var/tmp` (die Messung der Spitze verfehlte das kurze Fenster; Bemessung daher aus den Größen) |

**Hochrechnung für große Bestände** (nicht gemessen; aus dem großen Testkonto in `PHASE5-9-PERFORMANCE.md`): 1.000 Fotos ergeben etwa 21 MB Dateispeicher in der Vorschauqualität des Tests. Echte Fotos sind bis 2.048 px groß, etwa 0,3–1 MB je Bild. Backup- und Restore-Dauer wachsen ungefähr linear mit der Datenmenge und der Bandbreite zum Backup-Ziel.

## 6. Beschädigte Backups und Schlüsselprobleme

| Fall | Ergebnis |
| --- | --- |
| Datenblock beschädigt, der **nur ältere** Snapshots betrifft | `restic check` Exit 0, `restore-test.sh` **Exit 0 (unbemerkt)**, `restic check --read-data` Exit 1 → **S-6**: neue Option `restore-test.sh --full-check` (Exit 1 mit klarer Meldung) und Hinweis in der normalen Ausgabe |
| Datenblock des **neuesten** Snapshots beschädigt | `restore-test.sh` Exit 1: „Wiederherstellung fehlgeschlagen oder Inhalte beschädigt“ |
| Alle Datenblöcke beschädigt | `restore-test.sh` Exit 1 |
| **Falscher** Master-Key | `verify-data` Exit 2: 0 Datensätze entschlüsselt, 91 Fehler („Datenschlüssel nicht entschlüsselbar (falscher/fehlender Master-Key?)“) |
| **Fehlende** Schlüsselversion | `status` Exit 2: „FEHLENDE Versionen im Ring: 1“ |
| Schlüsselmaterial in Ausgaben | 0 Treffer; Anmeldenamen in Fehlermeldungen wurden in den Berichten geschwärzt |

## 7. Wiederherstellungszeit (RTO) und Datenverlust (RPO)

- **RTO** (nach Bereitstellung eines gehärteten Servers mit Docker):
  - Ohne Bau der Images etwa 1–2 Minuten für einen kleinen Bestand, davon 44 s Start der leeren Instanz.
  - Mit Bau der Images auf dem VPS (`docker compose up -d --build` laut RUNBOOK) zusätzlich einige Minuten.
  - Dazu kommen Klonen, DNS-Umstellung und Zertifikatsausstellung.
  - Bei großen Fotobeständen bestimmt die Download-Rate vom Backup-Ziel die Dauer.
- **RPO:**
  - Tägliches Backup per Timer. Änderungen seit dem letzten erfolgreichen Backup gehen im Katastrophenfall verloren, also bis zu 24 Stunden.
  - Noch nicht synchronisierte Änderungen bleiben in den Browsern ausstehend und werden nach der Wiederherstellung hochgeladen.
  - Ältere Serverstände können dabei Konflikte erzeugen; diese zeigt die App mit Feldvergleich an.
- **Voraussetzungen:**
  - `master_keys` und `hmac_secret` liegen offline vor. Ohne Master-Key ist der Inhalt **endgültig** verloren.
  - Das restic-Passwort ist vorhanden.
  - Das Repository liegt **außerhalb** des Servers.
