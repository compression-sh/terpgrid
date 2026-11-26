# Phase 5.7 – Sicherheits-Verifikationsmatrix

Stand: 5.7.0-rc.1.

**Einstufung:**
- **Verifiziert:** automatisierter Test oder reproduzierbarer Lauf mit Nachweis.
- **Teilweise:** nur einzelne Aspekte oder nur Code-Review.
- **Nicht verifiziert:** nicht geprüft.
- **Nicht anwendbar.**
- **Blockiert:** Prüfung in dieser Umgebung nicht möglich.

Es wird **keine** Konformität oder Zertifizierung behauptet.

**Nachweis-Kürzel:**

| Kürzel | Fundort |
| --- | --- |
| `S57` | `server/test/security57.test.ts` |
| `COL` | `server/test/collab.test.ts` |
| `AUTH` | `server/test/auth.test.ts` |
| `PK` | `server/test/passkeys.test.ts` |
| `ISO` | `isolation*.test.ts` |
| `ROT` | `rotation.test.ts` |
| `CRY` | `crypto.test.ts` |
| `PERM` | `permissions.test.ts` |
| `OFF57` | Browser `offline-sec.cjs` |
| `OFF56` | Browser `e2e-offline.cjs` |
| `MOB` | Mobil-Suite |
| `DR` | Docker `dr-57.sh` |
| `SW` | `service-worker.test.ts` |
| `SPS` | `spaceSync.test.ts` |
| `OFF` | `offline.test.ts` |

## Authentifizierung und Sitzungen

| Anforderung | Komponente | Status | Test | Ergebnis | Grenze | Nachweis |
| --- | --- | --- | --- | --- | --- | --- |
| Argon2id (≥ OWASP), Rehash bei Parameteränderung | `passwords.ts` | umgesetzt | ja | Verifiziert | – | AUTH |
| Passwortrichtlinie (≥ 12, gängige Passwörter, nicht = Kennung) | `passwords.ts` | umgesetzt | ja | Verifiziert | kleine Sperrliste | AUTH |
| Keine Kontoenumeration (Anmeldung, Wiederherstellung) | `routes/auth.ts` | umgesetzt | ja | Verifiziert | R-01 Verfügbarkeitsprüfung | S57 A1, AUTH |
| Gleiche Laufzeit für unbekannte Konten | Dummy-Hash | umgesetzt | teilweise | Teilweise | keine Zeitmessung im Test | Code |
| Ratenbegrenzung (IP, Konto, global, 2FA, Wiederherstellung, Registrierung) | `ratelimit.ts` | umgesetzt | ja | Verifiziert | prozesslokal (R-03) | AUTH |
| Sitzungsfixierung ausgeschlossen | `login.ts` | umgesetzt | ja | Verifiziert | – | S57 S1 |
| Rotation bei Anmeldung und Rechteänderung | `login.ts` | umgesetzt | ja | Verifiziert | – | S57 S6, AUTH |
| Abmelden beendet Serversitzung | `routes/auth.ts` | umgesetzt | ja | Verifiziert | – | S57 S5 |
| Abmelden offline, mehrere Tabs | `app/auth.tsx` | **5.7 behoben (F-01)** | ja | Verifiziert (Chromium) | Server erst bei nächstem Kontakt | OFF57 |
| Kontowechsel ohne Datenübernahme | `offline.ts`, `auth.tsx` | umgesetzt | ja | Verifiziert (Chromium) | – | OFF56, OFF57 |
| Passwortwechsel beendet andere Sitzungen | `routes/auth.ts` | umgesetzt | ja | Verifiziert | – | S57 A4 |
| 2FA einschalten beendet andere Sitzungen | `routes/auth.ts` | **5.7 (F-03)** | ja | Verifiziert | – | S57 S6 |
| Sitzungsübersicht mit Methode, Einzel-/Rest-/Gesamtwiderruf | Auth, Konto-UI | **5.7 (F-02)** | ja | Verifiziert | Gerät nur aus gekürztem User-Agent (kein Fingerprinting) | S57 S2–S4 |
| Gesperrtes Konto: Sitzungen enden sofort | `sessions.ts` | umgesetzt | ja | Verifiziert | – | S57 S7 |
| Wiederherstellung: Code einmalig, gehasht, beendet Sitzungen, entfernt Passkeys und 2FA | `routes/auth.ts` | umgesetzt | ja | Verifiziert | – | S57 A3, AUTH |
| Pseudonyme Konten, keine E-Mail/Telefonnummer, Kennung ≠ Handle | Identität | umgesetzt | ja | Verifiziert | – | AUTH, COL |
| Admin-Anmeldung wie Nutzende + Re-Auth für sensible Aktionen | Auth | umgesetzt | ja | Verifiziert | – | AUTH |

## Passkeys und TOTP

| Anforderung | Status | Ergebnis | Grenze | Nachweis |
| --- | --- | --- | --- | --- |
| Challenge zufällig, einmalig, 5 Min. gültig | umgesetzt | Verifiziert | Speicher einer Instanz | PK |
| Origin und RP-ID geprüft, User Verification verlangt | umgesetzt | Verifiziert | – | PK |
| Credential an genau ein Konto gebunden; Zähler gegen Klone | umgesetzt | Verifiziert | Zähler 0 (Plattform-Passkeys) ohne Klonerkennung – Standardverhalten | PK |
| Registrierung und Entfernen nur mit Re-Auth; mehrere Geräte | umgesetzt | Verifiziert | – | PK |
| TOTP ±1 Schritt, Replay-Schutz, verschlüsseltes Geheimnis | umgesetzt | Verifiziert | – | AUTH |
| Keine Biometrie-Aussagen; deutsche Erklärung | umgesetzt (5.6/5.7) | Verifiziert (Texte) | – | UI |
| Passkeys auf echten Geräten (Face ID, Android, Sicherheitsschlüssel) | – | **Blockiert** | keine Geräte | – |

## Verschlüsselung und Schlüssel

| Anforderung | Status | Ergebnis | Nachweis |
| --- | --- | --- | --- |
| AES-256-GCM, zufällige Nonce, AAD-Bindung, Manipulationserkennung | umgesetzt | Verifiziert | CRY |
| Kein Klartext in Tabellen und Dateien (alle Tabellen, alle Blobs) | umgesetzt | Verifiziert | COL (5.7) |
| Kein Klartext in Logs und Fehlerantworten | umgesetzt | Teilweise (Code + C4) | S57 C4, Code |
| Master-Key-Rotation, Konto- und Bereichsrotation, Unterbrechung | umgesetzt | Verifiziert | ROT, COL |
| Rotation unter gleichzeitigen Schreibvorgängen | umgesetzt | Verifiziert (5.7) | S57 K1 |
| Wiederherstellung nach Rotation | umgesetzt | Verifiziert (frühere Phasen) | DR 4.x/5.x |
| Keine automatische Produktionsrotation | umgesetzt | Verifiziert (keine Timer) | DR |

## Autorisierung, RLS und API

| Anforderung | Status | Ergebnis | Grenze | Nachweis |
| --- | --- | --- | --- | --- |
| BOLA/IDOR private Daten und Dateien | umgesetzt | Verifiziert | – | ISO, S57 D1 |
| Rechtematrix aller Rollen (Eigentümer, Bearbeiten, Kommentieren, Ansehen, Außenstehend) | umgesetzt | Verifiziert | – | COL, PERM |
| Verschachtelte Ressourcen, Zugriffsstufen, Dateien, Kommentare, Exporte | umgesetzt | Verifiziert | – | COL |
| Widerruf, Herabstufung, Blockieren, Löschen, Eigentumsübertragung | umgesetzt | Verifiziert | Kopien beim Empfänger nicht fernlöschbar | COL, SPS |
| Offline-Änderungen nach Widerruf abgelehnt | umgesetzt | Verifiziert | – | COL, SPS |
| RLS: ohne Kontext keine Zeilen, fremder Kontext keine fremden Zeilen, `WITH CHECK` | umgesetzt | Verifiziert | Auth-Tabellen ohne RLS (R-02) | S57 R1, COL |
| Laufzeitrolle ohne BYPASSRLS, Superuser oder DDL-Rechte | umgesetzt | Verifiziert | – | S57 R2 |
| CSRF (Token), Origin-Prüfung, Pre-Auth-Header | umgesetzt | Verifiziert | – | S57 C1, C2 |
| Massenzuweisung (`additionalProperties: false`) | umgesetzt | Verifiziert (Stichprobe) | – | S57 A2 |
| Falsche Inhaltstypen, übergroße Anfragen | umgesetzt | Verifiziert | – | S57 C3 |
| SQL-Injection | parametrisiert | Teilweise (Code) | kein Fuzzing | Code |
| Stored/Reflected XSS | React-Escaping + CSP | Teilweise (Code, CSP) | kein Fuzzing | Code |
| SSRF und Open Redirect (Katalog-Proxy) | feste Ziele, `redirect: 'error'` | Verifiziert (frühere Phasen) | – | `catalog.test.ts` |
| Pagination- und Ressourcenmissbrauch | Limits (`limit ≤ 500`, Quotas, Body-Limits) | Teilweise | – | Code, `sync.test.ts` |
| Endpunkt-Inventar mit Anforderungen | – | Teilweise | Inventar in dieser Matrix nur nach Gruppen; alle 28 Bereichsrouten in COL | COL |

## Medien und externe Quellen

| Anforderung | Status | Ergebnis | Grenze | Nachweis |
| --- | --- | --- | --- | --- |
| Typprüfung per Signatur, SVG/HTML abgelehnt, Größen und Quota | umgesetzt | Verifiziert | – | S57 D1 |
| Private Dateien: attachment, no-store, Sandbox-CSP, nie öffentlich adressierbar | umgesetzt | Verifiziert | – | S57 D2, COL |
| Metadaten-Entfernung (App) | umgesetzt | Verifiziert | – | `exif.test.ts`, `media.test.ts` |
| Metadaten im Profilbild (Server) | **5.7 (F-05)** | Verifiziert | – | S57 M1 |
| Metadaten in privaten Fotos bei direktem API-Upload | – | Nicht verifiziert (bewusst) | R-06 | – |
| Externe Anbieter erhalten keine Nutzerdaten | umgesetzt | Verifiziert (frühere Phasen) | – | `catalog.test.ts` |
| Katalogimport: Prüfsumme, Transaktion | umgesetzt | Verifiziert (frühere Phasen) | – | `cisp.test.ts`, `samples.test.ts` |
| Katalog-Aktualisierungstimer deaktiviert | umgesetzt | Verifiziert | – | DR |

## Administration und Protokoll

| Anforderung | Status | Ergebnis | Nachweis |
| --- | --- | --- | --- |
| Admin-Endpunkte nur für Admins | umgesetzt | Verifiziert | S57 V1 |
| Admin-Antworten ohne Hashes, Schlüssel, Tokens, Codes | umgesetzt | Verifiziert | S57 V2 |
| Sicherheitsverlauf ohne Inhalte; IP nur als HMAC; Aufbewahrung einstellbar | **5.7 (F-04)** | Verifiziert | S57 E1 |
| Trennung Nutzeransicht ↔ Betriebsdiagnose | umgesetzt | Verifiziert | Code, S57 |

## Offline und Gerät

| Anforderung | Status | Ergebnis | Grenze | Nachweis |
| --- | --- | --- | --- | --- |
| Offline-Speicher nur als Opt-in | umgesetzt | Verifiziert (Chromium) | – | OFF56, OFF |
| Keine privaten Daten im SW-Cache | umgesetzt | Verifiziert | – | SW, OFF57 |
| Keine Schlüssel im Browser | umgesetzt | Verifiziert (Inventar) | – | OFF57 |
| Ausstehende Änderungen nie still verworfen; nicht für andere Konten | umgesetzt | Verifiziert (Chromium) | Browser-Speicher unverschlüsselt | OFF56 |
| Kontolöschung räumt lokal auf | **5.7 (F-07)** | Teilweise (Code-Review) | kein automatisierter Test | Code |
| WebKit/Firefox | – | **Blockiert** | `playwright install` untersagt | – |
| Physische Geräte | – | **Blockiert** | keine Geräte | – |

## Deployment und Wiederherstellung

| Anforderung | Status | Ergebnis | Nachweis |
| --- | --- | --- | --- |
| Container: non-root, read-only, `cap_drop ALL`, `no-new-privileges`, Limits, Healthchecks, kein Docker-Socket | umgesetzt | Verifiziert (Konfiguration + CI „Laufzeitbenutzer prüfen“) | `docker-compose.yml`, CI |
| DB ohne veröffentlichten Port, internes Netz | umgesetzt | Verifiziert | Compose, DR |
| Security-Header (CSP, HSTS, Permissions-Policy, nosniff, Frame) | umgesetzt | Verifiziert (frühere Phasen, Header-Prüfung im Upgrade-Test 5.6) | – |
| Upgrade 5.6 → 5.7 ohne Datenänderung | umgesetzt | Verifiziert | DR 1 |
| Beschädigtes Backup / falsches Passwort / falscher Master-Key erkannt | **5.7 (F-08)** | Verifiziert | DR 3–5 |
| Rollback über Migration | **5.7 (F-06)** | Verifiziert | DR 6 |
| Totalverlust → frische Installation | umgesetzt | Verifiziert | DR 7 |
| Host (SSH, nftables, CrowdSec, Updates) | Leitfaden | Nicht verifiziert (kein Zugriff auf den VPS – bewusst) | `PHASE5-7-VPS-HARDENING.md` |

## Abhängigkeiten und Lieferkette

| Anforderung | Status | Ergebnis | Nachweis |
| --- | --- | --- | --- |
| `npm audit` (Laufzeit) | 0 Schwachstellen | Verifiziert | CI, lokal |
| Lockfiles, `npm ci` | umgesetzt | Verifiziert | CI |
| GitHub Actions auf Commit-SHA gepinnt | umgesetzt | Verifiziert | `ci.yml` |
| Basis-Images auf Version gepinnt (CI-Postgres zusätzlich per Digest) | umgesetzt | Teilweise (Produktions-Images ohne Digest) | Dockerfiles |
| SBOM (CycloneDX, Laufzeit) | **5.7** | Verifiziert | `docs/sbom/` (72 Frontend-, 115 Server-Komponenten) |
| Keine unnötigen Abhängigkeiten | geprüft | Verifiziert (alle 17 direkten Laufzeitabhängigkeiten genutzt) | `npm ls --omit dev` |
