# TERPGRID 6.0 – Sicherheitsabnahme

Stand: 6.0.0.

**Grundlage:**
- Server-Tests mit echter PostgreSQL 16 (232).
- Browser-Suiten in Chromium, Firefox und WebKit.
- Isolierte Docker-Installationen: Upgrade, DR, Klartextsuche, Deployment-Audit.
- Befundregister aus 5.7 und 5.9.

> **Verschlüsselungsmodell:** TERPGRID verschlüsselt **serverseitig**.
> - Inhalte liegen mit AES-256-GCM verschlüsselt in Datenbank, Dateispeicher und Backup.
> - Die Schlüssel je Konto und je gemeinsamem Bereich sind mit dem Master-Key des Servers verpackt.
> - Wer den Server **und** den Master-Key kontrolliert, kann entschlüsseln.
> - TERPGRID ist **nicht** Ende-zu-Ende-verschlüsselt (Studie: `PHASE5-7-E2EE-FEASIBILITY.md`).

## 1. Ergebnis

- **Kritische oder hohe Befunde: keine offen.**
- Alle Befunde aus 5.7 (F-01 bis F-08) und 5.9 (S-1 bis S-7) sind behoben und durch Tests belegt.
- In 6.0 kam kein neuer Sicherheitsbefund hinzu.
- Code-Änderungen in 6.0:
  - Lint-Bereinigung ohne Verhaltensänderung;
  - toter Code entfernt;
  - `install.sh` setzt den Image-Tag.

## 2. Prüfmatrix

| Bereich | Ergebnis | Nachweis |
| --- | --- | --- |
| Passwort-Hashing | Argon2id (64 MiB, t=3); kein Klartext gespeichert; Recovery-Codes nur als HMAC | `auth.test` „speichert kein Klartext-Passwort, sondern Argon2id …“ |
| Ratenbegrenzung Anmeldung | progressives Backoff je Konto ohne dauerhafte Sperre; Fehlversuche einer IP sperren das Konto nicht für andere IPs; 2FA-Fehlversuche kontoweit begrenzt; Recovery-Versuche begrenzt; Registrierung 5/h/IP; API 600/min/IP | `auth.test` (Backoff, IP, 2FA, Recovery); Lasttest 5.9 |
| Schutz vor Kontoaufzählung | gleiche Antwort für unbekannte Kennung und falsches Passwort; Freundschaftsanfragen neutral | `security57` A1; `e2e-55` (Handle-Enumeration) |
| Sitzungen | `__Host-`-Cookie, Rotation bei Anmeldung, Idle- und absolutes Timeout, Fixierung unmöglich, einzeln/alle widerrufbar, fremde nicht widerrufbar, Abmelden serverseitig | `auth.test`, `security57` S1–S7 |
| Passkeys | Origin, RP-ID, User Verification, Challenge-Bindung, Zähler, Schutz vor Credential-Substitution; Entfernen nur mit erneuter Anmeldung | `passkeys.test` (10); Browser Chromium (virtueller Authenticator); **Geräte ausstehend** |
| TOTP | Einrichtung, zweiter Faktor, Replay-Schutz, Deaktivierung; Einschalten beendet andere Sitzungen | `auth.test`, `security57` S6; UI-Workflow in 3 Engines (Einrichten, falscher Code, Anmeldung) |
| Wiederherstellung | Code einmalig, beendet Sitzungen, entfernt Passkeys und 2FA | `auth.test`, `security57` A3, `passkeys.test` |
| Kontoverschlüsselung | AES-256-GCM mit Schlüssel je Konto (Generationen), AAD-Bindung, Rotation unter Last verlustfrei | `crypto.test`, `rotation.test`, `security57` K1 |
| Bereichsverschlüsselung | eigener Schlüssel je Bereich | `collab.test`; DR: `verify-data` entschlüsselt Bereichsdatensätze und -dateien |
| Klartext ruhender Daten | Marker in privatem Eintrag und Kommentar: 0 Treffer in DB-Dateien, Dump, Dateispeicher, Logs, `/tmp`, Backup | DR-Übung 5.9 (Methode unverändert); 6.0: `RELEASE-6.0-ACCEPTANCE.md` §5 |
| PostgreSQL-RLS | Laufzeitrolle ohne `BYPASSRLS` und ohne Schemarechte; ohne Kontext keine, mit fremdem Kontext keine fremden Daten | `security57` R1/R2, `isolation*.test` |
| Kontoisolation | 5 Konten, alle Datenarten | `isolation-all.test`; Browser: Kontowechsel in 3 Engines |
| Zusammenarbeit | 4 Rollen, Zugriffsstufen, serverseitige 403, Entzug wirkt sofort, keine Anmeldenamen in fremden Ansichten | `collab.test` (31), `permissions.test`; `e2e-55` 26/26 in 3 Engines |
| Medien | fremde Dateien 404 ohne Existenzverrat; Pfadmanipulation und falsche Typen abgelehnt; `attachment`, `no-store`, Sandbox-CSP; EXIF/GPS beim Upload entfernt, Profilbilder mit Metadaten serverseitig abgelehnt | `security57` D1/D2/M1, `isolation.test`; UI-Workflow (ausgelieferte Fotos ohne EXIF) |
| CSRF und Herkunft | Token, Origin-Prüfung, Pre-Auth-Header | `auth.test`, `security57` C1/C2 |
| Offline-Speicher | ohne Offline-Freigabe beim Abmelden gelöscht (auch WebKit, S-1); geteiltes Gerät; keine privaten Inhalte im SW-Cache | `offline-sec`, `e2e-offline` in 3 Engines; Unit-Test `db.test` |
| Ausstehendes Offline-Abmelden | wirkt auf alle Tabs; Serversitzung beim nächsten Kontakt beendet | `offline-sec` |
| Kontowechsel | Kopien getrennt je Konto; keine fremden Inhalte | `e2e-offline`, `offline-sec` |
| Administration | nur Metadaten, keine Inhalte; keine Hashes, Schlüssel oder Tokens in Antworten; letzter Admin nicht entfernbar | `auth.test`, `security57` V1/V2 |
| Externe Anbieter | Katalog-Proxy nur zu festen Hosts, ohne Cookies und Referrer; nichts Privates verlässt den Server | `PHASE5-7-SECURITY-MATRIX.md` (unverändert seit 5.7) |
| Export | CSV ohne Formel-Ausführung (S-2) | `exporters-table.test` |
| Abhängigkeiten | `npm audit` 0 (Frontend und Server, Laufzeit und Entwicklung); Images und Actions gepinnt | §4 |
| Secret-Scan | gitleaks über die gesamte Historie: keine Funde; Konfiguration unverändert, keine neuen Ausnahmen | CI „Secret-Scan“ und lokal (`RELEASE-6.0-ACCEPTANCE.md` §7) |
| Container und Netz | read-only, `cap_drop: ALL`, `no-new-privileges`, Limits; DB und API nicht veröffentlicht; Secrets nur als Dateien | Deployment-Audit (5.9; Konfiguration in 6.0 unverändert) |

## 3. Bekannte, akzeptierte Risiken (Architektur)

| ID | Risiko | Begründung |
| --- | --- | --- |
| R-01 | Verfügbarkeit von Benutzernamen bei offener Registrierung abfragbar | für die Registrierung nötig, ratenbegrenzt; bei Einladungspflicht nur mit gültiger Einladung |
| R-02 | Authentifizierungstabellen ohne RLS | werden vor der Anmeldung gelesen; Inhalte gehasht bzw. mit dem Master-Key verpackt |
| R-03 | Ratenlimits nur im Arbeitsspeicher einer API-Instanz | Ein-Instanz-Architektur; Neustart setzt zurück |
| R-04 | Browser-Kopie unverschlüsselt (nur mit Offline-Freigabe über die Sitzung hinaus) | in App und Doku ausdrücklich beschrieben |
| R-05 | Betreiber oder kompromittierter Server mit Master-Key kann entschlüsseln | keine Ende-zu-Ende-Verschlüsselung |
| R-06 | Wer die App umgeht, kann eigene Fotos mit Metadaten hochladen und teilen | betrifft nur eigene Daten |
| R-07 | Offline-Widerruf: Ein Gerät, das offline ist, behält die lokale Kopie bis zur nächsten Verbindung | technisch nicht anders lösbar; dokumentiert |
| R-08 | Viele Personen hinter einer IP teilen sich 600 Anfragen/min | bewusster Schutz; dokumentiert |

## 4. Abhängigkeiten und Lieferkette

| Prüfung | Ergebnis |
| --- | --- |
| Direkte Laufzeitabhängigkeiten | Frontend 9, Server 8; alle verwendet; keine neuen in 6.0 |
| `npm audit` | 0 Schwachstellen in beiden Projekten |
| Basis-Images | `node:22.21-alpine3.22`, `caddy:2.10.2-alpine`, `postgres:16.10-alpine3.22` (Tag-Pins) |
| CI-Actions | per Commit-SHA gepinnt; gitleaks-Image per Digest |
| Datensätze | Katalog und Laborproben per Commit und SHA-256 geprüft |

## 5. Nicht geprüft (blockiert oder ausstehend)

- **Passkeys, Kamera, HEIC, Offline-Start, Screenreader auf physischen Geräten:** ausstehend (`DEVICE-TESTING-6.0.md`).
- **Offsite-Backup-Repository des Produktionsservers** (`restore-test.sh --full-check`): nur durch den Betreiber prüfbar.
