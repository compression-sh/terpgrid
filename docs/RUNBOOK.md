# TERPGRID – Runbook für Störungen und Disaster Recovery

Kurz und in der Reihenfolge, in der man es im Ernstfall braucht. Befehle im Verzeichnis `/opt/terpgrid/deploy` als root. **Niemals Secrets in Tickets, Chats oder Logs kopieren.**

## 0. Erste Diagnose (2 Minuten)

```bash
docker compose ps                      # läuft alles, „healthy“?
docker compose logs --tail 50 api      # Fehlermeldung der API (z. B. Schema, Secrets)
./preflight.sh                         # Konfiguration, Speicher, DNS, Secrets
cat state/backup-status.json           # letztes Backup
docker compose exec api node dist/cli.js schema-status
```

## 1. API startet nicht

| Meldung | Ursache | Lösung |
| --- | --- | --- |
| „Die Datenbank ist neuer als diese TERPGRID-Version“ | Rollback ohne Restore | §4 Rollback mit Restore |
| „Ausstehende Datenbank-Migrationen“ | `migrate`-Job lief nicht | `docker compose up -d` (startet migrate), Logs `docker compose logs migrate` |
| „…_FILE“ / ENOENT `/run/secrets/…` | Secret fehlt/nicht lesbar | `./preflight.sh`, Rechte `chmod 700 secrets; chmod 444 secrets/*` |
| „Master-Key-Version … nicht verfügbar“ | `MASTER_KEY_CURRENT` passt nicht zu `master_keys` | `.env`/`secrets/master_keys` prüfen (Offline-Kopie!) |
| Migration fehlgeschlagen | Fehler in einer Migration (transaktional zurückgerollt) | Logs sichern, Rollback auf vorherige Version (§4) |

## 2. Daten wirken falsch oder fehlen

1. **Nichts überschreiben.** Zuerst ein Backup des aktuellen Zustands: `backup/backup.sh`.
2. Integrität prüfen: `docker compose exec api node dist/cli.js verify-data` (entschlüsselt alles, nur Zählwerte).
3. Einzelne Nutzer: Konflikte erscheinen in der App unter *Konto → Synchronisation*; Nutzer können dort selbst entscheiden.
4. Restore nur nach Restore-Test: `backup/restore-test.sh <snapshot>`, dann `backup/restore.sh <snapshot>`.

## 3. Kompletter Serververlust

1. Neuen VPS härten (DEPLOYMENT.md §3), Repository nach `/opt/terpgrid` klonen, gleiche Version auschecken.
2. Aus der **Offline-Sicherung** zurückkopieren: `deploy/secrets/master_keys`, `deploy/secrets/hmac_secret`. DB-Passwörter dürfen neu erzeugt werden: `./install.sh --secrets-only` ergänzt nur Fehlendes.
3. `.env` (Domain, `MASTER_KEY_CURRENT`) und `backup/backup.env` (Repository, Passwortdatei aus der Offline-Sicherung) anlegen.
4. `./preflight.sh`, dann `docker compose up -d --build`.
5. `backup/restore-test.sh latest` → bei Erfolg `backup/restore.sh latest`.
6. DNS auf den neuen Server, Zertifikat wird automatisch ausgestellt. Nutzer müssen sich neu anmelden (Sessions sind im Backup enthalten, aber an Cookies gebunden – ggf. `TRUNCATE sessions`).

## 4. Rollback nach fehlgeschlagenem Upgrade

```bash
./rollback.sh                    # prüft das Schema mit der Zielversion
```

Meldet es „Datenbank enthält Migrationen, die … nicht kennt“:

```bash
sed -i "s/^TERPGRID_VERSION=.*/TERPGRID_VERSION=<alte-version>/" .env
backup/restore.sh <snapshot-von-vor-dem-upgrade>     # upgrade.sh hat ihn direkt vor dem Upgrade erstellt
```

Änderungen nach dem Upgrade gehen dabei verloren.

## 5. Schlüsselverlust

| Verloren | Folge | Vorgehen |
| --- | --- | --- |
| **Master-Key** (alle Kopien) | Alle Inhalte aller Konten sind **endgültig verloren** – auch in jedem Backup. Es gibt keinen Generalschlüssel. | Konten können ohne Inhalte neu beginnen. Deshalb: Offline-Kopie an zwei getrennten Orten, jährlich prüfen (Restore-Test liest sie). |
| restic-Passwort | Backups unbrauchbar, laufende Instanz unbeeinträchtigt | Sofort neues Repository + neues Passwort, neues Vollbackup |
| HMAC-Secret | Recovery-Codes und Einladungen ungültig, lokale Browser-Kopien werden neu angelegt | Neues Secret erzeugen, Nutzer erzeugen neue Recovery-Codes |
| Master-Key **kompromittiert** | Angreifer mit DB-Kopie kann entschlüsseln | Neue Master-Key-Version anhängen, `rotate-keys`, zusätzlich `rotate-user-keys --all`; alte Version nach Ablauf der Backups entfernen; Vorfall den Nutzern mitteilen |

## 6. Kontozugang verloren (Nutzer)

* Passwort vergessen → Anmeldeseite „Passwort vergessen?“ mit Recovery-Code (entfernt 2FA und Passkeys).
* Keine Recovery-Codes mehr → **kein** Weg zurück; die Administration kann bewusst keine Konten übernehmen oder Inhalte entschlüsseln. Das Konto kann gelöscht und neu angelegt werden.
* Passkey-Gerät verloren → mit Passwort anmelden und den Passkey unter *Konto → Passkeys* entfernen.

## 7. Sicherheitsvorfall (Verdacht)

1. Alle Sitzungen beenden: `docker compose exec db psql -U postgres -d terpgrid -c "TRUNCATE sessions"`.
2. Betroffene Konten sperren (*Administration → Konten*).
3. Logs sichern (`docker compose logs > /root/incident-$(date +%F).log`) – sie enthalten keine Passwörter/Inhalte.
4. Secrets rotieren (DEPLOYMENT.md → Rotation), Host prüfen/neu aufsetzen.
5. Nutzer informieren: Passwörter ändern, Recovery-Codes neu erzeugen.
