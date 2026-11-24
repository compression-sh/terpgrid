# TERPGRID – Sicherheit

Grundlage: OWASP ASVS 5.0 und die OWASP Cheat Sheets (Password Storage, Authentication, Session Management, CSRF, File Upload, SSRF, Docker). Bedrohungen und Restrisiken: [THREAT-MODEL.md](THREAT-MODEL.md). Verschlüsselungsmodell: [E2EE-DECISION.md](E2EE-DECISION.md).

**Grundsatz:** Hier steht nur, was umgesetzt **und** getestet ist. TERPGRID ist **nicht** „100 % anonym“, **nicht** „unhackbar“ und **nicht** Ende-zu-Ende-verschlüsselt.

## 1. Umgesetzte Maßnahmen und Nachweise

| Bereich | Maßnahme | Code | Test |
| --- | --- | --- | --- |
| Konten | Benutzername **oder** generierte Konto-ID (CSPRNG, 100 Bit), optionaler Anzeigename; keine E-Mail/Telefon/Klarname; Altersbestätigung | `server/src/identity.ts`, `routes/auth.ts` | `auth.test.ts` |
| Registrierung | Invite-only als Standard; Einladungen HMAC-gespeichert, einmalig (atomar verbraucht), ablaufend, widerrufbar | `routes/auth.ts`, `routes/admin.ts` | `auth.test.ts` (Einladungen) |
| Passwörter | Argon2id (`@node-rs/argon2`), eindeutiger Salt je Hash, PHC-Format mit Parametern; Rehash bei Parameteränderung; min. 12 / max. 256 Zeichen, Liste häufiger Passwörter, kein Benutzername im Passwort | `passwords.ts` | `auth.test.ts`; Rehash im Stack geprüft |
| Argon2-Parameter | Untergrenze OWASP (19 MiB, t=2, p=1); Compose-Standard 64 MiB, t=3; max. 2 gleichzeitige Hashes (Überlastschutz, 503 bei Sättigung) | `config.ts`, `passwords.ts` | `config.test.ts` |
| Brute Force | Backoff je **Kennung + IP** (5 freie Versuche, dann exponentiell bis 15 Min., keine Dauersperre) – Fehlversuche eines Angreifers sperren das Opfer nicht an anderen IPs aus; zusätzlich kontoweiter Backoff ab 50 Fehlversuchen (verteilte Angriffe); IP-Limits Login 30/15 Min., Registrierung 5/Std., Recovery 10/Std. + Konto-Backoff; API 600/Min. | `ratelimit.ts`, `context.ts`, `routes/auth.ts` | `auth.test.ts` (Backoff, Aussperr-Schutz, verteilte Angriffe, IP-Limits) |
| Enumeration | Gleiche Fehlermeldung und Dummy-Hash für unbekannte Konten (Login, Recovery); Namensprüfung nur mit gültiger Einladung | `routes/auth.ts` | `auth.test.ts` |
| Sessions | Opaque 256-Bit-Token, nur SHA-256 in der DB; `__Host-`-Cookie, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`; Rotation bei Login, Passwort- und 2FA-Änderung; Idle 3 Tage, absolut 30 Tage; Liste, Einzel-/Gesamtwiderruf | `sessions.ts` | `auth.test.ts` |
| Re-Auth | Passwort (+ TOTP, falls aktiv) für Recovery-Codes, 2FA, Export, Kontolöschung, Admin-Aktionen; 10 Min. gültig | `http.ts` | `auth.test.ts`, E2E |
| CSRF | Synchronizer-Token je Session im Header `X-CSRF-Token` (konstante Zeit), `SameSite=Strict`, Origin-Prüfung, Custom-Header für Pre-Auth-Endpunkte | `app.ts` | `auth.test.ts` |
| 2FA | TOTP (RFC 6238, ±1 Schritt), Schlüssel mit Konto-DEK verschlüsselt, Replay-Schutz über letzten Zeitschritt, max. 5 Versuche je Anmeldevorgang **und** kontoweite Grenze für falsche Codes über alle Anmeldevorgänge, Re-Auth und 2FA-Aktivierung (verhindert Durchprobieren mit neuen Anmeldevorgängen) | `routes/auth.ts` | `auth.test.ts` (inkl. MFA-Brute-Force-Regression), E2E |
| Passkeys | WebAuthn über `@simplewebauthn/server` 14.0.3 / `@simplewebauthn/browser` 14.0.0 (keine eigene Kryptografie); Registrierung nur mit Session + Re-Auth; residentKey + User Verification erforderlich; Anmeldung ohne Kennung (keine Enumeration); Server prüft Challenge (einmalig, 5 Min., an Session/Flow gebunden), Origin, RP-ID, UV, Signatur, Zähler; Credential-ID eindeutig an ein Konto gebunden; mehrere Passkeys, umbenennen/entfernen mit Re-Auth; Recovery entfernt alle Passkeys | `routes/passkeys.ts`, `src/lib/server/passkeys.ts` | `passkeys.test.ts` (Software-Authenticator: Replay, falsche Origin/RP-ID, ohne UV, Zähler-Rückschritt, Credential-Substitution, fremde Challenge, Re-Auth), Browser-E2E mit virtuellem Authenticator |
| Wiederherstellung | 10 Recovery-Codes (80 Bit) nur einmal angezeigt, HMAC-gespeichert, atomar einmalig; Recovery deaktiviert 2FA, entfernt Passkeys und beendet alle Sessions; **kein Generalschlüssel, keine Admin-Hintertür** | `users.ts`, `routes/auth.ts` | `auth.test.ts`, `passkeys.test.ts` |
| Mandantentrennung | Benutzer-ID ausschließlich aus der Server-Session; jede Abfrage `user_id = $1`; PK `(user_id, store, id)`; PostgreSQL-RLS mit `FORCE` (greift auch für den Schema-Owner); App-Rolle ohne `BYPASSRLS` | `db.ts`, `records.ts`, `001_init.sql` | `isolation.test.ts`, `isolation-all.test.ts`: jeder der 12 Bereiche einzeln (lesen/überschreiben/löschen mit geratenen Versionen, manipulierte `userId`/`user_id`-Felder, beliebige Cursor), verschachtelte/kodierte Datei-Pfade (gleiche 404-Antwort für „fremd“ und „gibt es nicht“), Paging-Grenzen, Export; **Nachweis per SQL-Mitschnitt, dass jede Abfrage auf `records`/`files` in echten Requests mit gesetztem RLS-Kontext läuft** |
| Verschlüsselung | AES-256-GCM, Envelope (DEK je Konto, mit versioniertem Master-Key verpackt), AAD bindet Konto/Bereich/ID, Format versioniert, KEK-Rotation über alle Generationen | `crypto.ts`, `keys.ts`, `userkeys.ts` | `crypto.test.ts`, `sync.test.ts` (Rotation), Stack: kein Klartext in DB/Volume/Backup |
| DEK-Rotation je Konto | Versionierte Schlüsselgenerationen (`user_keys`), `dek_gen` an jeder Zeile; Rotation in kleinen Transaktionen, jederzeit abbrechbar und fortsetzbar, Prüfung aller Inhalte vor dem Ausmustern; alte Schlüssel nur per `purge-retired-keys` nach Frist und ohne Verwendung gelöscht; Kontolöschung vernichtet alle Schlüssel (Krypto-Shredding) | `rotation.ts`, `003_user_key_generations.sql` | `rotation.test.ts` (vollständig, unterbrochen + fortgesetzt, falscher/beschädigter Schlüssel, andere Konten unberührt, Purge-Regeln), Stack-Test |
| Sync | Optimistische Versionen, Konflikte statt stillem Überschreiben, idempotenter Import (HMAC über kanonisches JSON), Store-Allowlist, ID-Muster, max. 256 KB/Datensatz, 200/Stapel | `records.ts`, `routes/sync.ts` | `sync.test.ts`, Frontend `sync.test.ts` |
| Dateien | Typ nur per Magic Bytes, Art/Varianten-Allowlist, Größenlimit, Quota, zufällige Speichernamen außerhalb des Web-Roots, verschlüsselt, Download nur als `attachment`, `nosniff`, `sandbox`-CSP, `no-store`; ersetzte/gelöschte Blobs erst nach Frist gelöscht (Papierkorb, Backup-Konsistenz) | `files.ts`, `routes/files.ts` | `sync.test.ts`, `isolation.test.ts`, `isolation-all.test.ts` |
| EXIF/GPS | Bilder werden im Browser verkleinert und neu kodiert (Metadaten entfallen) | `src/lib/media/images.ts` | bestehende Tests |
| Katalog-Proxy | Feste Ziel-URLs (kein SSRF), Parameter-Allowlist, keine Redirects, Größen-/Zeitlimits, keine Cookies an Anbieter, Bild-Proxy nur `www.strainapi.com/wp-content/uploads/…` + Magic Bytes, nur für angemeldete Nutzer, gemeinsames CannaLib-Kontingent; Fehler der Quelle (z. B. Firewall-403 mit HTML) werden nie durchgereicht, sondern als eigenes JSON gemeldet | `routes/catalog.ts` | `catalog.test.ts`, Live-E2E gegen StrainAPI |
| Header | API: `default-src 'none'; sandbox`-CSP, `nosniff`, `no-store`, `DENY`, `no-referrer`; SPA (Caddy): strikte CSP nur `'self'`, HSTS, COOP | `app.ts`, `deploy/Caddyfile` | `auth.test.ts`, Stack-Prüfung |
| Validierung | JSON-Schemas mit `additionalProperties: false` (unbekannte Felder → 400), Body-Limits, Timeouts | `app.ts`, Routen | `auth.test.ts` (z. B. `role: admin` abgelehnt) |
| Admin | Rollenprüfung serverseitig, Re-Auth, nur Metadaten/Kennzahlen, keine Inhalte, letzter Admin nicht löschbar | `routes/admin.ts` | `auth.test.ts`, E2E |
| Logs/Audit | Keine Passwörter, Tokens, Cookies, Inhalte; Einladungs-Token im Pfad geschwärzt (API + Caddy); IP nur als gekürzter HMAC; Audit 180 Tage | `audit.ts`, `app.ts`, `Caddyfile` | `auth.test.ts`, Stack-Logprüfung |
| Browser | Kein Token in localStorage/URL; IndexedDB je Konto; Outbox nie kontoübergreifend; THC-Lab-Entwürfe je Konto (nie gerätweit); Service Worker cacht nie `/api/*`; Sitzungsablagen und Foto-Cache im Speicher beim Abmelden/Kontowechsel geleert; Modus „Geteiltes Gerät“ (lokale Kopie beim Abmelden immer gelöscht, keine gemerkte Kennung) | `src/app/auth.tsx`, `src/lib/device.ts`, `public/sw.js` | Frontend `sync.test.ts`, E2E (u. a. fremdes Konto auf demselben Gerät) |
| Sortenkatalog (5.0) | Öffentliche Referenzdaten in eigenen Tabellen ohne Personenbezug; Import nur mit Owner-Rolle nach SHA-256-Prüfung (eine Transaktion); Laufzeitrolle nur `SELECT`; API nur angemeldet; Parameter per Allowlist/Regex, `LIKE`-Platzhalter maskiert, alle Abfragen parametrisiert | `catalog/*.ts`, `routes/library.ts`, Migration 005 | `library.test.ts` (Auth, Rechte der App-Rolle, `%`/SQL-Zeichen, fehlgeschlagener Import ändert nichts), `cisp.test.ts` |
| Betrieb/Monitoring | Schema-Schutz beim Start (DB neuer als Programm → Start verweigert), Preflight, Upgrade mit Backup-Pflicht, Rollback mit Schemaprüfung, System Health ohne personenbezogene Daten (nur Admins) | `migrate.ts`, `metrics.ts`, `deploy/*.sh` | `auth.test.ts` (Schema, System Health), Stack-Tests (Upgrade 3.0→4.0, Rollback, Restore) |
| CI | GitHub Actions mit `contents: read`, ohne Secrets, `pull_request` (nicht `pull_request_target`), Actions per SHA, Images per Digest; Lint, Tests, Audit, gitleaks über die gesamte Historie | `.github/workflows/ci.yml`, `.gitleaks.toml` | lokal ausgeführt (alle Schritte grün) |
| Betrieb | Container nicht-root, read-only, `cap_drop: ALL`, `no-new-privileges`, Limits, kein Docker-Socket, DB ohne Port/Internet, Secrets als Dateien | `deploy/` | Stack-Prüfung (FINAL-REPORT) |
| Backups | restic (verschlüsselt), Aufbewahrung, `check`, isolierter Restore-Test mit vollständiger Entschlüsselung | `deploy/backup/` | Restore-Test im Stack, falscher Schlüssel erkannt |

## 2. Argon2id-Messung

Gemessen im Produktions-Container (`node dist/cli.js bench-argon2`, 4 vCPU):

| Parameter | Zeit je Hash |
| --- | --- |
| m=19456 KiB, t=2, p=1 (OWASP-Minimum) | 14 ms |
| **m=65536 KiB, t=3, p=1 (Compose-Standard)** | **68 ms** |
| m=131072 KiB, t=3, p=1 | 167 ms |

Auf schwächeren VPS selbst messen; Ziel 50–250 ms. Höhere Werte werden bei der nächsten Anmeldung automatisch übernommen (Rehash).

## 3. Secrets – Regeln

* Keine Zugangsdaten im Code, keine Schlüssel im Git (`deploy/secrets/`, `.env`, `backup.env` sind in `.gitignore`), keine Secrets im Frontend-Bundle (geprüft), keine Secrets in Logs (geprüft).
* Keine Produktions-Debug-Endpunkte, keine Entwicklungs-Bypässe: `COOKIE_INSECURE_DEV` und HTTP werden mit `NODE_ENV=production` beim Start abgelehnt.
* Kein Standard-Admin, kein Standardpasswort, kein Master-Passwort.
* Rotation: siehe [DEPLOYMENT.md → Schlüsselrotation / Rotation weiterer Secrets](DEPLOYMENT.md).

## 4. Passkeys (WebAuthn) – umgesetzt in 4.0

Siehe Tabelle oben. Eine Anmeldung mit Passkey (Besitz + Biometrie/PIN durch User Verification) ersetzt Passwort **und** TOTP-Code. Re-Authentifizierung für sensible Aktionen erfolgt weiterhin per Passwort (+ TOTP). Grenzen: Synchronisierte Passkeys (z. B. iCloud-Schlüsselbund, Passwort-Manager) liegen beim jeweiligen Anbieter; der Server sieht nur den öffentlichen Schlüssel und ob ein Passkey synchronisiert wird (`backedUp`). Attestation wird bewusst nicht geprüft (`none`), d. h. jeder standardkonforme Authenticator wird akzeptiert.

### Empfohlene Repository-Einstellungen (nicht automatisch gesetzt)

Branch-Schutz für `main`: Pull Requests verpflichtend, Status-Checks „Frontend“, „Backend“, „Browser-Smoke-Test“, „Deployment-Konfiguration“ und „Secret-Scan“ müssen bestehen, keine Force-Pushes, Zusammenführen nur nach Review. Diese Einstellungen erfordern Admin-Rechte im Repository und wurden nicht verändert.

## 5. Abhängigkeiten

`npm audit` vor jedem Release in beiden Paketen (Stand 5.0.0-rc.1: **0 Befunde**, Frontend und Server inkl. Dev-Abhängigkeiten; minimatch in der Lint-Kette per `overrides` auf die gepatchte 11.0.2 gesetzt). In der CI läuft `npm audit --audit-level=moderate`. Versionen sind exakt gepinnt; Lockfiles sind versioniert. Basis-Images mit fester Version (`node:22.21-alpine3.22`, `postgres:16.10-alpine3.22`, `caddy:2.10.2-alpine`) – bei Updates Changelog prüfen und `upgrade.sh` nutzen.

## 6. Bekannte Grenzen

Siehe [THREAT-MODEL.md](THREAT-MODEL.md) (Restrisiken) und `docs/FINAL-REPORT.md` (Einschränkungen). Wichtigste: keine E2EE (Betreiber mit Shell-Zugriff kann entschlüsseln), unverschlüsselte Browser-Kopie, In-Memory-Ratenbegrenzung (eine API-Instanz), Metadaten (Anzahl/Größe/Zeitpunkte) auf dem Server lesbar.

## 7. Sicherheitsprobleme melden

Bitte vertraulich an die Betreiberin/den Betreiber der Instanz bzw. als privates Security Advisory im Repository – nicht als öffentliches Issue.
