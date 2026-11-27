# TERPGRID 6.0.0 – Release-Bericht

Stand: 6.0.0, Branch `claude/loving-gates-iyhnqa`, Basis `main` fc35fe7 (5.9.0-rc.1, PR #18 gemerged).

## Zusammenfassung

| | |
| --- | --- |
| **Status** | **Technisch vorbereitet, nicht freigegeben.** Offen: Geräteabnahme (G3), Betreiber-Gates G6–G8, Freigabe G10 |
| **Datenbank** | keine Migration (bleibt 009); Rollback auf 5.7/5.8/5.9 ohne Restore |
| **Neue Funktionen** | keine (bewusst) |
| **Behobene Fehler** | 2 (API-Client bei abgebrochener Antwort; Image-Tag bei Neuinstallation) |
| **Tests** | Frontend 295 ✓ · Server 232 ✓ · Lint 0 Warnungen · Typecheck ✓ · `npm audit` 0 |
| **Browser** | Chromium, Firefox, WebKit automatisiert (`RELEASE-6.0-ACCEPTANCE.md` §3); **keine** physischen Geräte |
| **Betrieb** | Upgrades 5.7/5.8/5.9 → 6.0 mit Abbruch, fehlerhafter Migration und Rollback ✓; DR-Übung ✓ |
| **Produktionsversion** | **unbekannt** – vor dem Upgrade ablesen (`UPGRADE-6.0.md` Schritt 1) |
| **Nicht getan (Regeln)** | kein Merge, kein Tag, kein Release, keine Image-Veröffentlichung, kein Deployment, keine Workflows ausgelöst, keine Schlüsselrotation, keine Hintergrundjobs; Web-Push und Katalog-Timer aus |

## 1. Vorgehen

1. PR #18 auf `main` geprüft (fc35fe7) und den Branch daraus neu aufgesetzt.
2. Baseline: Frontend 291, Server 232, 9 Lint-Warnungen.
3. Bereinigung:
   - Lint-Warnungen behoben;
   - ungenutzten Code gesucht und nur wirklich toten Code entfernt;
   - Version auf 6.0.0 gesetzt.
4. Abnahme:
   - Browser-Suiten und Seitenprüfung in drei Engines;
   - isolierte Docker-Upgrades von drei Ausgangsversionen;
   - DR-Übung;
   - Secret-Scan;
   - Katalog- und Wissensbestand gezählt.
5. Dokumentation und Release-Vorbereitung.

## 2. Änderungen im Code

| Commit | Änderung | Prüfung |
| --- | --- | --- |
| d8f4e8e | `TimelinePage`: Filterliste aus der URL memoisiert | `timeline*.test`, Seitenprüfung |
| d8f4e8e | `DiscoverPage`: Suchfeld ↔ URL über Ref; Filter aus der Abfragezeichenkette memoisiert (`filtersFrom`) | Direktlinks, Tippen → URL, Hash-Wechsel → Feld; Lokal- und Servermodus in 3 Engines |
| d8f4e8e | `isRole` (ungenutzt) entfernt | Typecheck, Server-Tests |
| d8f4e8e | `install.sh`: `TERPGRID_VERSION` aus `server/package.json`; `.env.example` 6.0.0 | ShellCheck (CI); vorher erhielten Neuinstallationen `5.1.0-rc.1` |
| d8f4e8e | Version 6.0.0 in beiden `package.json` und Lockfiles, README | Build zeigt 6.0.0 |
| 676eea1 | `api()`: abgebrochenes Lesen einer 200-Antwort → Verbindungsfehler statt `null` | neuer `api.test.ts` (schlägt ohne Fix fehl); Seitenprüfung Firefox |

**Bewusst behalten:**
- `ORAL_BIOAVAILABILITY`: Entscheidung aus 5.3.
- Test-Hilfen und exportierte Konstanten, die nur in Tests genutzt werden.

**Gefundener Fehler 676eea1:**
- Der Fehler zeigte sich einmal in der Firefox-Seitenprüfung als „can't access property "user", k is null“ beim ersten Laden.
- Ursache: Die Seite wurde neu geladen, während `GET /api/auth/session` noch lief. Firefox brach das Lesen des Antwortkörpers ab, `api()` fing das ab und gab `null` zurück.
- In 5.9 nicht beobachtet, weil der Zeitpunkt zufällig ist; der Code war seit 5.x unverändert.
- Leere Antworten und Nicht-JSON-Antworten liefern weiter `null`. Die Erkennung des Lokalmodus bleibt unverändert.

## 3. Abnahme

Details und Matrix: `RELEASE-6.0-ACCEPTANCE.md`.

| Bereich | Ergebnis |
| --- | --- |
| Gates | G1, G2, G4 (für 5.7/5.8/5.9), G5, G9 bestanden; G3, G6, G7, G8, G10 offen |
| Module | alle Hauptmodule bestanden; Passkeys automatisiert nur in Chromium; Offline-Neuladen in WebKit-Automation nicht prüfbar (B-4) |
| Upgrades | 3 Pfade, je mit Abbruch, Rollback-Ablehnung (5.4), Rollback, Roll-forward, fehlerhafter Migration; Ausfall 1,5–2,5 s |
| DR | Totalverlust → Neuinstallation → Restore: 0 Entschlüsselungsfehler, alle Blobs per SHA-256 gleich; Negativtests korrekt abgelehnt |
| Sicherheit | `RELEASE-6.0-SECURITY.md` – keine offenen kritischen/hohen Befunde |

## 4. Sicherheit

- Serverseitige Verschlüsselung (AES-256-GCM) mit Schlüsseln je Konto und je Bereich, verpackt mit dem Master-Key.
- **Keine Ende-zu-Ende-Verschlüsselung.**
- RLS, Sitzungen, 2FA, Passkeys, Rechte der Zusammenarbeit und Offline-Schutz sind unverändert und durch Tests belegt.
- Secret-Scan:
  - `.gitleaks.toml` unverändert;
  - keine Funde in `HEAD` und `origin/main`;
  - Hinweis zum lokalen Sicherungs-Branch in `RELEASE-6.0-ACCEPTANCE.md` §7.

## 5. Leistung

Keine Änderung an Sync, Speicher oder Server-Pfaden seit 5.9. Es gelten die Messungen aus `PHASE5-9-PERFORMANCE.md`:
- Erstabgleich von 20.000 Messungen: 5,5 s;
- Lasttest 1–25 Nutzer;
- großes Konto.

In 6.0 wurde kein neuer Lasttest gefahren.

## 6. Daten

| Bestand | Wert |
| --- | --- |
| Katalog | 16.710 Sorten, 494 Breeder |
| Laborproben | 89.923 (Smith et al. 2022, CC0) |
| Academy | 30 Artikel, 32 Glossarbegriffe, 4 Lernpfade |
| Terpen-Atlas | 27 Verbindungen |

Keine erfundenen Werte:
- 0 quantitative breeder-spezifische Terpenprofile;
- 0 lizenzierte Sortenfotos.

Vollständige Zählung: `RELEASE-6.0-ACCEPTANCE.md` §8.

## 7. Docker-Release-Vorbereitung (nicht ausgeführt)

**Grundsatz:** TERPGRID veröffentlicht keine Images. `upgrade.sh` bzw. `docker compose build` baut auf dem Server aus dem ausgecheckten Tag:
- `terpgrid-api:<version>` aus `server/Dockerfile`;
- `terpgrid-web:<version>` aus `deploy/Dockerfile.web`.

Der Tag kommt aus `server/package.json`. Die alte Version bleibt als Image für `rollback.sh` erhalten.

**Reproduzierbarkeit:**
- Basis-Images per Tag gepinnt: `node:22.21-alpine3.22`, `caddy:2.10.2-alpine`, `postgres:16.10-alpine3.22`;
- `npm ci` mit Lockfiles;
- Katalog und Proben per Commit und SHA-256;
- die CI baut beide Images bei jedem Push, ohne sie zu veröffentlichen;
- das API-Image läuft als UID 1000.

**Ablauf nach Freigabe (durch den Betreiber, nicht automatisch):**
1. PR manuell mergen.
2. Tag setzen: `git tag -s v6.0.0 <merge-commit> && git push origin v6.0.0`.
3. GitHub-Release aus dem Tag mit dem Text aus `docs/RELEASE-NOTES-6.0.md`.
4. Auf dem Server: `./upgrade.sh v6.0.0` nach `UPGRADE-6.0.md`.

**Optional, nur bei späterer Entscheidung für eine Registry:**
- `docker build` beider Images aus dem Tag;
- `docker push` mit Digest, Images per Digest in `docker-compose.yml`;
- `upgrade.sh --no-build` existiert dafür bereits.

Das ist für 6.0 weder nötig noch vorbereitet.

## 8. Offene Punkte vor der Freigabe

1. **G3 – Geräteabnahme:** `DEVICE-TESTING-6.0.md`, Pflicht IS, IP, AC, FD. Ein Verzicht braucht deine ausdrückliche Zustimmung.
2. **Produktionsversion ablesen.** Weicht sie von 5.7/5.8/5.9 ab, isoliert nachtesten.
3. **G6:** `backup/restore-test.sh latest` auf dem Server.
4. **G7:** Offline-Sicherung der Schlüssel bestätigen.
5. **G8:** Betrieb ohne neue P1/P2-Fehler.
6. **G10:** ausdrückliche Freigabe. Danach Merge, Tag und Release durch den Betreiber.

## 9. Grenzen

`RELEASE-6.0-KNOWN-LIMITATIONS.md`.
