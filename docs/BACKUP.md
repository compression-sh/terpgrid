# TERPGRID – Backup & Wiederherstellung

## Was wird gesichert?

| Inhalt | Gesichert | Bemerkung |
| --- | --- | --- |
| PostgreSQL (`pg_dump -Fc`) | ✅ | Konten, Sessions, Datensätze. Inhalte bereits mit Model A (AES-256-GCM) verschlüsselt |
| Dateispeicher (Volume `terpgrid_api-files`) | ✅ | Fotos/Dokumente, ebenfalls verschlüsselt |
| `deploy/secrets/` (Master-Key, HMAC-Secret, DB-Passwörter) | ❌ **bewusst nicht** | Separat offline sichern (siehe unten) |
| Caddy-Zertifikate | ❌ | werden automatisch neu ausgestellt |

restic verschlüsselt das Repository zusätzlich (AES-256-CTR + Poly1305-AES), dedupliziert und prüft Integrität. Ein gestohlenes Backup ist damit doppelt geschützt: Man bräuchte **das restic-Passwort und den Master-Key**.

Geprüft (Test-Installation, siehe FINAL-REPORT): Das Repository enthält weder Secrets noch Klartext-Inhalte.

## Einrichtung

```bash
cd /opt/terpgrid/deploy
cp backup/backup.env.example backup/backup.env && chmod 600 backup/backup.env
# RESTIC_REPOSITORY auf ein Ziel AUSSERHALB des VPS setzen (sftp:, s3:, rest:, b2: …)
openssl rand -base64 32 > /root/.terpgrid-restic-password && chmod 600 /root/.terpgrid-restic-password
sudo backup/backup.sh                                    # erstes Backup (legt das Repository an)
sudo cp systemd/terpgrid-backup.* systemd/terpgrid-restore-test.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now terpgrid-backup.timer terpgrid-restore-test.timer
```

`backup.sh` erledigt: Dump → `restic backup` → `restic forget --prune` (Standard: 7 täglich, 4 wöchentlich, 6 monatlich) → `restic check --read-data-subset=5%` → Statusdatei `deploy/state/backup-status.json` (im Admin-Dashboard sichtbar: letzter Erfolg, Fehler, Dump-Größe, Dauer).

### Konsistenz von Datenbank und Dateien

Der Dump ist ein konsistenter Snapshot der Datenbank. Danach werden die Dateien gesichert. Damit jede im Dump referenzierte Datei auch im Datei-Snapshot liegt, werden ersetzte oder gelöschte Blobs **nicht sofort gelöscht**, sondern landen im Papierkorb (`file_trash`) und werden erst nach `FILE_TRASH_DAYS` (Standard 7) entfernt. Neue Uploads zwischen Dump und Datei-Sicherung sind harmlos (Dateien ohne DB-Zeile). Der Restore-Test prüft, dass jede referenzierte Datei vorhanden und entschlüsselbar ist.

### Benachrichtigung bei Fehlschlag

In `backup/backup.env` (wird als Shell-Datei eingelesen – Werte mit Leerzeichen in Anführungszeichen, Datei nur für root beschreibbar):

```bash
NOTIFY_CMD='curl -fsS -d @- https://ntfy.sh/mein-geheimer-kanal'   # oder: 'mail -s "TERPGRID Backup" admin@example.org'
NOTIFY_ON_SUCCESS=false
```

Der Befehl erhält nur eine kurze Meldung (Host, Fehlerursache) – nie Secrets. Zusätzlich startet `terpgrid-backup.service` bei einem Absturz `terpgrid-notify@.service` (`OnFailure=`). Getestet: unerreichbares Backup-Ziel → Exit 1, Status „ok: false“ mit Ursache, Benachrichtigung „FEHLGESCHLAGEN – restic-Repository nicht erreichbar“; das Admin-Dashboard markiert Backups, die älter als 36 Stunden sind.

## Offline-Sicherung der Schlüssel (Pflicht)

Bewahre **getrennt vom Backup-Ziel** auf (Passwort-Manager, verschlüsselter USB-Stick, Papier im Tresor):

1. `deploy/secrets/master_keys` – **ohne ihn sind Datenbank und Backups unlesbar**
2. `deploy/secrets/hmac_secret` – sonst funktionieren Recovery-Codes nach einem Restore nicht
3. das restic-Passwort

### Was passiert bei Schlüsselverlust?

| Verloren | Folge |
| --- | --- |
| Master-Key | **Alle Inhalte aller Konten sind endgültig verloren** – auch aus jedem Backup. Es gibt keinen Generalschlüssel. |
| restic-Passwort | Backups sind unbrauchbar; laufende Instanz ist nicht betroffen → sofort neues Repository anlegen |
| HMAC-Secret | Daten bleiben lesbar; Recovery-Codes/Einladungen ungültig, Nutzer müssen neue Codes erzeugen |

Der Restore-Test meldet einen falschen Master-Key ausdrücklich („Datenschlüssel nicht entschlüsselbar“, Exit-Code 2) – getestet.

## Restore-Test (isoliert, monatlich)

```bash
sudo backup/restore-test.sh [snapshot|latest]
```

Stellt den Snapshot in Wegwerf-Containern in einem internen Docker-Netz **ohne Internet und ohne Verbindung zur Produktion** wieder her, spielt den Dump ein, zählt Konten/Datensätze/Dateien und entschlüsselt mit `verify-data` **jeden Datensatz und jede Datei**. Die Produktion wird nicht verändert.

Beispielausgabe (Test-Installation):

```
Konten: 1 · Datensätze: 2 · Dateien (DB): 1 · Migrationen: 001_init.sql
Konten: 1 · Datensätze entschlüsselt: 2 · Dateien entschlüsselt: 1 · Fehler: 0
✓ Restore-Test erfolgreich: Snapshot ist vollständig und mit dem Master-Key lesbar.
```

## Wiederherstellung (Produktion)

```bash
sudo backup/restore.sh [snapshot-id|latest]     # fragt nach „JA“
```

Ablauf: API/Caddy stoppen → Datenbank neu anlegen → `pg_restore` → Dateien per `rsync --delete` zurückspielen → Start → `verify-data`. Getestet: gelöschter Datensatz nach Restore wieder vorhanden, alle Inhalte entschlüsselbar, Dienste „healthy“. Weitere Abläufe (Serververlust, Schlüsselverlust, Rollback): [RUNBOOK.md](RUNBOOK.md).

### Kompletter Serververlust

1. Neuen VPS härten (DEPLOYMENT.md §3), Repository klonen.
2. `deploy/secrets/` aus der Offline-Sicherung zurückkopieren (`master_keys`, `hmac_secret`; DB-Passwörter dürfen neu erzeugt werden – `./install.sh --secrets-only` ergänzt fehlende).
3. `.env` und `backup/backup.env` anlegen, `docker compose up -d --build`.
4. `backup/restore.sh latest`.

## Schlüsselgenerationen und Backups

Backups enthalten die Tabelle `user_keys` mit allen nicht gelöschten Schlüsselgenerationen (mit dem Master-Key verpackt). Ein Restore eines Snapshots von **vor** einer Rotation funktioniert, solange der Master-Key dieser Zeit vorhanden ist. `purge-retired-keys` löscht alte Generationen standardmäßig erst nach 200 Tagen – länger als die Backup-Aufbewahrung (6 Monate). Nach einer **Master-Key-Rotation** brauchen ältere Backups die alte Master-Key-Version: Erst entfernen, wenn alle Backups mit dieser Version abgelaufen sind.

## Kontolöschung und Backups

Eine Kontolöschung entfernt Datensätze, Sessions, Recovery-Codes, Passkeys und **alle Datenschlüssel** des Kontos sofort aus der laufenden Instanz. Die verschlüsselten Datei-Blobs liegen bis zu `FILE_TRASH_DAYS` im Papierkorb, sind ohne die gelöschten Schlüssel aber nicht mehr entschlüsselbar (Krypto-Shredding). **In bestehenden Backups bleiben die (verschlüsselten) Daten bis zum Ablauf der Aufbewahrung erhalten** (Standard: maximal ca. 6 Monate). Wird ein solches Backup wiederhergestellt, erscheint das Konto wieder – Administratoren müssen es dann erneut löschen. Diese Frist wird Nutzern im Datenschutz-Center angezeigt.
