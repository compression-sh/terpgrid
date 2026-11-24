# TERPGRID Phase 5.1 – Bericht

Stand: 24.11.2026 · Branch `claude/phase-5-1` (von `main` nach Merge von PR #4) · Release-Kandidat **5.1.0-rc.1** (kein Tag, nicht veröffentlicht, nicht deployt)

## 1. Ausgangslage und Gap-Analyse

PR #4 (Phase 5) war beim Start bereits gemergt. Daher wurde ein neuer Branch von `main` angelegt, es gibt keine doppelten Commits.

| Ziel aus Phase 5 | Stand nach 5.0 | Stand nach 5.1 |
| --- | --- | --- |
| Katalog CI-Strains-Pro, Breeder, Suche | ✅ | ✅ unverändert, Karten/Sortierung verbessert |
| Genetics Explorer mit Katalog | ⬜ nur StrainAPI | ✅ Katalog-Graph (Abschnitt 3) |
| Grow-Vergleich | ⬜ | ✅ |
| Berichte / PDF | ⬜ | ✅ Druckansicht, PDF über den Druckdialog |
| Experimente & Phänotyp-Journal | ⬜ | ✅ im bestehenden Grow-/Pflanzenmodell |
| Datenvollständigkeit | 🟠 nur Katalog-Widersprüche | ✅ Grow-Dokumentation + Katalog-Datenlage |
| Dashboard | 🟡 | ✅ neu gestaltet |
| Backup/Restore mit Katalog | ⬜ nicht getestet | ✅ in Docker getestet |
| Barrierefreiheit | 🟠 nur Kontrast | 🟡 axe ohne Verstöße auf 17 Seiten; kein Screenreader-Test |
| Personal Data Explorer | 🟡 „Insights“ vorhanden | 🟡 unverändert (Bugfix), nicht erweitert |
| Foto-Erlebnis 2.0 | 🟡 Phase 4 | 🟡 unverändert |
| THC Lab / Lab Insights / Journal / Sammlung | 🟡 | 🟡 nur Text-Korrekturen; keine inhaltliche Überarbeitung |
| Cannabis 101 / Terpen-Atlas | 🟡 | 🟡 unverändert |
| Teilen von Grows | ⬜ | ⬜ bewusst nicht umgesetzt (Abschnitt 6) |
| Find My Seeds | ⬜ (Host blockiert) | ⬜ unverändert blockiert |

## 2. Backup und Restore (M1)

Getestet in einer isolierten Docker-Umgebung mit Images 5.0.0-rc.1, einem lokalen restic-Repository und Testdaten:

| Schritt | Ergebnis |
| --- | --- |
| Testdaten | Konto mit 3 Datensätzen und 1 Foto, Katalogimport |
| `backup.sh` | erfolgreich (Dump 3,6 MB inkl. Katalog) |
| `restore-test.sh` | Konten, Datensätze, Dateien und neu auch die Katalogzählung (16.710 / 494 / 21.210, Version); 3 Datensätze und 1 Datei entschlüsselt, 0 Fehler |
| Import abgebrochen (`docker kill` mitten im Lauf) | vorheriger Import bleibt aktiv, 16.710 Sorten, keine offene Transaktion |
| `restore.sh` auf dem laufenden Stack | nach dem Backup angelegter Datensatz entfernt; Altdaten, Foto (byteidentisch), Katalog, Suche und Breeder-Profil funktionieren |

**Zur Wiederherstellung:**
- Der Katalog ist im Dump enthalten und regenerierbar (`import-catalog.sh`).
- Persönliche Daten und Verknüpfungen sind nicht regenerierbar.
- Die Testumgebung wurde danach entfernt (Volumes, Secrets, restic-Repository).

## 3. Genetics Explorer mit Katalog (M3)

- Server: `/api/catalog/local/lineage/:id`.
  - Breitensuche über die dokumentierten Eltern, bis 4 Generationen, max. 80 Knoten.
  - Abweichende Elternangaben anderer Seedbanks erscheinen als alternative Kanten.
- Ein Elternname wird nur aufgelöst, wenn genau eine Sorte so heißt. Sonst gilt:
  - **mehrdeutig:** Kandidaten verschiedener Breeder, einzeln als neues Zentrum öffnbar;
  - **nicht im Katalog**;
  - **unbekannt:** „Unknown …“.
- Messung über alle 21.794 Elternverweise:

  | Auflösung | Anzahl | Anteil |
  | --- | ---: | ---: |
  | eindeutig | 2.914 | 13 % |
  | mehrdeutig | 9.391 | 43 % |
  | nicht im Katalog | 9.489 | 44 % |

  Graphen sind deshalb oft flach. Das ist der ehrliche Datenstand, nicht geraten.
- Bestehende Graph-Komponente wiederverwendet: Zoom, Pan, Pinch, Tastatur. Neu sind eine Textalternative und die Quellenangabe. StrainAPI bleibt unter `/discover/genetics/live`.
- Test: Kanten nur zwischen vorhandenen Knoten; mehrdeutige Kandidaten eindeutig; jede Elternangabe der Wurzel erscheint; 401 ohne Anmeldung; 404.
- Antwortzeit: 7 ms (Median).

## 4. Grow-Vollendung (M4)

- **Vergleich** (`#/grows/compare`, bis 4 Projekte):
  - Kennzahlen: Dauer, Phase, Pflanzen, maximale Höhe, Einträge, Fotos, Ausgaben, Trockengewicht mit „x von y Pflanzen“.
  - Verlauf in Grow-Tagen ab Start (macht unterschiedliche Startdaten vergleichbar), Messgröße inklusive VPD/DLI, Kontext- und Zeitraumfilter.
  - Warnung, wenn pH/EC aus verschiedenen Messkontexten stammen.
  - Fotos. Mobil Karten statt Tabelle.
- **Bericht** (`#/grows/:id/report`):
  - Abschnitte abwählbar: Kopf mit Dokumentationsstand, Pflanzen, Messwerte (Tabelle + bis zu 6 Diagramme), Verlauf, Foto-Auswahl (gleichmäßig über die Zeit, keine „Qualitäts“-Auswahl), Ausgaben, Experimente/Phänotypen, Notizen.
  - Helle Druck-CSS. PDF über den Druckdialog, ohne neue Bibliothek und ohne Upload; Fotos kommen aus dem angemeldeten Speicher.
  - Im Test als PDF erzeugt (Chromium, A4, 180 KB).
- **Experimente:** gespeichert im Grow-Datensatz (`experiments`).
  - Zeigt je Pflanze den jüngsten Wert im Zeitraum, ohne Durchschnitte oder Hochrechnung.
  - Hinweis, dass kleine Stichproben keine Ursachen belegen.
- **Phänotyp-Notizen:** gespeichert im Pflanzen-Datensatz (`phenotype`); Nebeneinander-Vergleich von 2–4 Pflanzen.
- Keine Migration. Backup-Bereinigung entfernt Pflanzen-IDs gelöschter Pflanzen aus Experimenten.

## 5. Oberfläche (M2/M5/M7)

- **Vorher/Nachher:** `docs/screenshots/phase-5-1/`. „Vorher“ ist der Stand vor dem Design-Umbau in 5.1, also schon mit den M3/M4-Funktionen.
- **Übersicht:**
  - Begrüßung mit Kurzstatus;
  - Schnellaktionen als kompakte, mobil wischbare Leiste;
  - schlanke Kennzahlen;
  - Statuskarten aktiver Grows (Phasenbalken, letzte Messwerte, Höhenverlauf, nächste Aufgabe, Dokumentationspunkte, „Log“);
  - neues Widget „Favoriten“.
- **Katalogkarten:**
  - Der Datensatz hat keine Bilder. Statt eines großen Platzhalters gibt es ein kompaktes Format mit Eltern, THC/CBD/Blütezeit und Datenlage.
  - Die Datenlage nutzt Symbol **und** Text: vorhanden / fehlt / widersprüchlich.
  - Standard-Sortierung jetzt nach Seedbank-Angeboten. Vorher stand bei „A–Z“ zuerst Datensatz-Rauschen wie „#1“.
- **Breeder:** Standard-Sortierung nach Sortenzahl.
- **Grow-Übersicht:** Karte „Dokumentation“ (Meilensteine, Sorten, Messwerte und Fotos je Woche, Ausgaben, Ergebnis) als Bestandsaufnahme ohne Punktwert.
- **Korrekturen falscher Aussagen im Servermodus:** Fotos, Journal, Einstellungen und THC-Lab-Eingaben wurden als „nur auf diesem Gerät“ beschrieben, werden aber synchronisiert.
- **Mobil:** 41 Routen × 6 Breiten (360, 390, 430, 768, 1024, 1440 px) ohne horizontalen Überlauf und ohne JS-Fehler. Zwei Funde wurden dabei behoben: Berichtstabellen und Katalogkarten bei 430 px. Wichtige Seiten habe ich visuell geprüft.

## 6. Sicherheit

- Katalog-Lineage: nur angemeldet, Parameter per Regex/Bereich, parametrisierte Abfragen, nur öffentliche Daten.
- Bericht/PDF: entsteht im Browser aus den eigenen Daten; es gibt keinen neuen Server-Endpunkt und keine öffentliche Freigabe.
- Experimente/Phänotypen: Teil der bestehenden verschlüsselten Datensätze (gleiches Modell wie bisher, keine neuen Rechte).
- **Teilen von Grows: nicht umgesetzt.** Begründung und nötige Nachweise stehen in SECURITY.md (Schlüssel je Konto, RLS je `user_id`, Sync je Konto). Es gibt keinen halbfertigen Code.
- CSP wirkt weiterhin: Der axe-Test musste CSP im Testbrowser ausdrücklich umgehen, weil Inline-Skripte blockiert werden.
- `npm audit`: 0 / 0.

## 7. Leistung (gemessen, lokaler Dev-Server, Median aus 7 Abrufen)

| Abfrage | Zeit |
| --- | ---: |
| Katalogsuche „gelato“ | 17 ms |
| Katalogsuche „og kush“ | 32 ms |
| Katalog ohne Suche, sortiert nach Angeboten | 41 ms |
| Filter (Indica, Auto, Abstammung) | 15 ms |
| Breeder-Liste | 7 ms |
| Breeder-Suche | 11 ms |
| Sortenseite | 25 ms |
| Abstammungsgraph (4 Generationen) | 7 ms |

Seitenaufbau inklusive Reload (Preview-Server): Übersicht 180 ms, Katalog 965 ms, Genetik 916 ms.

Bundle-Größe:
- Start-Bundle 482 KB (152 KB gzip), vorher 444 KB / 140 KB.
- Wissensartikel werden in der Palette erst beim Öffnen geladen (16 KB).
- Bericht, Vergleich und Experimente werden je Route nachgeladen.

## 8. Barrierefreiheit

- axe-core 4.10.3, nur im Testlauf eingebunden, nicht als Projektabhängigkeit. Geprüft nach WCAG 2.0/2.1 A und AA auf 17 Kernseiten.
- Vorher 5 Regeln mit 53 Knoten: Kalender-Grid ohne Zeilen, ungültige `dl` im Konto, `aria-label` ohne Rolle. Nachher **0 Verstöße**.
- Graph:
  - Knoten per Tab und Enter bedienbar;
  - Textalternative als Liste;
  - Abweichungen im Messwert-Diagramm als Raute und Text, nicht nur farblich.
- Nicht geprüft: echte Screenreader-Sitzungen (NVDA/VoiceOver) und manuelle Prüfung des Fokus-Fangs aller Dialoge.

## 9. Tests

| Prüfung | Ergebnis |
| --- | --- |
| Server (PostgreSQL 16) | **135/135**, neu: Lineage |
| Frontend | **221/221**, neu: Grow-Kennzahlen, Vollständigkeit, Zeitachse |
| TypeScript, ESLint | 0 Fehler (10 bestehende Warnungen) |
| Smoke-Test (Lokalmodus) | bestanden |
| Browser-E2E | Katalog (Regression), Grow-Workspace (Regression), Genetik, Vergleich/Bericht/Experimente/Phänotypen, Befehlspalette |
| Docker | Backup, Restore-Test, Restore, abgebrochener Import |

## 10. Offen bzw. nicht umgesetzt

- **Teilen von Grows** (Sicherheitsgrund, siehe oben).
- **Inhaltliche Überarbeitung** von THC Lab, Lab Insights, Journal, Sammlung, Cannabis 101 und Terpen-Atlas: nur Text-Korrekturen und Regressionstests. Medizinische und wissenschaftliche Aussagen in Cannabis 101 wurden in 5.1 nicht erneut gegen Quellen geprüft.
- **Personal Data Explorer** über „Insights“ hinaus: Datumsbereiche, Exporte und weitere Diagramme fehlen.
- **Foto-Erlebnis 2.0:** keine Änderungen in 5.1.
- **Teilweise Design-Überarbeitung:** Übersicht, Katalog und Grow; keine neue Komponentenbibliothek und keine Animations-Überarbeitung.
- **Find My Seeds:** Der Host ist im Netzwerk dieser Sitzung blockiert.
- Kein echter VPS, kein externer Pentest, kein Branch-Schutz gesetzt.

## 11. Einschätzung zur Freigabe

Für den Einsatz im kleinen Kreis auf einem eigenen Server ist der Stand technisch belastbar:
- Upgrade, Backup und Restore sind mit Katalog geprüft;
- die Tests laufen grün;
- keine Sicherheitsfunde offen.

Gegenüber der Vorgabe „Phase 5 vollständig“ fehlen die in Abschnitt 10 genannten Punkte. Sie sind nicht als erledigt dargestellt. Empfehlung: 5.1.0-rc.1 nach Durchsicht mergen und als nächste Schritte Teilen (eigene Sicherheitsphase), Personal Data Explorer und Inhaltsprüfung von Cannabis 101 planen.
