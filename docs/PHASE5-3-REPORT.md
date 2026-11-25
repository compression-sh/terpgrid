# TERPGRID 5.3 – Premium Experience, Feature-Integration & Produktionsqualität

Stand: 25.11.2026 · Version 5.3.0-rc.1 (Release-Kandidat, nicht veröffentlicht, nicht deployt)
Branch `claude/phase-5-3`, baut auf PR #7 (Korrekturen nach #6) auf. Keine Datenbank-Migration.

## 1. Vorgehen

1. **Audit vor der Umsetzung:** Jede Anforderung wurde gegen den vorhandenen Code geprüft, damit nichts doppelt entsteht.
   Viele Punkte gab es schon: Grow-Vergleich mit Ausgaben, Umwelt, Fotos und Ergebnissen; private Berichte mit Druck/PDF;
   Genetik-Graph mit Zoom und Pinch; Journal-Suche und -Statistik; Sammlungssuche.
2. **Baseline:** 50 Screenshots (25 Seiten × 1440/390 px) vom Stand vor der Phase (db6927e), mit realistischen Testdaten
   (2 Grows, 3 Pflanzen, 67 Aktivitäten, 6 Fotos, Laborberichte, Journal, Sammlung, Erinnerungen).
3. **Umsetzung** der Lücken und Baseline-Befunde in kleinen, getesteten Commits.
4. **Verifikation:** Tests, Typprüfung, Lint, Build, axe, Mobil-Durchlauf, isolierter restic-Backup/Restore, Messung der API-Zeiten.

## 2. Feature-Matrix

| Bereich | Vorher vorhanden | In 5.3 ergänzt/geändert | Status |
|---|---|---|---|
| Robustheit | – | Fehlergrenze je Ansicht; Kalender liest beschädigte Wiederholungsregeln sicher | ✓ |
| Dashboard | Erinnerungen je Termin (Duplikate) | eine Zeile je Serie mit Rhythmus, „+N weitere“; Grow-Karte bei 360 px ohne Überlauf | ✓ |
| Navigation | Seitenleiste auf niedrigen Bildschirmen abgeschnitten | kompaktere Abstände, Ausblendverlauf, Fußzeile verdichtet | ✓ |
| Sortenkatalog | Profile, Suche, Herkunft je Angabe | Parser v3 (keine Aroma-/Werbetexte als Eltern), „Gleiche Elternangaben“, „Weitere Sorten von …“ | ✓ |
| Admin/Abdeckung | Vollständigkeits-Audit, Prüfliste | Systemansicht: Katalogstand, Zwischenspeicher, letzter Lauf, Dateibelegung | ✓ |
| Genetics Explorer | Katalog-Graph, mehrdeutig/unbekannt markiert, Zoom/Pan/Pinch | geprüft; Eltern nur aus Quelle, nie abgeleitet; Parser v3 entfernt Scheineltern | ✓ (unverändert) |
| Growlogs | Vergleich, Berichte, Experimente | Pflanzenprofil: Phänotyp-Karte, Verlauf seitenweise (20 Einträge) | ✓ |
| Fotos | lokale Anzeige | Bilder erscheinen nach Login auf neuem Gerät, sobald heruntergeladen | ✓ (Fehler behoben) |
| THC Lab | Rechner mit Tests | keine Änderung an der Rechenlogik | ✓ (unverändert) |
| Journal | Suche, Filter, Kalender | mobil: Suche oben, Filter einklappbar, Monatsgruppen | ✓ |
| Sammlung | Suche, Mengenknöpfe | Mengenverlauf (max. 50 Einträge), Tag-Filter | ✓ |
| Academy | 30 Artikel, Lernpfade, Glossar | Prüfstatus je Artikel; ältere Aussagen geprüft, Genetik-Absatz korrigiert, PubChem-Beleg THC/THCA | ✓ |
| Terpen-Atlas | 27 Verbindungen, Vergleich, Rad, Belege | chemische Systematik; Touch-Ziele ≥ 24 px | ✓ |
| Insights | Kennzahlen, Diagramme | Zeitraum-/Grow-Filter, 4 CSV-Exporte, Laborvergleich | ✓ |
| Mobil/PWA | responsive | Durchlauf 360/390/430/768/1440 px: kein Überlauf, keine Laufzeitfehler | ✓ |
| Monitoring | API/DB-Health, Backup-Frische, Fehler | Katalog-/Refresh-Status, Dateibelegung | ✓ |
| Private Grow-Freigabe | – | **nicht umgesetzt** (siehe 9.) | bewusst deaktiviert |

## 3. Vorher/Nachher

Bilder in `docs/screenshots/phase-5-3/`, jeweils links vorher, rechts nachher:

- `vorher-nachher-dashboard.jpg`, `vorher-nachher-dashboard-mobil.jpg`: Erinnerungen je Serie, Fotos sichtbar, Seitenleiste
- `vorher-nachher-insights.jpg`: Filterleiste, CSV-Export, Laborvergleich
- `vorher-nachher-sortenseite.jpg`: „Weitere Sorten von Sin City Seeds“
- `vorher-nachher-academy-artikel.jpg`: Prüfstatus im Artikel
- `vorher-nachher-journal-mobil.jpg`: kompakte Filter, Monatsgruppen
- `vorher-nachher-pflanze-mobil.jpg`: Phänotyp-Karte, Verlauf seitenweise
- `nachher-admin-system.jpg`, `nachher-atlas-systematik.jpg`, `nachher-sammlung.jpg`

Alle 50 Nachher-Aufnahmen: keine Laufzeitfehler, jede Seite mit Überschrift. Gesamt-Ladezeit des Durchlaufs vorher 66,2 s,
nachher 66,2 s, also keine Verschlechterung.

## 4. Katalog & Genetik

- **Parser v3** auf dem Entwicklungsstand, gleiche Quelldatei (CI-Strains-Pro, Commit 80fbe5d40fac):

  | Kennzahl | vorher | nachher |
  |---|---|---|
  | auffällige Elternangaben | 388 | 4 (als „unbekannt“ markiert) |
  | Sorten mit Abstammung | 11.120 | 10.718 |
  | StrainAPI-Angaben | 304 | 304 (erhalten) |

  Die 402 entfallenen Abstammungen waren Aroma- oder Werbetexte, z. B. „notes of citrus“. Echte Namen in Kleinschreibung
  werden bewusst nicht geraten.
- **Verwandte Sorten** stammen nur aus dokumentierten Daten: identische Elternangaben bzw. derselbe Breeder.
  Breeder-spezifische Identitäten bleiben getrennt.
- **Upgrade:** `./import-catalog.sh` ausführen. Die neue Parser-Version verarbeitet dieselbe Datei neu; Nutzerdaten sind nicht betroffen.
- **Refresh-Prüfung:** `enrich-catalog --refresh` ist auf höchstens einen Lauf je 20 h gedrosselt und ruft nur Angaben ab,
  die in 7 Tagen ablaufen. Der systemd-Timer ist **nicht aktiviert**. Der Status ist jetzt in der Systemansicht sichtbar:
  ok / fällig / überfällig.

## 5. Growlog, THC Lab, Journal, Sammlung

- Pflanzenprofil: Phänotyp-Notizen aus Experimenten neben den Notizen; Verlauf mit „N ältere Einträge anzeigen“.
- Fotos: `watchPhotoUrl` lädt nach, sobald die Daten synchronisiert sind (Test `photo-url.test.ts`).
- THC Lab: Rechenlogik unverändert, bestehende Tests grün.
- Journal: `byMonth` getestet, mobil kompakter.
- Sammlung: `withQuantityChange` getestet; Verlauf ist Teil des verschlüsselten Datensatzes.

## 6. Academy & Atlas

- Jeder der 30 Artikel trägt einen Prüfstatus:
  - die 18 Leitfäden aus 2.1: „volltext“;
  - Genetik, Forschung, Cannabinoide und Begriffe: „teilweise“;
  - die übrigen Grundlagen, darunter alle Gesundheitsthemen: „bibliografisch“.
  Im Artikel steht ausdrücklich, dass eine externe Fachprüfung aussteht.
- Korrigiert: Der Genetik-Absatz entspricht jetzt Schwabe & McGlaughlin (2019). Die THC/THCA-Umrechnung ist mit PubChem
  belegt (CID 16078/98523; 314,5/358,5 g/mol; Faktor 0,877).
- Atlas: Systematik-Karte. Die Einordnung wird per Test gegen die Summenformeln geprüft.

## 7. Sicherheit & Datenschutz

- Verschlüsselung, RLS und Autorisierung sind unverändert. Neue Felder (Mengenverlauf) liegen im verschlüsselten Datensatz.
- Die Systemansicht ist nur für Admins (Test: 403 für Nutzer) und enthält keine Inhalte oder Login-Daten.
  Die Dateibelegung wird als Summe aus `users.storage_bytes` gelesen, nicht aus der RLS-geschützten Tabelle `files`.
- Die Fehlergrenze zeigt Details nur lokal in der Konsole; nichts wird an Dritte gesendet.
- `npm audit --omit=dev`: 0 Schwachstellen (Frontend und Server).

## 8. Backup & Restore (isoliert, aktuelle Images)

Der Test lief mit eigenem Compose-Projekt im Scratch-Verzeichnis: Images `terpgrid-api/web:5.3-test`, Ports 18080/18443,
lokales restic-Repository. Danach wurde alles entfernt (Container, Volumes, Repository, Secrets).

| Schritt | Ergebnis |
|---|---|
| Testdaten | 2 Konten, 110 Datensätze, 12 Dateien (335 KB), Katalog 16.710 Sorten, 541 Sorten mit Terpenangaben, 3 Claims/Matches, 1 Lauf, Academy-Fortschritt |
| Verschlüsselung at rest | Klartextsuche („Evercrisp“, „klima-vpd“) in `records.payload`: 0 Treffer |
| `backup.sh` | ok in 8 s, Dump 4,0 MB, `restic check` (5 %): keine Fehler |
| `restore-test.sh` | 2 Konten · 110 Datensätze · 12 Dateien · Migrationen 001–006 · Katalog 16.710/494/21.210 · entschlüsselt 110/12 · 0 Fehler |
| simulierter Verlust | Laborberichte, Einstellungen und Grows gelöscht, Claims/Matches gelöscht, 3 Dateien entfernt |
| `restore.sh` | `verify-data`: 110/12, 0 Fehler |
| Prüfung auf App-Ebene | alle Stores vollständig, Academy-Fortschritt erhalten, 2 Laborberichte, 6/6 Fotos bytegleich, keine Daten des zweiten Kontos sichtbar, 0 kaputte Pflanzenverweise |
| Referentielle Integrität | 0 verwaiste Claims, Angebote, Datensätze oder Dateien; Claims 3, Matches 3, Läufe 1, Terpenangaben 541 |
| Monitoring nach Restore | Backup „ok“ mit Zeitpunkt; Katalogstatus ok, 3 gültige Angaben, DB ok |

## 9. Bewusst nicht umgesetzt

**Private Grow-Freigabe:** Eine sichere Freigabe bräuchte eigene Freigabe-Schlüssel, Ablauf, Widerruf, Zugriffsprotokoll
und eine Prüfung, dass keine Metadaten durchsickern. Das ist eine eigenständige Sicherheitsfunktion mit eigenem
Threat-Model und gehört nicht als Nebenprodukt in diese Phase. Die Funktion bleibt deaktiviert bzw. nicht vorhanden.
Berichte lassen sich weiterhin lokal drucken oder als PDF speichern.

## 10. Tests & Qualität

| Prüfung | Ergebnis |
|---|---|
| Frontend (vitest) | 248/248 in 27 Dateien (neue oder erweiterte Tests: calendar-robust, explorer, photo-url, academy, catalog) |
| Server (vitest, echte PostgreSQL inkl. RLS/Isolation) | 159/159 in 12 Dateien |
| TypeScript (Frontend und Server) | 0 Fehler |
| ESLint | 0 Fehler, 10 Warnungen (bestehende hooks-Hinweise) |
| Build | ok, JS gesamt 1,74 MB unkomprimiert (größte Datei index 487 kB / 153 kB gzip) |
| shellcheck `-S warning` | 0 |
| axe (WCAG 2.0/2.1/2.2 A+AA), 23 Seiten | 0 Verstöße |
| Mobil-Durchlauf 360/430/768 px, 24 Seiten | kein horizontaler Überlauf (2 Befunde bei 360 px behoben), keine Laufzeitfehler |
| Restore | siehe 8. |

**API-Zeiten** (Entwicklungsinstanz, Median von 7 Aufrufen):

| Endpunkt | Median |
|---|---|
| Katalogsuche | 14 ms (Seite 2: 27 ms) |
| Sortendetail inkl. verwandter Sorten | 14–18 ms |
| Breeder | 3 ms |
| Abstammung (Tiefe 3) | 3 ms |
| Sorten je Terpen | 75 ms |
| Systemansicht | 3 ms |
| Sync 500 Datensätze | 5 ms |

## 11. Einschränkungen

- Hängt von PR #7 ab: zuerst #7 mergen, dann diesen PR.
- Elternnamen in reiner Kleinschreibung werden nicht erkannt; das ist gewollt, es wird nichts geraten.
- Die Academy-Inhalte sind nicht extern fachlich geprüft; der Prüfstatus sagt das offen.
- Private Grow-Freigabe nicht vorhanden (siehe 9.).
- Kein Deployment; Refresh-Timer und neue Produktionsjobs sind nicht aktiviert.

## 12. Freigabe-Einschätzung

Release-Kandidat. Tests, Typprüfung, Build, a11y und Restore sind grün. Empfohlene Reihenfolge:

1. PR #7 mergen.
2. Diesen PR prüfen und mergen.
3. Auf dem VPS `upgrade.sh` ausführen.
4. `./import-catalog.sh` ausführen (Parser v3).
5. `restore-test.sh` ausführen.
6. Den Refresh-Timer nur nach bewusster Entscheidung aktivieren.
