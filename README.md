# TERPGRID

**Your personal cannabis space.** Persönliches Dashboard für Growlogs, Fotos, einen Online-Sortenkatalog (Discover), ein persönliches Journal, die eigene Sammlung, Laborberichte und den THC-Rechner (THC Lab).

**Persönliche Daten lokal gespeichert · Online-Sortendaten von externen Quellen.**

- Kein Konto, kein Tracking. Growlogs, Fotos, Journal, Sammlung und Laborberichte liegen ausschließlich in diesem Browser (IndexedDB + localStorage) und werden nie an Anbieter gesendet.
- Netzwerkzugriffe gibt es nur im Bereich Discover: Suchbegriffe und Sortenkennungen gehen an StrainAPI bzw. – nur auf Klick – an CannaLib. Der Produktions-Build erlaubt per Content-Security-Policy ausschließlich diese beiden Hosts (`connect-src`) und Bilder nur von StrainAPI (`img-src`).
- Fotos werden beim Import verkleinert und neu kodiert. Dabei fallen alle eingebetteten Metadaten weg (inkl. GPS).
- Ein Informationswerkzeug zur Dokumentation und Schadensminimierung, keine medizinische oder rechtliche Beratung.

## Bereiche

| Bereich | Inhalt |
| --- | --- |
| **Discover** | Live-Sortenkatalog (StrainAPI): Suche mit Debounce/Abbruch, Filter (Typ, Breeder, Genetik, Terpen, THC/CBD, Favoriten), Sortierung, „Mehr laden“, verlinkbarer URL-Zustand. Filter ohne API-Unterstützung werden als „nur geladene Sorten“ gekennzeichnet; vollständige Ergebnisse nur nach ausdrücklichem „Alle laden“. |
| **Sortenprofil** | Hero-Bild mit Quellenangabe, Cannabinoid-Spannen mit Evidenzstatus (belegt/berichtet/umstritten/unzureichend), Terpene (Mengen nur aus eigenen Laborberichten), Genetik, Aroma, Botanik, berichtete Erfahrungen (klar als subjektiv gekennzeichnet), Beschreibung (HTML der Quelle nur als Text), optional CannaLib-Forschungsdaten. Merken, mit Pflanze verknüpfen, Grow zuordnen, Journal, Vergleich. |
| **Genetics Explorer** | Interaktiver Abstammungsgraph (Zoom, Pan, Pinch, Tastatur). Nur belegte Beziehungen; alternative Angaben gestrichelt, gleichnamige Sorten verschiedener Breeder als „mehrdeutig“ (nie zusammengeführt), CannaLib-Elternangaben mit Konfidenz. |
| **Terpen-Atlas** | 7 Terpene mit Formel, molarer Masse, CAS, PubChem-Quelle, Aroma und Vorkommen; Terpen-Rad, Vergleich, Nennungen im Katalog (ohne Mengen), Zusammensetzungen nur aus Laborberichten. |
| **Vergleich** | 2–4 Online- oder eigene Sorten nebeneinander, Unterschiede hervorgehoben, THC/CBD-Spannen auf gemeinsamer Skala. Keine Scores, kein Radar ohne vergleichbare Messwerte. |
| **Galerie** | Vollbild-Galerie mit Zoom/Swipe und Ansichten nach dokumentierten Metadaten (Typ, Terpen, Breeder, genetische Verwandte). |
| **Cannabis 101** | 12 Wissensartikel mit Quellen, Suche, Kategorien, Querverweisen, Lesefortschritt und Merkliste. |
| **Lab Insights** | Laborberichte mit THC/THCA/CBD/CBDA/CBG/CBN, Terpenen, Labor, Charge, Datum, lokalem Originaldokument (PDF/Bild), Herkunftskennzeichnung und Gesamtwerten (THC + 0,877 × THCA, CBD + 0,877 × CBDA). |
| **Übersicht** | Aktive Grows mit Tageszähler und Phase, neueste Fotos, anstehende Erinnerungen, Journal, Berechnungen, Sorten und Aktivitätsverlauf, ausschließlich aus eigenen Daten. Schnellaktionen; Karten lassen sich sortieren und ausblenden. |
| **Growlogs** | Projekte anlegen, bearbeiten, abschließen, archivieren und löschen. Meilensteine (Keimung … Abgeschlossen) mit berechneten Phasendauern. Projektseite mit Titelbild, Pflanzen, Foto-Zeitleiste, Verlauf, Messwert-Diagrammen, Kalender und Ausgaben. |
| **Pflanzen** | Eigenes Profil je Pflanze: Sorte, Typ, eigene Meilensteine, Aktivitäten (Gießen, Düngen, Umtopfen, Messung, Problem …), Messwerte (Höhe, °C, rel. Feuchte, pH, EC, eigene Größen), Fotos und Ernteergebnis. |
| **Fotos** | Mehrfach-Upload (Drag & Drop, Kamera/Galerie), Filter nach Grow, Pflanze, Phase und Datum, Vollbildansicht, Vorher/Nachher-Schieber, Nebeneinander-Ansicht, Zeitraffer-Diashow mit Geschwindigkeitsregler. |
| **THC Lab** | Der bisherige THC-Rechner unverändert: Edibles, Joint, Dosierung, Zeitachse, Werkzeuge, Vergleich, Gespeichert und Quellen. |
| **Sorten** | Eigene Bibliothek mit Herkunftskennzeichnung je Angabe (eigene Angabe / Herstellerangabe / Laborwert), Terpenen, Aroma, Bewertung und Verknüpfungen zu Grows, Journal und Sammlung. |
| **Journal** | Optionale, private Einträge (Sorte, Konsumform, eigene Mengenangabe, Stimmung, Notizen) mit Listen- und Kalenderansicht, Suche, Filtern und einer rein beschreibenden Zusammenfassung. |
| **Sammlung** | Inventar, Zubehör, Ausrüstung und Ausgaben. Mengen ändern sich nur nach Bestätigung. |
| **Kalender** | Monats- und Wochenansicht mit Aktivitäten, Fotos, Meilensteinen und eigenen (wiederkehrenden) Erinnerungen, Erledigt-Status und ICS-Export. Keine Push-Benachrichtigungen. |
| **Analysen** | Grow-Dauer, Ausgaben nach Kategorie und Grow, Messwert-Verläufe, Ernteergebnisse, Sorten-Bewertungen, Journal-Verlauf und Foto-Heatmap. |
| **Werkzeuge** | Einheiten (°C/°F, g/oz, l/gal, cm/in), Stromkosten, Kostenüberschlag, Datum & Dauer, Foto-Vergleich. |
| **Daten & Backup** | Speicherbelegung, ZIP-Backup (versioniertes `manifest.json` + Fotos), geprüfter Import (zusammenführen oder ersetzen), JSON- und Foto-Export, vollständiges Löschen. |

## Datenhaltung

- **Externe Datenquellen:** StrainAPI (öffentliche Read-only-API, Attribution „Data provided by StrainAPI“, angemessenes Caching laut API-Bedingungen) und optional CannaLib (anonym ca. 20 Anfragen/Std., 60/Tag – nur auf Klick, nur im Arbeitsspeicher, Bilder werden wegen ungeprüfter Rechte nicht angezeigt). Der Datensatz *ci-strains-pro* wurde geprüft, aber nicht eingebunden (StrainAPI deckt Bilder, Genetik und Evidenzstatus bereits ab; ein zusätzlicher Massendatensatz hätte nur den Bundle vergrößert).
- **API-Cache:** IndexedDB-Store `apiCache` – Listen/Suche 30 Min., Details 6 Std. frisch; bis 7 Tage als gekennzeichneter Offline-Fallback; max. 400 Einträge; nicht Teil des Backups.
- **Höflicher Client:** begrenzte Parallelität, Mindestabstand je Host, Abbruch veralteter Suchen, Retry-After/Rate-Limit-Header werden respektiert, keine Cookies, kein Referrer.
- **IndexedDB** (`terpgrid`) mit versionierten Schema-Migrationen (`src/lib/db/database.ts`) und einmaligen Datenmigrationen (`src/lib/db/migrate.ts`).
- **Migration der Altdaten:** Gespeicherte Berechnungen des THC-Rechners (`cannabisrechner.saved.v1`) werden beim ersten Start übernommen. Der alte Schlüssel bleibt als Sicherung erhalten.
- **Eingaben des THC Lab** liegen weiterhin unter den bisherigen localStorage-Schlüsseln.
- **Löschen mit Abhängigkeiten:** Löschoperationen räumen abhängige Datensätze in einer Transaktion auf (`src/lib/db/repo.ts`). Ein gelöschter Grow entfernt seine Pflanzen, Einträge, Fotos und Ausgaben; Inventar bleibt erhalten.
- **Backups** werden vor dem Schreiben geprüft: Format, Version, Pflichtfelder und Verknüpfungen. Verwaiste Verweise werden gelöst (`src/lib/backup.ts`).

**Einschränkungen**

- Daten sind an Browser und Gerät gebunden, werden nicht synchronisiert und sind nicht verschlüsselt. Regelmäßige Backups werden empfohlen.
- Bilder im HEIC-Format werden nur angenommen, wenn der Browser sie dekodieren kann.
- Metadaten werden durch Neu-Kodierung entfernt. Das Aufnahmedatum wird vorher aus EXIF gelesen; fehlt es, gilt das Dateidatum.

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit-Tests (Vitest, inkl. IndexedDB via fake-indexeddb)
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
scripts/          Browser-Smoke-Test
```

Tests verwenden gekürzte, echte API-Antworten als Fixtures (`src/lib/__tests__/fixtures`).

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, fflate (ZIP) und Vitest. Die Schriften werden lokal über Fontsource eingebunden.
