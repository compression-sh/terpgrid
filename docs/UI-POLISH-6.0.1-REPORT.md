# TERPGRID 6.0.1 – Oberfläche, Informationsarchitektur und Einfachheit

Stand: 6.0.1, Branch `claude/loving-gates-iyhnqa`, Basis `main` ce68653 (6.0.0, PR #19 gemerged).

## Zusammenfassung

| | |
| --- | --- |
| **Art** | reine Oberflächen-Version: keine Migration, **kein Servercode geändert**, keine neuen Abhängigkeiten |
| **Adressen** | alle Routen und Deep Links unverändert, deshalb keine Weiterleitungen nötig |
| **Ergebnis** | gruppierte Navigation, Übersicht für die ganze Plattform, ruhigere Gestaltung, kürzere lange Seiten |
| **Tests** | Frontend 296 ✓ (+1) · Server 232 ✓ · Lint 0 · Typecheck ✓ · `npm audit` 0 · gitleaks ohne Funde |
| **Browser** | Chromium, Firefox, WebKit: Seitenprüfung 34 Routen × 7 Breiten ohne Überlauf und Fehler; alle Suiten bestanden (WebKit Offline 22/23, bekannte Testgrenze B-5) |
| **Upgrade** | 6.0.0 → 6.0.1 isoliert ✓, Rollback auf 6.0.0 ohne Restore ✓ |
| **Nicht getan** | kein Merge, kein Deployment, keine Veröffentlichung, keine Produktionsjobs; Web-Push und Katalog-Timer aus |

Dokumente:

| Datei | Inhalt |
| --- | --- |
| `UI-POLISH-6.0.1-AUDIT.md` | priorisierte Matrix mit 30 Befunden |
| `INFORMATION-ARCHITECTURE.md` | Struktur, Begründungen, Übersicht |
| `DESIGN-SYSTEM.md` | Tokens, Typografie, Bausteine, Regeln |

## 1. Vereinfachte Navigation

| vorher | nachher |
| --- | --- |
| 16 gleichrangige Einträge, Gruppe „Werkzeuge“ mit Verlauf, Fotos, Kalender, Insights | **Übersicht · Entdecken · Gemeinsam**, darunter **Grow Studio** (Grows, Fotos, Grow-Rechner), **Labor** (THC Lab, Laborberichte), **Mein Bereich** (Journal, Sammlung, Meine Sorten, Kalender, Auswertung, Verlauf); unten Einstellungen, Konto & Datenschutz, Daten & Backup |
| „Discover“, „Insights“, „Genetics Explorer“ | Entdecken, Auswertung, Genetik-Explorer |
| zweimal „Werkzeuge“ (Seite und THC-Lab-Reiter) | Seite heißt „Grow-Rechner“ |
| Glocke als eigene Zeile, Untertitel unter dem Logo, Datenschutz-Satz im Fuß | Glocke neben der Suche; Logo ohne Untertitel; Fuß nur Konto und Sync-Status |
| Mobil: Übersicht, Growlogs, Discover, THC Lab, Mehr **plus** schwebender Plus-Knopf | Übersicht · Grows · **＋ Erfassen** · Entdecken · Mehr; „Mehr“ nach Bereichen gegliedert |
| Entdecken-Unterbereiche nur über Reiter | zusätzlich direkt in der Suche (`Strg K`) |

## 2. Übersicht 3.0

| vorher | nachher |
| --- | --- |
| Begrüßung als Titel, 6 Schnellaktionen, 4 feste Kennzahlen-Karten (auch bei 0), 10 Karten, davon 5 zum Grow | Titel „Übersicht“ mit Kontextzeile; bis zu 4 Kennzahlen mit Inhalt in **einer** Zeile; 7 Bereiche, adaptiv |
| keine Sammlung, kein Labor, keine Zusammenarbeit, kein Academy-Fortschritt | **Heute & demnächst** (Aufgaben 7 Tage, Anfragen/Neuigkeiten), **Letzte Aktivitäten** über alle Module inkl. Sammlung, **Deine Bereiche**, **Weiter entdecken** (Favoriten, zuletzt angesehen, begonnene Artikel) |
| leere Karten für Konten ohne Grow | Bereiche ohne Inhalt entfallen; „Anpassen“ zeigt sie zum Einstellen |
| „Übersicht anpassen“ doppelt (Einstellungen und Übersicht) | nur auf der Übersicht |

**Datenschutz:**
- Nur Daten der lokalen Arbeitskopie dieses Kontos und der vorhandene Zähler ungelesener Benachrichtigungen, derselbe wie bei der Glocke.
- Keine zusätzlichen Serveranfragen: Anfragen kalt 11 vorher, 11 nachher.
- Keine Inhalte aus fremden Bereichen, keine Empfehlungsalgorithmen.
- Academy-Titel werden nur bei begonnenen Artikeln nachgeladen (eigener Chunk); das Übersichts-Bundle wird dadurch nicht größer.

## 3. Zusammengeführte und entfernte Redundanzen

- Card-Kopf:
  - farbige Symbolkachel und Trennlinie entfernt;
  - wirkt auf **alle** Seiten mit Abschnitten;
  - Grün bleibt Aktionen und Zuständen vorbehalten.
- Kartenfläche: Weichzeichner und großer Schatten entfernt; ein statt zwei Hintergrundverläufe.
- Seitentitel:
  - eine Stufe (`page-title`) statt 15 Größenvarianten;
  - Slogans („Aromen verstehen.“, „Verstehen, was du anbaust.“, „Galerie.“) durch Namen ersetzt;
  - Großbuchstaben-Überzeilen entfernt, die den Reiter wiederholten.
- Schnellerfassung: eine je Gerät. Entfernt wurden `QuickAction`-Leiste und `CaptureFab`.
- Grow-Seite: Bearbeiten, Bericht, Experimente doppelt (Leiste **und** Menü „…“), jetzt bis 1280 px nur im Menü.
- „Growlogs“/„Grows“ uneinheitlich: jetzt durchgehend „Grows“ in Navigation, Titeln und Brotkrumen.

## 4. Progressive Offenlegung

| Seite | Maßnahme | sichtbar bleibt |
| --- | --- | --- |
| Konto & Datenschutz | Sitzungen: 5 neueste (aktuelle zuerst), „Alle n Sitzungen anzeigen“ | „Alle anderen beenden“, „Auf diesem Gerät abmelden“ |
| Sortenseite | „bei anderen Breedern“, „Gleiche Elternangaben“, „Weitere Sorten“, „Nachkommen“: je 8, „Alle n anzeigen“ | Evidenz, Herkunft, Hinweis auf Namensgleichheit |
| Übersicht | leere Bereiche als eine Zeile „Noch leer: …“ | |

Bewusst **nicht** versteckt:
- Evidenzmarken im Katalog;
- Laborproben-Abschnitt mit Kennzeichnung „Namensabgleich“;
- Sicherheitshinweis im THC Lab;
- 2FA-Empfehlung.

Begründungen: Audit A19 bis A22.

## 5. Mobil

- Erfassen sitzt mittig in der unteren Navigation und ist mit dem Daumen erreichbar. Kein schwebender Knopf überdeckt mehr Inhalte.
- „Mehr“ als gegliedertes Bottom Sheet: Zeilen mit 44 px Höhe, scrollbar bis 85 % der Höhe, Escape schließt.
- Safe Areas links, rechts und unten in der unteren Navigation berücksichtigt.
- Seitenprüfung bei 360, 390 und 430 px in drei Engines: kein horizontaler Überlauf.
- PWA- und Offline-Schutz unverändert; Offline-Suiten in allen Engines bestanden.

## 6. Barrierefreiheit (Ziel WCAG 2.2 AA)

| Prüfung | Ergebnis |
| --- | --- |
| axe (Mobil-Suite, 3 Engines) | 16/16 bestanden, einschließlich axe-Prüfung der Hauptseiten |
| Kontrast | Textstufen unverändert, bis `ink-500` ≥ 4,5:1 auf `ink-900` |
| Navigation | Gruppen mit `role="group"` und `aria-labelledby`; aktiver Eintrag `aria-current="page"`; „Mehr“ als `dialog` mit `aria-modal`, Escape schließt |
| Einklappen | Knöpfe mit `aria-expanded` |
| Touch-Ziele | untere Navigation 56 px, Erfassen 48 px, „Mehr“-Zeilen 44 px |
| Bewegung | unverändert: `prefers-reduced-motion` und App-Einstellung schalten Animationen ab |

**Hinweis:**
- Automatisierte Prüfungen belegen **keine** vollständige WCAG-Konformität.
- Screenreader und Textvergrößerung auf Geräten sind Teil der Geräteabnahme (`DEVICE-TESTING-6.0.md`, Schritt 21) und **nicht** durchgeführt.

## 7. Leistung

Messung mit Chromium, Mobil-Emulation 390 px, CPU 4× gedrosselt, Median aus 5 Läufen. Konto mit 2 Grows, 6 Pflanzen, 300 Messungen und 40 Journal-Einträgen.

| Seite (kalt) | LCP vorher | LCP nachher | TBT vorher → nachher | CLS vorher → nachher | JS kB vorher → nachher | Anfragen vorher → nachher |
| --- | --- | --- | --- | --- | --- | --- |
| Übersicht | 1136 ms | 1140 ms | 108 → 78 ms | 0,017 → **0** | 172 → 172 | 11 → 11 |
| Grow | 2440 ms | 2332 ms | 79 → 60 ms | 0 → 0 | 326 → 324 | 34 → 33 |
| Entdecken | 2412 ms | 2348 ms | 64 → 86 ms | 0,002 → 0,002 | 210 → 209 | 29 → 28 |
| Sortenseite | 2560 ms | 2392 ms | 94 → 72 ms | 0 → 0 | 215 → 212 | 36 → 33 |
| Academy-Artikel | 1912 ms | 1968 ms | 67 → 85 ms | 0 → 0 | 212 → 210 | 21 → 19 |

| Bundle | vorher | nachher |
| --- | --- | --- |
| `index` (JS) | 374,59 kB (gzip 116,03) | 371,24 kB (gzip 115,71) |
| `index` (CSS) | 132,35 kB (gzip 23,01) | 132,39 kB (gzip 22,92) |
| `react` | 189,09 kB | 189,09 kB |

**Bewertung:**
- Keine messbare Verschlechterung; die Abweichungen liegen im Rauschen der Messung (± 100 ms).
- Die Layoutverschiebung der Übersicht ist auf 0 gesunken.
- Das Haupt-Bundle ist leicht kleiner, weil Schnellaktionsleiste und schwebender Knopf entfallen sind.

## 8. Erhaltene Funktionen

- Kein Datenmodell, keine Berechnung, keine Formel, keine Berechtigung geändert. Der Servercode ist identisch mit 6.0.0.
- Alle Routen erreichbar wie bisher:
  - in der Seitenleiste, in „Mehr“ und in der Suche;
  - Bericht, Experimente und Bearbeiten im Grow-Menü „…“;
  - Dashboard-Anpassung auf der Übersicht.
- Gespeicherte Dashboard-Einstellungen früherer Versionen:
  - werden beim Laden bereinigt (`normalizeSettings`, Test vorhanden);
  - entfallene Bereiche (Messwerte, Journal, Berechnungen, Sorten, Favoriten) sind in „Aktive Grows“, „Deine Bereiche“ und „Weiter entdecken“ aufgegangen.

## 9. Regressionstests

| Prüfung | Chromium 157 | Firefox 155 | WebKit 26.6 |
| --- | --- | --- | --- |
| Seitenprüfung 34 Routen × 7 Breiten (360–1920) | 238 Aufrufe · 0 Überlauf · 0 Fehler | 238 · 0 · 0 | 238 · 0 · 0 |
| Workflows (Grow, Messung, Foto, Journal, Kalender, Suche, Katalog, 2FA, Sitzungen, Export, Administration) | 30/30 | 30/30 | 30/30 |
| Zusammenarbeit (Rollen, 403, Entzug, keine Anmeldenamen) | 26/26 | 26/26 | 26/26 |
| Offline (Opt-in, Start, Bearbeiten, Sync, Kontowechsel) | 26/26 | 26/26 | 22/23 (B-5, unverändert seit 5.9) |
| Offline-Sicherheit (Abmelden, ausstehendes Abmelden, keine Reste) | 16/16 | 16/16 | 16/16 |
| Mobil und axe | 16/16 | 16/16 | 16/16 |

| Prüfung | Ergebnis |
| --- | --- |
| Frontend-Tests | 296/296 (neu: Sammlung im Verlauf) |
| Server-Tests (PostgreSQL 16) | 232/232 |
| Lint / Typecheck | 0 Warnungen / sauber |
| `npm audit` | 0 |
| gitleaks (CI-Konfiguration) | keine Funde in `HEAD` und `origin/main` |

**Isoliertes Upgrade 6.0.0 → 6.0.1** (Docker, Daten wie in 6.0: 3 Konten, 110 Datensätze, 12 Dateien, gemeinsamer Bereich, Katalog und 89.923 Proben):

| Schritt | Ergebnis |
| --- | --- |
| abgebrochenes Upgrade, dann erneut ausgeführt | 38 s |
| Prüfsummen (privat, Zugangsdaten, Schlüssel, Zusammenarbeit, Katalog/Proben) | unverändert |
| Fotos | bytegleich 6/6 |
| Entschlüsselung | Fehler 0 |
| Rechte | fremde Daten unsichtbar; Mitglied liest (200), schreibt nicht (403) |
| Rollback auf 5.4 | korrekt abgelehnt |
| Rollback auf 6.0.0 | ✓, Roll-forward mit Ausfallfenster 2,5 s |
| fehlerhafte Migration | abgefangen, Rollback ✓ |

**Stand der Läufe:**
- Browser-Suiten, Seitenprüfung und Upgrade liefen auf 7976b82.
- Danach änderten sich nur Texte („Growlogs“ → „Grows“ in Titel und Brotkrumen, 352c6ec) und Dokumentation.
- Die Unit-Tests liefen auf dem letzten Stand.

## 10. Bekannte Grenzen und offene Punkte

| Punkt | Einordnung |
| --- | --- |
| Konto & Datenschutz bleibt eine lange Seite mit Sprungmarken | Aufteilung in Unterseiten erst nach 6.0.1 (Audit A26) |
| 8 Reiter in Entdecken | Zusammenlegen geprüft, nicht umgesetzt (A27) |
| keine einklappbare Seitenleiste | bewusst nicht umgesetzt (A29) |
| Screenshot „Gemeinsamer Bereich“ fehlt | Das Testkonto hat keinen Bereich. Bereiche und Rollen sind über die Zusammenarbeits-Suite in 3 Engines geprüft (26/26). |
| Vorher/Nachher in 7 Breiten nur für Übersicht, Entdecken, Sortenseite, Grow, Anmeldung und „Mehr“; übrige Seiten in 390 und 1440 px | Die Seitenprüfung lief für **alle** 34 Routen in allen 7 Breiten (Überlauf und Fehler); Bilder nur in Auswahl, um das Repository klein zu halten. |
| Physische Geräte | nicht geprüft; WebKit-Automation ist nicht Safari auf iOS |

## 11. Screenshots

| Ordner | Inhalt |
| --- | --- |
| `screenshots/ui-polish-6.0.1/before/` | Chromium, vor den Änderungen (main ce68653) |
| `screenshots/ui-polish-6.0.1/after/` | Chromium, nach den Änderungen |
| `…/after/firefox/`, `…/after/webkit/` | Stichproben |

Dateinamen: `<breite>-<seite>.jpg`, z. B. `390-dashboard.jpg`, `1440-sorte.jpg`, `390-mobil-mehr.jpg`, `1920-dashboard.jpg`. Alle Bilder sind echte Renderings, angemeldet mit einem synthetischen Testkonto.

## 12. Commits und Pull Request

| Commit | Inhalt |
| --- | --- |
| 9e1e6b5 | Navigation IA 2.0, Karten, Seitentitel, Übersicht 3.0, Einklappen |
| 3954daa | Version 6.0.1, Test Sammlung im Verlauf |
| 7976b82 | Seitenleiste kompakter |
| 09548e2 | Audit, IA, Design-System, Vorher-Screenshots |
| c47c1c9 | CHANGELOG |
| 352c6ec | „Grows“ einheitlich, Nachher-Screenshots |

Pull Request und CI-Status: siehe Beschreibung des Pull Requests.
