# TERPGRID 5.3 „Grow Studio“ – Bericht

Stand: 25.11.2026 · Version 5.3.1-rc.1 (Release-Kandidat, nicht veröffentlicht, nicht deployt)
Branch `claude/phase-5-3-studio`, Basis `origin/main` = `d6b80f2`. Keine Migration, keine neuen Abhängigkeiten,
keine Server-Änderungen.

## 1. Ausgangslage (M0)

| Prüfung | Ergebnis |
|---|---|
| PR #7 | gemergt am 25.11.2026, 06:45 UTC; Head `db6927e` ist Vorfahre von `main` |
| PR #8 | gemergt am 25.11.2026, 06:45 UTC; Merge-Commit `d6b80f2` = aktueller `main` |
| Fehlende Änderungen | keine; alle Commits beider PRs sind in `main` |
| Offene lokale Arbeit | keine (Arbeitsverzeichnis sauber) |
| Baseline-Tests | Frontend 248/248, Server 159/159 (PostgreSQL inkl. RLS/Isolation) |

## 2. Implementierungs-Matrix

Status nach dem Audit des Codes und der Baseline-Screenshots von `main`, vor dieser Phase:

| Bereich | Status vorher | Befund | Umsetzung | Prio |
|---|---|---|---|---|
| Dashboard | Complete | anpassbar (Reihenfolge, Ausblenden), Erinnerungen je Serie seit 5.3.0 | keine Änderung | – |
| Globale Suche (Strg+K) | Needs polish | deckt alle privaten Bereiche, Katalog, Academy, Glossar und Atlas ab; Treffer führten nur zur Liste; **schnell getippte Zeichen gingen verloren** | Deeplinks zum Eintrag; Fokus-Fehler behoben | P1 |
| Discover | Needs polish | Filter belegen auf dem Handy die halbe erste Bildschirmhöhe | Filter mobil einklappbar, Zähler aktiver Filter | P2 |
| Sortenseite / Breeder | Complete | verwandte Sorten seit 5.3.0; Touch-Ziele < 24 px | Touch-Ziele | P3 |
| Genetics Explorer | Needs polish | Zoom/Pan/Pinch und Mehrdeutigkeit vorhanden; kein Vollbild | Vollbild-Modus | P2 |
| Terpen-Atlas | Complete | Systematik seit 5.3.0 | – | – |
| Academy | Complete | Prüfstatus seit 5.3.0; externe Fachprüfung weiter offen | – | – |
| Grow-Übersicht | Partially implemented | ohne Sorten/Breeder, anstehende Aufgaben und Ausrüstung | drei neue Karten | P1 |
| Grow-Aktionen mobil | Needs polish | 7 Knöpfe in 3 Zeilen | 2 Knöpfe + Menü | P1 |
| Messwerte | Complete | Kontext, Einheiten, Zielbereiche, CSV vorhanden | – | – |
| Schnell-Log | Complete | Entwurf vorhanden | – | – |
| Fotos | Needs polish | eine Gruppe pro Tag → viel Leerraum; Vergleichsregler, Zeitraffer und GPS-Entfernung vorhanden | Monatsgruppen, Datum je Kachel | P1 |
| Grow-Vergleich | Partially implemented | bis 4 Grows, Kontexthinweis; kein Export | CSV-Export | P2 |
| Berichte | Complete | Druck/PDF über den Browser | – | – |
| Bereiche & Ausrüstung | Complete | Sammlung mit Strom-Schätzung; im Grow nicht sichtbar | in der Grow-Übersicht verknüpft | P1 |
| THC Lab | Complete | Rechenlogik unverändert | – | – |
| Journal | Needs polish | kein Entwurf bei neuen Einträgen | Entwurf (Tab, je Konto) | P2 |
| Sammlung | Complete | Archiv, Tags, Mengenverlauf vorhanden | Deeplink blendet Archiv ein | P3 |
| Kalender | Partially implemented | Monat/Woche; keine Liste, kein Pflanzenfilter | Listenansicht, Pflanzenfilter | P1 |
| Lab Insights | Complete | `?report=` vorhanden | Suchtreffer nutzen es | – |
| Personal Analytics | Complete | Filter/CSV seit 5.3.0 | – | – |
| Grow-Freigabe | Missing | eigenes Sicherheitsdesign nötig | **nicht umgesetzt** (siehe 7.) | – |

## 3. Umgesetzt

- **Grow-Übersicht** (`components/grow/GrowContextCards.tsx`, `lib/grow/context.ts`):
  - **Anstehend:** offene Erinnerungen der nächsten 14 Tage, eine Zeile je Serie mit Rhythmus.
  - **Sorten & Genetik:** Sorten aus den Pflanzen-Verknüpfungen mit Breeder. Katalog- und Abstammungslink erscheinen
    nur bei einer echten CISP-Verknüpfung. Freitext-Sorten werden angezeigt, aber nie einer Katalogsorte zugeordnet.
  - **Bereich & Ausrüstung:** Bereiche der Pflanzen und die dort zugeordneten Geräte. Der Strom wird als
    „Schätzung aus deinen Angaben“ ausgewiesen, nur aus Leistung × Betriebsstunden. Geräte ohne Angabe werden
    genannt, aber nicht eingerechnet.
- **Mobile Grow-Aktionen:** Schnell-Log und Eintrag bleiben sichtbar; Fotos, Pflanze, Bearbeiten, Bericht und
  Experimente liegen im „…“-Menü. Am Desktop ist alles unverändert sichtbar.
- **Fotos:** Raster nach Monat gruppiert, Datum je Kachel.
- **Kalender:**
  - Ansicht „Liste“ (30 Tage, Tagesgruppen, „Heute“). Erinnerungen sind direkt abhakbar, auch per `?view=list`.
  - Pflanzenfilter innerhalb eines Grows.
  - Der Wiederholungstext nutzt `safeRepeat`.
- **Suche:**
  - Journal → `journal?entry=…`, Sammlung → `collection?item=…`, Labor → `lab-reports?report=…`,
    Erinnerung → `calendar?view=list`.
  - `useFocusTarget` scrollt zum Eintrag und hebt ihn 2,6 s hervor (berücksichtigt reduzierte Bewegung).
- **Befehlspalette:** Das Suchfeld bekommt den Fokus jetzt beim Öffnen (autoFocus und Layout-Phase).
  Vorher fehlten direkt nach Strg+K getippte Zeichen. Nach der Korrektur kamen 5 von 5 schnellen Eingaben vollständig an.
- **Discover mobil:** „Filter & Sortierung“ einklappbar, mit Anzahl aktiver Filter.
- **Genetik:** Vollbild per Knopf; Escape beendet es, die Seite scrollt nicht mit, der Graph wird neu eingepasst.
- **Journal-Entwurf** (`lib/drafts.ts`): nur in sessionStorage und je Konto getrennt; mit „Verwerfen“, wird beim
  Speichern entfernt und ist beim Bearbeiten nicht aktiv.
- **Grow-Vergleich:** CSV der Kennzahlen (wie angezeigt) und des Verlaufs (nur gemessene Punkte, mit Grow-Tag,
  Datum und Messkontext).

## 4. Vorher/Nachher

Bilder in `docs/screenshots/phase-5-3-studio/` (links vorher = `main`, rechts nachher):

- `vorher-nachher-grow-uebersicht.jpg`
- `vorher-nachher-grow-mobil.jpg`
- `vorher-nachher-fotos.jpg`
- `vorher-nachher-kalender-liste.jpg`
- `vorher-nachher-discover-mobil.jpg`
- nur nachher: `nachher-genetik-vollbild.jpg`, `nachher-suche.jpg`, `nachher-suche-deeplink.jpg`, `nachher-grow-menue-mobil.jpg`

## 5. Tests & Qualität

| Prüfung | Ergebnis |
|---|---|
| Frontend (vitest) | 255/255 in 29 Dateien (neu: grow-context, drafts, Deeplinks, Vergleichs-CSV) |
| Server (vitest, PostgreSQL inkl. RLS/Isolation) | 159/159 |
| TypeScript | Frontend und Server 0 Fehler |
| ESLint | 0 Fehler, 10 bestehende Warnungen |
| shellcheck `-S warning` | 0 |
| `npm audit --omit=dev` | 0 Schwachstellen (Frontend und Server) |
| axe (WCAG 2.0/2.1/2.2 A+AA), 26 Seiten | 0 Verstöße |
| Mobil-Durchlauf 360/390/430/768/1024 px, 24 Seiten | kein horizontaler Überlauf, keine Laufzeitfehler |
| Screenshot-Lauf 25 Seiten × 1440/390 | 0 Laufzeitfehler, jede Seite mit Überschrift |
| Interaktionstests (Vollbild, Deeplink, Agenda, Filter, Menü) | 16/16 |
| Journal-Entwurf | 6/6 |
| Kern-Workflows mit neuem Konto (s. u.) | je 18/18 bei 390 px und 1440 px, 0 Laufzeitfehler |

Die Kern-Workflows liefen mit einem frisch registrierten Konto über diese Schritte:

1. Registrierung und Anmeldung
2. Dashboard
3. Sortensuche
4. Breeder
5. Genetik
6. Atlas
7. Academy
8. Grow anlegen, Pflanze anlegen
9. Messung
10. Foto-Upload
11. Schnell-Log
12. Vergleich
13. Journal
14. Sammlung
15. Labor
16. Globale Suche mit Deeplink
17. Abmelden

Dabei hat das Registrierungs-Limit des Servers (HTTP 429) nach vielen Testkonten wie vorgesehen gegriffen.
Die Läufe wurden nach einem Neustart des Entwicklungsservers wiederholt.

## 6. Backup & Restore (isoliert, Images dieses Branches)

Der Test lief mit eigenem Compose-Projekt im Scratch-Verzeichnis: Images `terpgrid-api/web:5.3s-test` (Stand `dd8456b`),
Ports 18080/18443, lokales restic-Repository. Danach wurde alles entfernt (0 Container, 0 Volumes, Repository und Secrets gelöscht).

| Schritt | Ergebnis |
|---|---|
| Testdaten | 2 Konten, 110 Datensätze, 12 Dateien (335.178 B), 16.710 Sorten, 541 mit Terpenangaben, 3 Claims, 3 Matches, 1 Lauf, Academy-Fortschritt |
| Klartext in `records.payload` („Evercrisp“, „klima-vpd“, „Testeintrag“) | 0 Treffer |
| `backup.sh` | ok in 8 s, Dump 4,0 MB, `restic check`: keine Fehler |
| `restore-test.sh` | 2 Konten, 110 Datensätze, 12 Dateien, Migrationen 001–006, Katalog 16.710/494/21.210, entschlüsselt 110/12, 0 Fehler |
| Simulierter Verlust | Laborberichte, Einstellungen, Grows, Journal, Claims und Matches gelöscht, 4 Dateien entfernt (danach 95 Datensätze, 0 Claims) |
| `restore.sh` | `verify-data` 110/12, 0 Fehler; Stand danach identisch zu vorher |
| Prüfung auf App-Ebene | alle 12 Stores vollständig, Academy-Fortschritt erhalten, 2 Laborberichte, 6/6 Fotos bytegleich, keine Daten des zweiten Kontos, 0 kaputte Pflanzenverweise |
| Referentielle Integrität | 0 verwaiste Claims, Angebote, Datensätze oder Dateien |
| Monitoring nach Restore | Admin-Übersicht: Backup „ok“ mit Zeitpunkt; Systemansicht: Katalog „ok“, 3 gültige Angaben, DB ok, Dateibelegung 335.178 B |

**Katalog-Refresh:** Code und Timer sind unverändert gegenüber PR #7 (Drosselung ≥ 20 h, nur bei Ablauf in 7 Tagen).
Der Timer ist **nicht aktiviert**.

## 7. Sicherheit & Datenschutz

- Keine Änderung an Server, Authentifizierung, Verschlüsselung, RLS oder Sync.
- Alle neuen Ansichten lesen nur Daten des angemeldeten Kontos aus der kontoeigenen lokalen Datenbank.
- Entwürfe liegen nur in sessionStorage; der Schlüssel enthält die Kontodatenbank, ein anderes Konto im selben Tab sieht sie also nicht.
- Deeplinks enthalten nur zufällige Datensatz-IDs, keine Inhalte. Ohne Anmeldung zeigen sie nichts.
- **Private Grow-Freigabe bleibt bewusst nicht umgesetzt.** Sie bräuchte eigene Schlüssel je Freigabe,
  serverseitige Autorisierung verschachtelter Objekte (Pflanzen, Fotos, Dateien), Widerruf mit Schlüsselrotation,
  ein Protokoll und Isolationstests. Das passt nicht als Nebenprodukt in eine UI-Phase.

## 8. Leistung

| Messung | Ergebnis |
|---|---|
| JS-Bundle gesamt | 1.738.753 → 1.755.057 Byte (+0,9 %) |
| Hauptdatei | 487,2 → 489,6 kB (gzip 153,4 → 154,2 kB) |
| Neue Abhängigkeiten | keine |
| Neue Karten der Grow-Übersicht | rechnen nur über die Pflanzen dieses Grows, ohne zusätzliche Anfragen |
| API-Zeiten | unverändert (keine Server-Änderung; Werte s. `PHASE5-3-REPORT.md`) |

Die Seitenzeiten aus dem Screenshot-Lauf sind von festen Wartezeiten bestimmt und deshalb nicht als Leistungswert
aussagekräftig. Die Workflow-Schritte lagen zwischen 0,8 und 4,4 s. Das Maximum ist die Registrierung mit
bewusst langsamem Argon2id-Hash.

## 9. Offen / nicht umgesetzt

- **„Design System 5.0“:** Es gab keine flächendeckende Überarbeitung aller Seiten. Diese Phase hat gezielt die im
  Audit gefundenen Schwächen behoben. Eine einheitliche Typografie- und Abstands-Überarbeitung aller Seiten bleibt ein eigenes Vorhaben.
- **Mess-Ausreißer:** werden nicht automatisch markiert. Eigene Zielbereiche sind vorhanden.
- **Zeitraffer:** kein Videoexport, weiterhin nur Wiedergabe im Browser.
- **Vergleichsansicht für Phänotypen** über mehrere Grows: nicht umgesetzt (Experimente je Grow sind vorhanden).
- **Pflanzenfilter im Kalender:** gilt für Einträge und Fotos. Erinnerungen haben keinen Pflanzenbezug und bleiben sichtbar.
- **Academy/Atlas:** keine externe Fachprüfung; der Prüfstatus je Artikel sagt das offen.
- **Private Grow-Freigabe:** siehe 7.

## 10. Freigabe-Einschätzung

Release-Kandidat für die umgesetzten Punkte. Tests, Typprüfung, Build, axe, Mobil-Durchlauf, Workflows und der
isolierte Restore sind grün.

Nach dem Merge:
1. `upgrade.sh` ausführen.
2. `restore-test.sh` ausführen. Ein Katalog-Neuimport ist nicht nötig (Parser unverändert).

Kein Deployment und keine Aktivierung des Refresh-Timers ohne ausdrückliche Freigabe.
