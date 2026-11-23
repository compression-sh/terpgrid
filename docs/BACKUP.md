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

`backup.sh` erledigt: Dump → `restic backup` → `restic forget --prune` (Standard: 7 täglich, 4 wöchentlich, 6 monatlich) → `restic check --read-data-subset=5%` → Statusdatei `deploy/state/backup-status.json` (im Admin-Dashboard sichtbar: letzter Erfolg, Fehler).

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

Ablauf: API/Caddy stoppen → Datenbank neu anlegen → `pg_restore` → Dateien per `rsync --delete` zurückspielen → Start → `verify-data`. Getestet: gelöschter Datensatz nach Restore wieder vorhanden, alle Inhalte entschlüsselbar, Dienste „healthy“.

### Kompletter Serververlust

1. Neuen VPS härten (DEPLOYMENT.md §3), Repository klonen.
2. `deploy/secrets/` aus der Offline-Sicherung zurückkopieren (`master_keys`, `hmac_secret`; DB-Passwörter dürfen neu erzeugt werden – `./install.sh --secrets-only` ergänzt fehlende).
3. `.env` und `backup/backup.env` anlegen, `docker compose up -d --build`.
4. `backup/restore.sh latest`.

## Kontolöschung und Backups

Eine Kontolöschung entfernt Datensätze, Dateien, Sessions und Recovery-Codes sofort aus der laufenden Instanz. **In bestehenden Backups bleiben die (verschlüsselten) Daten bis zum Ablauf der Aufbewahrung erhalten** (Standard: maximal ca. 6 Monate). Wird ein solches Backup wiederhergestellt, erscheint das Konto wieder – Administratoren müssen es dann erneut löschen. Diese Frist wird Nutzern im Datenschutz-Center angezeigt.
