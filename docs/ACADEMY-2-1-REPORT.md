# TERPGRID – Cannabis 101 & Terpen-Atlas, Expansion 2.1

Stand: 24.11.2026 · Version 5.2.0-rc.1 · Branch `claude/academy-2-1` · nicht gemergt, nicht ausgerollt.

## Kurzfassung

| Bereich | Ergebnis |
|---|---|
| Sortenkatalog (5A) | Vollständigkeits-Audit je Feld und Belegart, Herkunft je Feldangabe, konservativer Abgleich, fortsetzbare Anreicherung mit Probelauf, Admin-Ansicht. Ehrliches Ergebnis: Terpen-Nennungen bei **571 von 16.710** Sorten (vorher 541), Terpen-**Mengen** bei **0**. Mehr ist mit rechtlich nutzbaren Quellen derzeit nicht erreichbar. |
| Terpen-Atlas 3.0 | **27** Verbindungen (vorher 7) mit chemischer Identität aus PubChem, 2D-Strukturformel, belegtem Geruch, Vorkommen in Cannabis nur mit im Volltext geprüfter Literatur (22 von 27 belegt, 5 ausdrücklich „nicht belegt“), 6 Sammelnamen ohne Isomer-Zuordnung, Katalogbezug, Vergleich. |
| Academy | **17** Kategorien, **30** Artikel (12 bestehende + 18 neue Leitfäden), 4 Lernpfade mit Fortschritt je Konto, Glossar mit 32 Begriffen (auch in Strg+K), 4 interaktive Diagramme, Kontexthilfe an 3 Stellen. Neue Quellen: 16 Open-Access-Studien, Volltext geprüft. |
| Qualität | Frontend 233 Tests, Server 150 Tests, ESLint ohne Befund, TypeScript strikt, axe (WCAG 2.1 A/AA) 0 Verstöße auf 10 neuen/geänderten Seiten, mobil (390 px) ohne horizontalen Überlauf. |

## Umsetzungsmatrix

| Anforderung | Umsetzung | Status |
|---|---|---|
| Bestandsanalyse | Vorhandene Teile weiterentwickelt statt dupliziert: Wissenssystem (Cannabis 101) → Academy, Terpen-Atlas → 3.0, Sortenseite/Katalog erweitert. | erledigt |
| 17 Academy-Kategorien | `KB_CATEGORIES` in `src/lib/knowledge.ts`; jede Kategorie hat ≥ 1 Artikel (Test). | erledigt |
| Atlas: geprüfte Verbindungen | `src/lib/catalog/terpene-chem.json` aus PubChem PUG REST (CID, Formel, Masse, IUPAC, InChIKey, CAS mit Prüfziffer); `scripts/verify-terpenes.mjs` gleicht erneut ab (27/27 ohne Abweichung). | erledigt |
| Atlas: Isomere | Sammelnamen („Pinen“, „Ocimen“, „Terpineol“, „Phellandren“, „Nerolidol“, „Farnesen“) werden keinem Isomer zugeordnet; eigene Seiten. Gleiche Summenformel verlinkt. | erledigt |
| Atlas: Detailseite, Rad, 2D-Struktur, Vergleich, Aroma-/Familien-Explorer, Belegansicht | Detailseite mit Chemie, Struktur, Geruch (Originalzitat + Quelle), Cannabis-Beleg, Katalogsorten, eigenen Laborwerten, Quellen; Rad nach Aromafamilien; Filter nach Familie, Stoffklasse, Beleg; Vergleich bis 3. | erledigt |
| Atlas ↔ Sorten | `/api/catalog/local/terpene-index`, `/api/catalog/local/terpenes/:id/cultivars` – Nennungen mit Belegart (Seedbank/Datenbank), paginiert. | erledigt |
| Atlas ↔ Lab Insights | Eigene Laborwerte in Originaleinheit (mg/g bzw. %), Umrechnung gekennzeichnet; je Probe, nie verallgemeinert. | erledigt |
| 5A Katalog-Anreicherung | siehe unten | erledigt (mit dokumentierter Grenze) |
| Academy-Inhalte 20–30 | 30 Artikel. Neue Leitfäden: Anbau-Überblick, Licht (PPFD/DLI), Photoperiode, UV, Klima/VPD, pH/EC, NPK, organisch vs. mineralisch, Bewässerung, Blattsymptome, Krankheiten, Schädlinge, Geschlecht/Einhäusigkeit, Erntezeitpunkt, Trocknen/Curen, Terpenvariabilität, Laborberichte, Edibles & Fahren. | erledigt |
| Premium-Artikelansicht | Lesefortschritt, Inhaltsverzeichnis, eingebettete Diagramme, Begriffe, Quellen, Lernpfad-Navigation, Merken. | erledigt |
| Lernpfade mit Fortschritt je Konto | `src/lib/academy/paths.ts`; Fortschritt aus `settings.kbProgress` (Kontoeinstellung, synchronisiert). | erledigt |
| Interaktive SVG-Diagramme | VPD (Regler + Tabelle), DLI, Lebenszyklus, Narbenstufen. | erledigt |
| Kontexthilfe | `ContextHelp` in Grow-Messwerten, Laborberichten, Grow-Vergleich. | erledigt |
| Glossar in Strg+K | 32 Begriffe; zusätzlich Terpen-Atlas in der Palette. | erledigt |
| Bilder | Keine generierten oder fremden Sortenfotos. Diagramme sind als schematisch gekennzeichnet. | erledigt |

## 5A – Katalog-Anreicherung

### Vorgehen

1. **Audit** (`catalog-audit`): eine SQL-Abfrage über alle Sorten; je Feld vorhanden/fehlend/widersprüchlich und Belegart (Breeder, Seedbank, Datenbank, Labor).
2. **Quellenprüfung** (Nutzungsbedingungen, 24.11.2026): StrainAPI nutzbar mit Zwischenspeicher (30 Tage) und Namensnennung; Find My Seeds verweigert automatisierte Abrufe (403) und untersagt Spiegelung → deaktiviert, nicht umgangen; CannaLib anonym 20 Anfragen/Stunde → für Masse ungeeignet.
3. **Herkunft je Feld** (`catalog_claims`): Originalwert, normalisierter Wert, Belegart, Lizenz, Abruf- und Ablaufzeit, Prüfstatus.
4. **Konservativer Abgleich**: exakt nur bei Name + Breeder, ohne Versionskonflikt, gleiches Blüteverhalten. Admin-Entscheidungen bleiben bestehen.
5. **Läufe** idempotent, mit Probelauf, Checkpoint und Fortsetzung; Admin-Batch max. 25 Sorten.

### Vorher / Nachher (Testsystem, 16.710 Sorten)

| Feld | Vorher | Nachher | davon Datenbank-Angabe |
|---|---:|---:|---:|
| Typ (Indica/Sativa/Hybrid) | 4.543 | 6.373 | 0 |
| Typ-Bezeichnung laut Shop | 0 | 3.310 | 0 |
| Abstammung (strukturiert) | 10.926 | 11.128 | 37 |
| Abstammung (Text der Quelle) | 0 | 6.972 | 0 |
| THC | 7.376 | 7.391 | 28 |
| CBD | 3.891 | 3.902 | 12 |
| Terpene (Nennung) | 541 | 571 | 30 |
| Terpene (Mengen) | 0 | 0 | 0 |
| Weitere Cannabinoide | 0 | 0 | 0 |
| Aroma/Geschmack | 3.821 | 3.854 | 37 |
| Beschreibung | 0 | 37 | 37 |
| Foto (Rechte und Zuordnung belegt) | 0 | 0 | 0 |

Der größte Zuwachs kommt aus dem bereits lizenzierten Datensatz selbst (Parser v2: Typ +1.830, Abstammungstext +6.972). Fremdquellen: 725 StrainAPI-Datensätze → 37 exakte Zuordnungen, 2 zur Prüfung, 4 mehrdeutig, 682 ohne Gegenstück; 288 freigegebene Feldangaben. Labor-Belege im Katalog: 0 (private Laborberichte bleiben privat).

### Abnahmekriterien 5A

| # | Kriterium | Nachweis |
|---|---|---|
| 1 | Vollständigkeits-Audit mit echten Zahlen | `catalog-audit`, Admin-Tabelle, Tabelle oben |
| 2 | Mehrere Quellen geprüft, Lizenz und Limits beachtet | Quellentabelle in `docs/CATALOG.md`; Drosselung, Retry bei 429/5xx |
| 3 | Herkunft je Feld | `catalog_claims`; Sortenseite zeigt Quelle, Link, Abrufdatum |
| 4 | Konservativer Abgleich | Tests „exakt nur mit Breeder“, Version/Auto, mehrdeutig |
| 5 | Terpen-Anreicherung ohne Erfindung | Nur genannte Terpene, Sammelnamen bleiben Sammelnamen; Test „keine erfundenen Angaben“ |
| 6 | Cannabinoid-Anreicherung | THC/CBD mit Plausibilitätsgrenzen; weitere Cannabinoide: keine Quelle → 0 |
| 7 | Genetik-Anreicherung | Abstammungstext der Quelle + Datenbank-Genetik, gekennzeichnet |
| 8 | Fortsetzbar, idempotent, Probelauf | Tests „Probelauf schreibt nichts“, „idempotent“; `--resume` |
| 9 | Admin-Dashboard | Administration → Sortenkatalog |
| 10 | Belegarten auf Profilen | `EvidenceTag`: Laborbestätigt, Breeder-, Seedbank-, Datenbank-Angabe, Widersprüchlich, Keine Daten |
| 11 | „Kein belegtes Terpenprofil verfügbar.“ | `TerpeneCard`, Screenshot `sorte-ohne-terpenprofil.jpg` |
| 12 | Vorher/Nachher-Statistik | Tabelle oben |
| 13 | Keine Nutzerdaten an Quellen, Kernkatalog nicht durch Nutzer änderbar | Anfragen enthalten nur Katalognamen; Test „Kernkatalog für App-Rolle schreibgeschützt“, Admin-Endpunkte 403 für Nutzer |
| 14 | Keine Behauptung vollständiger Abdeckung | Abdeckung offen ausgewiesen (Terpene 3,4 %) |

## Terpen-Atlas 3.0

- 27 Verbindungen: Myrcen, Limonen, β-Caryophyllen, α-Pinen, β-Pinen, Linalool, α-Humulen, Terpinolen, β-Ocimen, trans-Nerolidol, α-Bisabolol, Eukalyptol, Camphen, δ-3-Caren, Geraniol, Borneol, Sabinen, α-Terpineol, Valencen, α-Phellandren, Pulegon, Guaiol, Fenchol, Caryophyllenoxid, p-Cymol, α-Terpinen, γ-Terpinen.
- Stereochemie: Der PubChem-Titel wird angezeigt (z. B. „(+)-Limonene“); für α-Bisabolol bewusst der Eintrag ohne Stereoangabe.
- CAS: erste von PubChem gelistete Nummer mit gültiger Prüfziffer; bei mehreren Nummern wird das angezeigt.
- Geruch: nur Originalbeschreibungen aus PubChem (HSDB, JECFA, CAMEO u. a.) – bei 5 Verbindungen fehlt eine, das Feld bleibt leer.
- Vorkommen in Cannabis: nur Booth et al. 2017 (Harz/Terpensynthasen) und Janta & Vimolmangkang 2024 (getrocknete Blüten, vorläufige Identifizierung), beide im Volltext geprüft. Nicht belegt: δ-3-Caren, Borneol, α-Phellandren, Pulegon, p-Cymol – ausdrücklich so gekennzeichnet.
- Korrektur: „pinene“ wurde bisher als α-Pinen gedeutet; jetzt Sammelname. Alte Links `…/terpenes/pinene` führen auf die Sammelseite.

## Academy

- Quellen: 16 Open-Access-Arbeiten (Europe PMC, Volltext gelesen), u. a. Rodriguez-Morrison 2021, Llewellyn 2022, Ahrens 2023, Peterswald 2025, Corredor-Perilla 2025, Bevan 2021, Crispim Massuela 2023/2026, Punja 2021, Pulkoski & Burrack, Garcia-de Heer 2024, Tran 2025, Baek 2025, Birenboim 2024, Le Foll 2026, Schwabe 2023.
- Zahlen sind als Studienbedingungen formuliert („in der Studie …“), keine Sollwerte. VPD-Bereiche werden ausdrücklich als Sekundärangabe aus Corredor-Perilla et al. gekennzeichnet.
- Nicht genutzt: Seiten von Health Canada (Zugriff aus der Testumgebung abgewiesen) und PMC-Webseiten (Captcha) – stattdessen die offizielle Europe-PMC-Schnittstelle. Die Lower-Risk Cannabis Use Guidelines sind nicht Open Access und werden nur in den bestehenden Artikeln zitiert.

## Technik

- Migration 006 (neu, nur Katalog-Metadaten). Keine Änderungen an Konten, Verschlüsselung oder Nutzerdaten.
- Keine neuen Abhängigkeiten.
- Bundle: Startpaket 483,8 kB (gzip 152,0 kB, +1,2 kB); Atlas, Academy und Wissenstexte werden nachgeladen.
- Antwortzeiten (lokal, Median aus 8): Terpen-Index 31 ms, Sorten je Terpen 78–82 ms, Sortenseite mit Angaben 18 ms; Qualitätsaudit ≈6,5 s (10 min Cache).
- Sicherheit: Admin-Endpunkte geben Nutzern 403; Batch-Größe begrenzt; nur ein Lauf gleichzeitig; Fetch ohne Weiterleitungen, mit Timeout; Quell-URLs nur `https://`; externe Links `noopener noreferrer nofollow`, `referrerPolicy=no-referrer`.

## Offene Punkte / ehrliche Grenzen

- Terpen-Mengen und weitere Cannabinoide fehlen im Katalog vollständig – keine nutzbare Quelle.
- Find My Seeds und CannaLib wären nur mit ausdrücklicher Genehmigung bzw. API-Schlüssel der Betreiber nutzbar.
- StrainAPI-Angaben laufen nach 30 Tagen ab. Ein gedrosselter Refresh (`refresh-catalog.sh`, optionaler Timer) ist vorbereitet, aber auf keinem Server aktiviert.
- Academy- und Atlas-Inhalte sind nicht extern fachlich begutachtet – siehe Abschnitt „Externe fachliche Begutachtung“.
- Ein 401 beim Seitenstart (Sitzungsprüfung vor der Anmeldung) erscheint in der Browser-Konsole; erwartetes Verhalten, kein Fehler.

## Prüfung nach Erstellung von PR #6 (24.11.2026)

### CI
Alle erforderlichen Checks auf dem ursprünglichen PR-Stand grün (2 Läufe): Frontend (Typecheck, Lint, Tests, Build, Audit),
Backend (Typecheck, Migrationen, Integrations- und Isolationstests, Audit), Browser-Smoke-Test, Deployment-Konfiguration,
Secret-Scan. Keine Reviews oder Kommentare.

**Hinweis zum Ablauf:** PR #6 wurde am 24.11.2026 um 18:49 UTC mit dem ursprünglichen Stand (`2157b6e`) gemergt, bevor die
folgenden Korrekturen fertig waren. Sie kommen über einen eigenen, kleinen Folge-PR nach `main` (3 Commits, 24 Dateien,
keine Überschneidung mit bereits gemergten Änderungen). CI für diesen Stand: grün (Läufe 25 und 26).

### Gefundene und behobene Fehler
| # | Fehler | Auswirkung | Behebung |
|---|---|---|---|
| 1 | Belegart „Breeder-Angabe“ wurde je Sorte vergeben, sobald irgendein Angebot vom Breeder-Shop stammte | Felder, die nur Händler nannten, erschienen als Breeder-Angabe (Terpene: 2 Sorten; bei THC, Aroma u. a. mehr) | Belegart je Feld (`listingEvidence`, Audit mit `direct_keys`); Test |
| 2 | Quellenangabe Smith et al. (2022) mit falscher Zeitschrift und DOI (aus Phase 5) | Nicht nachvollziehbare Quelle in 2 Artikeln | Per PubMed geprüft: PLoS One 17(5):e0267498; Aussage genauer gefasst |
| 3 | Kontexthilfe ragte auf schmalen Bildschirmen 203 px aus dem Bild bzw. wurde unter der Kopfzeile abgeschnitten | Hilfe mobil nicht lesbar | Mobil als Leiste über der Navigation (Portal), Desktop unverändert |
| 4 | Beim erneuten Abruf blieben Felder, die die Quelle nicht mehr liefert, bis zum Ablauf sichtbar | Veraltete Angaben bis zu 30 Tage | Gemeinsamer Schreibpfad entfernt nicht mehr gelieferte Felder; Test |
| 5 | Artikel „Forschung richtig einordnen“ nannte veraltete Belegart-Bezeichnungen | Inkonsistenz zur Oberfläche | Text aktualisiert |

### Neu seit PR-Erstellung
- `enrich-catalog --refresh` + `deploy/refresh-catalog.sh` + optionaler systemd-Timer (nicht aktiviert): ruft nur bei bald ablaufenden
  Angaben und höchstens alle 20 h ab; Fehler lassen gültige Angaben stehen; danach Entfernen abgelaufener Angaben.
- Tests: 30-Tage-Ablauf, Drosselung, Fehlerfall, entfernte Felder, Nutzerdaten/Verknüpfungen/Admin-Entscheidungen unverändert,
  Neuimport erhält Anreicherung, weitere Fälle gegen falsche Zuordnung (Kooperationen, fremde Breeder, Teilnamen),
  Belegart je Feld, In-App-Links der Artikel.

### Prüfergebnisse
- **571 Sorten mit Terpen-Nennung** = 541 aus Seedbank-/Breeder-Texten + 30 aus Datenbank-Angaben (keine Überschneidung).
  Alle 21 im Datensatz vorkommenden Terpen-Namen werden einem Atlas-Eintrag oder Sammelnamen zugeordnet.
- **37 exakte StrainAPI-Zuordnungen** einzeln geprüft: Name und Breeder identisch (nur Schreibweisen wie „N.Y.Ceeds“/„NYCeeds“).
  Die 2 „zu prüfen“-Fälle (Kooperation „Barney's Farm x Doja Exclusive“, „Wizard Trees“ vs. „Wizard Trees Genetics“) wurden korrekt nicht übernommen.
- **30-Tage-Gültigkeit:** `expires_at = retrieved_at + 30 Tage` (Test), abgelaufene Angaben werden in Sortenseite, Atlas-Index und Audit ausgeblendet (Test).
- **Atlas:** 27/27 Verbindungen erneut gegen PubChem geprüft (0 Abweichungen); alle 27 Detail- und 6 Sammelseiten laden.
- **Quellen:** 31 DOIs aus Academy, Wissensartikeln und Atlas gegen Europe PMC/PubMed geprüft – 30 korrekt, 1 korrigiert (Nr. 2 oben).
- **Mobil:** 71 Seiten (30 Artikel, 27 Terpene, 6 Sammelnamen, Atlas, Academy, Kategorie, 2 Sortenseiten, Messwerte,
  Grow-Vergleich, Laborberichte) bei 360 und 390 px: kein horizontaler Überlauf, keine Konsolenfehler.
  Glossar-Suche, Lernpfad-Fortschritt, DLI-/VPD-Regler, Kontexthilfe und eigene Laborwerte (mg/g) im Atlas funktionieren.
- **Tests:** Frontend 235, Server 157 (inkl. Isolationstests über alle 12 Sync-Bereiche), ESLint, TypeScript, shellcheck.

### Sicherheitsbewertung
- **Admin-Endpunkte** (`/api/admin/catalog/*`): jeder Handler prüft zuerst die Admin-Rolle; Nutzer erhalten 403 (Test);
  Schreibzugriffe brauchen gültiges CSRF-Token (global); Eingaben per Schema begrenzt (Batch ≤ 25, IDs per Regex);
  nur ein Lauf gleichzeitig; Aktionen im Audit-Log.
- **Neue Lese-Endpunkte** (Terpen-Index, Sorten je Terpen) liefern nur öffentliche Katalogdaten und verlangen eine Sitzung.
- **Kontentrennung:** keine neuen Nutzerdaten-Tabellen; Lernfortschritt liegt in den verschlüsselten Kontoeinstellungen
  (von der Isolationssuite abgedeckt). Private Laborberichte werden nie an Quellen gesendet oder in den Katalog übernommen.
- **Migration 006:** nur neue Tabellen; Laufzeitrolle erhält SELECT/INSERT/UPDATE/DELETE ausschließlich auf die drei
  Anreicherungstabellen, der Kernkatalog bleibt schreibgeschützt (Test). Fremdschlüssel: Angaben entfallen mit einer
  entfernten Sorte (CASCADE), Abgleiche behalten ihre Entscheidung (SET NULL). Läuft in der bestehenden Migrations-Transaktion.
- **Abhängigkeiten:** keine neuen; `npm audit --omit=dev` für Frontend und Server: 0 Schwachstellen.
- **Externe Abrufe:** nur `https://`, keine Weiterleitungen, Timeout, Drosselung; Anfragen enthalten nur Sortennamen.
- **Backup/Restore** (isoliert, gleiche Kette wie `backup.sh`/`restore-test.sh`: `pg_dump -Fc` → `pg_restore --exit-on-error`
  in eine separate Datenbank, zweite API-Instanz): Zeilenzahlen aller relevanten Tabellen identisch; ein Testkonto mit
  Lernfortschritt, Merkliste, Laborbericht (mg/g) und verknüpfter Katalogsorte war nach dem Restore unverändert lesbar
  (verschlüsselt, mit dem Schlüsselring entschlüsselt); Katalogangaben und Terpen-Index identisch (Prüfsumme);
  Rechte der Laufzeitrolle wiederhergestellt; `--refresh` lief auf der wiederhergestellten DB mit der Laufzeitrolle.
  Atlas- und Academy-Inhalte sind Teil des ausgelieferten Programms, nicht der Datenbank. Der vollständige Docker-Restore-Test
  (`restore-test.sh` mit restic) wurde in dieser Runde nicht erneut ausgeführt (zuletzt in 5.1 bestanden).

### Externe fachliche Begutachtung erforderlich
Die folgenden Inhalte geben Studien bzw. Datenbanken wieder, wurden aber nicht von Fachleuten geprüft:
1. **Gesundheit und Risiken** (ärztlich/toxikologisch): „Edibles und Autofahren“ sowie die bestehenden Artikel Wirkungsdauer,
   Toleranz, Konsumformen, Risikominimierung, THC und CBD. Die pharmakologischen Aussagen der älteren Artikel (Grotenhermen 2003,
   Huestis 2007, Hirvonen 2012) wurden in dieser Runde nur bibliografisch, nicht im Volltext erneut geprüft.
2. **Pflanzenbau** (Gartenbau/Agrarwissenschaft): Licht, Photoperiode, Fernrot (Einzelstudie), UV, VPD (Bereiche nur als
   Sekundärangabe), pH/EC, NPK-Optima (eine Sorte, Hydrokultur), Düngung, Bewässerung, Erntezeitpunkt, Trocknung.
3. **Pflanzenschutz** (Phytopathologie/Entomologie): Krankheiten, Schädlinge, Blattsymptome – inklusive der Frage, welche
   Maßnahmen in Deutschland zulässig sind.
4. **Genetik** (Pflanzengenetik): Geschlecht/Einhäusigkeit, Aussagen zu Sortennamen und Etiketten.
5. **Chemie** (Analytische Chemie): Zuordnung von Geruchsbeschreibungen zu Aromafamilien und deren deutsche Übersetzung,
   Stereochemie-Hinweise, Formulierung „vorläufig identifiziert“ (Janta & Vimolmangkang), Isomer-Gruppen.
6. **Recht:** Hinweis zum rechtlichen Rahmen im Anbau-Überblick; Nutzungsbedingungen der Datenquellen vor produktiver Nutzung.

### Nutzungsbedingungen StrainAPI (erneut geprüft am 24.11.2026)
Die „API Terms of Use“ (https://www.strainapi.com/api-terms/, „Last updated: October 6, 2026“) sind gegenüber der ersten
Prüfung unverändert. Erlaubt: Nutzung auch kommerziell, Caching „when reasonably necessary“; zwischengespeicherte Daten sollen
„at reasonable intervals“ aktualisiert werden; unnötige wiederholte Anfragen sind zu vermeiden. Verlangt: Namensnennung
„Data provided by StrainAPI“ mit Link. Verboten: im Wesentlichen vollständige Kopie, Weitergabe als konkurrierender Datensatz,
Umgehen von Limits (keine festen Zahlen genannt). Der Refresh entspricht dem: höchstens alle 20 h, nur bei bald ablaufenden
Angaben, gespeichert werden nur exakt zugeordnete Sorten (derzeit 37), 429-Antworten führen zu Pausen. **Restrisiko:** Der
Verzeichnis-Abruf liest die öffentliche Liste (≈ 725 Einträge, 8 Anfragen) im Speicher; das ist sparsamer als Einzelsuchen,
sollte aber bei geänderten Bedingungen neu bewertet werden. Der Timer bleibt deaktiviert, bis er bewusst eingeschaltet wird.

### Freigabe-Einschätzung
Aus technischer Sicht ist der Folge-PR mergebereit: CI grün, keine offenen Fehler, keine neuen Abhängigkeiten, keine
Migration, Backup/Restore geprüft. Vor einer **produktiven** Nutzung der Academy-Inhalte empfiehlt sich die oben genannte
fachliche Begutachtung. Merge und Deployment erfolgen nur nach deiner Freigabe.

## Screenshots

`docs/screenshots/academy-2-1/`: Atlas vorher/nachher, Sortenseite vorher (5.1)/nachher, Academy vorher (5.1)/nachher, Kontexthilfe mobil, Detailseite Linalool, Sammelname Pinen, Verbindung ohne Cannabis-Beleg, Sortenseite mit Datenbank-Angaben, Sortenseite ohne Terpenprofil, Admin-Katalogqualität, Academy-Start, Artikel mit VPD-Diagramm, Narbenstufen-Diagramm, mobile Ansichten.
