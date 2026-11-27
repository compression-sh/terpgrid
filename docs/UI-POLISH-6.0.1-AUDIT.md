# TERPGRID 6.0.1 – UI- und IA-Audit

Stand: main ce68653 (6.0.0).

**Methode:**
- Alle 34 Hauptseiten wurden angemeldet mit einem befüllten Testkonto in Chromium gerendert: ganze Seite bei 1440 und 390 px, dazu die Navigation und das „Mehr“-Menü.
- Die Bilder wurden einzeln angesehen; die Vorher-Bilder liegen in `screenshots/ui-polish-6.0.1/before/`.
- Code der gemeinsamen Bausteine (`Card`, `PageHeader`, `Shell`, `nav.ts`, Dashboard) gelesen.

**Priorität:**
- **P1:** wirkt auf viele Seiten oder den Einstieg.
- **P2:** einzelne wichtige Seite.
- **P3:** kosmetisch.

**Entscheidung:**
- **Vereinfacht:** weniger Elemente.
- **Zusammengeführt:** zwei Wege werden einer.
- **Verschoben:** an einen besseren Ort.
- **Beibehalten:** bewusst so gelassen, mit Begründung.
- **Offen:** für eine spätere Version.

## Matrix

| # | P | Fundstelle | Befund | Entscheidung | Umsetzung 6.0.1 |
| --- | --- | --- | --- | --- | --- |
| A1 | P1 | alle Seiten mit `Card` | Jeder Abschnitt hatte eine farbige Symbolkachel (32 px, grüner Rahmen) und eine Trennlinie unter dem Kopf. Auf der Übersicht gab es 9 grüne Kacheln: Grün wirkte als Dekoration statt als Signal. | Vereinfacht | Symbol gedämpft vor dem Titel, Kopf ohne Linie, Titel 14 px (`Card.tsx`) |
| A2 | P1 | `card`-Fläche | Weichzeichner, großer Schlagschatten und 16 px Radius auf jeder Karte: viel visuelles Gewicht, auf schwächeren Geräten auch Rechenlast | Vereinfacht | ohne Weichzeichner und Schatten, 12 px Radius (`index.css`) |
| A3 | P1 | Seitenhintergrund | zwei grüne Verläufe | Vereinfacht | ein schwacher Verlauf |
| A4 | P1 | Seitentitel | 24–44 px in 15 Varianten, Slogans („Aromen verstehen.“, „Verstehen, was du anbaust.“, „Galerie.“) und Großbuchstaben-Überzeilen, die den aktiven Reiter wiederholten | Vereinfacht | einheitlich `page-title`, klare Namen, Überzeilen entfernt |
| A5 | P1 | Seitenleiste | 16 gleichrangige Einträge; „Werkzeuge“ enthielt Verlauf, Fotos, Kalender und Insights, die keine Werkzeuge sind; Untertitel unter dem Logo; Datenschutz-Satz im Fuß; „Benachrichtigungen“ als eigene volle Zeile | Zusammengeführt/Verschoben | IA 2.0: Übersicht · Entdecken · Gemeinsam, darunter Grow Studio, Labor, Mein Bereich; Einstellungen unten; Glocke neben der Suche (`INFORMATION-ARCHITECTURE.md`) |
| A6 | P1 | Sprache | „Discover“, „Insights“, „Genetics Explorer“, „Comparison Studio“, „Visual Explorer“ in der Oberfläche | Vereinfacht | Entdecken, Auswertung, Genetik-Explorer; Überzeilen entfernt |
| A7 | P1 | Übersicht | zehn Karten, davon fünf zum Grow (aktive Grows, Messwerte, Erinnerungen, Fotos, Kennzahlen); Journal, Sammlung, Labor und Entdecken kaum vertreten; leere Karten bei Konten ohne Grow | Neu geordnet | Übersicht 3.0, adaptiv (siehe IA-Dokument) |
| A8 | P1 | Übersicht | Begrüßung „Guten Abend“ als Titel; Leiste mit sechs Schnellaktionen **zusätzlich** zu „Neu“ in der Seitenleiste und dem schwebenden Knopf mobil | Zusammengeführt | Titel „Übersicht“ mit Kontextzeile; eine Schnellerfassung je Gerät |
| A9 | P1 | Übersicht → Kennzahlen | „Fotos 6“ und „Pflanzen (aktiv)“ als feste Kacheln, auch bei 0 | Vereinfacht | nur Kennzahlen mit Wert > 0, maximal 4, als eine Zeile statt vier Karten |
| A10 | P1 | Mobil | schwebender Plus-Knopf überdeckte Inhalte (z. B. die Aktive-Grow-Karte); THC Lab in der unteren Leiste, Grows nur mit Kurzlabel „Growlogs“ | Verschoben | Erfassen in der Mitte der unteren Navigation; Übersicht · Grows · ＋ · Entdecken · Mehr |
| A11 | P1 | Mobil „Mehr“ | 12 gleich große Kacheln ohne Gruppierung | Vereinfacht | Gruppen mit Überschrift, kompakte Zeilen (44 px), Einstellungen am Ende |
| A12 | P1 | Einstellungen | „Übersicht anpassen“ (Reihenfolge, Sichtbarkeit) doppelt: Einstellungen und Übersicht | Zusammengeführt | nur auf der Übersicht, in den Einstellungen Verweis und „Standard wiederherstellen“ |
| A13 | P2 | Konto & Datenschutz | Seite ≈ 6.400 px hoch, davon ≈ 2.500 px Sitzungsliste (alle Sitzungen ungekürzt) | Vereinfacht | 5 neueste, darunter „Alle n Sitzungen anzeigen“; „Alle anderen beenden“ bleibt immer sichtbar |
| A14 | P2 | Sortenseite | rechte Spalte über 5.000 px: „bei anderen Breedern“ (40+) und „Nachkommen“ (70+) vollständig | Vereinfacht | je 8 Einträge, „Alle n anzeigen“; Evidenz und Herkunft unverändert sichtbar |
| A15 | P2 | Grow-Seite | 9 gleichrangige Knöpfe in der Aktionsleiste; Bearbeiten, Bericht und Experimente standen zusätzlich im Menü „…“ | Vereinfacht | Bearbeiten, Bericht und Experimente erst ab 1280 px in der Leiste, sonst im Menü (das sie schon enthielt) |
| A16 | P2 | Verlauf | Sammlung fehlte im gemeinsamen Verlauf | Ergänzt (Bestandsdaten) | Sammlungseinträge im Verlauf, mit Deep Link |
| A17 | P2 | Werkzeuge | zweimal „Werkzeuge“: Seite (Strom, Kosten, Einheiten) und Reiter im THC Lab (Cannabinoid-Rechner) | Umbenannt | Seite heißt „Grow-Rechner“ und steht im Grow Studio |
| A18 | P2 | Suche | Unterbereiche von Entdecken (Breeder, Genetik, Atlas, Academy) nicht direkt ansteuerbar | Ergänzt | als Navigationsziele in `Strg K` |
| A19 | P2 | Entdecken (Katalog) | Ergebniskarten dicht: Typ, Auto, Eltern, THC/CBD/Blütezeit, sechs Evidenzmarken, Quellenzahl | **Beibehalten** | Die Evidenzmarken zeigen Herkunft und fehlende Daten. Sie zu verstecken widerspräche den Vorgaben (Unsicherheit nicht verbergen). |
| A20 | P2 | Sortenseite | Laborproben-Abschnitt mit 20+ Terpenzeilen | **Beibehalten** | wissenschaftliche Angabe mit Kennzeichnung „Namensabgleich, nicht breeder-spezifisch“; Kürzen hätte die Einordnung erschwert |
| A21 | P2 | THC Lab | großer Warnhinweis über dem Rechner | **Beibehalten** | Sicherheitsinformation; bleibt sichtbar (ausblendbar wie bisher) |
| A22 | P2 | Konto | 2FA-Hinweis oben auf der Übersicht | **Beibehalten** | Sicherheitsempfehlung, mit „Später“ ausblendbar |
| A23 | P2 | Grow-Seite | großes Titelbild mit Tag/Phase-Kästen | **Beibehalten** | Identität des Projekts, liefert die wichtigsten Kennzahlen auf einen Blick |
| A24 | P3 | Seitenleiste | bei 900 px Fensterhöhe wurde „Verlauf“ abgeschnitten | Vereinfacht | engere Abstände, alle Einträge sichtbar |
| A25 | P3 | Konto | Sprungmarken-Leiste mit 11 Einträgen | **Beibehalten** | funktioniert als Inhaltsverzeichnis der langen Seite |
| A26 | P2 | Konto | Konto ist weiterhin eine lange Seite (Profil, Sicherheit, Passkeys, Sitzungen, Daten, Gerät, Datenschutz-Center, Freigaben) | **Offen** | Aufteilung in Unterseiten mit eigenen Adressen hätte Deep Links (`#datenschutz`) und Tests berührt; nach 6.0.1 sinnvoll |
| A27 | P3 | Entdecken | 8 Reiter, mobil horizontal scrollend | **Offen** | Zusammenlegen (z. B. „Live & Bilder“ + „Galerie“) braucht Prüfung der Datenquellen |
| A28 | P3 | Gemeinsam | Reiter mobil ohne Scroll-Hinweis (aus 5.8 bekannt) | **Offen** | kosmetisch |
| A29 | P2 | Seitenleiste | einklappbare, kompakte Seitenleiste | **Offen** | ohne klaren Nutzen bei 240 px Breite; nicht umgesetzt, um keine zusätzliche Einstellung einzuführen |
| A30 | P2 | Formulare/Dialoge | einheitliche Bausteine (`Modal`, `Fields`, `Confirm`, `SaveButton`) bereits vorhanden | **Beibehalten** | stichprobenweise geprüft (Schnell-Log, Grow, Journal, Teilen); keine abweichenden Varianten gefunden |

## Gemeinsame Bausteine – Prüfung auf doppelte Varianten

| Baustein | Befund | Ergebnis |
| --- | --- | --- |
| Karten | `Card` und Rohklasse `card` | Rohklasse wird für Sonderlayouts genutzt (Kennzahlenzeile, Leerzustand); keine zweite Komponente |
| Seitenköpfe | `PageHeader` und eigene Köpfe auf den Entdecken-Seiten | Eigene Köpfe bleiben (Suchfeld bzw. Bild im Kopf); Titelgröße jetzt einheitlich über `page-title` |
| Schwebender Plus-Knopf | `CaptureFab` | **entfernt** (ersetzt durch Erfassen in der unteren Navigation) |
| Schnellaktionen der Übersicht | `QuickAction` | **entfernt** (doppelt zu „Neu“) |
| Grow-Karte | `GrowCard` lag in der Übersicht, genutzt nur von der Grow-Liste | nach `components/grow/GrowCard.tsx` verschoben |
| Navigation | `PRIMARY_NAV` + `SECONDARY_NAV` | ersetzt durch `NAV_GROUPS` + `SETTINGS_NAV`, eine Quelle für Seitenleiste, Mobil und Suche |
