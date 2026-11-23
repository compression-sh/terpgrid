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
| Brute Force | Konto-Backoff (5 freie Versuche, dann exponentiell bis 15 Min., **keine** Dauersperre); IP-Limits Login 30/15 Min., Registrierung 5/Std., Recovery 10/Std. + Konto-Backoff; API 600/Min. | `ratelimit.ts`, `context.ts` | `auth.test.ts` (Backoff, IP-Limits) |
| Enumeration | Gleiche Fehlermeldung und Dummy-Hash für unbekannte Konten (Login, Recovery); Namensprüfung nur mit gültiger Einladung | `routes/auth.ts` | `auth.test.ts` |
| Sessions | Opaque 256-Bit-Token, nur SHA-256 in der DB; `__Host-`-Cookie, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`; Rotation bei Login, Passwort- und 2FA-Änderung; Idle 3 Tage, absolut 30 Tage; Liste, Einzel-/Gesamtwiderruf | `sessions.ts` | `auth.test.ts` |
| Re-Auth | Passwort (+ TOTP, falls aktiv) für Recovery-Codes, 2FA, Export, Kontolöschung, Admin-Aktionen; 10 Min. gültig | `http.ts` | `auth.test.ts`, E2E |
| CSRF | Synchronizer-Token je Session im Header `X-CSRF-Token` (konstante Zeit), `SameSite=Strict`, Origin-Prüfung, Custom-Header für Pre-Auth-Endpunkte | `app.ts` | `auth.test.ts` |
| 2FA | TOTP (RFC 6238, ±1 Schritt), Schlüssel mit Konto-DEK verschlüsselt, Replay-Schutz über letzten Zeitschritt, max. 5 Versuche je Anmeldevorgang | `routes/auth.ts` | `auth.test.ts`, E2E |
| Wiederherstellung | 10 Recovery-Codes (80 Bit) nur einmal angezeigt, HMAC-gespeichert, atomar einmalig; Recovery deaktiviert 2FA und beendet alle Sessions; **kein Generalschlüssel, keine Admin-Hintertür** | `users.ts`, `routes/auth.ts` | `auth.test.ts` |
| Mandantentrennung | Benutzer-ID ausschließlich aus der Server-Session; jede Abfrage `user_id = $1`; PK `(user_id, store, id)`; PostgreSQL-RLS mit `FORCE` (greift auch für den Schema-Owner); App-Rolle ohne `BYPASSRLS` | `db.ts`, `records.ts`, `001_init.sql` | `isolation.test.ts` (A/B: lesen, ändern, löschen, Export, Download, RLS direkt) |
| Verschlüsselung | AES-256-GCM, Envelope (DEK je Konto, mit versioniertem Master-Key verpackt), AAD bindet Konto/Bereich/ID, Format versioniert, KEK-Rotation | `crypto.ts`, `keys.ts` | `crypto.test.ts`, `sync.test.ts` (Rotation), Stack: kein Klartext in DB/Volume/Backup |
| Sync | Optimistische Versionen, Konflikte statt stillem Überschreiben, idempotenter Import (HMAC über kanonisches JSON), Store-Allowlist, ID-Muster, max. 256 KB/Datensatz, 200/Stapel | `records.ts`, `routes/sync.ts` | `sync.test.ts`, Frontend `sync.test.ts` |
| Dateien | Typ nur per Magic Bytes, Art/Varianten-Allowlist, Größenlimit, Quota, zufällige Speichernamen außerhalb des Web-Roots, verschlüsselt, Download nur als `attachment`, `nosniff`, `sandbox`-CSP, `no-store` | `files.ts`, `routes/files.ts` | `sync.test.ts`, `isolation.test.ts` |
| EXIF/GPS | Bilder werden im Browser verkleinert und neu kodiert (Metadaten entfallen) | `src/lib/media/images.ts` | bestehende Tests |
| Katalog-Proxy | Feste Ziel-URLs (kein SSRF), Parameter-Allowlist, keine Redirects, Größen-/Zeitlimits, keine Cookies an Anbieter, Bild-Proxy nur `www.strainapi.com/wp-content/uploads/…` + Magic Bytes, nur für angemeldete Nutzer, gemeinsames CannaLib-Kontingent | `routes/catalog.ts` | `catalog.test.ts` |
| Header | API: `default-src 'none'; sandbox`-CSP, `nosniff`, `no-store`, `DENY`, `no-referrer`; SPA (Caddy): strikte CSP nur `'self'`, HSTS, COOP | `app.ts`, `deploy/Caddyfile` | `auth.test.ts`, Stack-Prüfung |
| Validierung | JSON-Schemas mit `additionalProperties: false` (unbekannte Felder → 400), Body-Limits, Timeouts | `app.ts`, Routen | `auth.test.ts` (z. B. `role: admin` abgelehnt) |
| Admin | Rollenprüfung serverseitig, Re-Auth, nur Metadaten/Kennzahlen, keine Inhalte, letzter Admin nicht löschbar | `routes/admin.ts` | `auth.test.ts`, E2E |
| Logs/Audit | Keine Passwörter, Tokens, Cookies, Inhalte; Einladungs-Token im Pfad geschwärzt (API + Caddy); IP nur als gekürzter HMAC; Audit 180 Tage | `audit.ts`, `app.ts`, `Caddyfile` | `auth.test.ts`, Stack-Logprüfung |
| Browser | Kein Token in localStorage/URL; IndexedDB je Konto; Outbox nie kontoübergreifend; Service Worker cacht nie `/api/*`; Sitzungsablagen beim Abmelden gelöscht | `src/app/auth.tsx`, `public/sw.js` | Frontend `sync.test.ts`, E2E |
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

## 4. Passkeys (WebAuthn) – nächster Schritt, nicht umgesetzt

Geplant mit einer gepflegten Bibliothek (`@simplewebauthn/server` + `@simplewebauthn/browser`): Tabelle `webauthn_credentials (user_id, credential_id, public_key, sign_count, transports, created_at)`, Registrierung nur nach Re-Auth, Anmeldung als zusätzlicher Faktor oder passwortlos, Recovery-Codes bleiben. Bewusst nicht als halbe Lösung eingebaut.

## 5. Abhängigkeiten

`npm audit` vor jedem Release in beiden Paketen (Stand Phase 3: **0 Befunde**, Frontend und Server inkl. Dev-Abhängigkeiten). Versionen sind exakt gepinnt; Lockfiles sind versioniert. Basis-Images mit fester Version (`node:22.21-alpine3.22`, `postgres:16.10-alpine3.22`, `caddy:2.10.2-alpine`) – bei Updates Changelog prüfen und `upgrade.sh` nutzen.

## 6. Bekannte Grenzen

Siehe [THREAT-MODEL.md](THREAT-MODEL.md) (Restrisiken) und `docs/FINAL-REPORT.md` (Einschränkungen). Wichtigste: keine E2EE (Betreiber mit Shell-Zugriff kann entschlüsseln), unverschlüsselte Browser-Kopie, In-Memory-Ratenbegrenzung (eine API-Instanz), Metadaten (Anzahl/Größe/Zeitpunkte) auf dem Server lesbar.

## 7. Sicherheitsprobleme melden

Bitte vertraulich an die Betreiberin/den Betreiber der Instanz bzw. als privates Security Advisory im Repository – nicht als öffentliches Issue.
