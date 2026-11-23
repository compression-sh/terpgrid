# TERPGRID Phase 3 – Abschlussbericht: Private Cloud, Multiuser & Sicherheit

Stand: 23.11.2026 · Version 3.0.0 · Branch `claude/loving-gates-iyhnqa`

TERPGRID ist jetzt eine selbst gehostete Anwendung für mehrere Personen mit Datenschutz als Grundprinzip. Alle Funktionen aus Phase 1 und 2 sind erhalten. Ohne Backend läuft der bisherige Lokalmodus unverändert weiter (Smoke-Test: 28 Routen).

**Was TERPGRID nicht behauptet:** Es ist nicht „100 % anonym“, nicht „unhackbar“ und **nicht Ende-zu-Ende-verschlüsselt**. Zutreffend ist: *Inhalte liegen verschlüsselt auf dem eigenen Server. Wer den laufenden Server vollständig kontrolliert, könnte sie technisch entschlüsseln.*

---

## 1. Architekturüberblick

```
Browser (React-SPA, PWA)                       VPS (Docker Compose)
  IndexedDB je Konto + Outbox  ── HTTPS ──▶  Caddy (TLS, HSTS, CSP, SPA)
  Sync-Engine, Befehlspalette                  │ /api/* (internes Netz)
                                               ▼
                                             API: Node 22 · Fastify 5 (nicht-root, read-only)
                                               Auth · Sessions · Sync · Dateien · Katalog-Proxy · Admin
                                               AES-256-GCM-Envelope (Master-Key als Secret-Datei)
                                               │ internes Netz (ohne Internet)   │ Volume
                                               ▼                                 ▼
                                             PostgreSQL 16 (RLS, FORCE)       verschlüsselte Dateien
restic ──▶ Offsite-Repository (verschlüsselt): DB-Dump + Dateien (ohne Secrets)
```

Details: [ARCHITECTURE.md](ARCHITECTURE.md).

## 2. Bedrohungsmodell (Zusammenfassung)

27 Bedrohungen mit Gegenmaßnahmen und Restrisiko: [THREAT-MODEL.md](THREAT-MODEL.md). Die größten Restrisiken:

| Risiko | Bewertung |
| --- | --- |
| VPS vollständig kompromittiert (Root, laufender Prozess) | **Hoch.** Master-Key ist zur Laufzeit verfügbar. Gemindert durch gehärtete Container und Host, aber nicht vollständig abwehrbar (keine E2EE). |
| Betreiber mit Shell-Zugriff | Kann technisch entschlüsseln. Die App bietet dafür bewusst keine Funktion; das ist eine organisatorische Grenze, keine kryptografische. |
| Lokale Browser-Kopie | Unverschlüsselt. Auf gemeinsam genutzten Geräten beim Abmelden löschen. |
| Verteilte Brute-Force-Angriffe | Werden nur verlangsamt (Konto-Backoff + IP-Limits). 2FA wird empfohlen und in der App angeregt. |
| Verlust von Master-Key bzw. Recovery-Codes | Totaler Datenverlust bzw. Verlust des Kontos. Das ist Absicht, weil es keinen Generalschlüssel gibt; die Folgen sind dokumentiert. |

## 3. Datenbankdesign

| Tabelle | Zweck |
| --- | --- |
| `users` | UUID, `login_name` (Benutzername oder `tg-…`-ID), `login_kind`, `display_name`, `role`, `status`, Argon2id-PHC, verschlüsselter TOTP-Schlüssel, `totp_last_step`, verpackter DEK + Key-Version, Altersbestätigung, `storage_bytes` |
| `sessions` | SHA-256(Token) als PK, CSRF-Token, `expires_at`, `last_seen_at`, `reauth_at`, gekürzter User-Agent, IP-HMAC |
| `recovery_codes` | HMAC je Code, `used_at` |
| `invitations` | HMAC des Tokens, Notiz, Ablauf, Nutzung, Widerruf |
| `records` | PK `(user_id, store, id)`, `version`, `seq` (globale Sequenz für den Pull), `deleted`, `payload` (AES-256-GCM), `payload_mac` (idempotenter Import) |
| `files` | PK `(user_id, kind, id, variant)`, MIME, Größe, zufälliger Speichername |
| `audit_events` | Typ, Zeit, Benutzer, IP-HMAC, Metadaten ohne Secrets oder Inhalte |
| `schema_migrations` | versionierte, transaktionale Migrationen (Advisory Lock) |

**RLS:** `ENABLE` + `FORCE` auf `records` und `files`. Die Policy prüft `user_id = current_setting('app.user_id')`, das je Transaktion über `withUser()` gesetzt wird. Die App-Rolle `terpgrid_app` hat weder `BYPASSRLS` noch Owner-Rechte; Migrationen laufen als `terpgrid_owner`. Selbst der Owner sieht dank `FORCE` keine Zeilen (getestet).

## 4. Authentifizierung

* **Konten:** (A) Benutzername (3–32 Zeichen, reservierte Namen gesperrt) **oder** (B) generierte Konto-ID `tg-xxxxx-xxxxx-xxxxx-xxxxx` (100 Bit, CSPRNG), dazu ein optionaler Anzeigename. Keine E-Mail, kein Telefon, kein Klarname, kein Geburtsdatum, kein Social Login. Die Volljährigkeit wird bei der Registrierung bestätigt.
* **Registrierung:** Standardmäßig nur mit Einladung. Einladungen sind einmalig, ablaufend, widerrufbar und nur als HMAC gespeichert; die erste Einladung kommt per CLI. Öffentliche Registrierung ist nur mit `INVITE_ONLY=false` möglich.
* **Passwörter:** Argon2id. Untergrenze ist das OWASP-Minimum, der Compose-Standard liegt bei 64 MiB/t=3 (68 ms gemessen). Parameter stehen im PHC-String; bei Änderung wird beim Login automatisch neu gehasht (im Stack geprüft). Die Passwort-Richtlinie wird serverseitig durchgesetzt, Hashes werden nie ausgeliefert.
* **Brute Force:** Konto-Backoff ohne Dauersperre, IP-Limits, Dummy-Hash und einheitliche Fehlermeldungen, Parallelitätslimit für Argon2.
* **Sessions:** opaque, HttpOnly, Secure, SameSite=Strict, `__Host-`-Präfix, Rotation, Idle- und absolutes Timeout, Liste und Widerruf, Re-Auth-Fenster von 10 Minuten.
* **CSRF:** Synchronizer-Token, Origin-Prüfung, Custom-Header vor dem Login.
* **2FA:** TOTP mit QR-Code, Replay-Schutz, max. 5 Versuche je Anmeldung.
* **Wiederherstellung ohne E-Mail:** 10 einmalige Codes, die nur einmal angezeigt werden. Ein Recovery setzt das Passwort, deaktiviert 2FA und beendet alle Sessions. Bei Registrierung und Neuerzeugung wird deutlich vor dem Verlust gewarnt. Es gibt keine Hintertür.
* **Passkeys:** dokumentiert als nächster Schritt (SECURITY.md §4), nicht umgesetzt.

## 5. Verschlüsselungsmodell und Vertrauensgrenzen

* **Model A (umgesetzt):** AES-256-GCM mit 96-Bit-Zufalls-Nonce und versioniertem Format. Jedes Konto hat einen eigenen DEK, der mit dem Master-Key (KEK, versioniert, als Datei gespeichert, nicht in der DB, im Image oder im Git) verpackt wird. Die AAD bindet Konto, Bereich und ID. KEK-Rotation erfolgt per `rotate-keys`.
* **Verschlüsselt:** alle Datensatzinhalte, alle Dateien und TOTP-Schlüssel. **Lesbar:** Metadaten (Kennung, Anzahl, Größe, Zeitpunkte).
* **Model B (E2EE):** bewertet und bewusst nicht umgesetzt. Begründung und Voraussetzungen (OPAQUE, Recovery-Schlüssel, unabhängige Prüfung) stehen in [E2EE-DECISION.md](E2EE-DECISION.md).
* **Vertrauensgrenzen:** Browser ↔ Caddy (TLS) · Caddy ↔ API (internes Netz) · API ↔ PostgreSQL (internes Netz ohne Internet, RLS) · API ↔ Dateien (Volume) · API ↔ Master-Key (Secret-Datei, read-only) · API ↔ Sortendaten-Anbieter (fester Proxy) · VPS ↔ Backup-Ziel (restic).

## 6. Umgesetzte Sicherheitsmaßnahmen

Vollständige Tabelle mit Code- und Testverweisen: [SECURITY.md](SECURITY.md) §1. Kurz zusammengefasst: Mandantentrennung (Session-ID, explizite Filter, RLS), Validierung mit Schemas (unbekannte Felder werden abgelehnt), Datei-Uploads (Magic Bytes, Allowlist, Quota, verschlüsselt, `attachment`), SSRF-sicherer Katalog-Proxy, strikte CSP und Header, Log-Schwärzung, Admin ohne Zugriff auf Inhalte, gehärtete Container, verschlüsselte Backups mit Restore-Test.

Durch die Tests und das Review in dieser Phase gefundene und behobene Probleme:

| Befund | Behebung |
| --- | --- |
| Fastify verwarf unbekannte Felder still (z. B. `role: "admin"`) | Ajv mit `removeAdditional: false`: unbekannte Felder führen zu 400 |
| CSP des Builds hätte Aufrufe an die eigene API blockiert | `connect-src 'self'` ergänzt |
| THC-Lab-Migration kopierte gerätegebundene localStorage-Daten in jedes Konto | Läuft im Servermodus nicht mehr; Übernahme nur noch über den Assistenten |
| Einladungs-Token im URL-Pfad wäre in API- und Caddy-Logs gelandet | In beiden Logs geschwärzt (getestet) |
| DB-Init übergab Passwörter als Kommandozeilenargumente (in `ps` sichtbar) | psql liest die Secret-Dateien selbst |
| Caddy überschrieb die strengere `sandbox`-CSP der API | Seiten-CSP wird nur gesetzt, wenn die Antwort keine eigene hat |
| Bild-Proxy prüfte nur den Content-Type | Zusätzliche Prüfung der Magic Bytes |
| Caddy-Healthcheck schlug wegen fehlendem SNI fehl | Interner Health-Port nur im Container |
| npm audit: fastify ≤ 5.12.4, fflate ≤ 0.8.2 (ZIP64-Endlosschleife), vite, vitest | Aktualisiert, 0 Befunde |

## 7. Migrationsstrategie (lokale Daten → Konto)

1. Nach dem Login erkennt die App die alte Datenbank `terpgrid`, ohne sie anzulegen oder zu verändern.
2. Vorschau mit Anzahl je Bereich und Prüfung der Verknüpfungen.
3. Optional: ZIP-Sicherung im bisherigen Backup-Format.
4. Anzeige des Zielkontos und ausdrückliche Bestätigung.
5. Upload mit `mode: import`: idempotent über den HMAC des kanonischen JSON. Bei erneutem Durchlauf meldet der Server „unverändert“, abweichende Serverdaten werden zu Konflikten; es wird nichts überschrieben.
6. Fotos und Dokumente werden einzeln hochgeladen.
7. Serverprüfung der Anzahl (`/api/sync/summary`).
8. Die alte Datenbank bleibt erhalten. Löschen ist erst nach einem vollständig bestätigten Durchlauf **und** ausdrücklichem Klick möglich.
9. Wurde bereits in ein anderes Konto übernommen, erscheint ein Warnhinweis. Ein stiller Import findet nie statt.

Das Client-Schema v3 ist additiv (Outbox, Sync-Versionen, Konflikte). Backup-Format 2 bleibt kompatibel, und der Server-Export erzeugt dasselbe Format.

## 8. Docker Compose

Siehe [DEPLOYMENT.md](DEPLOYMENT.md). Kurzfassung:

```bash
git clone … /opt/terpgrid && cd /opt/terpgrid/deploy
sudo ./install.sh                                        # Domain, Secrets, Build, Start
docker compose exec api node dist/cli.js invite 7 Admin  # erste Einladung
docker compose exec api node dist/cli.js promote <kennung>
```

Upgrade mit `./upgrade.sh` (Backup → Build → Migration → Start), Rollback per vorherigem Image-Tag plus Restore des Snapshots vor dem Upgrade. Die Anleitung zur Host-Härtung (SSH-Schlüssel, ufw, unattended-upgrades, fail2ban, Zeit, Logs) steht in DEPLOYMENT.md §3.

## 9. Umgebungsvariablen

Vollständige Tabellen in DEPLOYMENT.md §5. Pflicht sind `TERPGRID_DOMAIN` (daraus wird `PUBLIC_ORIGIN` abgeleitet), `DATABASE_URL`/`DATABASE_PASSWORD_FILE`, `MASTER_KEYS_FILE` und `HMAC_SECRET_FILE`. Jede Secret-Variable kann als `*_FILE` übergeben werden. In Produktion werden HTTP und unsichere Cookies abgelehnt, ebenso Argon2-Parameter unter dem OWASP-Minimum.

## 10. Backup und Wiederherstellung

Siehe [BACKUP.md](BACKUP.md). restic sichert DB-Dump und Dateien, verschlüsselt, mit Aufbewahrung (7/4/6) und `check`. Secrets sind bewusst ausgenommen und werden offline gesichert. Der Status ist im Admin-Dashboard sichtbar. Der Restore-Test läuft isoliert: Wegwerf-Container im internen Netz, `pg_restore` und `verify-data` entschlüsseln jeden Datensatz und jede Datei. Kontolöschung und Backup-Aufbewahrung sind dokumentiert und werden im Datenschutz-Center angezeigt.

## 11. Ergebnisse der Sicherheitstests

| Suite | Ergebnis |
| --- | --- |
| Server-Integrationstests gegen echtes PostgreSQL 16 | **66/66**: `auth` 29 (u. a. Registrierung, Duplikate, schwache Passwörter, Login/Logout, Backoff, IP-Limits, Enumeration, Origin/CSRF, Rotation, Idle/absolutes Timeout, Widerruf fremder Sessions, Passwortänderung, Recovery inkl. Wiederverwendung, Re-Auth, TOTP inkl. Replay, Einladungen, Admin-Grenzen, letzter Admin, Audit ohne Secrets, Header), `isolation` 9, `sync` 9 (inkl. Rotation, verify-data), `crypto` 8, `catalog` 7, `config` 4 |
| Zwei-Benutzer-Isolation | A kann B weder lesen, ändern, löschen, exportieren noch herunterladen; eine vom Client gesendete `user_id` bleibt wirkungslos; RLS direkt geprüft (App-Rolle und Owner ohne Kontext: 0 Zeilen, Fremd-Insert abgelehnt, `ALTER TABLE` verweigert) |
| Verschlüsselung | Manipulation an Chiffrat, Tag und Nonce erkannt; falscher Schlüssel erkannt; AAD-Bindung; 1000 Nonces eindeutig; Key-Versionen; Rotation; manipulierte Datei auf der Platte erkannt |
| Frontend-Unit-Tests | **186/186** (u. a. Sync-Engine, Konflikte, Import inkl. Idempotenz, Konto-Trennung, Suche, Schema-Migration v3) |
| E2E im Browser gegen echten Server | Registrierung, Recovery-Codes (nicht im Web-Storage), Import, zweites Gerät, Fremdkonto ohne Zugriff, Abmelden mit Löschen; 2FA mit echtem TOTP, Export mit Re-Auth, Sitzungswiderruf, Admin ohne Inhalte, Service-Worker-Cache ohne `/api` (0 von 24 Einträgen) |
| Deployment (lokale Test-Installation, Domain `localhost`) | Alle Dienste healthy; UID 70/1000/10001; read-only; `cap_drop: ALL`; `no-new-privileges`; Speicherlimits; kein Docker-Socket; DB aus dem `egress`-Netz nicht erreichbar und ohne Internet; HSTS/CSP/`X-Frame-Options`; `__Host-`-Cookie mit Secure/HttpOnly; fremde Origin 403; kein Klartext in DB, Volume oder Backup; keine Tokens, Passwörter oder Cookies in Logs |
| Backup | Backup ok, Status im Admin-Dashboard; Restore-Test ok (alles entschlüsselt); mit falschem Master-Key Fehler (Exit 2); produktiver `restore.sh` stellt gelöschte Daten wieder her |
| Abhängigkeiten | `npm audit`: Frontend 0, Server 0 |
| Regression | Build ok, Smoke-Test im Lokalmodus mit 28 Routen ok |

Ein externer Penetrationstest oder eine unabhängige Prüfung hat **nicht** stattgefunden.

## 12. Verbleibende Risiken

* Keine E2EE: Bei Kompromittierung des laufenden Servers oder durch den Betreiber sind die Inhalte lesbar.
* Ratenbegrenzung, ausstehende MFA-Anmeldungen und Fehlerzähler liegen im Speicher einer einzelnen API-Instanz und werden beim Neustart zurückgesetzt. Mehrere Instanzen würden Redis oder die DB erfordern.
* Metadaten sind auf dem Server lesbar; die globale Sync-Sequenz verrät grob die Schreibaktivität anderer Konten.
* Die Prüfung des Benutzernamens mit gültiger Einladung verrät, ob ein Name existiert (bewusst so gewählt).
* Malware im Browser kann eine aktive Session nutzen und die unverschlüsselte lokale Kopie lesen.
* Docker veröffentlicht Ports an ufw vorbei; TERPGRID veröffentlicht nur 80/443 (dokumentiert).
* Restrisiko durch die Lieferkette (npm, Base-Images).

## 13. Bekannte Einschränkungen

* Passkeys (WebAuthn) sind nicht umgesetzt (dokumentiert als nächster Schritt).
* Rotation der Datenschlüssel je Konto ist nicht umgesetzt; rotiert wird nur der KEK.
* Der Server kodiert Bilder nicht neu (keine Bildbibliothek). Die Neukodierung und EXIF-Entfernung passiert im Browser; der Server prüft Signatur, Größe und Quota.
* Eingaben des THC Lab (localStorage) werden nicht synchronisiert; gespeicherte Berechnungen schon.
* Konfliktauflösung erfolgt pro Datensatz (meine Version / Server-Version), es gibt keine feldweise Zusammenführung.
* Der Katalog-Proxy braucht ausgehenden HTTPS-Zugriff vom VPS. In der Testumgebung waren externe Hosts für Container nicht erreichbar; der Proxy ist mit simulierten Antworten getestet.
* Die Docker-Images wurden in der Sandbox mit einer Testvariante gebaut, die nur zusätzlich das Proxy-Zertifikat der Sandbox enthält (`*.sandbox`, nicht im Repository). Alle übrigen Schritte sind identisch mit den Produktions-Dockerfiles.
* **Auf keinen echten VPS deployt** (keine Freigabe und keine Zugangsdaten). Alle Deployment-Aussagen beziehen sich auf die lokale Test-Installation.

## 14. Git-Commits (Phase 3)

| Commit | Inhalt |
| --- | --- |
| `b8e752f` | M1: Audit, Architektur, Bedrohungsmodell, Verschlüsselungsentscheidung |
| `ea9abc9` | Abhängigkeiten aktualisiert (npm audit 0) |
| `579ee44` | M2: Backend mit Argon2id, Sessions, Einladungen, Recovery, TOTP |
| `313a57e` | M3: Isolations-, Verschlüsselungs-, Sync-, Datei- und Proxy-Tests; Key-Rotation |
| `b2d175f` | accountKey für die lokale Konto-Datenbank |
| `4eaa5fe` | M4: Frontend-Login, Konto-DB, Sync, Altdaten-Übernahme |
| `58e4724` | Build-Cache nicht versionieren |
| `37825f4` | M5: Docker Compose, Caddy, restic-Backups mit Restore-Test |
| `526b581` | M6: Konto- und Datenschutz-Center, Admin, Befehlspalette, PWA |
| *(dieser Commit)* | M7: Härtung aus dem Review, SECURITY.md, aktualisierte Doku, Abschlussbericht |
