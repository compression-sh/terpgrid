# Upgrade auf 6.0.0 – manueller Leitfaden für `/opt/terpgrid/deploy`

Stand: 6.0.0.

- Dieser Leitfaden wurde **nicht** gegen die Produktion ausgeführt.
- Jeder Befehl stammt aus den Skripten dieses Repositorys.
- Jeder Schritt ist in isolierten Docker-Installationen getestet (`RELEASE-6.0-ACCEPTANCE.md` §5).

> **Laufende Produktionsversion: unbekannt.** Sie lässt sich nur auf dem Server ablesen (Schritt 1). Die getesteten Wege sind unten getrennt aufgeführt. Läuft eine andere Version, bitte vor dem Upgrade melden; dieser Weg wird dann isoliert nachgetestet.

## 1. Was sich gegenüber 5.9 ändert

| Bereich | Änderung | Auswirkung |
| --- | --- | --- |
| Datenbank | **keine Migration** (bleibt `009_session_security.sql`) | Rollback auf 5.7/5.8/5.9 ohne Restore möglich |
| Version | 6.0.0 in API, Oberfläche, Service Worker und Image-Tags | Browser zeigen „Neue Version verfügbar“ |
| `install.sh` | setzt `TERPGRID_VERSION` aus `server/package.json` (betrifft nur Neuinstallationen) | keine |
| Code-Qualität | Lint-Warnungen behoben, toter Code entfernt | keine Verhaltensänderung |
| Hintergrundjobs, Web-Push, Katalog-Timer | **weiterhin aus** | – |

## 2. Getestete Wege

| Von | Nach 6.0.0 | Migrationen | Rollback |
| --- | --- | --- | --- |
| 5.9.0-rc.1 | ✓ isoliert getestet | keine | `./rollback.sh 5.9.0-rc.1` ✓ |
| 5.8.0-rc.1 | ✓ isoliert getestet | keine | `./rollback.sh 5.8.0-rc.1` ✓ |
| 5.7.0-rc.1 | ✓ isoliert getestet | keine | `./rollback.sh 5.7.0-rc.1` ✓ |
| ≤ 5.6 | nicht getestet | 009 wird angewendet (additiv) | nur `backup/restore.sh --version <alt> <snapshot>` |

## 3. Voraussetzungen

| Ressource | Bedarf |
| --- | --- |
| Freier Speicher | **≥ 5 GB** (von `preflight.sh` erzwungen): Images ca. 360 MB, Build-Cache 1–2 GB, Backup-Staging ≈ Dump-Größe |
| RAM | **2 GB** (Bau des Web-Images neben dem laufenden Betrieb); Betrieb im Leerlauf ca. 190 MiB für alle Container |
| Backup | funktionierendes `backup/backup.env`; `upgrade.sh` bricht ohne erfolgreiches Backup ab |
| Wartungsfenster | 15 Minuten (inkl. Backup, Bau, Prüfungen); reine Ausfallzeit siehe §7 |

## 4. Ablauf (als root bzw. mit sudo, am besten in `tmux`)

```bash
cd /opt/terpgrid/deploy

# ── 1. Ist-Zustand ablesen (ändert nichts)
grep '^TERPGRID_VERSION=' .env                      # laufende Version
cat state/previous-version 2>/dev/null              # vorherige Version
git -C .. log --oneline -1                          # ausgecheckter Stand
docker compose ps                                   # alle Dienste „running“/„healthy“
docker compose exec -T api node dist/cli.js schema-status   # „✓ Schema passt“ (zuletzt 009_session_security.sql)
./preflight.sh                                      # „Preflight bestanden“
df -h / /var/lib/docker; free -m
# Ab 5.9 zusätzlich verfügbar:
./status.sh 2>/dev/null || echo "status.sh gibt es erst ab 5.9 – übersprungen"

# ── 2. Daten prüfen, frisches Backup, isolierter Restore-Test (berührt die Produktion nicht)
docker compose exec -T api node dist/cli.js verify-data       # „Fehler: 0“
backup/backup.sh                                               # „✓ Backup erfolgreich“
backup/restore-test.sh latest                                  # „Restore-Test erfolgreich“
#   ab 5.9 gründlicher (liest das ganze Repository):  backup/restore-test.sh --full-check latest

# ── 3. Upgrade (Preflight → Backup → git → Images bauen → Start → Health-Prüfung)
./upgrade.sh v6.0.0        # sobald der Tag v6.0.0 nach dem Merge existiert
# oder ohne Tag auf den Stand von main:
# ./upgrade.sh             # git pull --ff-only des ausgecheckten Branches

# ── 4. Nach dem Upgrade prüfen
grep '^TERPGRID_VERSION=' .env                      # 6.0.0
./status.sh --verify                                # alle Dienste ✓, Schema ✓, Katalog, Proben, Schlüsselring,
                                                    # Entschlüsselung aller Daten „Fehler 0“, „✓ Keine Probleme gefunden“
docker compose exec -T api node dist/cli.js catalog-validate | head -20
curl -s https://<DOMAIN>/api/health/ready           # {"status":"ok"}

# ── 5. Neues Backup und Restore-Test des 6.0-Stands
backup/backup.sh
backup/restore-test.sh latest
```

**Beim Upgrade von 5.7 oder 5.8:**
- Während des Upgrades läuft noch die Wartefunktion der alten Version, weil `lib.sh` vor dem `git pull` geladen wird.
- Sie erkennt nicht gestartete Dienste nach einer Unterbrechung nicht.
- Deshalb nach Schritt 3 **immer** `./status.sh` ausführen. Meldet es „Dienst caddy läuft nicht“: `docker compose up -d`, dann erneut `./status.sh`.

**Erwartete Ausgaben:**

| Befehl | Ausgabe |
| --- | --- |
| `upgrade.sh` | „✓ Upgrade auf 6.0.0 erfolgreich.“ und „✓ Schema passt zu dieser Version.“ |
| `status.sh --verify` | Katalog „16710 Sorten, 494 Breeder“ und „Laborproben 89923“ (falls importiert), „Entschlüsselungsprüfung: … Fehler 0“, „✓ Keine Probleme gefunden“ |

**Im Browser:**
1. Anmelden; „Neue Version verfügbar“ → „Aktualisieren“.
2. Administration → System zeigt 6.0.0.
3. Stichprobe: Grow öffnen, Foto ansehen, gemeinsamen Bereich öffnen.

## 5. Nicht tun

- `terpgrid-catalog-refresh.timer` einschalten.
- Web-Push konfigurieren.
- Schlüssel rotieren (`rotate-keys`, `rotate-user-keys`, `purge-retired-keys`).
- `.env` oder `secrets/` ersetzen. `upgrade.sh` ändert nur `TERPGRID_VERSION`.
- Alte Images vor Abschluss der Prüfungen löschen; sie werden für den Rollback gebraucht.

## 6. Rollback

```bash
cd /opt/terpgrid/deploy
./rollback.sh               # auf state/previous-version; prüft das Schema mit dem Programm der Zielversion
./status.sh                 # (nach Rollback auf 5.7/5.8 gibt es status.sh nicht mehr: docker compose ps, schema-status)
```

- **Abgelehnte Rollbacks:** Ziele, deren Programm die Migrationen der Datenbank nicht kennt (z. B. 5.4), lehnt `rollback.sh` ab. Exit 1, mit Hinweis auf `backup/restore.sh --version <ziel> <snapshot>`.
- **Fehlgeschlagenes Upgrade:**
  - `upgrade.sh` meldet „✗ Version 6.0.0 ist nicht gesund gestartet“. Bei Migrationsfehlern zeigt es zusätzlich deren Ausgabe.
  - Migrationen laufen transaktional; die fehlgeschlagene wird vollständig zurückgerollt.
  - Danach `./rollback.sh <vorherige>`.
- **Unterbrochenes Upgrade:**
  - Abbruch vor dem Umschalten: Die alte Version läuft weiter.
  - Abbruch beim Umschalten: `./upgrade.sh` erneut ausführen und danach `./status.sh`.

## 7. Ausfallzeit

- Gemessen in der isolierten Installation; Werte in `RELEASE-6.0-ACCEPTANCE.md` §5.
- Der Bau der Images läuft bei laufender alter Version.
- Ausfall entsteht nur beim Neustart von API und Caddy, in den Tests einige Sekunden.
- Auf dem VPS hängt das von CPU und Datenträger ab.
- Offene Browser-Tabs synchronisieren danach automatisch weiter; nicht übertragene Änderungen bleiben ausstehend.

## 8. Wenn etwas nicht stimmt

| Symptom | Vorgehen |
| --- | --- |
| `preflight.sh` meldet Fehler | beheben (Speicher, Secrets-Rechte, DNS), dann erneut; nichts wurde geändert |
| Backup schlägt fehl | Upgrade bricht von selbst ab; `cat state/backup-status.json`, restic-Ziel prüfen |
| API startet nicht | `docker compose logs --tail 50 api migrate`, dann `./rollback.sh` |
| Entschlüsselungsfehler in `status.sh --verify` | **nicht weiterarbeiten**; `secrets/master_keys` mit der Offline-Sicherung vergleichen (`RUNBOOK.md` §5), dann Rollback |
| Browser zeigt alte Version | „Aktualisieren“ im Hinweis; installierte App schließen und neu öffnen |
