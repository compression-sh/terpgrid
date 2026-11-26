# Phase 5.7 – Notfallwiederherstellung (getestet)

Stand: 5.7.0-rc.1. Alle Tests liefen **isoliert** in eigenen Docker-Compose-Projekten mit eigenen Ports und Test-Secrets. Das Produktivsystem wurde nicht berührt.

## 1. Testaufbau

- **Ausgangsinstallation:** 5.6.0-rc.1 (Stand `main` @ `8658cda`).
- **Testdaten:**
  - drei Konten, 110 private Datensätze, 12 Dateien (6 Fotos mit Vorschaubild);
  - Passwörter, Recovery-Codes, Kontoschlüssel;
  - ein gemeinsamer Bereich mit 76 Einträgen, 8 Dateien, Kommentaren und einem Mitglied mit Rolle „Kommentieren“;
  - eine Freundschaft.
- **Prüfsummen** (MD5 über die Rohwerte in der Datenbank):
  - privat: Version, Sequenz, Chiffrat, MAC und Generation je Datensatz bzw. Datei;
  - Zusammenarbeit: Bereiche, Mitgliedschaften, Einträge, Kommentare;
  - Authentifizierung: Kennungen, Passwort-Hashes, verschlüsselte 2FA-Geheimnisse, verpackte Konto- und Bereichsschlüssel, Recovery-Code-Hashes.
- **Lesbarkeit:** `verify-data` entschlüsselt alles. Fremdzugriff und Rollen werden über die echte API geprüft.

## 2. Ergebnisse

| # | Szenario | Ergebnis |
| --- | --- | --- |
| 1 | Upgrade 5.6 → 5.7 mit `upgrade.sh` (Backup vorher automatisch) | ✓; Migration 009 angewendet; private Daten, Zusammenarbeit und Konten/Schlüssel/Codes **bytegleich**; 110 Datensätze, 12 Dateien und der Bereich fehlerfrei entschlüsselt; fremde Daten nicht sichtbar; Fotos bytegleich 6/6; Schreiben als „Kommentieren“ → 403 |
| 2 | Backup und `restore-test.sh` | ✓ (neu: `restic check` + `restore --verify`, danach vollständige Entschlüsselung) |
| 3 | **Beschädigtes Backup** (Bytes in allen Datenpaketen einer Kopie verändert) | ✓ erkannt: `restore-test.sh` bricht mit „restic check fehlgeschlagen – Repository beschädigt oder unvollständig“ ab (Exit 1); `restic check --read-data` meldet ebenfalls einen Fehler |
| 4 | **Falsches Backup-Passwort** | ✓ erkannt: „wrong password or no key found“ (Exit 1) |
| 5 | **Falscher bzw. fehlender Master-Key** | ✓ erkannt: `verify-data` meldet jeden betroffenen Datensatz („beschädigt oder Schlüssel fehlt“), Exit ≠ 0; mit richtigem Master-Key wieder Exit 0 |
| 6 | **Rollback über eine Migration** (5.7 → 5.6) | `rollback.sh` verweigert korrekt (DB neuer als Programm). **Befund F-06:** Der bisher ausgegebene Weg „erst Restore, dann rollback.sh“ scheiterte, weil `restore.sh` die aktuelle Version startete, die 009 sofort wieder anwandte. **Behoben:** `restore.sh --version 5.6.0-rc.1 <snapshot>` → Version 5.6, 8 Migrationen, Daten wie vor dem Upgrade, Mitgliederrechte intakt; danach erneutes Upgrade auf 5.7 ✓ |
| 7 | **Totalverlust** (alle Container und Volumes gelöscht) → frische Installation aus Git, neue DB-Passwörter, Master-Key und HMAC-Secret aus der sicheren Ablage, `restore.sh latest` | ✓ in **81 s** (lokale Maschine, kleiner Datenbestand); private Daten, Zusammenarbeit und Konten/Schlüssel/Codes **identisch**; Fotos bytegleich; Rechte intakt |
| – | Hintergrund-Timer/Jobs während der Tests | 0 aktiv; Katalog-Aktualisierung bleibt deaktiviert |
| – | Aufräumen | 0 Container, 0 Volumes übrig |

Skript: `dr-57.sh` im Arbeitsverzeichnis der Sitzung (nicht Teil des Repos, da es Test-Secrets erzeugt). Die Schritte entsprechen `RUNBOOK.md`.

## 3. Was im Backup enthalten ist – und was nicht

| Enthalten (restic-verschlüsselt) | Nicht enthalten (separat sichern!) |
| --- | --- |
| PostgreSQL-Dump: Konten, Passwort-Hashes, verschlüsselte Datensätze, verpackte Konto-, Bereichs- und Profilschlüssel, Mitgliedschaften, Kommentare, Benachrichtigungen, Sicherheitsprotokoll, Katalog und Laborproben | **Master-Key** (`secrets/master_keys`) – ohne ihn ist das Backup nicht entschlüsselbar |
| Dateispeicher (verschlüsselte Fotos und Dokumente) | **HMAC-Secret** – ohne es funktionieren Recovery-Codes und Einladungen nicht; die Kontoschlüssel der Browser-Datenbanken ändern sich |
| | **restic-Passwort** |
| | `.env` (Domain, Ports, Version) – lässt sich aus `.env.example` neu erstellen |

## 4. Wiederherstellungszeit (RTO) und Datenverlust (RPO)

- **RPO:** Abstand der Backups. Standard ist der Timer `terpgrid-backup.timer` (täglich). Änderungen seit dem letzten Snapshot gehen verloren. Ausnahme: Geräte mit Offline-Freigabe oder ausstehenden Änderungen übertragen ihre lokalen Änderungen nach der Wiederherstellung erneut. Bei Versionskonflikten erscheinen Konflikte zur Entscheidung, nie stilles Überschreiben.
- **RTO (gemessen, kleiner Bestand):**
  - etwa 80 s für den Totalverlust ohne Image-Bau;
  - mit Image-Bau zusätzlich einige Minuten.
  - Bei großen Fotobeständen bestimmen Download aus dem Offsite-Repository und `rsync` die Dauer; grob linear zur Datenmenge (nicht gemessen).
- **Nach einem Rollback per Restore** fehlen alle Änderungen nach dem Snapshot vor dem Upgrade.

## 5. Abläufe (Kurzfassung)

1. **Regelmäßig:** `backup/restore-test.sh latest` (monatlich; Timer vorhanden, Aktivierung durch den Betreiber).
2. **Datenverlust:** zuerst `restore-test.sh <snapshot>`, dann `restore.sh <snapshot>`.
3. **Rollback über Migrationen:** `restore.sh --version <alte-version> <snapshot-vor-dem-upgrade>`.
4. **Totalverlust:**
   1. Server neu aufsetzen (Härtung siehe `PHASE5-7-VPS-HARDENING.md`).
   2. Repository klonen, `install.sh --secrets-only`.
   3. **Master-Key und HMAC-Secret aus der Offline-Sicherung** zurückkopieren.
   4. `backup.env` mit Repository und Passwort anlegen.
   5. `docker compose up -d`, dann `restore.sh latest`.
5. **Unterbrochenes Upgrade:**
   - `upgrade.sh` erstellt vorher immer ein Backup.
   - Startet die neue Version nicht gesund: `rollback.sh <alt>` (ohne Migration) bzw. `restore.sh --version <alt> <snapshot>` (mit Migration).

## 6. Grenzen

- Kontolöschung: Gelöschte Konten bleiben bis zum Ablauf der Backup-Aufbewahrung in alten Snapshots enthalten (verschlüsselt). Eine Wiederherstellung eines älteren Snapshots stellt sie wieder her. Das ist in der Oberfläche beschrieben.
- Wiederherstellungen ersetzen die gesamte Datenbank; es gibt keine Wiederherstellung einzelner Konten.
- Getestet nur auf einer lokalen Maschine mit kleinem Datenbestand. Offsite-Repositories (S3, SFTP) und große Datenmengen wurden in dieser Phase nicht gemessen.
