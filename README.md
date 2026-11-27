# TERPGRID

**Your personal cannabis space.** Persönliches Dashboard für Growlogs, Fotos, einen Online-Sortenkatalog (Discover), ein persönliches Journal, die eigene Sammlung, Laborberichte und den THC-Rechner (THC Lab).

**Self-hosted · Private Daten geschützt · Kein Tracking.** · Version 6.0.0 · Release-Notizen: [docs/RELEASE-NOTES-6.0.md](docs/RELEASE-NOTES-6.0.md) · Änderungen: [CHANGELOG.md](CHANGELOG.md)

TERPGRID läuft in zwei Modi:

| | **Servermodus** (Self-Hosting, empfohlen) | **Lokalmodus** (ohne Backend) |
| --- | --- | --- |
| Konten | Anonyme Konten (Benutzername oder generierte Konto-ID, keine E-Mail), Einladungen, 2FA, Passkeys, Recovery-Codes | keine |
| Speicherort | Eigener Server (PostgreSQL + Dateispeicher), Arbeitskopie je Konto im Browser | nur dieser Browser |
| Verschlüsselung | Inhalte auf dem Server AES-256-GCM (Envelope, Schlüssel je Konto, rotierbar). **Keine Ende-zu-Ende-Verschlüsselung** – der Server-Betreiber könnte technisch entschlüsseln | keine |
| Geräte | Synchronisation mit Drei-Wege-Merge und Konfliktauflösung, offline nutzbar (Opt-in je Gerät), THC-Lab-Entwürfe geräteübergreifend | ein Gerät |
| Sortendaten | lokaler Katalog (CI-Strains-Pro, 16.710 Sorten, auf deinem Server indexiert) + StrainAPI/CannaLib über den Proxy | direkt bei StrainAPI/CannaLib |

- Keine Analyse-, Werbe- oder Tracking-Dienste. Persönliche Daten werden nie an Sortendaten-Anbieter gesendet.
- Fotos werden beim Import verkleinert und neu kodiert. Dabei fallen alle eingebetteten Metadaten weg (inkl. GPS).
- Ein Informationswerkzeug zur Dokumentation und Schadensminimierung, keine medizinische oder rechtliche Beratung.

**Self-Hosting:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · Checkliste: [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md) · Störungen: [docs/RUNBOOK.md](docs/RUNBOOK.md) · Upgrade: [docs/UPGRADE-6.0.md](docs/UPGRADE-6.0.md) · Wartung: [docs/MAINTENANCE.md](docs/MAINTENANCE.md) · Backups: [docs/BACKUP.md](docs/BACKUP.md) · Sicherheit: [docs/SECURITY.md](docs/SECURITY.md) · Architektur: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Bedrohungsmodell: [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) · Verschlüsselung: [docs/E2EE-DECISION.md](docs/E2EE-DECISION.md)

## Bereiche

| Bereich | Inhalt |
| --- | --- |
| **Katalog** (Servermodus) | Lokal indexierter Datensatz CI-Strains-Pro (CC BY 4.0): Suche über alle 16.710 Sorten mit Trefferarten und echten Summen, Filter, Sortenseiten mit Angeboten je Seedbank, Quell-URL, Widersprüchen, Abstammung und Nachkommen. Belegart je Angabe (Breeder, Seedbank, Datenbank, eigenes Labor); Anreicherung aus StrainAPI mit Herkunft je Feld, Vollständigkeits-Audit und Admin-Prüfliste. Siehe [docs/CATALOG.md](docs/CATALOG.md). |
| **Genetik** (Servermodus) | Abstammungsgraph aus dem Katalog: nur dokumentierte Eltern, gleichnamige Sorten verschiedener Breeder bleiben getrennt, unbekannte und abweichende Angaben gekennzeichnet. |
| **Breeder** (Servermodus) | Verzeichnis aller 494 Breeder (A–Z, Suche, Kooperationen) mit Profil, Typverteilung, häufigen Elternsorten und Sortenliste; Breeder merken. Keine erfundenen Firmenangaben. |
| **Discover / Live & Bilder** | Live-Sortenkatalog (StrainAPI): Suche mit Relevanz-Sortierung (Namenstreffer vor Erwähnungen und reinen Volltexttreffern, Gruppen ehrlich ausgewiesen, „Nur Namenstreffer“), Debounce/Abbruch, Filter (Typ, Breeder, Genetik, Terpen, THC/CBD, Favoriten), Sortierung, „Mehr laden“, verlinkbarer URL-Zustand. Filter ohne API-Unterstützung werden als „nur geladene Sorten“ gekennzeichnet; vollständige Ergebnisse nur nach ausdrücklichem „Alle laden“. |
| **Sortenprofil** | Hero-Bild mit Quellenangabe, Cannabinoid-Spannen mit Evidenzstatus (belegt/berichtet/umstritten/unzureichend), Terpene (Mengen nur aus eigenen Laborberichten), Genetik, Aroma, Botanik, berichtete Erfahrungen (klar als subjektiv gekennzeichnet), Beschreibung (HTML der Quelle nur als Text), optional CannaLib-Forschungsdaten. Merken, mit Pflanze verknüpfen, Grow zuordnen, Journal, Vergleich. |
| **Genetics Explorer** | Interaktiver Abstammungsgraph (Zoom, Pan, Pinch, Tastatur). Nur belegte Beziehungen; alternative Angaben gestrichelt, gleichnamige Sorten verschiedener Breeder als „mehrdeutig“ (nie zusammengeführt), CannaLib-Elternangaben mit Konfidenz. |
| **Terpen-Atlas** | 27 Verbindungen mit PubChem-geprüfter Identität (CID, Formel, Masse, IUPAC, InChIKey, CAS), 2D-Strukturformel, belegtem Geruch und Cannabis-Beleg aus geprüfter Literatur; Sammelnamen ohne Isomer-Zuordnung, Terpen-Rad, Filter, Vergleich, Katalogsorten je Terpen (Nennungen, keine Mengen), eigene Laborwerte je Probe. |
| **Vergleich** | 2–4 Online- oder eigene Sorten nebeneinander, Unterschiede hervorgehoben, THC/CBD-Spannen auf gemeinsamer Skala. Keine Scores, kein Radar ohne vergleichbare Messwerte. |
| **Galerie** | Vollbild-Galerie mit Zoom/Swipe und Ansichten nach dokumentierten Metadaten (Typ, Terpen, Breeder, genetische Verwandte). |
| **Cannabis 101 · Academy** | 30 Artikel in 17 Kategorien (Anbau, Licht, Klima/VPD, pH/EC, Nährstoffe, Pflanzengesundheit, Ernte, Trocknung, Wirkstoffe, Risiken …) mit Quellen aus Open-Access-Studien; Lernpfade mit Fortschritt, Glossar (auch in Strg+K), interaktive Diagramme, Kontexthilfe in Growlogs und Laborberichten. |
| **Lab Insights** | Laborberichte mit THC/THCA/CBD/CBDA/CBG/CBN, Terpenen, Labor, Charge, Datum, lokalem Originaldokument (PDF/Bild), Herkunftskennzeichnung und Gesamtwerten (THC + 0,877 × THCA, CBD + 0,877 × CBDA). |
| **Übersicht** | Aktive Grows mit Tageszähler und Phase, neueste Fotos, anstehende Erinnerungen, Journal, Berechnungen, Sorten und Aktivitätsverlauf, ausschließlich aus eigenen Daten. Schnellaktionen; Karten lassen sich sortieren und ausblenden. |
| **Growlogs** | Projekte anlegen, bearbeiten, abschließen, archivieren und löschen. Meilensteine (Keimung … Abgeschlossen) mit berechneten Phasendauern. Projektseite mit Titelbild, Pflanzen, Foto-Zeitleiste, Verlauf, Messwert-Diagrammen, Kalender und Ausgaben. |
| **Messwerte** | pH/EC mit Messkontext (Gießwasser, Nährlösung, Drainage, Substrat), EC/TDS in mS/cm, µS/cm oder ppm (Skala wählbar), Klima, Wurzelraum, Licht; VPD und DLI berechnet und gekennzeichnet; eigene Zielbereiche, Zeitraum- und Kontextfilter, CSV-Export. |
| **Grow-Bereiche & Ausrüstung** | Zelte, Räume, Zonen; Geräte mit Leistung, Laufzeit, Garantie, Standort und Wartungsprotokoll; Stromschätzung aus eigenen Angaben. |
| **Vergleich, Berichte & Experimente** | Bis zu vier Grows nebeneinander (Grow-Tage, Messkontext-Filter), druckbarer Projektbericht (PDF über den Druckdialog), Experimente und Phänotyp-Notizen mit Vergleich, Dokumentationsstand je Grow. |
| **Schnell-Log & Etiketten** | Beobachtung, Messung oder Pflege in wenigen Taps (Entwurf bleibt erhalten); druckbare Pflanzen-Etiketten mit QR-Link (ohne Anmeldung wirkungslos). |
| **Pflanzen** | Eigenes Profil je Pflanze: Standort, Tags, Sorte, Typ, eigene Meilensteine, Aktivitäten (Gießen, Düngen, Umtopfen, Messung, Problem …), Messwerte (Höhe, °C, rel. Feuchte, pH, EC, eigene Größen), Fotos und Ernteergebnis. |
| **Fotos** | Mehrfach-Upload (Drag & Drop, Kamera/Galerie), Filter nach Grow, Pflanze, Phase und Datum, Vollbildansicht, Vorher/Nachher-Schieber, Nebeneinander-Ansicht, Zeitraffer-Diashow mit Geschwindigkeitsregler. |
| **THC Lab** | Der bisherige THC-Rechner unverändert: Edibles, Joint, Dosierung, Zeitachse, Werkzeuge, Vergleich, Gespeichert und Quellen. |
| **Sorten** | Eigene Bibliothek mit Herkunftskennzeichnung je Angabe (eigene Angabe / Herstellerangabe / Laborwert), Terpenen, Aroma, Bewertung und Verknüpfungen zu Grows, Journal und Sammlung. |
| **Journal** | Optionale, private Einträge (Sorte, Konsumform, eigene Mengenangabe, Stimmung, Notizen) mit Listen- und Kalenderansicht, Suche, Filtern und einer rein beschreibenden Zusammenfassung. |
| **Sammlung** | Inventar, Zubehör, Ausrüstung und Ausgaben. Mengen ändern sich nur nach Bestätigung. |
| **Kalender** | Monats- und Wochenansicht mit Aktivitäten, Fotos, Meilensteinen und eigenen (wiederkehrenden) Erinnerungen, Erledigt-Status und ICS-Export. Keine Push-Benachrichtigungen. |
| **Insights** | Kennzahlen mit Datengrundlage (aktive Grows, dokumentierte Grow-Dauer, Pflanzenalter, Foto-Häufigkeit, Messungen, Sorten, Journal, Ausgaben) – ohne Empfehlungen oder Vorhersagen, mit Hinweis bei zu wenig Daten. Dazu Grow-Dauer, Ausgaben nach Kategorie und Grow, Messwert-Verläufe, Ernteergebnisse, Sorten-Bewertungen, Journal-Verlauf und Foto-Heatmap. |
| **Werkzeuge** | Einheiten (°C/°F, g/oz, l/gal, cm/in), Stromkosten, Kostenüberschlag, Datum & Dauer, Foto-Vergleich. |
| **Gemeinsam** (nur mit Server) | Private Profile (Handle getrennt vom Anmeldenamen, Sichtbarkeit je Feld), Freunde über exaktes Handle/Social-ID oder Einladungslink – ohne Verzeichnis. Gemeinsame Bereiche mit eigenem Bereichsschlüssel, Rollen (Eigentümer, Bearbeiten, Kommentieren, Ansehen), Zugriffsstufen je Eintrag, Teilen als Kopie oder Verschieben mit Vorschau, Kommentare, Aktivitätsverlauf, In-App-Benachrichtigungen. Serverseitig verschlüsselt, **keine** Ende-zu-Ende-Verschlüsselung. Details: `docs/PHASE5-5-COLLABORATION-REPORT.md`. |
| **Mobil & App (PWA)** | Installierbar auf iPhone, iPad, Android und Desktop (Anleitung: `docs/PHASE5-6-PWA-GUIDE.md`), Updates erst nach Bestätigung, Plus-Knopf für die Schnellerfassung, Bottom Sheets, Safe Areas. Offline-Nutzung je Konto und Gerät als Opt-in – ohne Freigabe wird die lokale Kopie beim Abmelden gelöscht. Details: `docs/PHASE5-6-OFFLINE-ARCHITECTURE.md`. |
| **Konto & Datenschutz** | Sicherheitsstatus, Gerätemodus („Geteiltes Gerät“: lokale Kopie beim Abmelden löschen), Verwaltung der lokalen Kopie, Profil, Passwort, 2FA (TOTP), Passkeys (mehrere, umbenennen, entfernen), Recovery-Codes, aktive Sitzungen (einzeln/alle beenden), vollständiger Export, Kontolöschung, Datenschutz-Center mit ehrlicher Darstellung, was wo wie geschützt liegt, inkl. „Zusammenarbeit & Freigaben“ mit sofortigem Widerruf. |
| **Synchronisation** | Status („synchronisiert“ erst nach Serverbestätigung), ausstehende Änderungen; Änderungen an verschiedenen Feldern werden automatisch zusammengeführt, echte Feldkonflikte erscheinen mit Feldvergleich (Meine Version / Server-Version); erneute Versuche mit wachsendem Abstand. |
| **Verlauf** | Persönliche Zeitachse aus Meilensteinen, Pflege, Messwerten, Fotos, Journal, Sorten, Laborberichten und Kalender – aus vorhandenen Daten abgeleitet, filterbar, nach Tagen gruppiert. Kein Feed, nichts wird geteilt. |
| **Datenübernahme** | Geführte Übernahme der bisherigen lokalen Daten in ein Konto: Vorschau, Sicherung, Zielkonto, Bestätigung, idempotenter Upload, Serverprüfung, Aufräumen erst danach. |
| **Administration** | Konten (sperren/entsperren), Einladungen, Speicher, Backup-Status, System Health (Version, Schemastand, Laufzeit, Antwortzeiten, Fehlerraten – ohne personenbezogene Daten), Sicherheitsereignisse – ohne Zugriff auf Inhalte. |
| **Befehlspalette** | Strg/⌘ + K: Navigation, Aktionen und Suche in den eigenen, lokal geladenen Daten (nichts wird gesendet). |
| **Daten & Backup** | Speicherbelegung, ZIP-Backup (versioniertes `manifest.json` + Fotos), geprüfter Import (zusammenführen oder ersetzen), JSON- und Foto-Export, vollständiges Löschen. |

## Datenhaltung

- **Externe Datenquellen:** StrainAPI (öffentliche Read-only-API, Attribution „Data provided by StrainAPI“, angemessenes Caching laut API-Bedingungen) und optional CannaLib (anonym ca. 20 Anfragen/Std., 60/Tag – nur auf Klick, nur im Arbeitsspeicher, Bilder werden wegen ungeprüfter Rechte nicht angezeigt). Im Servermodus kommt der lokale Sortenkatalog aus *CI-Strains-Pro* (CC BY 4.0, 16.710 Sorten, 494 Breeder; serverseitig importiert, nicht im Bundle) und die getrennten Laborproben aus Smith et al. 2022 (CC0, Namensabgleich, keine Breeder-Messwerte) – siehe `docs/CATALOG.md`.
- **API-Cache:** IndexedDB-Store `apiCache` – Listen/Suche 30 Min., Details 6 Std. frisch; bis 7 Tage als gekennzeichneter Offline-Fallback; max. 400 Einträge; nicht Teil des Backups.
- **Höflicher Client:** begrenzte Parallelität, Mindestabstand je Host, Abbruch veralteter Suchen, Retry-After/Rate-Limit-Header werden respektiert, keine Cookies, kein Referrer.
- **IndexedDB** (Lokalmodus `terpgrid`, Servermodus je Konto eine eigene Datenbank `terpgrid-u-<Konto>`) mit versionierten Schema-Migrationen (`src/lib/db/database.ts`) und einmaligen Datenmigrationen (`src/lib/db/migrate.ts`).
- **Migration der Altdaten:** Gespeicherte Berechnungen des THC-Rechners (`cannabisrechner.saved.v1`) werden beim ersten Start übernommen. Der alte Schlüssel bleibt als Sicherung erhalten.
- **Eingaben des THC Lab:** Im Servermodus als Entwurf je Konto gespeichert und geräteübergreifend synchronisiert; im Lokalmodus unter den bisherigen localStorage-Schlüsseln.
- **Löschen mit Abhängigkeiten:** Löschoperationen räumen abhängige Datensätze in einer Transaktion auf (`src/lib/db/repo.ts`). Ein gelöschter Grow entfernt seine Pflanzen, Einträge, Fotos und Ausgaben; Inventar bleibt erhalten.
- **Backups** werden vor dem Schreiben geprüft: Format, Version, Pflichtfelder und Verknüpfungen. Verwaiste Verweise werden gelöst (`src/lib/backup.ts`).

**Einschränkungen**

- Lokalmodus: Daten sind an Browser und Gerät gebunden, werden nicht synchronisiert und sind nicht verschlüsselt. Regelmäßige Backups werden empfohlen.
- Servermodus: Die Arbeitskopie im Browser ist unverschlüsselt (auf gemeinsam genutzten Geräten den Modus „Geteiltes Gerät“ nutzen). Die Verschlüsselung schützt Daten auf dem Datenträger und in Backups, nicht vor jemandem, der den laufenden Server kontrolliert (keine Ende-zu-Ende-Verschlüsselung, siehe [docs/E2EE-DECISION.md](docs/E2EE-DECISION.md)).
- Bilder im HEIC-Format werden nur angenommen, wenn der Browser sie dekodieren kann.
- Metadaten werden durch Neu-Kodierung entfernt. Das Aufnahmedatum wird vorher aus EXIF gelesen; fehlt es, gilt das Dateidatum.

## Entwicklung

```bash
npm install --legacy-peer-deps
npm run dev        # Entwicklungsserver (Lokalmodus)
TERPGRID_API_PROXY=http://127.0.0.1:8080 npm run dev   # mit lokalem Backend (server/)
npm test           # Unit-Tests (Vitest, inkl. IndexedDB via fake-indexeddb)
npm run lint       # ESLint
npm run build      # Typecheck + Produktions-Build
npm run preview    # Build lokal ansehen (Port 4173)
npm run e2e        # Browser-Smoke-Test gegen den Preview-Server (benötigt Playwright + Chromium)
```

## Architektur

```
src/
  app/            Router (Hash), DataProvider, Shell/Navigation, Dialoge, Toasts, Schnellaktionen
  pages/          Dashboard, Growlogs (Liste/Projekt/Pflanze), Fotos, Sorten, Journal,
                  Sammlung, Kalender, Analysen, Werkzeuge, Daten, Einstellungen, THC Lab
  features/       THC-Rechner-Ansichten (unverändert übernommen)
  components/     ui/ (Card, Modal, Stat, …), forms/, grow/, photos/, brand/
  lib/calc/       THC-Berechnungslogik (unverändert, getestet)
  lib/db/         Datenmodell, IndexedDB-Schicht, Repository, Migrationen
  lib/grow/       Phasen, Messreihen, Beschriftungen
  lib/media/      EXIF-Leser, Bildverarbeitung
  lib/catalog/    Provider-Adapter (StrainAPI, CannaLib), HTTP-Client, Cache-Service,
                  Genetik-Parser, Abstammungsgraph, Terpen-Atlas, HTML→Text
  pages/discover/ Discover, Sortenprofil, Genetics Explorer, Terpen-Atlas, Vergleich,
                  Galerie, Cannabis 101
  lib/            backup, calendar (inkl. ICS), analytics, dates, …
  lib/__tests__/  Unit-Tests
  lib/server/     API-Client (Cookie-Session, CSRF-Header)
  lib/sync/       Sync-Engine (Outbox, Pull, Konflikte), Übernahme lokaler Altdaten
  pages/auth/     Anmeldung, Registrierung, Wiederherstellung
  pages/account/  Konto & Datenschutz, Synchronisation, Datenübernahme, Administration
server/           Backend (Node 22, Fastify, PostgreSQL) – siehe server/src, Tests in server/test
deploy/           Docker Compose, Caddy, preflight/install/upgrade/rollback, Backup (restic), systemd
scripts/          Browser-Smoke-Test
.github/          CI (Lint, Tests, Migrationen, Smoke-Test, Image-Builds, Secret-Scan)
```

Backend-Tests (echte PostgreSQL-Datenbank nötig):

```bash
cd server && npm install --legacy-peer-deps
TEST_PG_URL=postgres://postgres:<pw>@127.0.0.1:5432/postgres npm test
```

Server-Verwaltung (im Container: `docker compose exec api node dist/cli.js <befehl>`): `invite`, `promote`/`demote`, `migrate`, `schema-status`, `verify-data`, `rotate-keys` (Server-Schlüssel), `rotate-user-keys`/`key-status`/`purge-retired-keys` (Schlüssel je Konto), `import-catalog` (Sortenkatalog, besser über `deploy/import-catalog.sh`), `cleanup`, `status [--verify]` (lesende Betriebsdiagnose, auch als `deploy/status.sh`). Details: [docs/RUNBOOK.md](docs/RUNBOOK.md). Upgrade auf 6.0: [docs/UPGRADE-6.0.md](docs/UPGRADE-6.0.md) · Wartung: [docs/MAINTENANCE.md](docs/MAINTENANCE.md).

Tests verwenden gekürzte, echte API-Antworten als Fixtures (`src/lib/__tests__/fixtures`).

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, fflate (ZIP) und Vitest; Backend: Node 22, Fastify 5, PostgreSQL 16, @node-rs/argon2, otpauth, @simplewebauthn (Passkeys); Betrieb: Docker Compose, Caddy, restic. Die Schriften werden lokal über Fontsource eingebunden.
