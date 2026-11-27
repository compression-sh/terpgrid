# TERPGRID – Informationsarchitektur

Stand: 6.0.1. Quelle der Wahrheit im Code: `src/app/nav.ts` (`NAV_GROUPS`, `SETTINGS_NAV`, `DISCOVER_SECTIONS`, `MOBILE_NAV_IDS`).

## Grundsätze

1. **Wenige Produktbereiche statt einer langen Liste.** Die Navigation ordnet Funktionen danach, wofür man sie benutzt, nicht danach, wann sie entstanden sind.
2. **Keine Adresse ändert sich.** Alle Routen (`#/grows`, `#/discover/…`, `#/lab/…`, `#/together/…`, …) sind unverändert, Deep Links und Lesezeichen funktionieren weiter. Es gibt deshalb keine Weiterleitungen.
3. **Häufiges ist einen Klick entfernt.** Höchstens zwei Ebenen: Bereich → Seite; Unterbereiche als Reiter auf der Seite.
4. **Deutsch.** Englische Bezeichnungen aus früheren Phasen sind ersetzt: „Discover“ → „Entdecken“, „Insights“ → „Auswertung“, „Genetics Explorer“ → „Genetik-Explorer“.
5. **Administration bleibt getrennt** und erscheint nur für Administratoren, über „Konto & Datenschutz“ und die Suche.

## Struktur

| Bereich | Einträge | Route | Bemerkung |
| --- | --- | --- | --- |
| *(oben, ohne Überschrift)* | Übersicht | `#/` | Übersicht über die ganze Plattform |
| | Entdecken | `#/discover` | Reiter: Entdecken, Breeder, Live & Bilder, Genetik, Terpen-Atlas, Vergleich, Galerie, Cannabis 101 |
| | Gemeinsam | `#/together` | nur mit Server-Konto; Freunde, Bereiche, Einladungen, Benachrichtigungen |
| **Grow Studio** | Grows | `#/grows` | Projekte, Pflanzen, Messwerte, Fotos, Vergleich, Bericht, Experimente, Etiketten |
| | Fotos | `#/photos` | Foto-Studio über alle Grows |
| | Grow-Rechner | `#/tools` | Einheiten, Strom- und Grow-Kosten, Datum, Foto-Vergleich (früher „Werkzeuge“) |
| **Labor** | THC Lab | `#/lab/edibles` | Reiter: Edibles, Joint, Dosierung, Zeitachse, Werkzeuge, Vergleich, Gespeichert, Quellen |
| | Laborberichte | `#/lab-reports` | |
| **Mein Bereich** | Journal | `#/journal` | |
| | Sammlung | `#/collection` | |
| | Meine Sorten | `#/strains` | Favoriten inklusive |
| | Kalender | `#/calendar` | Aufgaben und Erinnerungen |
| | Auswertung | `#/analytics` | früher „Insights“ |
| | Verlauf | `#/timeline` | |
| **Einstellungen** (unten) | Einstellungen | `#/settings` | App, Anzeige, Online-Sortendaten, Info |
| | Konto & Datenschutz | `#/account` | nur Server-Konto: Profil, Sicherheit, Passkeys, Sitzungen, Gerät, Datenschutz-Center, Freigaben |
| | Daten & Backup | `#/data` | Export, Import, Speicher |

### Abweichungen vom Vorschlag und Begründung

| Vorschlag | Umsetzung | Grund |
| --- | --- | --- |
| „Entdecken“ als Gruppe mit fünf Einträgen | **ein** Eintrag, Unterbereiche als Reiter, zusätzlich direkt über die Suche (`Strg K` → „Terpen-Atlas“, „Breeder-Verzeichnis“ …) | Die Reiter existieren bereits auf jeder Entdecken-Seite. Fünf Seitenleisten-Einträge hätten die Navigation verdoppelt. |
| „Gemeinschaft“ als eigene Gruppe | **„Gemeinsam“ oben** neben Übersicht und Entdecken | Eine Gruppe mit einem Eintrag braucht keine Überschrift. Freunde, Bereiche und Einladungen sind Reiter dieser Seite. |
| „Grow Studio: Ausrüstung“ | bleibt in **Sammlung** (Kategorien „Grow-Ausrüstung“, „Grow-Bereich“) | Ausrüstung ist ein Sammlungseintrag mit Kategorie. Eine zweite Oberfläche für dieselben Daten wäre doppelt. |
| „Mein Bereich: Aufgaben, Favoriten“ | Aufgaben im **Kalender**, Favoriten in **Meine Sorten** und auf der Übersicht | Bestehende Datenmodelle; keine neue Funktion. |
| „Einstellungen“ mit 10 Kategorien | drei Seiten: Einstellungen (App), Konto & Datenschutz (Konto, Sicherheit, Geräte, Datenschutz, Zusammenarbeit), Daten & Backup | Die Konto-Seite hatte bereits Sprungmarken für alle Kontokategorien. Doppelt gesteuerte Einstellungen wurden entfernt (siehe unten). |

### Mobil

| Position | Ziel | Grund |
| --- | --- | --- |
| 1 | Übersicht | Startpunkt |
| 2 | Grows | häufigster Arbeitsbereich (Messen, Fotos, Pflege) |
| 3 (Mitte) | **Erfassen** (`+`) | Schnellerfassung mit dem Daumen erreichbar; ersetzt den schwebenden Plus-Knopf, der Inhalte überdeckte |
| 4 | Entdecken | Sortenlexikon, Atlas, Academy |
| 5 | Mehr | alle übrigen Bereiche nach Gruppen, Einstellungen am Ende |

Der Vorschlag „Mein Bereich“ als eigenes Ziel wurde **nicht** übernommen. Dafür hätte eine neue Hub-Seite entstehen müssen, und Grows sind nach den vorhandenen Abläufen das häufigere Ziel. „Mein Bereich“ steht als Gruppe in „Mehr“. Das THC Lab ist von der unteren Leiste nach „Mehr → Labor“ gewandert, also zwei Tipps statt einem.

## Doppelte Steuerung entfernt

| Einstellung | vorher | nachher |
| --- | --- | --- |
| Übersicht: Reihenfolge und Sichtbarkeit | Einstellungen **und** Übersicht („Anpassen“) | nur Übersicht; in den Einstellungen ein Hinweis mit „Zur Übersicht“ und „Standard wiederherstellen“ |
| Schnellerfassung (Desktop) | Seitenleiste „Neu“ **und** Leiste mit 6 Knöpfen auf der Übersicht | Seitenleiste „Neu“ (alle Arten); auf der Übersicht keine zweite Leiste |
| Schnellerfassung (Mobil) | schwebender Knopf **und** Leiste auf der Übersicht | Erfassen in der unteren Navigation |

## Übersicht (Dashboard 3.0)

Reihenfolge der Standardansicht. Einstellbar über „Anpassen“; gespeicherte Reihenfolgen früherer Versionen werden beim Laden bereinigt (`normalizeSettings`).

| Bereich | Inhalt | Erscheint nur, wenn … |
| --- | --- | --- |
| Kennzahlen | bis zu 4 aus: aktive Grows, Aufgaben in 7 Tagen, Journal, Sammlung, eigene Sorten, Fotos | der Wert > 0 ist |
| Heute & demnächst | Aufgaben der nächsten 7 Tage (abhakbar), ungelesene Anfragen/Einladungen und Neuigkeiten aus Bereichen | es Aufgaben oder Neuigkeiten gibt |
| Aktive Grows | bis zu 4 Projekte mit Phase, letzten Messwerten, nächster Aufgabe | ein Grow aktiv ist |
| Letzte Aktivitäten | gemeinsamer Verlauf aller Module (Grows, Messungen, Fotos, Journal, Sorten, **Sammlung**, Labor, Kalender) | es Einträge gibt |
| Deine Bereiche | Journal, Sammlung, Meine Sorten, Laborberichte, Berechnungen, Kalender mit Anzahl; leere Bereiche als eine Zeile | immer |
| Weiter entdecken | begonnene Academy-Artikel, Favoriten, zuletzt angesehene Katalogsorten, Wege zu Breeder, Genetik, Atlas, Academy | immer |
| Neueste Fotos | 12 neueste eigene Fotos | Fotos vorhanden |

**Datenschutz der Übersicht:**
- Alle Inhalte stammen aus der lokalen Arbeitskopie **dieses** Kontos.
- Für Zusammenarbeit wird nur der bereits vorhandene Zähler ungelesener Benachrichtigungen gelesen, derselbe wie bei der Glocke. Es gibt keine zusätzlichen Serveranfragen und keine Inhalte aus fremden Bereichen.
- Keine Empfehlungsalgorithmen, kein Tracking.
