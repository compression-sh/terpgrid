# TERPGRID – Architektur (Phase 3: Private Cloud & Multiuser)

Stand: 23.11.2026 · gilt für den Code in diesem Repository (Version 3.0.0, Phase 3 umgesetzt).

## 1. Bestandsaufnahme (Audit vor Phase 3)

| Bereich | Befund |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 6, Tailwind 4, Recharts, fflate. Hash-Router (`src/app/router.ts`). Kein SSR. |
| Persistenz | IndexedDB `terpgrid`, Schema v2 (`src/lib/db/database.ts`). Stores: `grows, plants, activities, photos, photoData, reminders, strains, journal, inventory, expenses, calculations, settings, labReports, labDocs, apiCache`. |
| Weitere lokale Speicher | `localStorage`: THC-Lab-Eingaben (`cannabisrechner.*`), Tab-Zustand, Hinweis-Flags. `sessionStorage`: Vergleichsablage, „Gesamtkatalog geladen“. |
| Schreibpfade | Alle Datensatz-Schreibvorgänge laufen über `putOne`/`writeBatch` in `database.ts` (Repository `repo.ts`, Backup-Restore, Migrationen, Lab Insights, THC Lab). Das ist der zentrale Ansatzpunkt für die Synchronisation. |
| Beziehungen | `plants.growId → grows`, `activities.growId/plantId`, `photos.growId/plantId/strainId/journalId/inventoryId`, `photoData.id = photos.id`, `plants/journal/inventory/labReports.strainId → strains`, `strains.externalKey` (StrainAPI), `labReports.documentId → labDocs`, `reminders.growId/plantId`, `expenses.growId`, `inventory.growId`. Kaskaden in `repo.ts`. |
| Externe APIs | StrainAPI (öffentlich, CORS `*`), CannaLib (anonym 20/h). Direkt aus dem Browser; Cache in `apiCache`. |
| Authentifizierung / Backend | Nicht vorhanden. Keine Secrets im Code. |
| Sicherheitsrisiken (alt) | Alle Daten unverschlüsselt im Browser; kein Schutz bei gemeinsam genutzten Geräten; kein Multiuser; Backup-ZIP unverschlüsselt. |

## 2. Zielarchitektur

```
 Browser (React SPA, PWA)                    VPS (Docker Compose)
 ┌──────────────────────────┐   HTTPS     ┌──────────────────────────────────────────┐
 │ UI · IndexedDB je Konto  │◀──────────▶│ Caddy (TLS, HSTS, Header, statische SPA) │
 │ Sync-Engine (Outbox)     │  /api/*     │      │ reverse_proxy (internes Netz)      │
 └──────────────────────────┘             │      ▼                                    │
                                          │ API (Node 22 · Fastify · non-root)        │
                                          │  Auth · Sessions · Records · Dateien      │
                                          │  Envelope-Verschlüsselung (AES-256-GCM)   │
                                          │  Katalog-Proxy (StrainAPI/CannaLib)       │
                                          │      │ internes Netz      │ Volume        │
                                          │      ▼                    ▼               │
                                          │ PostgreSQL 16 (RLS)   /data/files (verschl.)│
                                          │ Master-Key: Docker-Secret-Datei (ro)      │
                                          └──────────────────────────────────────────┘
                                          restic → Offsite-Repository (verschlüsselt)
```

* **Ein** API-Prozess, **eine** Datenbank, **ein** Reverse Proxy. Keine Microservices, keine Queues.
* Die SPA bleibt weitgehend unverändert: Sie arbeitet weiter gegen IndexedDB – jetzt **eine Datenbank pro Konto** (`terpgrid-u-<hash>`) – und eine Sync-Engine gleicht mit dem Server ab.

## 3. Datenmodell (Server)

Generisches, eigentümergebundenes Datensatzmodell statt 13 einzelner Tabellen: Es bildet die vorhandenen IndexedDB-Stores 1:1 ab, erhält alle Beziehungen (IDs bleiben gleich) und verschlüsselt den gesamten Inhalt.

| Tabelle | Inhalt |
| --- | --- |
| `users` | interne UUID, `login_name` (Benutzername **oder** generierte Konto-ID, normalisiert, eindeutig), `display_name`, `role`, `status`, Argon2id-PHC-Hash, verschlüsselter TOTP-Schlüssel, verpackter Daten-Schlüssel (DEK) + Key-Version, Altersbestätigung |
| `sessions` | SHA-256 des Session-Tokens (Token selbst nie gespeichert), CSRF-Secret, Ablauf (absolut/idle), Re-Auth-Zeitpunkt, gekürzter User-Agent |
| `recovery_codes` | HMAC-SHA-256 je Code (Schlüssel aus HMAC_SECRET), `used_at` |
| `invitations` | HMAC-SHA-256 des Tokens (Schlüssel aus HMAC_SECRET), Ablauf, Nutzung, Widerruf |
| `records` | `(user_id, store, id)` PK, `version`, `seq` (globale Sequenz für Pull), `deleted`, `payload` (AES-256-GCM), `payload_mac` (HMAC für idempotenten Import) |
| `files` | `(user_id, kind, id, variant)` PK, Größe, MIME (per Magic Bytes geprüft) – Inhalt mit dem Konto-DEK verschlüsselt im Dateisystem unter zufälligem 48-Hex-Namen |
| `audit_events` | Typ, Zeit, Benutzer, gekürzter IP-HMAC, Metadaten **ohne** Secrets/Inhalte |
| `schema_migrations` | versionierte SQL-Migrationen |

**Row Level Security** auf `records` und `files`: Die App verbindet sich als Rolle `terpgrid_app` (kein Owner, kein `BYPASSRLS`); jede Anfrage mit Benutzerkontext setzt in einer Transaktion `SET LOCAL app.user_id`. Zusätzlich enthält **jede** Abfrage `user_id = $1` (Defense in Depth).

## 4. Synchronisation

* **Push** `POST /api/sync/push`: Änderungen mit `baseVersion`. Der Server schreibt nur, wenn die gespeicherte Version übereinstimmt (optimistische Nebenläufigkeit), sonst **409/Konflikt** mit Serverstand. Kein stilles Überschreiben.
* **Pull** `GET /api/sync/changes?since=<seq>`: alle eigenen Änderungen inkl. Löschmarken, seitenweise.
* **Outbox** im Browser (Store `outbox`): Änderungen bleiben gespeichert, bis der Server bestätigt. Gehört fest zur Konto-Datenbank – bei Kontowechsel wird nie die Outbox eines anderen Kontos hochgeladen.
* **Binärdaten** (Fotos, Laborberichte): Upload/Download einzeln, verschlüsselt gespeichert, Download nur mit Session + Eigentum; Fotos werden bei Bedarf nachgeladen.
* **Konflikte** erscheinen im Sync-Status; Auflösung bewusst durch den Nutzer („Meine Version behalten“ / „Server-Version übernehmen“).

## 5. Migration lokaler Daten

Nach dem Login erkennt die App die alte Datenbank `terpgrid` (Einzelnutzer). Vorschau mit Anzahl je Bereich → Hinweis, welches Konto die Daten erhält → ausdrückliche Bestätigung → Kopie in die Konto-Datenbank + Upload mit `mode: import` (idempotent über `payload_mac`) → Zählung/Prüfung → optionales Aufräumen erst nach Bestätigung. Ein lokales ZIP-Backup kann vorher erstellt werden.

## 6. Externe Daten

StrainAPI und CannaLib laufen im Servermodus über einen **festen** Proxy (`/api/catalog/...`): fester Zielhost, Pfad- und Parameter-Allowlist, Größen-/Zeitlimits, keine Weiterleitung von Cookies, Bild-Proxy nur für `www.strainapi.com/wp-content/uploads/…` mit MIME-Prüfung. Persönliche Daten werden nie an die Anbieter gesendet. CannaLib-Kontingent ist für alle Nutzer der Instanz gemeinsam.

## 7. Betriebsmodi

* **Servermodus** (Standard bei Self-Hosting): Login erforderlich.
* **Lokalmodus** (Fallback, wenn kein Backend erreichbar ist, z. B. reine Vite-Entwicklung): bisheriges Verhalten mit der alten lokalen Datenbank – ausdrücklich als „nur auf diesem Gerät“ gekennzeichnet.

## 8. Umsetzung im Repository

| Teil | Ort |
| --- | --- |
| API (Fastify, Routen, Hooks) | `server/src/app.ts`, `server/src/routes/{auth,account,sync,files,catalog,admin}.ts` |
| Sessions, Passwörter, Ratenbegrenzung | `server/src/sessions.ts`, `passwords.ts`, `ratelimit.ts` |
| Kryptografie, Schlüsselrotation, Integritätsprüfung | `server/src/crypto.ts`, `keys.ts`, `verify.ts` |
| Schema + RLS | `server/migrations/001_init.sql` |
| CLI | `server/src/cli.ts` (`migrate`, `invite`, `promote`, `rotate-keys`, `verify-data`, `bench-argon2`, …) |
| Frontend-Auth, Konto-DB, Sync | `src/app/auth.tsx`, `src/lib/server/api.ts`, `src/lib/sync/engine.ts`, `src/lib/db/database.ts` (Schema v3) |
| Altdaten-Übernahme | `src/lib/sync/legacy.ts`, `src/pages/account/ImportPage.tsx` |
| Konto, Admin, Sync-Status | `src/pages/account/*` |
| Deployment | `deploy/` (Compose, Caddyfile, Skripte, systemd) |

### Request-Fluss (schreibend)

Browser → Caddy (TLS, Header) → API `onRequest`: Sicherheits-Header → API-Ratenlimit → Session aus Cookie (SHA-256-Lookup, Ablauf, Status) → Origin-Prüfung → Pre-Auth-Header bzw. CSRF-Token → Schema-Validierung → Handler → `withUser()` (Transaktion, `app.user_id`, RLS) → Verschlüsselung mit dem Konto-DEK → PostgreSQL.

Weitere Dokumente: [THREAT-MODEL.md](THREAT-MODEL.md) · [E2EE-DECISION.md](E2EE-DECISION.md) · [SECURITY.md](SECURITY.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [BACKUP.md](BACKUP.md)
