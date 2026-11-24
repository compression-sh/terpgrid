# TERPGRID Phase 4 – Abschlussbericht: Production Readiness, Privacy 2.0 & Premium Experience

Stand: 24.11.2026 · Release-Kandidat **4.0.0-rc.1** (nicht veröffentlicht, kein Tag) · Branch `claude/phase-4` (auf Basis von `main` nach PR #2)

**Grundsatz:** Hier steht nur, was umgesetzt und geprüft wurde. Nicht Geprüftes ist ausdrücklich als solches gekennzeichnet. TERPGRID ist **nicht Ende-zu-Ende-verschlüsselt**, nicht „100 % anonym“ und nicht „unhackbar“.

---

## 1. Zusammenfassung der Änderungen

| Bereich | Umgesetzt |
| --- | --- |
| **Sicherheits-Audit** | Code gegen ASVS 5.0 / OWASP geprüft. Sechs Befunde behoben (§5), darunter ein 2FA-Brute-Force und ein Aussperr-Angriff. |
| **Passkeys** | WebAuthn mit `@simplewebauthn` 14: Registrierung nach Re-Auth, Anmeldung ohne Kennung, mehrere Passkeys, umbenennen und entfernen (Re-Auth), Verwaltung im Konto. |
| **DEK-Rotation je Konto** | Versionierte Schlüsselgenerationen, fortsetzbare Umschlüsselung in kleinen Transaktionen, Prüfung vor dem Ausmustern, Purge nur nach Frist. |
| **Datenschutz im Browser** | Konto-Trennung der THC-Lab-Entwürfe, Foto-Cache wird beim Kontowechsel geleert, Modus „Geteiltes Gerät“, Verwaltung der lokalen Kopie. |
| **Mandantentrennung** | Tests über alle 12 Bereiche mit manipulierten IDs, Ownership-Feldern und Pfaden. RLS-Kontext in echten Requests per SQL-Mitschnitt nachgewiesen. |
| **Sync 2.0** | Drei-Wege-Merge auf Feldebene, Retry mit Backoff, THC-Lab-Entwürfe geräteübergreifend, fünf klare Statuszustände. |
| **Externe APIs** | StrainAPI und CannaLib live geprüft. Relevanz-Sortierung für Suchen, Proxy-Fehlerbehandlung gehärtet. |
| **Produktionsbetrieb** | Preflight, Upgrade (Backup-Pflicht, Health-Wartezeit), Rollback mit Schema-Schutz, System Health, Backup-Benachrichtigung, Datei-Papierkorb, Ressourcen gemessen, Runbook, Checkliste. |
| **Premium UX** | Seite „Verlauf“ (Zeitachse), „Insights“, Sicherheitsstatus, überarbeiteter Foto-Upload, mobile Prüfung aller Routen. |
| **CI** | GitHub Actions mit minimalen Rechten und angehefteten Versionen. Lint, Tests, Migrationen, Smoke-Test, Deployment-Konfiguration, Image-Builds, gitleaks. |

## 2. Commits

| Commit | Inhalt |
| --- | --- |
| `a23365f` | M1: Audit-Befunde behoben, Isolation über alle Bereiche, Geteiltes Gerät |
| `49d7cfc` | M2: Passkeys (WebAuthn) |
| `903bf48` | M2: DEK-Rotation je Konto, Datei-Papierkorb |
| `683707e` | M3: Sync 2.0 (Merge, Backoff, THC-Lab-Entwürfe) |
| `6d047cb` | M3: Relevanz-Sortierung, Live-Prüfung StrainAPI/CannaLib |
| `f839a0b` | M4: Preflight, Upgrade/Rollback, Schema-Schutz, Monitoring, Backups |
| `ea4b44d` | M5: Verlauf, Insights, Foto-Upload, Sicherheitsstatus, mobile Prüfung |
| `e536a42` | M6: CI, ESLint, gitleaks, ICS-Fix |
| `45d0997` | M6: CI-Fix im Test-Helfer, Dokumentation |

Pull Request: siehe Chat-Antwort (gegen `main`, nicht gemergt).

## 3. Testergebnisse (tatsächlich ausgeführt)

| Prüfung | Ergebnis |
| --- | --- |
| Server-Integrationstests gegen PostgreSQL 16 | **105/105** (9 Dateien) |
| Frontend-Unit-Tests | **203/203** (21 Dateien) |
| ESLint | 0 Fehler, 10 Warnungen (Hook-Abhängigkeiten, bewusst als Warnung) |
| `npm audit` (Frontend / Server, inkl. Dev) | 0 / 0 |
| gitleaks (Arbeitsverzeichnis + 22 Commits Historie) | keine Funde (Allowlist nur für Testpasswörter und einen Schlüsselnamen) |
| Browser-E2E: Passkeys mit virtuellem WebAuthn-Authenticator | Registrierung, Umbenennen, Login ohne Kennung, ohne UV abgelehnt |
| Browser-E2E: THC-Lab-Sync mit zwei Geräten | Entwurf übernommen, paralleles Bearbeiten verschiedener Rechner ohne Konflikt zusammengeführt, fremdes Konto auf demselben Gerät sieht nichts |
| Browser-E2E: Discover gegen Live-StrainAPI über den Server-Proxy | Ranking, 3 Anfragen je Suche, 8/8 Bilder über den Proxy, Detailseite, Sonderzeichen, keine direkten Browser-Anfragen an Anbieter |
| Mobile Prüfung | 29 Routen × 6 Breiten (320–1280 px) mit Daten aller Bereiche: kein Überlauf, keine JS-Fehler (vorher 2 Überläufe, behoben) |
| Smoke-Test Lokalmodus | bestanden (28 Routen) |
| Docker-Stack: Upgrade 3.0.0 → 4.0.0-rc.1 mit Bestandsdaten | bestanden (42 s inkl. Backup), alle Daten und das alte 2FA-Geheimnis funktionieren |
| Docker-Stack: Rollback-Schutz | 3.0.0 (ohne Prüfung) bricht sicher ab, simulierte neuere DB wird erkannt, API verweigert den Start |
| Docker-Stack: Rollback auf 3.0.0 per Restore | bestanden (Schema 001, alle Daten entschlüsselt) |
| Docker-Stack: DEK-Rotation, Absturz der API (`kill -9`), Last, Backup, Restore-Test, Fehlerbenachrichtigung | bestanden (Details §10) |
| GitHub Actions (echte Runner) | Lauf 1: 4/5 grün, Backend fehlgeschlagen (Test-Helfer übersprang Rollen mit abweichendem Passwort, behoben in `45d0997`). **Lauf 2 (`45d0997`): alle 5 Jobs grün** – Frontend, Backend (105 Tests, Migrationen), Smoke-Test, Deployment-Konfiguration inkl. echter Image-Builds ohne Sandbox-Anpassungen, Secret-Scan. |

## 4. Sicherheitsbefunde

| # | Befund | Schwere | Status |
| --- | --- | --- | --- |
| F1 | 2FA-Codes ließen sich mit beliebig vielen neuen Anmeldevorgängen durchprobieren (je 5 Versuche) | hoch | behoben: kontoweite Grenze (Regressionstest) |
| F2 | Fehlversuche eines Angreifers konnten ein Konto überall bis zu 15 Min. aussperren | mittel | behoben: Backoff je Kennung + IP, kontoweit erst ab 50 Fehlversuchen (Regressionstests) |
| F3 | THC-Lab-Eingaben über gerätweite localStorage-Schlüssel für andere Konten sichtbar | mittel | behoben: je Konto (E2E) |
| F4 | Foto-URL-Cache behielt Bilder des vorherigen Kontos im Speicher | mittel | behoben |
| F5 | Unbegrenzte Liste ausstehender 2FA-Anmeldungen (Speicher-DoS) | niedrig | behoben |
| F6 | Kennung des letzten Kontos auf geteilten Geräten gespeichert | niedrig | behoben: Modus „Geteiltes Gerät“ |
| F7 | Proxy gab Firewall-403 der Quelle als „nicht gefunden“ aus und reichte HTML durch | niedrig | behoben (Test) |
| F8 | ICS-Export maskierte Semikolons nicht (RFC 5545); der Test bestätigte den Fehler | niedrig | behoben (durch ESLint gefunden, Regressionstest) |
| F9 | Foto-Upload behauptete im Servermodus „nichts wird hochgeladen“ | Korrektheit der Aussage | behoben |
| F10 | minimatch-Schwachstelle in der neuen Lint-Werkzeugkette (nur Entwicklung) | moderat | behoben per Override 11.0.2 |

Geprüft und **ohne Befund**: Session-Invalidierung (Passwort, Recovery, Sperre, Rollenwechsel, Kontolöschung), Re-Auth-Pflicht für sensible Aktionen, Konto-Enumeration (Login, Recovery und Passkey-Login enumerationsfrei; die Namensprüfung bei der Registrierung verrät die Existenz eines Namens bewusst und nur mit gültiger Einladung), Fehlermeldungen (gleiche 404 für „fremd“ und „gibt es nicht“), Logs (keine Passwörter, Codes, Tokens oder Inhalte), Service Worker (kein `/api`), API ohne Owner-Rechte im Normalbetrieb.

## 5. Architekturänderungen

* **Migrationen:** 002 (`webauthn_credentials`, `users.webauthn_user_id`), 003 (`user_keys`, `dek_gen` an `records`/`files`/TOTP, `file_trash`, Altspalten nullable), 004 (Leserecht der App-Rolle auf `schema_migrations`). Alle additiv; Bestandsdaten werden zu Generation 1 ohne Neuverschlüsselung.
* **Server:** `routes/passkeys.ts`, `login.ts` (gemeinsamer Login-Abschluss), `userkeys.ts`, `rotation.ts`, `metrics.ts`, Schema-Schutz in `migrate.ts`/`index.ts`, Datei-Papierkorb in `files.ts`.
* **Frontend:** `lib/sync/merge.ts`, `hooks/useLabDraft.ts`, `lib/timeline.ts`, `lib/insights.ts`, `lib/catalog/rank.ts`, `lib/device.ts`, `lib/server/passkeys.ts`, Seiten Verlauf/Insights, Passkey- und Geräteverwaltung.
* **Betrieb:** `deploy/preflight.sh`, `upgrade.sh`, `rollback.sh`, `lib.sh`, systemd-`OnFailure`, `.github/workflows/ci.yml`, `.gitleaks.toml`, `eslint.config.js`.

## 6. Verschlüsselung und Wiederherstellung – Grenzen

* **Model A (serverseitig), keine E2EE.** Wer den laufenden Server vollständig kontrolliert, kann entschlüsseln. Daran ändern weder Passkeys noch die Rotation etwas.
* **Master-Key-Verlust = endgültiger Verlust aller Inhalte, auch in jedem Backup.** Die Offline-Kopie an zwei getrennten Orten ist Pflicht (Runbook §5).
* **DEK-Rotation:** Alte Generationen werden nie automatisch gelöscht. Ein Purge vor Ablauf alter Backups macht diese Backups für das betroffene Konto unlesbar (Standardfrist 200 Tage, länger als die Aufbewahrung von 6 Monaten). Ein Rollback auf eine Version vor 4.0 nach einer Rotation geht nur per Restore.
* **Lokale Browser-Kopie unverschlüsselt.** Eine Verschlüsselung im Browser würde einen Schlüssel auf demselben Gerät erfordern und gegen Zugriff auf das entsperrte Gerät nicht schützen. Die umgesetzte Lösung: je Konto getrennt, Modus „Geteiltes Gerät“ (Löschen beim Abmelden), manuelles Löschen und klare Hinweise.
* **Ohne Recovery-Codes kein Zugang**, wenn Passwort und Passkeys fehlen. Es gibt keinen Admin-Zugriff auf Inhalte.
* **Passkeys:** Attestation wird nicht geprüft (`none`); synchronisierte Passkeys liegen beim jeweiligen Anbieter. Re-Auth erfolgt weiterhin per Passwort (+ TOTP).

## 7. Ergebnisse der API-Integration

* **StrainAPI (live, 24.11.2026):** Erreichbar, Antwortzeit ca. 0,9 s. `X-WP-Total`/`X-WP-TotalPages` sind vorhanden, `per_page=100` funktioniert. **Suche „gelato“:** 225 Treffer in nicht relevanzsortierter Reihenfolge. 8 tragen den Begriff im Namen, 31 erwähnen ihn in Abstammung, Beschreibung oder Geschmack, 186 in keinem gelieferten Feld. Ein exakter Eintrag „Gelato“ existiert in StrainAPI nicht (CannaLib führt ihn). **Maßnahme:** Laden von bis zu 3 × 100 Treffern und lokale Relevanz-Sortierung; die Gruppen werden ehrlich ausgewiesen. Skriptartige Suchbegriffe blockiert die Firewall der Quelle mit 403 und HTML; der Proxy meldet das jetzt verständlich. Bilder kommen über den Bild-Proxy (8/8 geladen). Detailseiten, Kodierung von Sonderzeichen und der Cache (30 Min. für Suchen) wurden geprüft.
* **CannaLib (live):** Erreichbar. Anonymes Limit laut Header 20 Anfragen pro Stunde (`X-RateLimit-Limit: 20`), Reset nach 3600 s. Der Adapter versteht Suche und Detail (10 Treffer, Eltern, Laborwerte, DNA-Datensätze). Die Rohdaten enthalten Bild-URLs, die wegen ungeklärter Rechte weiterhin **nicht** angezeigt werden. Anfragen bleiben auf Klick ausgelöst und sind instanzweit auf 18 pro Stunde begrenzt.
* **Grenzen:** Eine Aussage zur Vollständigkeit des Katalogs ist nicht möglich. Änderungen am Schema der Quelle fängt die Normalisierung ab (fehlende Felder sind optional); getestet ist das mit echten, gekürzten Antworten als Fixture.

## 8. Stand der Produktionsreife

**Bereit für eine kontrollierte Erstinstallation auf einem privaten VPS. Das Deployment selbst steht aus und wartet auf deine ausdrückliche Freigabe.**

Belegt:
* Installation, Upgrade, Rollback und Restore sind auf einer lokalen Docker-Installation durchgespielt, einschließlich echtem Upgrade von 3.0.0.
* Sicherheits-Header, Härtung, Backups und Monitoring sind geprüft.
* Die CI baut die echten Images ohne Sandbox-Anpassungen erfolgreich.

Nicht belegt, weil kein VPS verfügbar war:
* Let's-Encrypt-Ausstellung mit echter Domain
* Verhalten hinter einer echten Firewall bzw. ufw
* Offsite-Backup-Ziel über das Netz (getestet wurde ein lokales restic-Repository)
* Zeitsynchronisation auf dem Zielsystem

## 9. Benötigte VPS-Ressourcen

Gemessen lokal (4 vCPU Xeon 2,1 GHz). Details in DEPLOYMENT.md §2.

| Messung | Wert |
| --- | --- |
| Leerlauf | API 30 MiB, DB 73 MiB, Caddy 14 MiB |
| Last (4 Konten, 10 parallel, 400 Operationen) | 0 Fehler, p95: Push 241 ms, Pull 41 ms, Upload 1 MiB 108 ms, Download 30 ms; Spitzen: API 1,5 Kerne/65 MiB, DB 0,7 Kerne/96 MiB |
| Argon2id je Login | 68 ms (64 MiB) |
| Verschlüsselung | 1 MiB ≈ 1,4 ms, Mehrgröße 29 Byte |

**Empfehlung für eine kleine private Instanz (bis ca. 10 Personen):**
* 2 vCPU und 2 GB RAM
* SSD mit Platz für die Fotos × 1,1, zuzüglich etwa 3 GB für System und Images
* Offsite-Backup-Ziel mit etwa dem 1,5-Fachen der Datenmenge

## 10. Einrichtung (Kurzfassung)

```bash
# Auf dem VPS (nach Freigabe), siehe docs/PRODUCTION-CHECKLIST.md
sudo git clone https://github.com/compression-sh/terpgrid.git /opt/terpgrid
cd /opt/terpgrid && sudo git checkout claude/phase-4    # bzw. nach dem Merge: main / v4.0.0
cd deploy && sudo ./install.sh --secrets-only           # Domain, Secrets
# master_keys, hmac_secret und restic-Passwort offline sichern!
sudo cp backup/backup.env.example backup/backup.env && sudo chmod 600 backup/backup.env   # Ziel + NOTIFY_CMD
sudo ./preflight.sh && sudo ./install.sh
sudo docker compose exec api node dist/cli.js invite 7 Admin   # Link öffnen, registrieren, Codes sichern
sudo docker compose exec api node dist/cli.js promote <kennung>
sudo backup/backup.sh && sudo backup/restore-test.sh
sudo cp systemd/terpgrid-* /etc/systemd/system/ && sudo systemctl daemon-reload \
  && sudo systemctl enable --now terpgrid-backup.timer terpgrid-restore-test.timer
```

## 11. Verbleibende Risiken und Blocker

* **Blocker:** Das VPS-Deployment wartet auf Freigabe und Zugangsdaten. Branch-Schutzregeln für `main` sind nicht gesetzt (Admin-Rechte nötig); die Empfehlung steht in SECURITY.md §4.
* **Risiken:**
  * Keine E2EE.
  * Unverschlüsselte Browser-Kopie.
  * Ratenbegrenzung, Kennzahlen und 2FA-Zwischenstände liegen im Speicher einer einzelnen Instanz.
  * Metadaten sind lesbar.
  * Verteilte Angriffe werden nur gebremst.
  * Abhängigkeit von externen Diensten für Sortendaten.
  * Kein externer Penetrationstest.
* **Bewusst nicht umgesetzt:**
  * Re-Auth per Passkey
  * Feldweiser Merge innerhalb von Arrays (Arrays gelten als Ganzes)
  * Verschlüsselung der lokalen Kopie
  * Automatische Backup-Benachrichtigung ohne konfigurierten `NOTIFY_CMD`
* **Hinweis:** Node 20 ist auf GitHub-Runnern veraltet. Die angehefteten Actions v4 laufen deshalb erzwungen unter Node 24 (Warnung im CI-Log). Eine Aktualisierung auf neuere Action-Versionen ist empfohlen, wenn diese lange genug verfügbar sind.

## 12. Empfohlene nächste Schritte

1. PR prüfen und mergen. Danach Branch-Schutz für `main` mit den CI-Jobs als Pflicht-Checks einrichten.
2. VPS-Deployment nach der Checkliste freigeben (Domain und Offsite-Backup-Ziel bereitstellen).
3. Nach dem Start: Backup und Restore-Test auf dem echten System, Admin mit Passkey oder 2FA, Timer aktivieren.
4. Nach Stabilisierung `v4.0.0` taggen (Freigabe nötig).
5. Später: Re-Auth per Passkey, externe Sicherheitsprüfung, gegebenenfalls Redis/DB-basierte Ratenbegrenzung für mehrere Instanzen.

## 13. Dokumentation

[DEPLOYMENT.md](DEPLOYMENT.md) · [BACKUP.md](BACKUP.md) · [RUNBOOK.md](RUNBOOK.md) · [PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md) · [SECURITY.md](SECURITY.md) · [THREAT-MODEL.md](THREAT-MODEL.md) · [E2EE-DECISION.md](E2EE-DECISION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [CHANGELOG](../CHANGELOG.md)
