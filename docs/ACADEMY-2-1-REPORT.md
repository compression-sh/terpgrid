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
- Der Ablauf der StrainAPI-Angaben (30 Tage) erfordert einen wiederkehrenden Lauf (`enrich-catalog --index`); ein Zeitplan ist nicht eingerichtet.
- Academy-Inhalte sind nicht fachlich extern begutachtet; sie geben die zitierten Studien wieder.
- Ein 401 beim Seitenstart (Sitzungsprüfung vor der Anmeldung) erscheint in der Browser-Konsole; erwartetes Verhalten, kein Fehler.

## Screenshots

`docs/screenshots/academy-2-1/`: Atlas vorher/nachher, Detailseite Linalool, Sammelname Pinen, Verbindung ohne Cannabis-Beleg, Sortenseite mit Datenbank-Angaben, Sortenseite ohne Terpenprofil, Admin-Katalogqualität, Academy-Start, Artikel mit VPD-Diagramm, Narbenstufen-Diagramm, mobile Ansichten.
