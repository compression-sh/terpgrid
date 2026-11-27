# TERPGRID – Wartung einer kleinen selbst gehosteten Instanz

Stand: 6.0.0.

- Gilt für die Installation unter `/opt/terpgrid/deploy` mit Docker Compose, Caddy, PostgreSQL 16 und restic.
- Alles hier nutzt die vorhandenen Skripte. Es gibt keine zusätzlichen Dienste, kein Kubernetes, kein Redis und kein externes Monitoring.
- **Dieser Leitfaden aktiviert nichts automatisch.** Timer werden nur so eingeschaltet, wie unten beschrieben, und nur vom Betreiber.

## 1. Was ohnehin automatisch läuft

| Was | Wo | Hinweis |
| --- | --- | --- |
| Abgelaufene Sitzungen löschen, Datei-Papierkorb leeren, Sicherheitsprotokoll nach `AUDIT_RETENTION_DAYS` kürzen | in der API, stündlich | Teil der Anwendung; Fehler zeigt Administration → System („Fehler von Hintergrundaufgaben“) |
| TLS-Zertifikat erneuern | Caddy, automatisch (Let's Encrypt) | Port 80/443 müssen erreichbar bleiben; Prüfung in §8 |
| Container-Neustart nach Absturz | `restart: unless-stopped` | – |

Optional per systemd-Timer, vom Betreiber einzuschalten (`docs/BACKUP.md`):

| Timer | Zeitpunkt | Status-Empfehlung |
| --- | --- | --- |
| `terpgrid-backup.timer` | täglich 03:17 | **einschalten** |
| `terpgrid-restore-test.timer` | monatlich am 1., 04:41 | **einschalten** |
| `terpgrid-catalog-refresh.timer` | täglich 05:23 | **aus lassen**, nur nach ausdrücklicher Entscheidung |

Fehlgeschlagene Backup- und Restore-Test-Läufe melden sich über `terpgrid-notify@` mit `NOTIFY_CMD` aus `backup/backup.env`, sofern gesetzt.

## 2. Wöchentlich (5 Minuten)

```bash
cd /opt/terpgrid/deploy
./status.sh                    # Dienste, Speicher, Backup-Alter, Schema, Katalog, Schlüsselring – meldet Probleme mit ✗
journalctl -u terpgrid-backup.service --since -8d | tail -20
```

Zusätzlich im Browser: Administration → System (Fehlerrate, p95, Datenbank, Speicher) und Administration → Übersicht (Sicherheitsereignisse der letzten 7 Tage, z. B. gehäufte gesperrte Anmeldungen).

## 3. Monatlich

| Aufgabe | Befehl |
| --- | --- |
| Restore-Test (falls der Timer nicht läuft) | `backup/restore-test.sh latest` |
| Vollständige Entschlüsselungsprüfung | `./status.sh --verify` |
| Sicherheitsupdates des Hosts | `sudo apt update && sudo apt upgrade` (danach ggf. Neustart; die Container starten selbst) |
| Docker-Speicher prüfen | `docker system df` |
| Alte, nicht mehr benötigte TERPGRID-Images entfernen | nur Images ältere als die vorherige Version: `docker image ls terpgrid-api`, dann gezielt `docker image rm terpgrid-api:<alt> terpgrid-web:<alt>`. Die **vorherige** Version für Rollbacks behalten. |

## 4. Vierteljährlich

| Aufgabe | Befehl / Vorgehen |
| --- | --- |
| Restore-Test mit **allen** Daten des Repositorys | `backup/restore-test.sh --full-check latest` (prüft auch ältere Snapshots) |
| Lesbarkeit der Offline-Sicherung von `master_keys` und `hmac_secret` | Vergleich mit dem Server ohne Ausgabe des Inhalts: `sha256sum secrets/master_keys secrets/hmac_secret` gegen die Prüfsumme der Offline-Kopie |
| Wiederherstellungsübung in einer Testumgebung | `docs/RUNBOOK.md` §3 auf einer Wegwerf-VM; Dauer notieren |
| Abhängigkeiten prüfen | siehe §5 |

## 5. Sicherheits- und Abhängigkeitsupdates

TERPGRID pinnt alle Versionen:
- npm-Lockfiles;
- Basis-Images `node:22.21-alpine3.22`, `caddy:2.10.2-alpine`, `postgres:16.10-alpine3.22`;
- GitHub Actions per SHA.

Updates kommen daher **nur über neue TERPGRID-Versionen** und nie unbemerkt.

**Prüfen, ob etwas ansteht** (in einem Checkout des Repositorys, nicht auf dem Server nötig):

```bash
npm audit --omit=dev && (cd server && npm audit --omit=dev)    # Laufzeitabhängigkeiten
npm outdated; (cd server && npm outdated)                        # nur zur Information
```

**Vorgehen bei einer Sicherheitslücke:**
1. Schwere bewerten. Ist der Laufzeitpfad betroffen? Läuft das Paket nur beim Bauen oder in Tests?
2. Patch-Version im Repository anheben (Lockfile), danach Tests, Build und CI.
3. Neue TERPGRID-Version per Pull Request; Einspielen mit `./upgrade.sh` (siehe `UPGRADE-6.0.md`).

**Basis-Images** (z. B. neues `node:22.x-alpine` mit Sicherheitsfixes):
- Tag in `server/Dockerfile` und `deploy/Dockerfile.web` anheben, CI prüfen, als neue Version ausrollen.
- **PostgreSQL:** Patch-Versionen (16.x) sind unkritisch.
- **Ein Wechsel der Hauptversion** (16 → 17) braucht einen Dump und ein Restore in ein neues Volume. Das ist nicht skriptgestützt und muss vorher in einer Testumgebung geübt werden.

## 6. PostgreSQL

- Autovacuum ist aktiv (Standard). Bei kleinen Instanzen ist keine manuelle Wartung nötig.
- **Größe beobachten:** `./status.sh` zeigt die Datenbankgröße. Katalog und Laborproben belegen etwa 80–90 MB; private Inhalte kommen dazu.
- **Integrität:** Daten-Checksummen sind beim Anlegen aktiviert (`--data-checksums`). Die vollständige Entschlüsselungsprüfung (`status.sh --verify`) liest alle privaten Datensätze.
- **Nicht tun:** Rechte, RLS-Richtlinien oder Rollen von Hand ändern. Migrationen laufen nur über den `migrate`-Job.

## 7. Speicherplatz

| Verbraucher | Prüfen | Maßnahme |
| --- | --- | --- |
| Fotos (Volume `terpgrid_api-files`) | `./status.sh` | Kontingent je Konto über `USER_QUOTA_MB` (Standard 2048) |
| Datenbank | `./status.sh` | – |
| Docker-Images und Build-Cache | `docker system df` | alte Versionen entfernen (§3), `docker builder prune` nach Upgrades |
| Logs | begrenzt auf 5 × 10 MB je Container | – |
| restic-Repository (extern) | `restic stats` mit den Zugangsdaten aus `backup/backup.env` | Aufbewahrung über `KEEP_DAILY`/`KEEP_WEEKLY`/`KEEP_MONTHLY` |

`preflight.sh` verlangt vor jedem Upgrade mindestens 5 GB frei.

## 8. Zertifikate

- Caddy erneuert automatisch.
- **Prüfung:** `echo | openssl s_client -connect <DOMAIN>:443 -servername <DOMAIN> 2>/dev/null | openssl x509 -noout -enddate`.
- Fehlt die Erneuerung: `docker compose logs caddy | tail -50`. Häufige Ursachen sind ein blockierter Port 80 (Firewall, CrowdSec-Sperre der Let's-Encrypt-Prüfer) oder ein geänderter DNS-Eintrag.

## 9. Schlüsselverwaltung

| Schlüssel | Regel |
| --- | --- |
| `secrets/master_keys` | **nie** ins Backup-Repository. Offline an zwei getrennten Orten. Verlust bedeutet: alle Inhalte endgültig verloren |
| `secrets/hmac_secret` | ebenfalls offline sichern. Verlust macht Wiederherstellungscodes und Einladungen ungültig |
| restic-Passwort | getrennt vom Repository aufbewahren |
| Rotation | **nur manuell und nur bei Anlass** (Verdacht auf Kompromittierung, Personalwechsel mit Zugriff): `DEPLOYMENT.md` → Schlüsselrotation. TERPGRID rotiert nie automatisch |

## 10. Katalog und Laborproben

- **Katalog:**
  - Feste Version (CI-Strains-Pro, Commit und Prüfsumme in `deploy/import-catalog.sh`).
  - Ein Update ist eine bewusste Code-Änderung: neue Prüfsumme, `import-catalog.sh --dry-run`, dann Import.
  - Private Daten bleiben unberührt.
- **Laborproben:** Smith et al. 2022, CC0, fest; Import über `deploy/import-samples.sh`.
- **Anreicherung (StrainAPI):**
  - Angaben haben ein Ablaufdatum. Ohne den Aktualisierungstimer werden sie danach in der Bibliothek nicht mehr angezeigt (Administration → Katalog zeigt den Stand).
  - Das ist gewollt, solange keine Entscheidung für den Timer fällt.
  - Eine manuelle, gedrosselte Aktualisierung ist möglich: `docker compose exec api node dist/cli.js enrich-catalog --provider strainapi --refresh`. Siehe `docs/CATALOG.md`; vorher die Nutzungsbedingungen prüfen.
- **Neue Quellen:** nur mit geklärter Lizenz für die Weitergabe an selbst gehostete Instanzen (Quellenregister in der Administration). Keine Sortenfotos ohne belegte Rechte.

## 11. Vorfälle

`docs/RUNBOOK.md`:

| Fall | Abschnitt |
| --- | --- |
| Erstdiagnose mit `status.sh` | §0 |
| API startet nicht | §1 |
| Totalverlust | §3 |
| Rollback | §4 |
| Schlüsselverlust | §5 |
| Sicherheitsvorfall | §7 |

Grundsätze:
- Erst Beweise sichern: `docker compose logs > /root/vorfall-$(date +%F).log`. Dann handeln.
- Bei Verdacht auf kompromittierte Sitzungen: Administration → Konten sperren. Betroffene Personen beenden in Konto → Sitzungen alle Sitzungen.
- Bei Verdacht auf einen kompromittierten Master-Key: Rotation nach `DEPLOYMENT.md` und Information der Nutzenden. TERPGRID ist **nicht** Ende-zu-Ende-verschlüsselt.

## 12. Upgrades

- Immer nach dem versionsspezifischen Leitfaden (`docs/UPGRADE-6.0.md`).
- Kurzform: `./preflight.sh` → `backup/restore-test.sh latest` → `./upgrade.sh <tag>` → `./status.sh --verify` → `backup/backup.sh`.
- Die vorherige Version bleibt als Image erhalten; `./rollback.sh` prüft das Schema, bevor es umschaltet.
