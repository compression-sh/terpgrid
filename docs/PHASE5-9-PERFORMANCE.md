# Phase 5.9 – Performance und Ressourcen (gemessen)

Stand: 5.9.0-rc.1.

**Messumgebung:**
- 4 vCPU (Intel Xeon 2,1 GHz), 16 GB RAM, Docker 29.
- Isolierte Docker-Compose-Installation mit den **Produktions-Containerlimits**: API 1,5 CPU / 768 MB, PostgreSQL 1 CPU / 512 MB, Caddy 1 CPU / 256 MB.
- Katalog (16.710 Sorten) und Laborproben (89.923) importiert.
- Nur synthetische Konten.

> **Wichtig:** Das ist eine Entwicklungsmaschine, kein VPS. Die Zahlen zeigen Größenordnungen und Engpässe, **keine zugesicherte Produktionskapazität**. Auf dem VPS mit `./status.sh`, `docker stats` und Administration → System nachmessen.

## 1. Gleichzeitige Nutzer (API, PostgreSQL)

**Ablauf je virtuellem Nutzer**, nach dem Zufallsprinzip mit anschließender Denkzeit von 0,5 s:

| Anteil | Aktion |
| --- | --- |
| 30 % | inkrementeller Sync-Abruf |
| 20 % | Sync-Push einer Messung |
| 20 % | Katalogsuche |
| 10 % | Sortenseite |
| 5 % | Genetik-Abfrage (Tiefe 3) |
| 10 % | Ungelesen-Zähler |
| 5 % | Vorschaubild |

**Zur Einordnung:** Eine reale Person erzeugt deutlich weniger Last; die App gleicht im Leerlauf nur alle 60 s ab. 25 „virtuelle Nutzer“ mit 0,5 s Denkzeit entsprechen grob dem Dauerklicken von 25 Personen gleichzeitig.

| Gleichzeitig | Anfragen/s | p50 | p95 | p99 | Fehler | API CPU Spitze / RAM | DB CPU Spitze / Mittel / RAM | Caddy RAM |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2,0 | 9 ms | 35 ms | 42 ms | 0 | 4 % / 37 MiB | 7 % / 2 % / 146 MiB | 18 MiB |
| 5 | 9,7 | 7 ms | 34 ms | 74 ms | 0 | 10 % / 51 MiB | 10 % / 7 % / 155 MiB | 18 MiB |
| 10 | 19,4 | 6 ms | 34 ms | 76 ms | 0 | 9 % / 56 MiB | 10 % / 14 % / 170 MiB | 18 MiB |
| 25 | 48,4 | 6 ms | 36 ms | 145 ms | 0 | 91 % / 56 MiB | 52 % / 33 % / 174 MiB | 14 MiB |
| **Sättigung:** 25 ohne Denkzeit | 139 | 108 ms | 583 ms | 710 ms | 0 | 92 % / 61 MiB | **100 % / 96 %** / 179 MiB | 13 MiB |

Prozentangaben: `docker stats`, 100 % = ein Kern. Leerlauf: API 30 MiB, PostgreSQL 142 MiB (mit Katalog und Proben), Caddy 16 MiB.

**Teuerste Abfragen:**

| Abfrage | p50 bei 1–10 Nutzern | p50 bei Sättigung |
| --- | --- | --- |
| Sortenseite (Katalogsorte mit Angeboten, Anreicherung, gleichnamigen Laborproben) | 27–34 ms | 526 ms |
| Katalogsuche (Volltext) | 11–20 ms; erste Suche nach dem Start kalt | 202 ms |

**Engpass:**
- Unter Dauerlast ist **PostgreSQL am CPU-Limit von 1 Kern** der begrenzende Faktor, nicht die API (Node) und nicht Caddy.
- Für die Zielgröße einer kleinen privaten Instanz (bis ca. 10–25 Personen) reicht das mit großem Abstand.
- Eine Optimierung der Sortenseite ist durch diese Messung **nicht** gerechtfertigt und wurde nicht vorgenommen.

**Ratenbegrenzung pro IP:**
- Die API begrenzt auf **600 Anfragen pro Minute und IP**.
- Im ersten Durchlauf kamen alle virtuellen Nutzer von **einer** IP. Ab 10 aktiven Nutzern antwortete die API dann teilweise mit 429 („Zu viele Anfragen“), z. B. bei 25 Nutzern 2.372 von 2.971 Anfragen.
- Die Messreihe oben lief deshalb mit eigener Absenderadresse je Nutzer, also wie bei Personen an verschiedenen Anschlüssen.

> **Betriebshinweis:** Viele sehr aktive Personen hinter **einem** Anschluss (z. B. NAT im selben Haushalt) teilen sich die 600 Anfragen pro Minute. Bei normaler Nutzung wird das nicht erreicht; beim gleichzeitigen Erstabgleich großer Fotobestände auf mehreren Geräten ist es möglich. Die App versucht es dann automatisch mit wachsendem Abstand erneut; nichts geht verloren.

## 2. Großes Konto: 20.000 Messungen, 1.000 Fotos

| Messung (API, intern) | Ergebnis |
| --- | --- |
| 20.000 Messungen anlegen (Push à 200) | 42 s |
| Vollständiger Abruf aller 21.002 Datensätze | 1,0 s, 8,2 MiB, 43 Seiten |
| 1.000 Vorschaubilder abrufen (10 parallel) | 2,0 s, 7,5 MiB |
| Datenbank danach | 115 MB (inkl. Katalog und Proben) · Dateispeicher 20,7 MB |

**Browser (neues Gerät, Anmeldung bis Anzeige), über Caddy:**

| Kennzahl | Chromium 1440 px vorher | Chromium 1440 px **nachher** | Chromium 390 px, 4× CPU-Drosselung vorher | 390 px 4× **nachher** | WebKit 1440 nachher | Firefox 1440 nachher |
| --- | --- | --- | --- | --- | --- | --- |
| Anmeldung → Übersicht | 1,2 s | 1,2 s | 1,4 s | 1,4 s | 0,8 s | 0,8 s |
| Erstabgleich 21.002 Datensätze | 18,0 s | **5,5 s** | 54,3 s | **12,9 s** | 11,2 s | 8,8 s |
| Fotos: die ersten 21 Bilder sichtbar | 20,6 s | **8,1 s** | 65,0 s | **21,9 s** | 15,0 s | 13,5 s |
| Messwert-Diagramm (Grow mit 20.000 Messungen) | 0,96 s | 0,90 s | 4,9 s | 3,9 s | 2,1 s | 3,5 s |
| Insights (alle Messungen) | 1,8 s | 0,9 s | 4,0 s | 4,3 s | 1,6 s | 5,4 s |
| Verlauf | 0,39 s | 0,35 s | 0,57 s | 0,62 s | 0,30 s | 0,67 s |

„vorher“ = 5.9-Stand vor der Optimierung (`0896f87`), gleiche Instanz, gleiches Konto, gleiche Messmethode.

**Gefundene Ursachen und Korrekturen (gemessen begründet):**
1. Die Oberfläche las nach **jeder** Abgleichseite alle Datensätze neu ein. Bei 106 Seiten führte das zu quadratischem Aufwand und blockierte IndexedDB zwischen den Seiten.
   - Jetzt: Benachrichtigungen werden gebündelt (höchstens alle 1,5 s, plus am Ende).
   - Seitengröße 500 statt 200 (der Server erlaubte bereits 500).
2. Fehlende Fotos wurden in Abgleich-Reihenfolge geladen (älteste zuerst), die Galerie zeigt aber die neuesten oben. Jetzt werden die neuesten zuerst geladen.

**Verbleibend (dokumentiert, nicht optimiert):**
- Foto-Downloads laufen mit 3 parallelen Anfragen, also etwa 6 Dateien/s. 1.000 Fotos sind damit nach rund 6 Minuten vollständig lokal. Mehr Parallelität würde die IP-Begrenzung (10 Anfragen/s) erreichen.
- Insights und Diagramme berechnen alle Messungen im Hauptthread. Bei 20.000 Messungen und 4× gedrosselter CPU sind das rund 4 s. Für typische Bestände (Hunderte bis wenige Tausend Messungen) ist das unkritisch.
- **Upload-Begrenzung:** 300 Uploads pro Stunde und Konto, also 150 Fotos/h (Vollbild und Vorschau). Wer viele Fotos auf einmal hochlädt oder einen großen lokalen Bestand in ein Konto übernimmt, wartet entsprechend. Die App wiederholt automatisch, zeigt aber zwischenzeitlich den Sync-Status „Fehler“ mit der Meldung „Zu viele Uploads“.

## 3. Laden der App (Frontend)

Siehe Tabelle in §5 (FCP/LCP, Chromium, gedrosselt) und `PHASE5-8-PERFORMANCE-REPORT.md` für die Methode.

**JS-Bundles (unkomprimiert / gzip):**

| Datei | Größe |
| --- | --- |
| `index` | 374,4 kB / 116,0 kB (5.8: 373,9 kB) |
| `charts` (Recharts) | 427,6 kB / 114,6 kB, nur auf Seiten mit Diagrammen geladen |
| CSS | 132,3 kB / 23,0 kB |

## 4. Backup und Restore (klein, Docker)

Details in `PHASE5-9-DISASTER-RECOVERY.md`.

## 5. Erstes Laden (gemessen nach dem Muster von 5.8)

**Messaufbau:**
- Chromium, 390 × 844, `isMobile`, CPU 4× gedrosselt.
- Preview-Build mit echter API.
- Messkonto mit 2 Grows, 6 Pflanzen, 300 Messungen und 40 Journal-Einträgen.
- Median aus 5 Läufen; „kalt“ ohne, „warm“ mit Service Worker.
- „vorher“ = 5.8.0-rc.1 (`917d845`), in derselben Sitzung auf demselben Rechner gemessen.

| Seite | Modus | FCP ms vorher → nachher | LCP ms | TBT ms | Anfragen |
| --- | --- | --- | --- | --- | --- |
| Übersicht | kalt | 700 → 704 | 1160 → 1112 | 78 → 80 | 12 → 11 |
| Grow | kalt | 692 → 676 | 2384 → 2348 | 54 → 50 | 35 → 34 |
| Discover | kalt | 676 → 728 | 2300 → 2384 | 52 → 87 | 30 → 29 |
| Sortenseite | kalt | 716 → 692 | 2572 → 2540 | 97 → 73 | 37 → 36 |
| Academy-Artikel | kalt | 680 → 708 | 1820 → 1904 | 58 → 73 | 22 → 21 |
| Übersicht | warm | 248 → 232 | 676 → 660 | 92 → 76 | 11 → 11 |
| Grow | warm | 216 → 244 | 1048 → 1052 | 58 → 49 | 34 → 34 |
| Discover | warm | 240 → 228 | 1456 → 1408 | 71 → 52 | 29 → 29 |
| Sortenseite | warm | 244 → 232 | 648 → 648 | 88 → 54 | 36 → 36 |
| Academy-Artikel | warm | 296 → 268 | 680 → 664 | 82 → 67 | 21 → 21 |

**Bewertung:**
- Bei kleinen Beständen liegen FCP, LCP und TBT im Rauschen (±50–100 ms zwischen Läufen). Es wird **keine** Beschleunigung behauptet.
- Belegt ist eine Anfrage weniger beim Kaltstart: Die 346 Datensätze passen jetzt in eine Abgleichseite.
- Der Nutzen der Sync-Änderungen zeigt sich erst bei großen Beständen (§2).

## 6. Ressourcenempfehlung

| Instanz | Empfehlung | Begründung |
| --- | --- | --- |
| Privat, 1–10 Personen | 2 vCPU, 2 GB RAM, 20 GB SSD + Fotos × 1,1 | Leerlauf zusammen ca. 190 MiB; unter Dauerlast mit 25 Nutzern zusammen unter 250 MiB. Der Rest dient Betriebssystem, Image-Bau (`npm ci` und `vite build` beim Upgrade) und Page-Cache für PostgreSQL. |
| bis ca. 25 Personen | wie oben; bei dauerhaft hoher DB-Last das CPU-Limit der DB in `docker-compose.yml` anheben | Engpass unter Sättigung ist die DB mit 1 Kern |
| Backup-Ziel | Datenmenge × 1,5 | restic dedupliziert; Aufbewahrung 7/4/6 |
| Freier Platz für Upgrades | ≥ 5 GB (wird von `preflight.sh` erzwungen) | Images plus Build-Cache plus Backup-Staging |
