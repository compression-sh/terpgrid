# Upgrade auf 5.9.0-rc.1 (Produktionsreife) – manueller Leitfaden für `/opt/terpgrid/deploy`

Stand: 5.9.0-rc.1.

- Dieser Leitfaden wurde **nicht** gegen die Produktion ausgeführt.
- Alle Befehle stammen aus den Skripten dieses Repositorys.
- Getestet wurde jeder Schritt in isolierten Docker-Installationen (Nachweise: `PHASE5-9-DISASTER-RECOVERY.md`).

## 1. Was sich ändert

| Bereich | Änderung | Auswirkung auf den Betrieb |
| --- | --- | --- |
| Datenbank | **keine Migration** (Stand bleibt `009_session_security.sql`) | Rollback auf 5.7/5.8 ohne Restore möglich |
| Neu: `deploy/status.sh` und `node dist/cli.js status [--verify]` | lesende Betriebsdiagnose | ändert nichts, gibt keine Konten- oder Schlüsseldaten aus |
| Server | Versionsanzeige ohne `APP_VERSION` aus `package.json` | rein kosmetisch (Compose setzt `APP_VERSION` ohnehin) |
| Client | Abmelden löscht die Arbeitskopie zuverlässig (auch Safari), CSV-Exporte gegen Formel-Injektion geschützt, Auswahlfelder in Safari, Layout- und Textkorrekturen | keine |
| Hintergrundjobs, Web-Push, Katalog-Timer | **unverändert aus** | – |

## 2. Voraussetzungen

| Ressource | Bedarf | Begründung / Messung |
| --- | --- | --- |
| Freier Speicher | **mindestens 5 GB** (wird von `preflight.sh` erzwungen) | Neue Images ca. 360 MB (API 267 MB, Web 88 MB); Build-Cache beim Bauen 1–2 GB; Backup-Staging ≈ Dump-Größe |
| RAM | **2 GB** empfohlen | Beim Bauen des Web-Images läuft `npm ci` und `vite build` neben dem laufenden Betrieb. Betrieb im Leerlauf: siehe `PHASE5-9-PERFORMANCE.md` |
| Ausfallzeit | siehe §6 | Neustart der Container nach dem Bau; der Bau selbst läuft bei laufender alter Version |
| Backup | funktionierendes `backup/backup.env` | `upgrade.sh` bricht ohne erfolgreiches Backup ab |

## 3. Ablauf (als root bzw. mit sudo)

```bash
cd /opt/terpgrid/deploy

# ── 1. Ist-Zustand ablesen (ändert nichts)
grep '^TERPGRID_VERSION=' .env                     # laufende Version (z. B. 5.7.0-rc.1 oder 5.8.0-rc.1)
cat state/previous-version 2>/dev/null             # vorherige Version (Rollback-Ziel)
git -C .. log --oneline -1                         # ausgecheckter Stand
docker compose ps                                  # alle Dienste „running“, api/db/caddy „healthy“
docker compose exec -T api node dist/cli.js schema-status   # erwartet: zuletzt 009_session_security.sql, „✓ Schema passt“
./preflight.sh                                     # muss mit „Preflight bestanden“ enden
df -h / /var/lib/docker                            # ≥ 5 GB frei
free -m

# ── 2. Ausgangsdaten prüfen und frisches Backup samt isoliertem Restore-Test
docker compose exec -T api node dist/cli.js verify-data      # „Fehler: 0“
backup/backup.sh                                   # „✓ Backup erfolgreich“
backup/restore-test.sh latest                      # „Restore-Test erfolgreich“ – berührt die Produktion nicht
cat state/backup-status.json                       # "ok":true

# ── 3. Upgrade (Preflight → Backup → git pull --ff-only → Images bauen → Start → Health-Prüfung)
./upgrade.sh                                       # auf den neuesten Stand des ausgecheckten Branches
# oder gezielt auf den gemergten Stand/Tag:
# ./upgrade.sh <commit-oder-tag>

# ── 4. Nach dem Upgrade prüfen
grep '^TERPGRID_VERSION=' .env                     # 5.9.0-rc.1
./status.sh --verify                               # neu in 5.9: Container, Speicher, Backup, Schema, Katalog, Proben,
                                                   # Schlüsselring, Entschlüsselung aller Daten – erwartet „✓ Keine Probleme gefunden“
docker compose exec -T api node dist/cli.js catalog-validate | head -20
curl -s https://<DOMAIN>/api/health/ready          # {"status":"ok"}

# ── 5. Backup des neuen Stands und Restore-Test
backup/backup.sh
backup/restore-test.sh latest
```

### Erwartete Ausgaben

- **`upgrade.sh`:**
  - „✓ Upgrade auf 5.9.0-rc.1 erfolgreich.“
  - „✓ Schema passt zu dieser Version.“
- **`status.sh --verify`:**
  - Katalog „16710 Sorten, 494 Breeder“, sofern importiert.
  - „Laborproben 89923“, sofern importiert.
  - „Entschlüsselungsprüfung: … Fehler 0“.
  - „✓ Keine Probleme gefunden“.
  - Exit 0.
- **`restore-test.sh`:**
  - dieselbe Anzahl Konten und Datensätze wie in der Produktion;
  - „Restore-Test erfolgreich“.

### Im Browser prüfen

1. Anmelden.
2. Die App meldet „Neue Version verfügbar“. „Aktualisieren“ wählen.
3. Administration → System zeigt Version 5.9.0-rc.1.
4. Stichprobe: Grow öffnen, Foto anzeigen, gemeinsamen Bereich öffnen.

## 4. Nicht tun

- `systemctl enable …terpgrid-catalog-refresh.timer` – der Katalog-Timer bleibt aus.
- Web-Push konfigurieren.
- `rotate-keys`, `rotate-user-keys` oder `purge-retired-keys` im Zuge des Upgrades – keine Schlüsselrotation.
- `.env` oder `secrets/` von Hand ersetzen. `upgrade.sh` ändert nur `TERPGRID_VERSION`.

## 5. Rollback

Da 5.9 keine Migration mitbringt, ist der Rollback auf die vorherige Version ohne Restore möglich:

```bash
cd /opt/terpgrid/deploy
./rollback.sh                    # Ziel aus state/previous-version; prüft vorher das Schema mit der Zielversion
./status.sh --verify
```

- `rollback.sh` lehnt Ziele ab, deren Programm die Migrationen der Datenbank nicht kennt. Im Test wurde 5.4.0-rc.1 abgelehnt: Exit 1, Hinweis auf `restore.sh --version`, laufende Version unverändert.
- Für ältere Ziele (vor 5.7, also vor Migration 009) gilt:

  ```bash
  backup/restore.sh --version <zielversion> <snapshot-von-vor-dem-upgrade>   # Snapshot-IDs: restic snapshots
  ```

  Änderungen nach dem Snapshot gehen dabei verloren.

**Fehlgeschlagenes Upgrade:**
- `upgrade.sh` endet mit „✗ Version … ist nicht gesund gestartet“ und nennt den Rollback-Befehl.
- Migrationen laufen transaktional. Eine fehlerhafte Migration hinterlässt keine Teiländerungen, das ist getestet.
- Danach `./rollback.sh <vorherige-version>` ausführen.

**Unterbrochenes Upgrade** (z. B. abgebrochene SSH-Sitzung). Beide Fälle sind getestet (`PHASE5-9-DISASTER-RECOVERY.md` §2):
- **Abbruch vor dem Umschalten** (Backup oder Bau): Die alte Version läuft unverändert weiter, `.env` ist unverändert.
- **Abbruch beim Umschalten:**
  - `.env` nennt bereits 5.9.0-rc.1, API und Caddy laufen eventuell nicht. Die Daten bleiben unverändert.
  - `./upgrade.sh` erneut ausführen.
  - **Danach unbedingt `./status.sh`.** Beim Upgrade **von** 5.7/5.8 läuft noch die alte Wartefunktion. Sie hat im Test „erfolgreich“ gemeldet, obwohl der Caddy-Container nur angelegt, aber nicht gestartet war.
  - Meldet `status.sh` „Dienst caddy läuft nicht“: `docker compose up -d` ausführen, dann erneut `./status.sh`.
  - Ab 5.9 erkennt `upgrade.sh` das selbst.
- **Tipp:** Das Upgrade in `tmux` oder `screen` ausführen.

## 6. Ausfallzeit

- Gemessen in der isolierten Installation; Werte in `PHASE5-9-DISASTER-RECOVERY.md` §2.
- Der Bau der Images läuft vollständig bei laufender alter Version.
- Ausfall entsteht nur beim Neustart von API und Caddy nach dem Bau.
- Auf dem VPS können Bauzeit und Neustart je nach CPU länger dauern.
- Ein kurzes Wartungsfenster (15 Minuten inklusive Backup und Prüfungen) einplanen.
- Offene Browser-Tabs synchronisieren nach dem Neustart automatisch weiter. Nicht übertragene Änderungen bleiben im Browser ausstehend.

## 7. Wenn etwas nicht stimmt

| Symptom | Diagnose | Vorgehen |
| --- | --- | --- |
| `preflight.sh` meldet Fehler | Ausgabe lesen (Speicher, Secrets-Rechte, DNS) | beheben, dann erneut; nichts wurde geändert |
| Backup schlägt fehl | `cat state/backup-status.json`, restic-Repository erreichbar? | Upgrade bricht von selbst ab; Ursache beheben |
| API startet nicht | `docker compose logs --tail 50 api migrate` | `./rollback.sh` |
| `status.sh` meldet Entschlüsselungsfehler | `docker compose exec -T api node dist/cli.js verify-data` | **Nicht** weiterarbeiten. Prüfen, ob `secrets/master_keys` unverändert ist (`RUNBOOK.md` §5); Rollback |
| Browser zeigt alte Version | „Neue Version verfügbar“ → „Aktualisieren“ | bei installierter App ggf. App schließen und neu öffnen |
