# Phase 5.6 – Native Mobile Experience, PWA 3.0 & sichere Offline-Intelligenz

Stand: 5.6.0-rc.1 (Release-Kandidat, nicht veröffentlicht, nicht deployt) · Branch `claude/loving-gates-iyhnqa`, Basis `main` @ `ac6c3d6`.

Begleitdokumente:
- `PHASE5-6-OFFLINE-ARCHITECTURE.md`
- `PHASE5-6-MOBILE-THREAT-MODEL.md`
- `PHASE5-6-PWA-GUIDE.md`

Screenshots liegen in `docs/screenshots/phase-5-6/`.

## 1. Ausgangslage (M0)

- **PR #14 (Phase 5.5) ist gemergt:** `main` = `ac6c3d6` und enthält den CI-Fix `eb890ad`. Der Branch wurde von `origin/main` neu gestartet; kein gestapelter PR.
- **Vorher-Messung:**
  - 267 Frontend-Tests.
  - Service Worker mit sofortigem `skipWaiting` (Updates ohne Rückfrage).
  - Private Arbeitskopie blieb ohne Opt-in dauerhaft im Browser.
  - React lag im Diagramm-Chunk; dadurch wurden rund 440 kB Recharts bei jedem Start vorgeladen.
  - Kein `viewport-fit=cover`, kein Apple-Icon in 180 px, keine Manifest-Verknüpfungen.

## 2. Umgesetzt

| Meilenstein | Inhalt | Status |
| --- | --- | --- |
| M1 Design-System & iOS | Safe Areas (Kopfzeile, Navigation, Sheets, Seitenränder), `viewport-fit=cover`, 16-px-Eingaben auf Touch-Geräten, `overscroll-behavior`, Tap-Hervorhebung, Bottom Sheet mit Wischgeste (Alternative: ✕/Esc), Plus-Knopf, Scroll-Wiederherstellung, Ziehen zum Synchronisieren (nur installiert), „Bewegung reduzieren“ | fertig |
| M2 PWA-Lebenszyklus | Manifest (`id`, Verknüpfungen, `display_override`, Kategorien), Apple-Icon 180 px, Apple-Meta-Tags, Update erst nach Bestätigung, Offline-Ersatzseite, keine Ablage von `no-store`/`private`, einmalige Installationskarte, Anleitungen für iPhone/iPad/Android/Desktop | fertig |
| M3 Sichere Offline-Architektur | Offline als Opt-in je Konto und Gerät, Bereinigung beim Abmelden und Kontowechsel, nie bei ausstehenden Änderungen, Abmelden ohne Verbindung wird nachgeholt | fertig |
| M4 Offline-Einstellungen & Sync | Konto → Dieses Gerät (Schalter, Speicher, Aufschlüsselung, Jetzt synchronisieren, Löschen), Einstellungen → App, einheitliche Sync-Zustände (7 Begriffe), „Zugriff widerrufen“ in Bereichen | fertig |
| M5 Foto-Studio & Schnellerfassung | Originalauflösung (Metadaten trotzdem entfernt), Abbrechen, erneut versuchen, Beschreibung je Foto, HEIC/RAW-Hinweise; Schnellerfassung mit 9 Arten über bestehende Formulare, Rückmeldung lokal/synchronisiert | fertig |
| M6 Discover, Academy, Zusammenarbeit | Discover-Filter als Bottom Sheet (Evidenztrennung unverändert), Academy mit mobilem Inhaltsverzeichnis und „An der letzten Stelle weiterlesen“ (Fortschritt, Merken, Glossar bestanden bereits), Bereiche: einheitliche Zustände, mobil geprüft | fertig |
| M7 Push & Passkeys | Web-Push begründet **nicht** umgesetzt (siehe 6); Passkey-Fehlertexte präzisiert, Biometrie-Versprechen entfernt | fertig |
| M8 Performance & Barrierefreiheit | Chunk-Aufteilung korrigiert, Messung vorher/nachher, axe auf 6 Breiten × 8 Seiten, manuelle Prüfung | fertig |
| M9 Upgrade, Doku, PR | Docker-Upgrade 5.5 → 5.6 mit Backup/Restore/Rollback, 4 Dokumente, Screenshots, Version 5.6.0-rc.1 | fertig |

Keine Server- oder Schemaänderung: Phase 5.6 ist rein clientseitig plus Versionsnummer. Private Daten, Kontoisolation, Bereichsautorisierung und Verschlüsselung sind unverändert (per Prüfsummen belegt, siehe 7).

### Während der Tests gefundene und behobene Fehler
1. **Absturz beim Abmelden:**
   - Ursache: Ein Effekt gab das Ergebnis von `window.scrollTo()` zurück. Neuere Chromium-Versionen liefern dort ein Promise, React erwartete eine Aufräumfunktion.
   - Folge: Die Seite blieb nach dem Abmelden leer.
   - Gefunden durch die Mehrkonten-Regression, behoben.
2. **Abmelden ohne Verbindung blieb wirkungslos:**
   - Das Sitzungs-Cookie ist HttpOnly, deshalb war man beim nächsten Online-Start wieder angemeldet.
   - Jetzt wird das Abmelden beim nächsten Serverkontakt nachgeholt, bevor Daten laden.
3. **Dialoge ohne zugänglichen Namen:**
   - `Modal` und das neue `BottomSheet` waren nicht mit ihrer Überschrift verknüpft; Screenreader sagten nur „Dialog“.
   - Jetzt verknüpft über `aria-labelledby`.
4. **Recharts bei jedem Start:**
   - Rollup zog React in den manuellen Chunk `charts`.
   - React hat jetzt einen eigenen Chunk, `charts` lädt nur noch bei Diagrammen.

## 3. Tests

| Prüfung | Ergebnis |
| --- | --- |
| Frontend-Unit-Tests (`vitest`) | **288/288** (vorher 267; neu: Offline-Freigabe/Bereinigung, Sync-Zustände, Plattformerkennung, Service-Worker-Verhalten in Sandbox, Bildgrößen/Formate) |
| Server-Tests | unverändert (kein Servercode geändert), laufen in CI |
| Lint | 0 Fehler (9 bestehende Warnungen in unveränderten Dateien) |
| Browser-Smoke (`npm run e2e`, Lokalmodus) | bestanden (28 Routen mobil) |
| **Offline-/Mehrkonten-Regression** (Chromium, echte API, 2 Konten, ein Gerät) | **26/26** |
| **Mobil-Suite** (6 Breiten, axe, Überlauf, Plus-Knopf, Sheets, Update-Ablauf, iPhone-UA) | **16/16** |
| Docker-Upgrade 5.5.0-rc.1 → 5.6.0-rc.1 | bestanden (Details in 7) |

Die Offline-Regression prüft unter anderem:
- Standard „aus“; Abmelden löscht die Arbeitskopie.
- Offline-Freigabe ermöglicht den Offline-Start aus dem SW-Cache mit lokalen Daten.
- Nach dem Abmelden kein Offline-Fortsetzen ohne Passwort.
- Kontoisolation.
- Kontowechsel behält freigegebene Kopien.
- Rückfrage bei ausstehenden Änderungen; die Kopie bleibt.
- Offline-Abmelden beendet die Serversitzung beim nächsten Kontakt.
- Die Bereinigung verschont Kopien mit ausstehenden Änderungen.
- Geteiltes Gerät erzwingt „aus“ und löscht alles inklusive localStorage.
- SW-Caches enthalten keine `/api/`-Antworten und keine privaten Inhalte.

### Browser- und Gerätematrix (ehrlich)

| Umgebung | Getestet | Art |
| --- | --- | --- |
| Chromium (Playwright, headless) 360/390/430/768/1024/1440 px | ja | Emulation (Viewport, Touch, `isMobile`) |
| „iPhone 14“-Profil | ja | **nur Emulation in Chromium** (Safari-User-Agent, Viewport) – keine WebKit-Engine |
| WebKit (Safari-Engine) | **nein** | In dieser Umgebung nicht installiert; `playwright install` ist ausdrücklich ausgeschlossen |
| Firefox | **nein** | wie WebKit |
| Physische Geräte (iPhone, iPad, Android) | **nein** | Keine Geräte verfügbar. iOS-spezifisches Verhalten (Standalone-Modus, Safe Areas am echten Notch, HEIC-Dekodierung, Zoom-Verhalten, Passkeys mit iCloud-Schlüsselbund) ist **nicht** auf echten Geräten verifiziert. |

Vor einem Release empfohlen:
- Abnahme auf mindestens einem iPhone (Safari und installiert), einem Android-Gerät (Chrome) und mit Firefox Desktop.
- Prüfliste: Installation, Update-Hinweis, Offline-Start, Kamera-Upload (inklusive HEIC), Passkey-Anmeldung und Safe Areas.

## 4. Performance (gemessen, nicht geschätzt)

Bedingungen:
- Chromium, 390 × 844, `isMobile`, CPU 4× gedrosselt.
- Preview-Build mit echter API; Konto mit 2 Grows, 6 Pflanzen, 300 Messungen und 40 Journal-Einträgen.
- Median aus 5 Läufen.
- „kalt“ = neuer Kontext ohne Service Worker; „warm“ = mit Service Worker.
- JS = übertragene JavaScript-Bytes (komprimiert).

| Seite | Modus | FCP ms vorher → nachher | LCP ms | TBT ms | JS kB |
| --- | --- | --- | --- | --- | --- |
| Übersicht | kalt | 848 → **680** | 1688 → **1100** | 170 → **61** | 277 → **172** |
| Grow | kalt | 872 → 672 | 2576 → 2432 | 130 → 49 | 318 → 325 |
| Discover | kalt | 884 → 664 | 2880 → 2312 | 205 → 59 | 315 → 210 |
| Sortenseite | kalt | 960 → 676 | 3028 → 2464 | 366 → 34 | 320 → 215 |
| Academy-Artikel | kalt | 872 → 668 | 2108 → 1776 | 152 → 42 | 316 → 211 |
| Übersicht | warm | 364 → 216 | 780 → 656 | 179 → 44 | 0 → 0 |
| Grow | warm | 272 → 212 | 1252 → 1064 | 84 → 46 | 0 → 0 |
| Discover | warm | 452 → 216 | 1752 → 1320 | 252 → 43 | 0 → 0 |
| Sortenseite | warm | 348 → 224 | 816 → 636 | 155 → 77 | 0 → 0 |
| Academy-Artikel | warm | 348 → 200 | 776 → 612 | 132 → 44 | 0 → 0 |

CLS blieb unverändert (≤ 0,017).

Die Grow-Seite lädt weiterhin Recharts für ihre Messwertdiagramme; sie wird dadurch geringfügig größer (+7 kB, weil React jetzt in einem eigenen Chunk liegt).

Einstiegs-Bundle: `index` 523 kB (main) → 372 kB plus `react` 189 kB (gzip zusammen 175 kB statt 283 kB inklusive des vorgeladenen `charts`).

## 5. Barrierefreiheit (WCAG 2.2 AA – Ziel, keine Konformitätsbehauptung)

**Automatisch:**
- axe-core mit den Regeln `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` und `wcag22aa`.
- 48 Kombinationen: 6 Breiten × 8 Seiten (Übersicht, Grow, Discover, Academy-Artikel, Einstellungen, Konto, Gemeinsam, Journal).
- Ergebnis: **0 Verstöße**.
- Automatische Tests decken nur einen Teil der Kriterien ab.

**Manuell geprüft (Code und Bedienung in Chromium):**
- Dialoge haben jetzt zugängliche Namen; vorher fehlten sie, das ist behoben.
- Fokusfalle und Esc über natives `<dialog>`.
- Wischgesten haben immer eine Alternative: ✕, Esc, Knopf „Jetzt synchronisieren“ (2.5.7 Ziehbewegungen).
- Zielgrößen:
  - Plus-Knopf 56 px.
  - Erfassungsarten ≥ 56 px hoch.
  - Filterfelder im Sheet 44 px.
  - Untere Navigation ≥ 56 px.
- Status mit `role="status"`/`aria-live`: Update-Hinweis, Ziehen zum Synchronisieren, Upload-Fortschritt.
- „Bewegung reduzieren“ zusätzlich zur Systemeinstellung.
- 16-px-Eingaben verhindern Zoom-Sprünge.
- Texte durchgehend auf Deutsch.

**Nicht geprüft:**
- Screenreader auf echten Geräten (VoiceOver, TalkBack).
- Sprachsteuerung.
- Vergrößerung auf 200 % und 400 % auf echten Geräten.

Diese Punkte gehören zur Geräteabnahme.

## 6. Bewusst nicht umgesetzt

- **Web-Push:** Nicht umgesetzt (Blocker).
  - Es bräuchte VAPID-Schlüssel und eine zusätzliche Abhängigkeit oder eigene Kryptografie.
  - Push-Nachrichten laufen zwingend über die Push-Dienste der Browserhersteller (Google, Mozilla, Apple). Diese erfahren Endpunkt, Zeitpunkt und Häufigkeit, auch bei verschlüsseltem und generischem Inhalt.
  - Zustellung und Wiederholungen wären ein Produktions-Hintergrunddienst.
  - Beides verlangt ausdrückliche Freigabe.
  - Stattdessen gibt es weiterhin In-App-Benachrichtigungen ohne Inhalte. Die Erweiterungsstelle `NotificationChannel` (Phase 5.5) bleibt.
  - Automatische Push-Anmeldung gibt es nicht.
- **Offline für gemeinsame Bereiche:** nicht angeboten, weil Rechte jederzeit entzogen werden können (Begründung in der Offline-Architektur).
- **Offline-Katalog:** Der Katalog wird nie vollständig heruntergeladen (Datenmenge, Lizenz der Quelle).
- **Fernlöschung:** technisch nicht möglich und nicht behauptet.
- **Biometrie:** keine Aussagen. TERPGRID sieht keine biometrischen Daten.

## 7. Docker-Upgrade 5.5.0-rc.1 → 5.6.0-rc.1 (isoliert)

Aufbau:
- Eigenes Compose-Projekt mit Ports 18080/18443.
- Images aus `ac6c3d6` (5.5.0-rc.1) und `4df7ec4` (5.6.0-rc.1).
- Konten mit 110 Datensätzen und 12 Dateien.
- Gemeinsamer Bereich mit 76 Einträgen und 8 Dateien, Mitglied mit Rolle „Kommentieren“.

| Schritt | Ergebnis |
| --- | --- |
| `upgrade.sh --no-build` (mit Backup vorher) | ✓ Upgrade, ✓ Schema passt; **keine neue Migration** (8 vorher/nachher) |
| Private Datensätze und Dateien (Prüfsumme über Version, Sequenz, Chiffrat, MAC) | unverändert |
| Bereiche, Mitgliedschaften, Einträge, Kommentare (Prüfsumme) | unverändert |
| `verify-data` | 110 Datensätze, 12 Dateien, 1 Bereich entschlüsselt, 0 Fehler |
| Fremdzugriff / Rollen | fremde Daten nicht sichtbar; Fotos bytegleich 6/6; Mitglied liest, Schreiben als „Kommentieren“ = 403 |
| Ausgelieferte Hülle | `sw.js` 5.6.0-rc.1, SKIP_WAITING-Ablauf, kein automatisches `skipWaiting`; Manifest-Verknüpfungen; Apple-Icon 200; API `no-store`, `sw.js` `no-cache` |
| Backup + `restore-test.sh` | ✓ vollständig und mit dem Master-Key lesbar |
| Simulierter Verlust (alle Bereiche gelöscht) → `restore.sh` | ✓ private Daten und Zusammenarbeit identisch, Mitglied liest wieder |
| `rollback.sh 5.5.0-rc.1` | ✓ ohne Wiederherstellung möglich (keine Migration); Daten identisch; alte Hülle ausgeliefert |
| Erneut `upgrade.sh` auf 5.6 | ✓ |
| Hintergrund-Timer/Jobs | 0 aktiv; Katalog-Aktualisierung bleibt deaktiviert |
| Aufräumen | 0 Container, 0 Volumes |

Rollback-Hinweis für Clients:
- Nach einem Rollback auf 5.5 aktiviert sich der alte Service Worker selbst, weil 5.5 noch sofortiges `skipWaiting` hatte.
- Lokale Offline-Freigaben bleiben im Browser gespeichert, werden von 5.5 aber nicht ausgewertet. 5.5 behält Arbeitskopien wie bisher.

## 8. Screenshots (`docs/screenshots/phase-5-6/`)

| Breite / Gerät | Screenshots |
| --- | --- |
| 390 px | Übersicht mit Offline-Frage, Schnellerfassung, Aufgabe aus der Schnellerfassung, Foto-Studio, Discover-Filter, Grow, Academy-Artikel, Einstellungen, Konto, Update-Hinweis |
| 1440 px | Übersicht, Grow, Academy-Artikel, Einstellungen, Konto |
| iPhone-Profil (Chromium-Emulation) | Installationskarte mit Anleitung, Offline-Frage |

## 9. Bekannte Grenzen und nächste Schritte

1. Geräteabnahme auf iPhone, iPad, Android und Firefox; siehe Prüfliste in Abschnitt 3.
2. `indexedDB.databases()` fehlt in älteren Browsern; dort entfällt die Bereinigung beim Kontowechsel.
3. Die Wischgeste und das Ziehen zum Synchronisieren sind nur in Chromium-Emulation geprüft.
4. Die Fotoqualität „Originalauflösung“ ist auf 16 Megapixel begrenzt (Canvas-Grenze mobiler Browser). Ab 18 MB wird automatisch auf „Optimiert“ zurückgefallen, mit Hinweis.

## 10. Commits und Pull Request

- `e66d057` – M1–M4: PWA 3.0, iOS-Optimierung, Offline als Opt-in, Schnellerfassung
- `b398ad3` – M5–M7: Foto-Studio 3.0, Discover-Filter, Academy mobil, Abmelden ohne Verbindung
- `4df7ec4` – Dialoge mit zugänglichem Namen, Version 5.6.0-rc.1, Screenshots
- Dokumentations-Commit und PR-Link: siehe Pull Request (direkt gegen `main`, kein gestapelter PR, kein automatischer Merge, kein Deployment).
