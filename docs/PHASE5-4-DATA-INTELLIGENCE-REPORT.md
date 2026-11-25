# TERPGRID 5.4 – Data Intelligence: Bericht

Stand: 25.11.2026 · Version 5.4.0-rc.1 (Release-Kandidat, nicht veröffentlicht, nicht deployt)
Branch `claude/phase-5-4-data`, Basis `63b3665` = Head von PR #10 (5.3.2-rc.1).

## 0. Ausgangslage

| PR | Status beim Start | Konsequenz |
|---|---|---|
| #7, #8, #9 | gemergt, in `main` (`5d5f604`) enthalten | – |
| #10 (Abschluss-Review 5.3) | **offen**, `mergeable: clean` | Phase 5.4 baut auf dessen Head `63b3665` auf, damit nichts doppelt entsteht. **#10 zuerst mergen.** |

Die Baseline-Tests liefen grün: Frontend 258/258, Server 159/159.

## 1. Katalog-Abdeckung vorher/nachher

Grundlage ist dieselbe Quelldatei (CI-Strains-Pro, Commit `80fbe5d40fac`). Gemessen wurde mit `catalog-audit` über **alle
16.710 Sorten**. „Vorher“ ist Parser v3 vor Beginn dieser Phase, „Nachher“ ist Parser v4 plus Laborproben.

| Feld | Vorher | Nachher | Belegart / Anmerkung |
|---|---|---|---|
| Sorten / Breeder / Angebote | 16.710 / 494 / 21.210 | 16.710 / 494 / 21.210 | keine neuen Sorten erfunden oder zusammengelegt |
| THC | 7.391 (44,2 %) | 7.391 (44,2 %) | Breeder 4.033 · Seedbank 3.343 · Datenbank 28; 248 widersprüchlich |
| CBD | 3.902 (23,4 %) | 3.902 (23,4 %) | Breeder 3.066 · Seedbank 825 · Datenbank 12 |
| Weitere Cannabinoide (sortenbezogen) | 0 | 0 | keine Quelle liefert breederbezogene Werte |
| Cannabinoide aus **Laborproben gleichnamiger Produkte** | 0 | **2.904 (17,4 %)** | Wissenschaftliche Quelle, nur Namensgleichheit; THC, CBD, CBG, CBC, CBN, THCV je Probe |
| Terpen-Nennung | 571 (3,4 %) | 571 (3,4 %) | in der Quelldatei gibt es keine weiteren Nennungen (siehe 3.) |
| Terpene aus **Laborproben gleichnamiger Produkte** | 0 | **2.686 (16,1 %)** | 43.148 Proben mit je bis zu 14 Terpenen |
| **Terpene gesamt (Nennung oder Laborprobe)** | 571 (3,4 %) | **3.095 (18,5 %)** | Faktor 5,4 – ohne erzeugte Profile |
| Terpenmengen breederbezogen | 0 | 0 | nicht belegbar; nichts berechnet |
| Abstammung (strukturiert) | 10.726 (64,2 %) | 10.730 (64,2 %) | +4 durch reparierte Elternnamen |
| Elternverweise eindeutig auflösbar | 3.371 | 3.386 | +15; mehrdeutig 8.972 → 8.976, nicht im Katalog 9.035 → 9.024 |
| Aroma | 3.854 (23,1 %) | 3.854 | Beschreibungen, keine Chemie |
| Bilder mit belegten Rechten | 0 | 0 | keine Quelle mit belegter Zuordnung |
| Quell-URL je Sorte | 100 % | 100 % | – |

Die Laborproben ändern keine Katalogsorte. Sie stehen als eigene, gekennzeichnete Belegart daneben, und die Audit-Zeilen
tragen den Vermerk „nur Namensgleichheit“.

## 2. Quellenrecherche und Lizenzentscheidungen

Das vollständige Register steht in `server/src/catalog/sources.ts` und unter Administration → Quellenregister.

| Quelle | Lizenz | Einstufung | Entscheidung |
|---|---|---|---|
| CI-Strains-Pro | CC BY 4.0 | freigegeben mit Namensnennung | Kernkatalog; Parser v4 |
| **Smith et al. 2022** (PLoS ONE, GitHub-Datensatz) | **CC0 1.0** | **freigegeben** | **89.923 Proben importiert** |
| StrainAPI | API-Bedingungen (Caching, Namensnennung) | eingeschränkt | unverändert: 37 Sorten, 288 Angaben, 30 Tage Zwischenspeicher |
| CannaLib | API-Bedingungen | nur Referenz | Abruf auf Klick, keine Übernahme |
| Find My Seeds | API Policy | technisch nicht zugänglich | HTTP 403 für automatisierte Abrufe; keine Umgehung |
| Cannlytics (Hugging Face) | CC BY 4.0 **und** ODC-By (widersprüchlich) | Lizenz unklar | Lizenz klären; das Laden erfordert fremden Python-Code; Host hier gesperrt |
| Watts et al. 2021 (Dryad) | CC0 | technisch nicht zugänglich | nur 137 niederländische Proben; Host hier gesperrt – Kandidat |
| Official Cannabis Strain Index | CC BY 4.0 laut Anbieter | nur Referenz | nur Aggregate, keine Einzelproben |
| OpenCOA / terphunter / CannabisAnalytic | keine Weitergabelizenz | Erlaubnis erforderlich | – |
| Leafly (inkl. Kaggle-Kopien) | Bedingungen untersagen Übernahme | ungeeignet | – |
| PubChem | gemeinfrei | freigegeben | Atlas-Identitäten (bereits vorhanden) |
| Sortenbilder (Wikimedia u. a.) | je Bild | nur Referenz | Zuordnung Bild → Breeder-Linie nicht belegbar |

**Zugriffsgrenzen dieser Umgebung:** Der Netzwerk-Proxy sperrt zenodo.org, datadryad.org, huggingface.co, opencoa.org
und officialcannabis.net. Ich habe die Lizenzen deshalb über Websuche und Primärseiten geprüft und nur Quellen
eingebunden, die über GitHub (raw) erreichbar waren und deren Lizenz eindeutig ist.

## 3. Ungenutzte Daten im Lizenzbestand (CI-Strains-Pro)

Ich habe alle 53 Spalten der Quelldatei gegen den Parser geprüft:

- **Terpene:** Außer der Spalte `terpenes` (556 Zeilen, bereits genutzt) nennt keine Spalte einen Terpennamen (Suche nach
  28 Verbindungen in `flavors`, `effects`, `genetics_description`, `lineage_description`, Namen). Die 526 verworfenen Werte
  sind reine Zahlen wie „3“ oder „1“ (Scraper-Artefakte). Aus Aromen werden keine Terpene abgeleitet.
- **Kodierungsfehler (behoben):** 495 Elternfelder waren mehrfach falsch dekodiert. 486 davon sind jetzt verlustfrei
  repariert (Parser v4); die übrigen 9 werden wie bisher bereinigt.
- **Generationen:** `filial_`, `backcross_` und `selfed_generation` sind Teilmengen von `generation` (bereits genutzt).
  Sie bringen keine neue Information.
- **Bewusst ungenutzt:** `lineage_formula`. Es ist eine vom Scraper aus Slugs abgeleitete Kette und würde
  Großeltern-Beziehungen erraten.

## 4. Laborproben: Modell, Zuordnung, Grenzen

- **Speicherung:** Jede Probe einzeln (`catalog_samples`) mit den Originalspalten der Quelle als Schlüssel. Je Produktname
  gibt es eine Verteilung aus vorhandenen Messwerten (n, nachgewiesen, Minimum, 25 %, Median, 75 %, Maximum). Fehlende
  Werte zählen nicht als 0.
- **Cannabinoide:** Gesamtwerte, von den Autoren berechnet (neutrale Form + 0,877 × Säureform; fehlende Säureformen dort
  als 0). Sie werden als „berechnete Gesamtwerte“ angezeigt, nie als Einzelmessung von THC oder THCA.
- **Terpene:** 14 Verbindungen in Gewichtsprozent. Ocimen und Nerolidol sind **Isomer-Summen** und mit „Σ“ gekennzeichnet;
  sie werden nicht still einer Einzelform zugeordnet.
- **Zuordnung:** Nur zu photoperiodischen Sorten mit exakt gleichem Namen inklusive Version (`catalog_name_key`).
  - 718 Autoflower-Treffer sind ausgeschlossen.
  - 1.463 Namen treffen 2.904 Sorten, davon tragen 577 Namen mehrere Breeder (z. B. „Blue Dream“ bei 20 Breedern).
  - Die Karte nennt das ausdrücklich: „Nicht eindeutig zugeordnet“ und „X Breeder führen eine Sorte dieses Namens“.
- **Keine Bewertung:** Die Proben ergeben keinen Score und kein Ranking nach Wirkung, kein Profil, und die Katalogsorte
  bleibt unverändert.

## 5. Datenqualität (aktueller Befund, `catalog-validate`, 0,3 s)

| Schweregrad | Anzahl | Befund |
|---|---|---|
| Kritisch | 0 | Angaben ohne Lizenzvermerk |
| Hoch | 0 | THC-Minimum über Maximum; CBD > 30 % |
| Mittel | 232 | Sorte nennt sich selbst als Elternteil |
| Mittel | 49 | THC-Angabe über 35 % (über dem höchsten Laborwert der Proben: 35,7 %) |
| Mittel | 17 | gegenseitige Elternangaben (A ↔ B) |
| Mittel | 6 | Abgleiche externer Quellen warten auf Prüfung |
| Mittel | 0 | Kodierungsreste (vorher betroffen, durch Parser v4 behoben) |
| Niedrig | 194 | beide Elternteile identisch (z. B. „Blue Dream: blue-dream × blue-dream“) |
| Niedrig | 0 | Terpennamen ohne Atlas-Zuordnung |
| Info | 577 | Probennamen mit mehreren Breedern (erwartbar, gekennzeichnet) |
| Info | 330 | Auto-/Versionsvariante mit gleichnamigem Elternteil (erwartbar) |

Befunde werden **nicht** automatisch korrigiert. Die Admin-Ansicht zeigt Beispiele mit Link und eine empfohlene Aktion.
Abgleichsentscheidungen von Admins bleiben über Neuimporte hinweg erhalten (bestehende Logik, Tests in `enrich.test.ts`).

## 6. Produkt

- **Sortenseite:** Karte „Laborproben gleichnamiger Produkte“ mit den Belegarten „Wissenschaftliche Quelle“ und
  „Nicht eindeutig zugeordnet“. Sie zeigt eine Cannabinoid-Tabelle (Median, mittlere 50 %, n), Terpenbalken (mittlere 50 %,
  Median, Nachweisquote) und Herkunft, Methode und Grenzen. Die Terpenkarte verweist darauf, ohne „Kein belegtes
  Terpenprofil verfügbar.“ zu ersetzen.
- **Eigene Laborberichte** (privat) erscheinen als Markierung neben den Proben. Der Vergleich findet nur im Browser statt;
  nichts wird übertragen oder zusammengeführt.
- **Terpen-Atlas:** Messwerte je Verbindung (Proben, Nachweisquote, Median) und Produktnamen mit dem höchsten Median
  (mindestens 20 Proben).
- **Discover:** Filter „Mit Laborproben“ (2.686 Sorten).
- **Vergleich** (bis 4 Sorten): Zeilen „Laborproben (gleichnamig)“ und „Terpene laut Proben (Median)“.
- **Admin:** Probenabdeckung in der Vollständigkeitstabelle (Spalte „Wissenschaft“), „Datenqualität des Katalogs“ und
  „Quellenregister“.
- **Academy:** Abschnitt „Gleicher Name, andere Probe“. Die Zahlen sind aus dem Datensatz berechnet; die Quelle steht im
  Artikel.

Screenshots liegen in `docs/screenshots/phase-5-4/`:
- Vorher/nachher: Sortenseite (Desktop und mobil), Atlas Myrcen
- Nur nachher: Probenkarte (Desktop und mobil), Vergleich, Atlas-Messwerte, Admin-Abdeckung, Admin-Datenqualität,
  Admin-Quellenregister

## 7. Technik

**Datenbank:**
- **Migration 007:** `catalog_name_key()` (IMMUTABLE) mit Funktionsindex, `catalog_samples`, `catalog_sample_stats` und
  `catalog_sample_imports`. Die Laufzeitrolle hat nur Leserechte (Test).
- **Speicherbedarf:** Proben 71 MB, Statistik 5,5 MB.

**Werkzeuge:**
- `import-samples`: Prüfsumme fest, idempotent, ersetzt die Quelle in einer Transaktion vollständig, scheitert sauber.
- `deploy/import-samples.sh`: lädt die an den Commit gebundene Raw-URL, höchstens 50 MB, gleicht die SHA-256 ab;
  Übereinstimmung mit dem Code ist per Test geprüft.
- `catalog-validate`; `catalog-audit` erweitert.

**Sicherheit:**
- Alle Katalog- und Proben-Endpunkte verlangen eine Anmeldung, Admin-Endpunkte die Admin-Rolle (Tests: 401/403).
- Externe Daten sind strikt validiert: Slug-Format, Wertebereiche, Proben-ID, Regionen aus einer festen Liste.
- Kein HTML aus Quelldaten; React rendert nur Text.
- Keine personenbezogenen Daten in den Katalogtabellen; private Laborberichte bleiben in der kontoeigenen Datenbank.

**Abhängigkeiten:** keine neuen.

## 8. Leistung (Entwicklungsinstanz, Median aus 5)

| Endpunkt | vorher (5.3) | nachher |
|---|---|---|
| Sortendetail (inkl. Proben) | 18–24 ms | 26–33 ms |
| Katalogsuche | 14 ms | 10–14 ms (auch mit Probenfilter) |
| Terpen-Atlas je Verbindung | 82 ms | 83 ms (erster Aufruf nach Import 150 ms, dann zwischengespeichert) |
| Datenqualitätsprüfung | – | 274 ms (Admin, 10 Min. zwischengespeichert) |
| Vollständiges Audit | – | 7,2 s (Admin, 10 Min. zwischengespeichert) |
| Probenimport (89.923) | – | 4–8 s |

## 9. Tests

| Prüfung | Ergebnis |
|---|---|
| Frontend (vitest) | 260/260 (neu: Proben-Zuordnung Frontend ↔ Server, Umrechnung eigener Berichte) |
| Server (vitest, PostgreSQL inkl. RLS/Isolation) | 171/171 |
| Neue Servertests | Kodierungsreparatur, Einlesen und Prüfen der Proben, Idempotenz, Leserechte der Laufzeitrolle, Autoflower-/Versionsausschluss, fehlend ≠ 0, Filter, Atlas-Isomer-Summen, Anmeldung, Admin-Rechte, Quellenregister, Audit, Deploy-Skript ↔ Code |
| TypeScript, ESLint | 0 Fehler (10 bestehende Hook-Warnungen) |
| shellcheck, npm audit | 0 / 0 |
| axe WCAG 2.2 AA (7 neue/geänderte Seiten, 1280 und 390 px, als Admin) | 0 Verstöße (zuvor 9 gefunden und behoben) |
| Browser-Abläufe (Filter, Probenkarte, Vergleich, Atlas, Admin, mobil) | 14/14, keine Laufzeitfehler |
| **Upgrade** von 5.3.2 (Images `63b3665`) auf 5.4.0-rc.1 (`c835e41`), isoliert | Preflight, Backup, Migration 007; 110/110 Datensätze, 6/6 Fotos bytegleich; Katalog-Neuimport (Parser v4) und Probenimport per Download mit Prüfsumme, zweiter Lauf idempotent |
| **Restic** mit Proben | Backup, Restore-Test (Migrationen 001–007); nach gelöschten Proben stellt `restore.sh` 89.923 Proben und 3.087 Verteilungen wieder her |
| Rollback-Schutz | `rollback.sh 5.3.2` verweigert ohne vorherigen Restore (Migration 007 unbekannt) – korrekt |

## 10. Offen und Einschränkungen

- **Breederbezogene Terpenmengen bleiben bei 0.** Keine geprüfte Quelle liefert sie mit belegter Breeder-Zuordnung.
  Die Laborproben gelten nur für gleichnamige Handelsware.
- **Bilder:** weiterhin keine; keine Quelle mit belegter Rechte- und Sortenzuordnung.
- **Cannlytics und Watts 2021** sind wegen gesperrter Hosts in dieser Umgebung nicht geprüft. Für Cannlytics muss
  außerdem die Lizenz schriftlich geklärt werden.
- **Elternbeziehungen:** Die 232 Selbstbezüge, 194 Doppel-Eltern und 17 gegenseitigen Angaben sind gemeldet, aber nicht
  korrigiert. Das braucht eine manuelle Prüfung oder eine Regel im Parser, die der Admin freigibt.
- **Nicht umgesetzt:** Breeder-Biografien, Länder und Logos (keine lizenzierte Quelle) sowie eine Graph-Filterung nach
  Beziehungsart. Der bestehende Graph kennzeichnet Mehrdeutigkeit, bleibt aber unverändert.
- **Academy:** Der neue Abschnitt ist nicht extern fachlich geprüft (Prüfstatus „Volltext“ wie die übrigen 2.1-Artikel).

## 11. Freigabe-Einschätzung

Release-Kandidat 5.4.0-rc.1. Tests, Barrierefreiheit, Upgrade, Restore und Rollback-Schutz sind geprüft. Reihenfolge:

1. PR #10 mergen.
2. Diesen PR prüfen und mergen.
3. `upgrade.sh` ausführen.
4. `./import-catalog.sh` ausführen (Parser v4).
5. Optional `./import-samples.sh` ausführen.
6. `restore-test.sh` ausführen.

Den StrainAPI-Refresh-Timer und neue Jobs nicht ohne ausdrückliche Freigabe aktivieren; diese Phase hat keine
eingeführt.

## 12. Empfohlene nächste Schritte

1. **Cannlytics-Lizenz** schriftlich klären (CC BY vs. ODC-By). Danach ein Import nach demselben Probenmodell (eine
   weitere `source`), mit Hosts in der Netzwerkfreigabe.
2. Den **Dryad-Datensatz von Watts 2021** prüfen; Probenbezeichnungen könnten Sortennamen enthalten.
3. **Prüf-Workflow für Elternbefunde:** Admin-Entscheidung „Selbstbezug ignorieren“ persistent wie bei den Abgleichen.
4. **Graph:** Kanten nach Belegart filtern (Breeder/Seedbank/Text), Konflikte farblich hervorheben.
5. Kontakt zu Breedern bzw. Seedbanks für **lizenzierte Bilder und Biografien**.
