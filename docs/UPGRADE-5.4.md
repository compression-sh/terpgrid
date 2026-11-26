# Upgrade auf 5.4.0-rc.1 (Data Intelligence)

Stand: 26.11.2026 · gilt für Instanzen ab 5.3.x · `main` = `dd3a73c` (Merge von PR #12)

Dieses Dokument beschreibt das **manuelle** Produktions-Upgrade. Es werden keine Jobs oder Timer aktiviert; der Katalog-Refresh-Timer bleibt aus.

## 1. Was sich ändert

| Bereich | Änderung | Betrifft Nutzerdaten? |
| --- | --- | --- |
| Migration `007_catalog_samples.sql` | Neue Funktion `catalog_name_key`, Index auf `catalog_cultivars`, neue Tabellen `catalog_sample_imports`, `catalog_samples`, `catalog_sample_stats`; App-Rolle erhält nur `SELECT` | Nein – nur öffentliche Katalogtabellen |
| Parser v4 (`import-catalog.sh`) | Repariert doppelt kodierte Namen; derselbe CISP-Commit wird wegen neuer Parser-Version automatisch neu importiert (kein `--force` nötig) | Nein |
| `import-samples.sh` (optional) | 89.923 öffentliche Laborproben (Smith et al. 2022, CC0), fester Commit und SHA-256, idempotent | Nein |

Die Migration ist additiv: Sie ändert und löscht keine bestehenden Tabellen. Auch ohne Probenimport läuft 5.4 normal; die Probenkarte erscheint dann einfach nicht.

## 2. Produktions-Upgrade – Befehle in dieser Reihenfolge

Auf dem VPS als root im Installationsverzeichnis (Standard `/opt/terpgrid`):

```bash
cd /opt/terpgrid/deploy

# 0. Vorbereitung: Zustand und Platz prüfen (nichts wird verändert)
./preflight.sh
df -h /var/lib/docker /opt/terpgrid        # mindestens 1 GB frei (siehe Abschnitt 3)
docker compose exec -T api node dist/cli.js schema-status   # erwartet: 006 aktuell

# 1. Upgrade: Preflight → restic-Backup → git pull --ff-only → Images 5.4.0-rc.1 bauen
#    → Migration 007 im migrate-Job → Start → Health-Prüfung
./upgrade.sh

# 2. Katalog mit Parser v4 neu einlesen (erst prüfen, dann importieren)
./import-catalog.sh --dry-run
./import-catalog.sh

# 3. Optional: öffentliche Laborproben (erst prüfen, dann importieren)
./import-samples.sh --dry-run
./import-samples.sh

# 4. Kontrolle
docker compose exec -T api node dist/cli.js schema-status   # erwartet: 007, Exit 0
docker compose exec -T api node dist/cli.js catalog-audit | tail -25
docker compose exec -T api node dist/cli.js catalog-validate | head -30

# 5. Frisches Backup inkl. Katalog/Proben und isolierter Restore-Test (berührt Produktion nicht)
backup/backup.sh
backup/restore-test.sh latest
```

Erwartete Ausgaben:

* `upgrade.sh`: „Upgrade auf 5.4.0-rc.1 erfolgreich“ und Schemastand 007.
* `import-catalog.sh`: 16.710 Sorten, 21.210 Angebote, 494 Breeder, 0 entfernt.
* `import-samples.sh`: 89.923 übernommen, 0 abgelehnt, 3.087 Produktnamen. Ein zweiter Aufruf meldet „bereits aktiv – nichts zu tun“.
* `restore-test.sh`: Konten- und Datensatzzahl wie in Produktion, „Laborproben: 89923 · Produktnamen: 3087“, „Restore-Test erfolgreich“.

**Nicht ausführen:** `systemctl enable … terpgrid-catalog-refresh.timer`. Der Refresh bleibt bis zu einer ausdrücklichen Freigabe aus. Bestehende Backup- und Restore-Test-Timer bleiben unverändert.

## 3. Ressourcenbedarf (gemessen)

Gemessen am 26.11.2026 auf 4 vCPU / 16 GB mit PostgreSQL 16 und dem Stand `dd3a73c`.

### Probenimport (89.923 Proben)

| Größe | Wert |
| --- | --- |
| Download (`deploy/catalog/smith2022-e71c838e6bac.csv`) | 19,7 MB (Abbruch über 50 MB) |
| Dauer Import (Einlesen, Prüfen, Schreiben, Statistik) | **6,9 s** (Prozess gesamt 7,9 s) |
| Zweiter Aufruf (gleiche Prüfsumme) | 1,0 s, keine Änderung |
| Arbeitsspeicher Importprozess (Spitze, RSS) | **391 MB** im migrate-Container (ohne eigenes Limit) |
| Belegung in PostgreSQL nach Import | `catalog_samples` 71 MB + `catalog_sample_stats` 5,5 MB ≈ **77 MB** |
| Kurzzeitig während eines erneuten Imports (`--force`) | bis ca. 2× (alte Zeilen bis zum Autovacuum) plus WAL → bis ca. **250 MB** zusätzlich |
| Zuwachs je Datenbank-Dump (pg_dump -Fc) | ca. **+3,9 MB** (8,1 MB statt 4,2 MB in der Testdatenbank) |

### Katalogimport (Parser v4, zum Vergleich)

| Größe | Wert |
| --- | --- |
| Download | 13,8 MB |
| Dauer | 4,6 s (Prozess 6,6 s) |
| Arbeitsspeicher (Spitze) | 479 MB |
| Belegung | Sorten 48 MB, Angebote 26 MB, Breeder 0,8 MB |

### Planung für den VPS

* **Auf 2 vCPU** etwa 2–3× langsamer rechnen: Probenimport unter 30 s, Katalogimport unter 20 s, jeweils zuzüglich Download.
* **Freier Speicherplatz:** mindestens 1 GB vor dem Upgrade.
  * Neue Images der Version 5.4.0-rc.1 (Größe hier nicht gemessen; das alte Image bleibt für das Rollback erhalten). `docker image ls terpgrid-*` zeigt die bisherige Größe als Richtwert.
  * CSV-Dateien: ca. 35 MB.
  * Datenbank inkl. kurzzeitigem WAL- und Vacuum-Bedarf: ca. 250 MB.
  * Backup-Stage: wenige MB.
* **Arbeitsspeicher:** Die Importe laufen nacheinander im migrate-Container. Mit 2 GB RAM bleibt neben API (Limit 768 MB), PostgreSQL (Limit 512 MB) und Caddy genug Reserve.
  * Importe nicht parallel starten.
  * Bei 1 GB RAM die Importe außerhalb der Nutzungszeiten ausführen.
* **Backup-Ziel:** durch Proben und Katalog wenige MB je Snapshot; restic dedupliziert unveränderte Tage.

## 4. Backup und Rollback

* **Vor dem Upgrade:** `upgrade.sh` erzwingt ein restic-Backup und bricht ohne Änderung ab, wenn es fehlschlägt.
  * Ohne konfiguriertes Backup verlangt das Skript die Eingabe „JA“.
* **Alte Version bleibt erhalten:** Die Images der Vorversion bleiben lokal liegen; `state/previous-version` merkt sich den Tag.
* **Rollback nach angewendeter Migration 007:** `rollback.sh` prüft mit dem Programm der Zielversion den Schemastand.
  * Version 5.3.x kennt 007 nicht (Exit 3), deshalb verweigert das Skript den Rollback.
  * Es verlangt zuerst die Wiederherstellung des Snapshots von vor dem Upgrade:

  ```bash
  restic snapshots --tag terpgrid            # Snapshot unmittelbar vor dem Upgrade wählen
  backup/restore.sh <snapshot-id>
  ./rollback.sh 5.3.2-rc.1                   # bzw. Inhalt von state/previous-version
  ```

  * **Achtung:** Der Restore setzt auch Nutzerdaten auf den Stand vor dem Upgrade zurück. Änderungen, die danach gemacht wurden, gehen verloren.
  * Deshalb das Upgrade außerhalb der Nutzungszeiten ausführen und vor dem Rollback prüfen, ob ein Rollback wirklich nötig ist.
  * Probleme nur im Katalog oder bei den Proben lassen sich ohne Rollback beheben, siehe unten.
* **Katalog- oder Probenimport fehlerhaft:** Beide Importe laufen jeweils in einer einzigen Transaktion.
  * Bei einem Fehler bleibt der vorherige Stand aktiv; der Lauf wird als `failed` protokolliert.
  * Ein Rollback der Anwendung ist dafür nicht nötig.
* **Geprüft (Phase 5.4, isolierte Docker-Umgebung):**
  * Upgrade 5.3.2 → 5.4.0-rc.1 erfolgreich.
  * Nutzerdaten 110/110 und Fotos 6/6 bytegleich.
  * Restic-Restore stellt 89.923 Proben wieder her.
  * `rollback.sh` verweigert korrekt ohne vorherigen Restore.
* **Neu in `restore-test.sh`:** Der Restore-Test gibt zusätzlich die Zahl der Laborproben aus.

## 5. Trennung: Laborproben vs. Breeder-Angaben

* **Eigene Tabellen:** Proben liegen ausschließlich in `catalog_samples`/`catalog_sample_stats`.
  * Der Import schreibt nie in `catalog_cultivars`, `catalog_listings` oder `catalog_claims`.
  * Es gibt keinen Fremdschlüssel zu Sorten.
* **Zuordnung nur beim Lesen:** über `catalog_name_key(name_slug, version)`, nur für Sorten ohne Autoflower-Kennzeichen.
  * Ein Katalog-Neuimport lässt die Proben daher unberührt und umgekehrt.
* **Getrennt in der API:** Die Sortenseite liefert Proben im eigenen Feld `samples`.
  * THC/CBD der Breeder- und Seedbank-Angaben bleiben in ihren bisherigen Feldern.
  * Der Vergleich zeigt eigene Zeilen „Laborproben“.
* **Gekennzeichnet in der Oberfläche:**
  * „Wissenschaftliche Quelle“ und „Nicht eindeutig zugeordnet“.
  * Hinweis „beschreibt gleichnamige Handelsware – nicht diese Breeder-Linie“.
  * Zahl der Breeder mit gleichnamiger Sorte.
* **Unverändert:**
  * Breederbezogene Terpenmengen: weiterhin 0.
  * Kein Profil wird aus Proben erzeugt.
  * Kein Aroma-zu-Chemie-Schluss.
* **Datenqualität:** Die Regeln `samples-version` und `samples-ambiguous-name` machen unsichere Zuordnungen im Admin-Bereich sichtbar.

## 6. Private Daten bei Katalog-Neuimporten

* **Getrennte Rollen:**
  * Katalog- und Probenimporte laufen mit der Owner-Rolle im migrate-Container.
  * Sie löschen bzw. ersetzen ausschließlich `catalog_*`-Zeilen der jeweiligen Quelle.
  * Die laufende API (`terpgrid_app`) hat auf die Probentabellen nur `SELECT`.
* **Prüfung am 26.11.2026 auf der Entwicklungsdatenbank:**
  * Ablauf: Prüfsumme gebildet → Probenimport (`--force`) → Katalogimport (`--force`) → erneut Prüfsumme gebildet.
  * Erfasst: alle `records` (Nutzer, Bereich, ID, Version, Sequenz, Chiffrat, Zeitstempel) und alle `files`-Zeilen.
  * Ergebnis vorher und nachher identisch: 313 Datensätze, 40 Dateien, 19 Konten, md5 `c01db8e9…`/`b14df3e6…`.
* **Abhängigkeiten:** Private Datensätze verweisen höchstens über eine Sorten-ID im verschlüsselten Inhalt auf den Katalog. Es gibt keinen Fremdschlüssel, also auch kein kaskadierendes Löschen.
* **Eigene Laborberichte** der Nutzer werden nur im Browser neben die öffentlichen Proben gestellt und nie an den Server übertragen oder mit ihnen vermischt.

## 7. Entwicklungs-Branches

Am 26.11.2026 nach `git fetch --prune` geprüft. **Nichts wurde gelöscht.** Alle Branches sind vollständig in `main` enthalten und können nach Ermessen manuell entfernt werden:

| Branch | Befund |
| --- | --- |
| `claude/phase-4` | 1 Commit nicht Vorfahre, aber als identischer Patch in `main` (README 4.0.0-rc.1) |
| `claude/phase-5`, `claude/phase-5-1`, `claude/phase-5-3`, `claude/phase-5-3-studio` | Vorfahren von `main` |
| `claude/phase-5-3-review` | Enthält nur den Merge von PR #11; Dateistand identisch mit `b14851e`, das in `main` ist |
| `claude/phase-5-4-data` | Vorfahre von `main` (PR #12) |
| `claude/loving-gates-iyhnqa` | Arbeits-Branch dieser Sitzung; nach Merge bzw. Verwerfen dieses Dokuments entfernbar |

Entfernen (manuell, nach eigener Prüfung): `git push origin --delete claude/phase-4 claude/phase-5 …` oder über die GitHub-Oberfläche.
