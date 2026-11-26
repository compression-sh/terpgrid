# Phase 5.7 – Sicherheitsbericht

Stand: 5.7.0-rc.1 (Release-Kandidat, nicht veröffentlicht, nicht deployt) · Basis `main` @ `8658cda` (PR #15 gemergt) · Branch `claude/loving-gates-iyhnqa`

Begleitdokumente:
- `PHASE5-7-THREAT-MODEL.md`
- `PHASE5-7-SECURITY-MATRIX.md`
- `PHASE5-7-ENCRYPTION-AUDIT.md`
- `PHASE5-7-E2EE-FEASIBILITY.md`
- `PHASE5-7-OFFLINE-SECURITY.md`
- `PHASE5-7-VPS-HARDENING.md`
- `PHASE5-7-DISASTER-RECOVERY.md`

> Dieser Bericht behauptet **keine** vollständige Sicherheit und keine Zertifizierung. Er dokumentiert, was geprüft, gefunden, behoben und belegt wurde – und was nicht.

## 1. Ausgangslage (M0)

- **PR #15:** CI grün (alle 5 Jobs), manuell gemergt (`main` = `8658cda`). Branch von `main` neu gestartet; kein gestapelter PR.
- **Baseline vor Änderungen:** 205 Server-Tests und 288 Frontend-Tests grün.
  - Ein erster Lauf scheiterte nur, weil die lokale PostgreSQL nach einem Neustart der Arbeitsumgebung gestoppt war. Nach dem Neustart der Datenbank war der Lauf grün.
- **WebKit/Firefox:** **blockiert**. In dieser Umgebung ist nur Chromium vorinstalliert. Weitere Browser ließen sich nur per `playwright install` nachladen, und das ist hier ausdrücklich untersagt. Siehe Abschnitt 6.

## 2. Vorgehen

- **Statische Prüfung** des Quellcodes für alle in der Aufgabe genannten Bereiche:
  - Authentifizierung, Sitzungen, Passkeys, TOTP, Wiederherstellung.
  - Autorisierung, RLS, Kryptografie, Dateien, Proxy, Admin.
  - Offline-Speicher, Service Worker.
  - Docker, Caddy, Backups.
- **Dynamische Tests:**
  - Neue Server-Tests mit mehreren Konten und direkten API-Aufrufen, unabhängig vom Frontend: `server/test/security57.test.ts`, 24 Tests.
  - Klartext-Scan über **alle** Tabellen und Dateien: `server/test/collab.test.ts`.
  - Browser-Tests der Offline-Sicherheit in Chromium.
  - Isolierte Docker-Notfalltests.
- **Befunde nur, wenn reproduziert:**
  - F-01 wurde gegen den unveränderten `main`-Build nachgestellt (vorher/nachher).
  - F-06 trat im Notfalltest auf.
  - Spekulative Risiken stehen als „akzeptiert/dokumentiert“, nicht als Befund.

## 3. Befundregister

| ID | Komponente | Schwere | Reproduktion | Auswirkung | Behebung | Status | Regressionstest |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **F-01** | Client: Offline-Abmeldung (5.6) | **Mittel** | Zwei Tabs angemeldet → Verbindung trennen → in Tab 1 abmelden → Tab 2 zeigt weiter private Daten; nach Rückkehr der Verbindung ist die Serversitzung weiter gültig (bis zum nächsten App-Start). Gegen `main` gemessen: `tab2StillLoggedIn=true`, Session-Status **200**; nach Fix `false`, **401**. | Abmelden wirkt auf einem gemeinsam genutzten Gerät nicht vollständig; ein zweiter Tab bleibt angemeldet und synchronisiert weiter. | Abmeldesignal an alle Tabs (`storage`-Ereignis), lokales Abmelden dort; ausstehende Server-Abmeldung wird bei `online`, Sichtbarkeitswechsel und alle 30 s nachgeholt (`flushPendingLogout`). | behoben | `offline-sec.cjs` (Browser, 16/16), Reproduktion `repro-f01.cjs` |
| **F-02** | Sitzungsverwaltung | Niedrig | Es gab nur „andere Sitzungen beenden“; die Anmeldemethode einer Sitzung war nicht erkennbar. | Bei Verdacht auf fremden Zugriff keine Ein-Klick-Abmeldung aller Geräte; verdächtige Sitzungen schwer einzuordnen. | `POST /api/auth/sessions/revoke-all`; Spalte `sessions.auth_method` (Migration 009, additiv); Anzeige „mit Passwort / 2FA / Passkey / Wiederherstellungscode“. | behoben | `security57` S2, S4 |
| **F-03** | 2FA aktivieren | **Mittel** | Konto mit zwei Sitzungen → in Sitzung 1 2FA einschalten → Sitzung 2 bleibt gültig. | Wer bereits eine gestohlene Sitzung hat, behält sie, obwohl das Opfer 2FA gerade als Gegenmaßnahme einschaltet. | Beim Einschalten von 2FA werden alle anderen Sitzungen beendet; die aktuelle wird rotiert (Methode bleibt erhalten). | behoben | `security57` S6 |
| **F-04** | Sicherheitsverlauf | Niedrig | Passkey hinzugefügt/entfernt, Abmeldung und fehlgeschlagene Wiederherstellung fehlten in der Nutzeransicht; Aufbewahrung fest 180 Tage. | Nutzende erkennen manipulierte Passkeys nicht im Verlauf; Betreibende können die Aufbewahrung nicht anpassen. | Ereignisse ergänzt (inkl. Faktor); `AUDIT_RETENTION_DAYS` (7–730, Standard 180). | behoben | `security57` E1 |
| **F-05** | Profilbild (Server) | Niedrig | `PATCH /api/social/profile` mit JPEG inkl. EXIF-Block (z. B. GPS) direkt an die API → angenommen, für Freunde sichtbar. Die App selbst kodiert neu und ist nicht betroffen. | Standortdaten können über einen Client an der App vorbei an Freunde gelangen. | Server lehnt EXIF/XMP in JPEG, PNG und WebP ab (415). | behoben | `security57` M1 |
| **F-06** | Rollback-Werkzeug | **Mittel** | Nach Upgrade mit Migration 009: `rollback.sh` empfahl „1) restore.sh, 2) rollback.sh“. `restore.sh` startete die *aktuelle* Version; deren Migrationsjob wendete 009 sofort wieder an → Rollback blieb blockiert. (Die Doku beschrieb den richtigen Weg; die Werkzeugausgabe nicht.) | Fehlgeschlagenes Rollback in einer Stresssituation; Gefahr manueller Fehler. | `restore.sh --version <ziel>` startet direkt mit der Zielversion; Meldungen in `rollback.sh`/`upgrade.sh` und Doku angepasst. | behoben | `dr-57.sh` Schritt 6 (Docker) |
| **F-07** | Kontolöschung (Client) | Niedrig | Nach „Konto löschen“ legte der Abmeldeablauf die gerade gelöschte lokale Datenbank leer neu an; eine Offline-Freigabe blieb gespeichert. Texte im Datenschutz-Center beschrieben noch den Stand vor 5.6. | Leere Reste im Browser, irreführende Datenschutz-Texte. | Löschablauf: Offline-Freigabe entfernen, `logout({ wipeLocal: true })`; Texte aktualisiert (Opt-in, ausstehende Änderungen, Fernlöschung nicht möglich). | behoben | Code-Review; kein automatisierter Test (siehe Matrix) |
| **F-08** | Restore-Test | Niedrig | `restore-test.sh` prüfte die Repository-Integrität nicht ausdrücklich; Beschädigung fiel nur indirekt auf. | Unklare Fehlermeldung bei beschädigtem Backup. | `restic check` vor dem Restore, `restore --verify` (auch in `restore.sh`). | behoben | `dr-57.sh` Schritt 3 (beschädigt → Exit 1 mit klarer Meldung) |

Keine Befunde der Schwere „Hoch“ oder „Kritisch“ gefunden. Insbesondere ergaben gezielte Tests **keine** Lücke bei:
- objektbezogener Autorisierung (fremde Dateien, Sitzungen, Bereiche);
- CSRF und Herkunftsprüfung;
- Massenzuweisung, Pfadmanipulation, Typverwechslung bei Uploads;
- Admin-Endpunkten;
- RLS;
- Klartext in Datenbank oder Dateien;
- Rotation unter Last.

### Akzeptierte bzw. dokumentierte Risiken (keine Befunde)

| ID | Thema | Begründung |
| --- | --- | --- |
| R-01 | `GET /api/auth/username-available` verrät bei offener Registrierung, ob ein Benutzername vergeben ist | Für die Registrierung nötig, ratenbegrenzt, bei Einladungspflicht nur mit gültiger Einladung. Anmeldung, Wiederherstellung und Freundschaftsanfragen verraten nichts. |
| R-02 | Authentifizierungstabellen (`users`, `sessions`, `user_keys`, `recovery_codes`, `webauthn_credentials`, `audit_events`) ohne RLS | Werden vor der Anmeldung gelesen; Inhalte darin sind gehasht (Passwörter, Codes, Session-Token) oder mit dem Master-Key verpackt (Schlüssel). Inhaltstabellen haben RLS. |
| R-03 | Ratenbegrenzungen, 2FA-Zwischenschritte, Passkey-Challenges nur im Arbeitsspeicher einer API-Instanz | Bewusste Ein-Instanz-Architektur; ein Neustart verwirft laufende Anmeldungen (sicherer Ausfall). |
| R-04 | Browser-Arbeitskopie unverschlüsselt | Nur mit Offline-Freigabe über die Sitzung hinaus; ausdrücklich so beschrieben. Siehe Offline-Dokument. |
| R-05 | Kompromittierter Server/Betreiber | Keine Ende-zu-Ende-Verschlüsselung; siehe E2EE-Studie. |
| R-06 | Private Fotos per direktem API-Upload mit Metadaten | Nur eigene Fotos des hochladenden Kontos; die App entfernt Metadaten immer. Beim Teilen in Bereiche werden Server-Blobs kopiert – wer die App umgeht, teilt eigene Metadaten. Siehe Matrix. |

## 4. Geänderte Dateien (Überblick)

- **Server:**
  - Migration `009_session_security.sql`.
  - `sessions.ts`, `login.ts`, `routes/auth.ts` (Methode, revoke-all, 2FA-Sitzungsende).
  - `routes/passkeys.ts`, `routes/account.ts` (Verlauf).
  - `config.ts`, `index.ts` (Aufbewahrung).
  - `social/profiles.ts` (Metadaten).
- **Client:**
  - `app/auth.tsx` (Tab-Signal, Nachholen der Abmeldung).
  - `pages/account/AccountPage.tsx` (Sitzungen, Verlauf, Statusübersicht, Löschablauf, Texte).
- **Deployment:**
  - `backup/restore.sh` (`--version`, `--verify`).
  - `backup/restore-test.sh` (`restic check`, `--verify`).
  - `rollback.sh`, `upgrade.sh` (Meldungen).
  - `docker-compose.yml`, `.env.example` (`AUDIT_RETENTION_DAYS`).
- **Doku:** `DEPLOYMENT.md`, `RUNBOOK.md`, die acht Phase-5.7-Dokumente, SBOM unter `docs/sbom/`.

## 5. Tests und Ergebnisse

| Prüfung | Ergebnis |
| --- | --- |
| Server (Vitest, echte PostgreSQL 16) | **230/230** (vorher 205; neu u. a. 24 in `security57`, 1 Klartext-Scan) |
| Frontend (Vitest) | **288/288** |
| Lint / Typecheck | 0 Fehler (9 bestehende Warnungen in unveränderten Dateien) |
| `npm audit` (Laufzeit, Frontend + Server) | 0 Schwachstellen |
| Browser-Smoke (Lokalmodus) | bestanden |
| Offline-Sicherheit Phase 5.7 (Chromium, echte API) | **16/16** |
| Offline/Mehrkonten Phase 5.6 (Regression) | **26/26** |
| Mobil-Suite (6 Breiten, axe-core 4.x, Update-Ablauf) | **16/16**, 0 axe-Verstöße auf 48 Kombinationen |
| Docker-Notfalltest (Upgrade 5.6→5.7, Beschädigung, falsches Passwort, falscher Master-Key, Rollback über 009, Totalverlust) | bestanden (siehe Disaster-Recovery-Dokument) |

### Performance

Die Änderungen betreffen Anmeldung und Abmeldung, nicht das Laden der App:
- Eine zusätzliche Spalte beim Anlegen der Sitzung.
- Ein `storage`-Listener.
- Eine Prüfung im 30-s-Intervall (liest nur einen localStorage-Eintrag).

Eine messbare Auswirkung auf FCP/LCP ist nicht zu erwarten; es wurde nicht erneut gemessen. Das Einstiegs-Bundle wächst um rund 1 kB (`index` 372 → 373 kB unkomprimiert).

## 6. Browser- und Gerätekompatibilität (ehrlich)

| Umgebung | Status |
| --- | --- |
| Chromium (Playwright, headless): Desktop und mobile Emulation 360–1440 px | geprüft |
| WebKit (Safari-Engine), Firefox | **blockiert** – nicht installiert, Installation per `playwright install` in dieser Umgebung untersagt |
| Physische Geräte (iPhone, iPad, Android) | **nicht geprüft** – keine Geräte verfügbar |

Empfehlung vor 6.0: Abnahme auf mindestens einem iPhone (Safari und installiert), einem Android-Gerät und mit Firefox Desktop. Prüfen:
- Anmeldung mit Passkey;
- Abmelden offline mit zwei Tabs;
- Update-Hinweis;
- Offline-Start;
- Sitzungsübersicht.

## 7. Commits und Pull Request

- `27ce447` – Sitzungen, Offline-Abmeldung über Tabs, Profilbild-Metadaten, Sicherheitsverlauf
- `89e2a42` – Version 5.7.0-rc.1
- `6fd048b` – Backup: Repository-Prüfung und verifizierte Wiederherstellung
- `e92b7c3` – Rollback über Migrationen: `restore.sh --version` (F-06)
- `d696aa1` – Test: Kontoschlüssel-Rotation unter gleichzeitigen Schreibvorgängen
- Dokumentations-Commit, PR-URL und CI-Status: siehe Pull Request (direkt gegen `main`, kein gestapelter PR, kein automatischer Merge, kein Deployment).
