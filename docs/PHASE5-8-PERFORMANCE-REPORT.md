# Phase 5.8 – Performance-Bericht

Stand: 5.8.0-rc.1.

**Bedingungen:**
- Chromium, Viewport 390 × 844, `isMobile`, CPU 4× gedrosselt.
- Preview-Build mit echter API und PostgreSQL.
- Messkonto mit 2 Grows, 6 Pflanzen, 300 Messungen und 40 Journal-Einträgen.
- Median aus 5 Läufen.
- „kalt“ = neuer Browserkontext ohne Service Worker; „warm“ = mit Service Worker.
- „vorher“ = unveränderter `main` (`dfc8a64`) am selben Rechner und in derselben Sitzung.

| Seite | Modus | FCP ms vorher → nachher | LCP ms | TBT ms | Anfragen |
| --- | --- | --- | --- | --- | --- |
| Übersicht | kalt | 688 → 680 | 1116 → 1076 | 70 → 54 | 14 → **12** |
| Grow | kalt | 700 → 656 | 2388 → 2368 | 57 → 30 | 37 → **35** |
| Discover | kalt | 676 → 684 | 2328 → 2296 | 62 → 63 | 32 → **30** |
| Sortenseite | kalt | 672 → 648 | 2508 → 2408 | 40 → 28 | 39 → **37** |
| Academy-Artikel | kalt | 672 → 684 | 1820 → 1820 | 47 → 56 | 24 → **22** |
| Übersicht | warm | 196 → 256 | 648 → 656 | 58 → 78 | 13 → **11** |
| Grow | warm | 220 → 196 | 1056 → 1036 | 72 → 41 | 36 → **34** |
| Discover | warm | 212 → 236 | 1328 → 1316 | 38 → 44 | 31 → **29** |
| Sortenseite | warm | 212 → 192 | 620 → 604 | 81 → 41 | 38 → **36** |
| Academy-Artikel | warm | 196 → 204 | 616 → 612 | 35 → 38 | 23 → **21** |

JS-Transfer unverändert (Übersicht kalt 172 kB; Einstiegs-Bundle `index` 373,4 → 373,9 kB unkomprimiert, +0,5 kB).

## Bewertung (ehrlich)

- **Belegt:** zwei Anfragen weniger je Seite. Ursache war die dreifache Abfrage des Ungelesen-Zählers beim Start (jetzt eine gemeinsame Anfrage).
- **LCP und FCP:** Die Unterschiede von wenigen Dutzend Millisekunden liegen im Messrauschen (Streuung zwischen Läufen ±50–100 ms). Eine messbare Verbesserung wird **nicht** behauptet.
- **Foto-Downloads im Leerlauf:**
  - Das Messkonto hat keine Fotos, deshalb ist diese Änderung oben nicht sichtbar.
  - Im Ladeverlauf eines Kontos mit 6 Fotos (Chromium, ohne Netzdrosselung) startete die Katalogsuche auf Discover vorher **nach** den ersten 6 Foto-Downloads (636 ms → Suche 669 ms). Nachher läuft sie **vor** allen Foto-Downloads (Suche 704 ms → erster Download 983 ms).
  - Bei langsamen Verbindungen und vielen Fotos ist ein Vorteil beim ersten Öffnen auf einem neuen Gerät zu erwarten; gemessen wurde das nicht.
- **Server:** Die Katalog-Endpunkte antworten lokal in 2–35 ms. Ausnahme ist die erste Volltextsuche nach dem Start (~0,6 s, kalter Datenbank-Cache). Datenbankabfragen sind daher nicht der Engpass. Die verbleibende LCP-Zeit der Katalogseiten entsteht im Client: Laden der Routen-Chunks, Rendern unter 4× CPU-Drosselung.

## Nicht umgesetzt

- Keine spekulativen Optimierungen wie Vorabladen aller Routen oder SSR. Sie würden die Architektur verändern und den Offline-Betrieb verkomplizieren.
- Keine Abhängigkeiten entfernt: Alle 17 direkten Laufzeitabhängigkeiten werden genutzt (geprüft in 5.7, unverändert).
