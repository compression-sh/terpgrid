# Phase 5.8 – Feature-Matrix (Audit und Umsetzung)

Stand: 5.8.0-rc.1.

**Methode:**
- Alle 31 Hauptseiten wurden mit einem realistisch befüllten Konto in Chromium bei 1440 px und 390 px aufgenommen und gesichtet (Konsole auf Fehler geprüft).
- Ergänzend: Code-Durchsicht je Bereich, API-Antwortzeiten und Ladeverlauf.

**Bewertung:**
- **vollständig** – funktioniert, keine Lücke gefunden;
- **verbessert** – in 5.8 ergänzt oder korrigiert;
- **behoben** – Fehler gefunden und beseitigt;
- **bewusst offen** – Grenze mit Begründung, siehe `PHASE5-8-REMAINING-LIMITATIONS.md`.

**Priorität der Befunde:** P1 Fehler mit Funktionsverlust · P2 sichtbarer Mangel · P3 Komfort.

## Befunde des Audits und Umsetzung

| # | Bereich | Befund | Prio | Ergebnis |
| --- | --- | --- | --- | --- |
| A-01 | Gemeinsam | Erstbesuch: parallele Anfragen legten das Profil gleichzeitig an → **500 „Interner Fehler“** | P1 | **behoben** (`INSERT … ON CONFLICT`), Regressionstest „P1“ in `security57.test.ts`; vor dem Fix reproduzierbar 500 |
| A-02 | Meine Sorten | „Verknüpft … seit **Invalid Date**“, wenn das Verknüpfungsdatum fehlt (z. B. aus Importen) | P2 | **behoben** (Datum nur bei gültigem Wert) |
| A-03 | Daten & Backup | Im Servermodus Warnung „Browser-Daten können verloren gehen – Backup erstellen“ (Lokalmodus-Meldung) | P2 | **behoben** (nur im Lokalmodus) |
| A-04 | Konto | Sicherheitsübersicht: fünf Kacheln mit umbrechenden Langtexten | P2 | **verbessert** (kurze Werte, fünf Spalten ab `sm`) |
| A-05 | Alle Karten mit Aktionen (z. B. Foto-Zeitleiste) | Mobil wurde der Titel neben mehreren Aktionen zusammengedrückt | P2 | **verbessert** (Kopf bricht um; gemeinsame `Card`-Komponente) |
| A-06 | Journal | Keine Tags, kein Zeitraumfilter, kein Export | P2 | **verbessert**: Tags (Formular, Anzeige, Filter, Suche), Zeitraum von/bis, „Filter zurücksetzen“, CSV-Export der gefilterten Einträge; Entwürfe enthalten Tags |
| A-07 | Genetik | Startseite nur mit Suchfeld (ohne Einstieg) | P3 | **verbessert**: Ausgangspunkte – meistgelistete Katalogsorten mit dokumentierter Abstammung (reale Daten, Reihenfolge ausdrücklich keine Wertung) |
| A-08 | Start/Leistung | `/api/notifications/unread` beim Start dreimal parallel | P3 | **behoben** (gemeinsame Anfrage) |
| A-09 | Start/Leistung | Sync lädt Fotodateien sofort beim Start und konkurriert mit der geöffneten Seite | P3 | **verbessert** (Downloads im Leerlauf, spätestens nach 3 s) |
| A-10 | Werkzeuge → Foto-Vergleich | In der Aufnahme schwarze Flächen | – | **kein Fehler**: Vollbilder wurden noch synchronisiert (A-09); nach dem Laden korrekt |
| A-11 | Daten & Backup | „Fotos (Bilddaten) 0 B“ | – | **kein Fehler**: Testdaten ohne Größenangabe; echte Uploads speichern die Größe |

## Bereichsübersicht

| Bereich | Funktionen (Auszug) | Status 5.8 |
| --- | --- | --- |
| **Übersicht** | Kennzahlen, aktive Grows, Erinnerungen, Fotos, Aktivitäten, Messwerte, Journal; anpassbar | vollständig |
| **Grow Studio** | Projekte, Phasen, Pflanzen (Profile, Phänotyp, Ergebnis), Messwerte (pH/EC/Klima/VPD/DLI, Kontexte, Zielbereiche), Foto-Zeitleiste, Zeitraffer, Vergleich, Kalender, Ausgaben, Experimente, Projektbericht (Druck/PDF), Grow-Vergleich (bis 4) | vollständig; Kartenköpfe mobil verbessert (A-05) |
| **Gemeinsames Bearbeiten von Growlogs** | Bereiche mit Rollen Eigentümer/Bearbeiten/Kommentieren/Ansehen, Zugriffsstufen, Kommentare, Verlauf | vollständig; Erstbesuch-Fehler behoben (A-01); Rechte durch 31 Bereichstests belegt |
| **Sortenkatalog** | 16.710 Sorten, 494 Breeder, Suche/Filter (Bottom Sheet mobil), Breeder-Profile, Herkunft je Feld, Laborproben getrennt (Namensabgleich) | vollständig; keine neuen Datenquellen oder Fotos (bewusst offen) |
| **Genetik** | Abstammungsgraph (Katalog und Live), Tiefe, Mehrdeutigkeiten gekennzeichnet | verbessert (A-07) |
| **Terpen-Atlas** | 27 Verbindungen (PubChem-geprüft), Strukturformeln, Geruch, Vorkommen, Isomere, Quellen | vollständig |
| **THC Lab** | Edibles, Joint, Dosierung, Zeitachse, Werkzeuge, Vergleich, Gespeichert, Quellen; Schwankungsbreiten, Warnhinweise | vollständig (Formeln durch eigene Testdateien abgedeckt – Edibles, Dosierung, Potenz, Rauchen, Umrechnungen, Labor; unverändert) |
| **Laborberichte** | Erfassen, Gesamt-THC/CBD mit Säureform-Faktor, Originaldokument, Teilen | vollständig |
| **Insights (Analytics)** | Kennzahlen, Grow-Dauer, Ausgaben, Messwertverlauf mit Zeitraum- und Grow-Filter, Tabelle, CSV | vollständig |
| **Journal** | Einträge, Stimmungen, Fotos, Kalenderansicht, Zusammenfassung, Risikohinweise | verbessert (A-06) |
| **Sammlung** | Inventar mit Kategorien, Tags, Suche, Mengen, Wartung, Ausgaben, Sorten | vollständig |
| **Kalender** | Monat/Woche/Liste, Erinnerungen mit Wiederholung, Überfällig, ICS-Export | vollständig |
| **Verlauf** | Zeitachse aller Quellen mit Filtern | vollständig |
| **Fotos** | Raster, Vergleich, Zeitraffer, Filter nach Grow/Pflanze/Phase/Zeitraum | vollständig |
| **Werkzeuge** | Einheiten, Strom, Kosten, Datum, Foto-Vergleich | vollständig |
| **Daten & Backup** | ZIP-Backup, Import, JSON/Foto-Export, Löschen | behoben (A-03) |
| **Konto & Datenschutz** | Sitzungen, Passkeys, 2FA, Gerät/Offline, Datenschutz-Center, Löschung | verbessert (A-04) |
| **Einstellungen** | Übersicht anpassen, Allgemein, App/PWA, Online-Sortendaten | vollständig |
| **Administration** | Konten, Einladungen, Systemzustand, Katalog-Qualität | vollständig (nicht neu gesichtet; Rechte in `security57` V1/V2 getestet) |
