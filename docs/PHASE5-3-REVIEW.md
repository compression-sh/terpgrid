# TERPGRID 5.3 – Abschluss-Review

Stand: 25.11.2026 · Version 5.3.2-rc.1 · Branch `claude/phase-5-3-review` (Basis `main` = `5d5f604`, PR #9 gemergt).
PR #9 war beim Start des Reviews bereits gemergt (25.11.2026, 11:34 UTC). Korrekturen gehen daher in einen eigenen Folge-PR.
Kein Deployment, kein Merge. Der Refresh-Timer bleibt aus.

## 1. Abnahmematrix (Phase-5.3-Masterprompt)

Legende: **V** vollständig · **T** teilweise · **N** nicht umgesetzt · **F** fehlerhaft (im Review gefunden, Spalte „Nachweis“
nennt die Korrektur) · **U** noch nicht getestet. Jede Bewertung stützt sich auf die genannten Nachweise, nicht auf die CI allein.

| Bereich | Status | Nachweis / Einschränkung |
|---|---|---|
| Premium-UI/UX aller Hauptseiten | **T** | Gezielte Korrekturen (Grow, Fotos, Kalender, Discover, Sammlung, Labor); **keine** flächendeckende Design-System-5.0-Überarbeitung |
| Dashboard | **V** / T | Funktionen vollständig (anpassbar, Erinnerungen je Serie, Workflows 18/18); kein Neu-Design |
| Strain Encyclopedia (Discover, Sortenseite) | **V** | Suche, Filter, Belegarten je Feld, verwandte Sorten; Workflow „Sorte suchen“ grün |
| — Bilder im Katalog | **N** | 0 Fotos mit belegten Rechten (bewusst; keine ungeklärten Bilder) |
| CI-Strains-Pro-Datenanreicherung | **T** | StrainAPI für 37 Sorten (288 Angaben); Terpene nur 3,4 % – siehe 3. |
| Breeder-Profile | **V** | Profil, Typverteilung, Elternsorten, Seedbanks; Workflow grün |
| Genetics Explorer | **V** / U | Graph, Mehrdeutigkeit, Zoom/Pan, Vollbild (E2E); **Pinch auf echtem Gerät nicht getestet** |
| Growlogs | **V** | Übersicht mit Aufgaben, Sorten, Ausrüstung; Workflows Grow/Pflanze/Log grün |
| Messwertverwaltung | **T** | Kontext, Einheiten, Zielbereiche, CSV, Diagramme; **keine Ausreißer-Markierung** |
| Plant Photo Studio | **T** | Raster, Vollbild, Vorher/Nachher-Regler, Zeitraffer-Wiedergabe, GPS-Entfernung; **kein Zeitraffer-Export** |
| Grow-Vergleich | **V** | bis 4 Grows, Zeitraum, Messkontext, CSV (Tests) |
| Phänotyp-Dokumentation | **T** | Experimente je Grow, Phänotyp-Karte im Pflanzenprofil; **kein Vergleich über mehrere Grows** |
| Grow-Reports | **V** | Druck/PDF über den Browser, Abschnitte wählbar; nur lokal erzeugt |
| THC Lab | **V** | Rechenlogik unverändert, Tests grün |
| Journal | **V** | Suche, Filter, Kalender, Monatsgruppen, Entwurf (E2E 6/6) |
| Collection | **F → V** | **Mobil fehlerhaft** (Namen „Bl…“, Chips über Knöpfen) → korrigiert, Screenshot |
| Cannabis Academy | **T** | 30 Artikel, Lernpfade, Glossar, Prüfstatus; **keine externe Fachprüfung** |
| Terpene Atlas | **V** | 27 Verbindungen, Systematik, Vergleich, Rad |
| Lab Insights | **F → V** | **Y-Achse abgeschnitten** (mobil) → korrigiert |
| Persönliche Analytics | **V** | Zeitraum-/Grow-Filter, 4 CSV-Exporte |
| Kalender | **V** | Monat, Woche, Liste, Pflanzenfilter, Wiederholungen; keine Push-Benachrichtigung (ehrlich ausgewiesen) |
| Globale Suche | **V** | alle Bereiche, Deeplinks; Fokus-Fehler in PR #9 behoben |
| Mobile UX | **V** / U | 360–1024 px ohne Überlauf, Workflows 390 px 18/18; **kein Test auf echten Geräten (iOS/Android)** |
| PWA | **F → V** | **Offline-Start nach Erstbesuch fehlerhaft**, **Offline-Modus synchronisierte nicht automatisch** → beides korrigiert und getestet |
| Sicherheit & Datenschutz | **V** | 159 Server-Tests (u. a. 34 Auth, 14 Isolation), Client-Isolation per E2E |
| Private Grow-Freigabe | **N** | bewusst nicht umgesetzt (eigenes Sicherheitsdesign nötig) |
| Barrierefreiheit | **V** / U | axe 0 Verstöße (26 Seiten); **kein Screenreader-Test mit echten Hilfsmitteln** |

## 2. Im Review behobene Fehler

| # | Fehler | Ursache | Korrektur |
|---|---|---|---|
| 1 | PWA: Nach dem ersten Besuch startete die App offline als leere Seite | Service Worker speicherte nur `index.html`; JS/CSS kamen erst beim zweiten Online-Laden in den Cache | Build schreibt alle gehashten Assets in den Service Worker; Vorab-Cache beim Installieren |
| 2 | PWA: Cache-Treffer fehlten trotz gespeicherter Dateien | Server sendet `Vary: Origin`, Modul-Skripte senden Origin | `ignoreVary` nur für öffentliche, gehashte Dateien |
| 3 | „Offline weiter“: Nach Rückkehr des Servers keine Synchronisation bis zum Neuladen | Kein erneuter Verbindungsversuch | Prüfung bei `online` und alle 30 s; Sitzung wird erst geprüft, wenn der Server antwortet (kein Rauswurf bei Serverausfall) |
| 4 | Sammlung mobil unlesbar | Foto, Inhalt, Mengen- und Aktionsknöpfe in einer Zeile | Knöpfe mobil unter dem Inhalt |
| 5 | Labor-Diagramm mobil: Achse abgeschnitten | Achsenbreite 58 px für „220 mg/g“ | 76 px |
| 6 | Doppelte Logik | Wiederholungstext im Kalender dupliziert `repeatLabel` | gemeinsame Funktion |
| 7 | Toter Code | 9 Exporte ohne Verwendung (auch nicht in Tests) | entfernt |

## 3. Katalog-Datenabdeckung (CI-Strains-Pro, tatsächlich gemessen)

`catalog-audit` auf der Entwicklungsdatenbank (gleiche Quelldatei wie in Produktion, Commit `80fbe5d40fac`,
Parser v3): 16.710 Sorten, 494 Breeder, 21.210 Angebote.

| Feld | vorhanden | fehlend | Abdeckung | widersprüchlich | verworfen | Belegart Breeder / Seedbank / Datenbank |
|---|---|---|---|---|---|---|
| Breeder | 16.710 | 0 | 100,0 % | 0 | 0 | 4.837 / 11.873 / 0 |
| Weitere Bezeichnungen | 14.431 | 2.279 | 86,4 % | 0 | 0 | 3.051 / 11.380 / 0 |
| Sortentyp (Indica/Sativa/Hybrid) | 6.373 | 10.337 | 38,1 % | 90 | 0 | 3.766 / 2.607 / 0 |
| Typ-Bezeichnung laut Shop | 3.310 | 13.400 | 19,8 % | 0 | 0 | 3.310 / 0 / 0 |
| Indica-/Sativa-Anteil | 4.365 | 12.345 | 26,1 % | 141 | 204 | 1.893 / 2.472 / 0 |
| Seed Type (fem./regulär) | 6.071 | 10.639 | 36,3 % | 0 | 0 | 3.831 / 2.240 / 0 |
| Blüteverhalten (Auto/photoperiodisch) | 16.710 | 0 | 100,0 % | 0 | 0 | 4.837 / 11.873 / 0 |
| Genetik (strukturiert) | 10.726 | 5.984 | 64,2 % | 738 | 3.490 | 2.753 / 7.965 / 37 |
| Genetik (Text der Quelle) | 6.972 | 9.738 | 41,7 % | 0 | 0 | 3.182 / 3.790 / 0 |
| THC | 7.391 | 9.319 | 44,2 % | 248 | 4.496 | 4.033 / 3.343 / 28 |
| CBD | 3.902 | 12.808 | 23,4 % | 32 | 441 | 3.066 / 825 / 12 |
| Weitere Cannabinoide | 0 | 16.710 | 0,0 % | – | – | Quelle liefert keine |
| Terpene (Nennung) | 571 | 16.139 | 3,4 % | 0 | 526 | 516 / 25 / 30 |
| Terpene (Mengen) | 0 | 16.710 | 0,0 % | – | – | keine Quelle; nichts erzeugt |
| Aromaprofil | 3.854 | 12.856 | 23,1 % | 0 | 377 | 2.113 / 1.708 / 37 |
| Beschriebene Wirkung | 1.729 | 14.981 | 10,3 % | 0 | 0 | 337 / 1.392 / 0 |
| Blütezeit | 10.564 | 6.146 | 63,2 % | 153 | 163 | 3.630 / 6.934 / 0 |
| Wuchshöhe | 4.966 | 11.744 | 29,7 % | 0 | 0 | 3.385 / 1.581 / 0 |
| Ertrag | 5.431 | 11.279 | 32,5 % | 0 | 0 | 3.036 / 2.395 / 0 |
| Beschreibung | 37 | 16.673 | 0,2 % | 0 | 0 | 0 / 0 / 37 (StrainAPI) |
| Bilder | 0 | 16.710 | 0,0 % | – | – | keine mit belegten Rechten |

**Quellen:**
- CI-Strains-Pro (CC BY 4.0): Angebote von Breeder-Shops und Seedbanks.
- StrainAPI: 37 exakt zugeordnete Sorten, 288 Angaben, Abgleich `exact` 37 / `probable` 2 / `ambiguous` 4 / `none` 47.
- Laborwerte: keine im Katalog. Laborberichte bleiben privat und an ihre Probe gebunden.

**Werden vorhandene Quelldaten vollständig genutzt?** Ich habe die 53 Spalten der Quelldatei gegen den Parser geprüft:
- **Terpene:** Die 526 verworfenen Werte sind reine Zahlen wie „3“ oder „1“ (Scraper-Artefakte, v. a. North Atlantic Seed Co.
  und The Attitude). Sie enthalten keine Terpennamen, das Verwerfen ist also korrekt. Es gibt keine weitere Terpenquelle in der Datei.
- **Nicht genutzt** wird `lineage_formula` (13.178 Zeilen). Das ist eine vom Scraper aus Slugs abgeleitete Kette
  („acapulco-gold-x-mexican-sativa x columbian-gold“), verlustbehaftet und ohne Breeder-Zuordnung. Die Übernahme würde
  Großeltern-Beziehungen erraten und unterbleibt deshalb bewusst. Ebenfalls nicht genutzt werden `filial_generation`,
  `backcross_generation` und `selfed_generation` (523 / 150 / 175); ob sie in `generation` (830) enthalten sind, ist nicht geprüft.
- **Alle übrigen inhaltlichen Spalten** werden ausgewertet.

**Ergebnis:** Höhere Terpen- und Cannabinoid-Abdeckung ist nur mit einer neuen, lizenzierten Quelle möglich, nicht aus den vorhandenen Daten.

## 4. Produktionsreife

| Prüfung | Ergebnis |
|---|---|
| **Restic Backup/Restore** (Images `5.3.2-test` = `405a741`, isoliert) | `backup.sh` ok, `restic check` ohne Fehler; `restore-test.sh` entschlüsselt 110/12, 0 Fehler; echter Restore nach simuliertem Verlust: Stand identisch, 6/6 Fotos bytegleich, Academy-Fortschritt, Laborberichte, Claims erhalten, 0 verwaiste Verweise, zweites Konto isoliert; danach 0 Container/Volumes |
| **Migration bestehender Installation** | Klon auf `d6b80f2` (5.3.0-rc.1) mit Daten → `upgrade.sh --no-build 9684317`: Preflight bestanden, automatisches Backup, Images 5.3.1-rc.1, 110 Datensätze / 12 Dateien / 16.710 Sorten unverändert, `verify-data` 0 Fehler, 6/6 Fotos bytegleich |
| **Rollback** | `rollback.sh 5.3-test`: „Schema passt zu dieser Version“, gesund, Daten unverändert |
| **Verschlüsselte Nutzerdaten** | Klartextsuche in `records.payload`: 0 Treffer; Entschlüsselung nur mit Master-Key |
| **Account-Isolation (Server)** | `isolation.test.ts` 9 + `isolation-all.test.ts` 5 Tests (alle Sync-Bereiche, RLS, Dateien) |
| **Account-Isolation (Client)** | E2E mit zwei Konten im selben Browser: kein Datensatz, Entwurf oder Suchtreffer von A bei B; beide Abmeldepfade (lokale Kopie löschen / behalten) geprüft |
| **Private Medien** | Test „Datei-Zugriffe mit fremden, verschachtelten oder manipulierten IDs schlagen fehl, ohne Existenz zu verraten“; Service Worker cacht nie `/api/` (Test) |
| **Offline-Cache** | Nur öffentliche App-Hülle im Cache; private Daten in kontoeigener IndexedDB; Offline-Start, Offline-Eintrag, Sync nach Rückkehr, Serverausfall ohne Rauswurf (E2E) |
| **Session-Sicherheit** | 34 Auth-Tests: `__Host-`-Cookie, Rotation beim Login, Idle-/Absolut-Timeout, CSRF + Origin, Widerruf, HTTPS-Pflicht in Produktion |
| **Fehlerbehandlung** | Fehlergrenze je Ansicht (5.3.0); keine Laufzeitfehler in 50 Seitenaufnahmen und allen Workflows |
| **Docker-Deployment** | Stack aus Images dieses Stands gesund, Preflight grün, kein Docker-Socket eingebunden |
| **Katalogimport** | `import-catalog.sh --file`: Prüfsumme, 16.710/494/21.210 in 4–6 s |
| **Aktualisierung (Refresh)** | `enrich-catalog --refresh` mit Drosselung (Tests in `enrich.test.ts`); `install.sh`/`upgrade.sh` enthalten keinen `systemctl`-Aufruf; Timer **nicht aktiviert** |

## 5. Performance (gemessen)

| Messung | Desktop 1440 | Mobil 390 |
|---|---|---|
| Anmeldung bis Dashboard (inkl. Argon2id) | 1.297 ms | 1.140 ms |
| Seitenwechsel bis Inhalt, Median aus 3, 15 Seiten | 15–118 ms | 15–81 ms |
| Grow-Seite bis Überschrift | 65 ms | – |

**API**, Median aus 7 Aufrufen:

| Endpunkt | Median |
|---|---|
| Katalogsuche | 14 ms (Seite 2: 26 ms) |
| Sortendetail | 18–24 ms |
| Breeder | 4 ms |
| Abstammung | 4 ms |
| Sorten je Terpen | 82 ms |
| Sync 500 Datensätze | 10 ms |

**Bundle:** JS gesamt 1,76 MB (gzip Hauptdatei 154 kB). Der Vorab-Cache des Service Workers umfasst 106 Dateien (2,17 MB)
und lädt einmalig nach dem ersten Besuch.

## 6. Tests

| Prüfung | Ergebnis |
|---|---|
| Frontend (vitest) | 258/258 in 30 Dateien (neu: Service Worker) |
| Server (vitest, PostgreSQL inkl. RLS) | 159/159 in 12 Dateien |
| TypeScript, ESLint | 0 Fehler (10 bestehende Hook-Warnungen) |
| shellcheck, npm audit | 0 / 0 |
| axe WCAG 2.2 AA, 26 Seiten | 0 Verstöße |
| Mobil-Durchlauf 360/390/430/768/1024 px, 24 Seiten | 0 Überlauf, 0 Laufzeitfehler |
| Kern-Workflows (neues Konto) | 18/18 bei 390 px und 1440 px |
| Interaktionen (Vollbild, Deeplink, Agenda, Filter, Menü) | 16/16 |
| Journal-Entwurf | 6/6 |
| Konto-Isolation im Browser | 7/7 |
| PWA offline | 10/10 |
| Serverausfall | 3/3 |
| Restic, Upgrade, Rollback | siehe 4. |

## 7. Code-Qualität

- **Duplikate:** Der Wiederholungstext im Kalender ist zusammengeführt. Weitere Duplikate fand die Suche nach gleichen Textbausteinen nicht.
- **Toter Code:** 9 ungenutzte Exporte entfernt. `ORAL_BIOAVAILABILITY` bleibt als belegte Konstante (Grotenhermen 2003) stehen,
  obwohl sie derzeit nicht verwendet wird. Unimportierte Dateien: keine.
- **Abhängigkeiten:** keine neuen. `npm audit` 0.
- **Hardcodierte Werte:** Die CannaLib-Basis-URL lag doppelt vor (Frontend ungenutzt, Server genutzt); die Frontend-Kopie ist entfernt.
  Das Prüfintervall im Offline-Modus (30 s) ist bewusst fest und dokumentiert.
- **API-Zugriffe:** Neue Funktionen lesen nur die kontoeigene lokale Datenbank. Der Server war in 5.3 unverändert;
  die einzige neue Netzanfrage ist `GET /api/auth/config` (öffentlich) im Offline-Modus.
- **Performance:** Das pulsierende Element der Grow-Seite ist die Markierung der laufenden Phase, kein Ladeproblem.

## 8. Empfehlung für die nächste Phase

1. **Design System 5.0** als eigenes Vorhaben: Typografie- und Abstands-Tokens und ein einheitlicher Seitenkopf
   (Discover, Atlas und Academy nutzen eigene Köpfe), dazu ein Review aller Seiten mit Vorher/Nachher.
2. **Tests auf echten Geräten:** iOS Safari (PWA-Installation, Offline, Pinch im Genetik-Graph) und Android Chrome;
   Screenreader-Test (VoiceOver/TalkBack) für Formulare, Dialoge und Diagramme.
3. **Datenquellen:** eine lizenzierte Quelle für Terpen- und Cannabinoid-Laborwerte und für Sortenbilder mit Rechten prüfen.
   Die vorhandenen Daten sind ausgeschöpft.
4. **Grow-Werkzeuge:** Ausreißer-Markierung bei Messwerten (nur Kennzeichnung, keine Korrektur), Zeitraffer-Export
   (WebCodecs/Canvas, lokal), Phänotyp-Vergleich über Grows.
5. **Private Grow-Freigabe** erst nach einem eigenen Threat-Model: Freigabeschlüssel, Ablauf, Widerruf, Protokoll und Isolationstests.

## 9. Freigabe-Einschätzung

Release-Kandidat **5.3.2-rc.1**. Alle oben genannten Prüfungen sind grün, und die drei Funktionsfehler aus dem Review
(PWA-Offline-Start, PWA-Resync, Sammlung mobil) sind behoben und getestet. Die als **T**, **N** und **U** markierten
Punkte sind keine Fehler, sondern offene Anforderungen.

Nach dem Merge: `upgrade.sh`, dann `restore-test.sh`. Kein Katalog-Neuimport nötig.
