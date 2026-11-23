# TERPGRID

**Your personal cannabis space.** Privates, lokales Dashboard für Growlogs, Fotos, Sorten, ein persönliches Journal, die eigene Sammlung und den THC-Rechner (THC Lab).

- Kein Konto, kein Server, kein Tracking. Alle Daten liegen in diesem Browser (IndexedDB + localStorage).
- Der Produktions-Build setzt eine Content-Security-Policy mit `connect-src 'none'`, sodass die App keine Netzwerkverbindungen aufbauen kann.
- Fotos werden beim Import verkleinert und neu kodiert. Dabei fallen alle eingebetteten Metadaten weg (inkl. GPS).
- Ein Informationswerkzeug zur Dokumentation und Schadensminimierung, keine medizinische oder rechtliche Beratung.

## Bereiche

| Bereich | Inhalt |
| --- | --- |
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
  lib/            backup, calendar (inkl. ICS), analytics, dates, …
  lib/__tests__/  Unit-Tests
scripts/          Browser-Smoke-Test
```

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, fflate (ZIP) und Vitest. Die Schriften werden lokal über Fontsource eingebunden.
