# Lokaler Sortenkatalog (CI-Strains-Pro)

Stand: 24.11.2026 · TERPGRID 5.0.0-rc.1

TERPGRID kann einen öffentlichen Sortendatensatz in die eigene PostgreSQL-Datenbank importieren. Discover sucht dann
serverseitig über den vollständigen Datensatz (korrekte Gesamtzahlen, keine Teilmengen) und bietet ein Breeder-Verzeichnis.
StrainAPI bleibt als Live-Quelle für Fotos und Evidenzstatus erhalten („Live & Bilder“), CannaLib als optionale
Forschungsquelle.

## Quelle und Lizenz

| | |
| --- | --- |
| Datensatz | Cannabis Intelligence Database (Repository „ci-strains-pro“) von Shannon Goddard |
| Repository | https://github.com/Shannon-Goddard/ci-strains-pro |
| Geprüfte Version | Commit `80fbe5d40fac8dda5120f50b946f069c4961f253` (05.07.2026), Datei `raw-data.csv` |
| SHA-256 | `469fb653819f0f97c29d17ca6e58451f3e4972da72424ab9ca6d1cd319d9103c` |
| Datenlizenz | CC BY 4.0 (`DATA_LICENSE.md`) – Namensnennung, Link, Hinweis auf Änderungen |
| Code-Lizenz des Repos | MIT (`LICENSE`) – betrifft nur deren Skripte; TERPGRID übernimmt keinen Code daraus |

Umsetzung der Lizenzpflichten: Katalogseiten, Sortenseiten und Breeder-Profile zeigen Quelle, Autorin, Lizenz-Link und den
Änderungshinweis („Von TERPGRID verändert: Zeichenkodierung bereinigt, unplausible Werte verworfen, Angebote je Breeder und
Sorte gruppiert, Breeder-Schreibweisen zusammengeführt.“). Die Lizenz deckt **keine** Rechte an Fotos, Logos oder Marken
Dritter ab – der Datensatz enthält keine Bilder, TERPGRID zeigt für Katalogsorten nur einen klar gekennzeichneten Platzhalter.
Quell-URLs der Seedbanks werden als Link angezeigt (mit `rel="noopener noreferrer nofollow"`, ohne Referrer).

## Tatsächlicher Inhalt (geprüft) vs. Angaben des Projekts

| | Angabe im README des Projekts | Geprüft (Commit oben) |
| --- | --- | --- |
| Zeilen | 21.282 | **21.210** |
| Spalten | 51 | **53** |
| „Verifizierte Sorten“ | 21.220 | 21.210 Seedbank-Angebote → **16.710** Sorten (Breeder + Name + Version + Auto) |
| Breeder | 519 | 503 Schreibweisen → **494** Breeder (9 reine Schreibvarianten zusammengeführt) |
| Seedbanks | – | 19 |
| Abstammung | 76,1 % | **61,2 %** der Angebote mit verwertbarer Elternangabe (nach Verwerfen von Fließtext; inkl. als „unbekannt“ markierter Elternteile) |

Die „Verifizierung“ des Projekts (KI-Prüfung + manuelle Stichproben) wird nicht als unabhängige botanische Bestätigung
dargestellt. Alle Werte sind Angaben von Seedbanks/Breedern (Shop-Texte).

## Importregeln (`server/src/catalog/cisp.ts`)

- **Kodierung:** Die Datei enthält mehrfach falsch dekodiertes UTF-8 (z. B. „Ã\u0083Â\u0082…“-Ketten, 116 Ersatzzeichen).
  Solche Ketten, Ersatz- und Steuerzeichen werden entfernt; Leerraum normalisiert.
- **Pflichtfelder:** `strain_id` (UUID), `source_url` (nur `https:`), Sortenname, Breeder, Seedbank. Fehlt etwas → Zeile abgelehnt.
- **Plausibilität (verwerfen statt korrigieren):**
  - THC 1–40 %; unter 1 % nur, wenn CBD max ≥ 3 % (CBD-Sorten). Die Quelle enthält u. a. 2.502 × „0,0“ und 1.981 × „0,03“
    (Parser-Artefakte zweier Shops) sowie Werte bis 8.211 %.
  - CBD 0,1–30 % (die Spalte `cbd_avg` enthält Werte bis 8.211 und wird nicht genutzt).
  - Blütezeit 35–120 Tage, Höhe indoor 15–400 cm / outdoor 30–600 cm, Ertrag indoor 50–1.500 g/m² / outdoor 20–3.000 g/Pflanze.
  - min > max → beide verworfen. Indica + Sativa müssen 100 % (±1) ergeben.
- **Abstammung:** Elternangaben nur, wenn sie wie ein Sortenname aussehen (≤ 48 Zeichen, ≤ 6 Wörter, kein Shop-Text wie
  „THC“, „days“, „taste“, „Lineage:“, keine zusammengeklebten Wörter). Ist ein Elternteil Fließtext, wird die ganze Abstammung
  dieses Angebots verworfen (eine halbe Abstammung wäre irreführend). „Unknown …“ wird als unbekannter Elternteil geführt.
- **Terpene/Aromen/Wirkungen:** nur echte Begriffslisten; Zahlen in der Terpenspalte (z. B. „3“) werden verworfen.
  Terpene sind **Nennungen**, keine Mengen. Wirkungen sind Werbeaussagen und so gekennzeichnet.
- **Identität:** Ein Listing (= Zeile) behält die `strain_id` der Quelle. Eine Sorte fasst Listings **desselben Breeders**
  mit gleichem Namen, gleicher Version und gleichem Blüteverhalten (Auto/photoperiodisch) zusammen. Gleichnamige Sorten
  verschiedener Breeder werden **nie** zusammengeführt (1.604 Namen kommen bei mehreren Breedern vor).
  Breeder werden nur über Groß-/Kleinschreibung, Satzzeichen und Leerraum zusammengeführt (z. B. „ACE Seeds“/„Ace Seeds“).
  Kooperationen („X x Y“) bleiben eigene Einträge mit Mitgliederliste.
- **Widersprüche:** Überschneiden sich die Spannen zweier Angebote nicht (z. B. THC 20–22 % vs. 25–28 %), wird das Feld als
  widersprüchlich markiert; die Sortenseite zeigt jede Einzelangabe mit Seedbank und Quell-URL.

## Qualitätsbericht (Import vom 24.11.2026)

| Kennzahl | Wert |
| --- | --- |
| Rohzeilen | 21.210 |
| Übernommen | 21.210 (0 abgelehnte Zeilen, 0 doppelte IDs) |
| Sorten (Breeder-spezifisch) | 16.710 |
| Breeder | 494 (davon 12 auch Seedbank, 11 Kooperationen) |
| Mehrfach-Angebote derselben Seedbank für dieselbe Sorte | 580 |
| Sorten mit widersprüchlichen Angaben | 1.186 |
| Bilder | 0 (Datensatz enthält keine) |

Abdeckung je Angebot nach Validierung:

| Feld | Angebote | Anteil |
| --- | ---: | ---: |
| Quell-URL | 21.210 | 100 % |
| Abstammung | 12.975 | 61,2 % |
| Blütezeit | 12.089 | 57,0 % |
| THC | 8.501 | 40,1 % |
| Ertrag indoor | 5.790 | 27,3 % |
| Höhe indoor | 5.504 | 26,0 % |
| Indica/Sativa-Anteil | 4.830 | 22,8 % |
| Aromen | 4.234 | 20,0 % |
| CBD | 3.943 | 18,6 % |
| Wirkungen (Shop-Text) | 1.948 | 9,2 % |
| Terpen-Nennungen | 556 | 2,6 % |

Auf Sortenebene: 10.926 mit Abstammung, 7.376 mit THC-, 3.891 mit CBD-Angabe, 2.486 Autoflowering.
Verworfene Einzelwerte (Auszug): THC max 4.839, THC min 4.667, Abstammung 3.249, Ertrag indoor min 2.211, Terpene 574.
Speicherbedarf in PostgreSQL inkl. Indizes: ca. 50 MB (frische Installation, gemessen mit `pg_database_size`).

Den vollständigen Bericht erzeugt `import-catalog --dry-run --report bericht.json`; die API liefert ihn unter
`/api/catalog/local/report` (angemeldet).

## Import und Aktualisierung

Auf dem Server (Docker):

```bash
cd /opt/terpgrid/deploy
sudo ./import-catalog.sh --dry-run   # Download, Prüfsumme, Qualitätsbericht – nichts wird geschrieben
sudo ./import-catalog.sh             # Import (eine Transaktion, idempotent)
```

- Der Download läuft auf dem Host (Ziel: `raw.githubusercontent.com`), der Import im `migrate`-Container mit der Owner-Rolle.
  Die laufende API hat nur Leserechte auf die Katalogtabellen.
- Stimmt die Prüfsumme nicht, bricht der Import ab (`--force` nur bewusst für eine andere, selbst geprüfte Datei).
- Dieselbe Datei erneut importieren ändert nichts („bereits aktiv“). Eine neue Version aktualisiert per Upsert;
  Einträge, die nicht mehr enthalten sind, werden entfernt. Ein Fehler lässt den bisherigen Katalog vollständig bestehen.
- **Rückkehr zu einer älteren Version:** denselben Befehl mit der älteren Datei ausführen
  (`./import-catalog.sh --file alte.csv --force`). Die Historie steht in `catalog_imports`.
- Persönliche Daten werden nie verändert. Verknüpfte eigene Sorten speichern nur `cisp:<Sorten-ID>` und eine eigene Kopie
  der Angaben; entfällt eine Sorte, zeigt der Link „nicht mehr im Katalog“, die eigene Sorte bleibt.

Ohne Docker (Entwicklung): `DATABASE_MIGRATE_URL=… npx tsx src/cli.ts import-catalog --file raw-data.csv`.

## Suche

- PostgreSQL `pg_trgm` (Trigramm-Index auf dem Namen, ähnliche Schreibweisen) + gewichteter Volltext
  (A Name · B Aliase/Breeder · C Eltern/Seedbanks · D Terpene/Typ/Samentyp).
- Rangfolge: exakter Name → Namensanfang/Alias → im Namen → Breeder/Abstammung/Terpen/Seedbank → ähnliche Schreibweise.
  Die Oberfläche zeigt die Anzahl je Trefferart; die Gesamtzahl gilt für den ganzen Katalog.
- Gemessen auf dem Testsystem (16.710 Sorten): 5–11 ms je Suchanfrage in der Datenbank; im Browser inkl. 300 ms Eingabeverzögerung ca. 0,9 s.
- Suchanfragen gehen nur an die eigene Instanz. In der Befehlspalette werden Katalog und Breeder ebenfalls nur über die eigene
  Instanz durchsucht; persönliche Daten bleiben lokal.

## Grenzen

- Keine Fotos, keine Logos, keine Firmengeschichten, Länder oder Websites der Breeder – TERPGRID ergänzt nichts ohne Quelle.
- Werte stammen aus Shop-Texten und wurden nicht im Labor bestätigt; Shop-Angaben weichen häufig von Messwerten ab.
- Breeder/Seedbank/Reseller sind nur so weit unterschieden, wie der Datensatz es erlaubt (Kennzeichen „auch Seedbank“, wenn
  der Breeder-Name einer der 19 Seedbanks entspricht).
- Gleichnamige Elternangaben können sich auf verschiedene Linien beziehen; die Oberfläche zeigt sie als „mehrdeutig“.
- Der Genetics Explorer (Graph) arbeitet weiterhin mit StrainAPI-Daten; Katalogsorten zeigen Eltern, Mehrdeutigkeit und
  Nachkommen auf der Sortenseite.
- Im Lokalmodus (ohne Server) steht der Katalog nicht zur Verfügung; Discover nutzt dort wie bisher StrainAPI.
