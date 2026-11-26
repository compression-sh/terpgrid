# Phase 5.8 – Produktbericht

Stand: 5.8.0-rc.1 (Release-Kandidat, nicht veröffentlicht, nicht deployt) · Basis `main` @ `dfc8a64` (PR #16 gemergt) · Branch `claude/loving-gates-iyhnqa`

Begleitdokumente:
- `PHASE5-8-FEATURE-MATRIX.md`
- `PHASE5-8-PERFORMANCE-REPORT.md`
- `PHASE5-8-REMAINING-LIMITATIONS.md`

Screenshots aller Hauptseiten (1440 px und 390 px, je 31 Seiten): `docs/screenshots/phase-5-8/`.

## 1. Ausgangslage

- PR #16 ist gemergt. Der Branch wurde frisch von `main` gestartet; kein gestapelter PR.
- Der Sicherheitsbericht aus 5.7 enthält **keine** offenen kritischen oder hohen Befunde. Es war nichts nachzuziehen.
- Baseline: 230 Server- und 288 Frontend-Tests grün.

## 2. Vorgehen

1. **Audit:** Alle Hauptseiten wurden mit realistisch befülltem Konto aufgenommen (Grows, 67 Einträge, 6 Fotos, Journal, Sammlung, Erinnerungen, Laborberichte) und gesichtet, auf Desktop und mobil. Dazu kamen Konsole und API-Log.
2. **Code-Durchsicht** je Bereich auf fehlende Funktionen (Suche, Filter, Tags, Zeiträume, Exporte) und auf Platzhalter. Gefunden wurden nur bewusst gekennzeichnete Platzhalter für fehlende lizenzierte Sortenfotos.
3. **Priorisierte Umsetzung** der Befunde (Feature-Matrix), danach vollständige Regression.

Das Produkt war bereits weitgehend vollständig. Phase 5.8 hat deshalb gezielt **echte Fehler und Lücken** geschlossen, statt Funktionen zu duplizieren.

## 3. Umgesetzt

| Bereich | Änderung |
| --- | --- |
| **Gemeinsam (Fehler P1)** | Beim ersten Öffnen legten parallele Anfragen das Profil doppelt an → 500 „Interner Fehler“. Behoben über atomares `INSERT … ON CONFLICT`. Regressionstest: vorher 500, nachher 200. |
| **Journal** | Tags (Eingabe, Anzeige, Filter, Suche, Entwurf), Zeitraum von/bis, „Filter zurücksetzen“, CSV-Export der gefilterten Einträge (Semikolon, UTF-8 mit BOM für Excel; lokal erzeugt) |
| **Genetik** | Startseite mit Ausgangspunkten: meistgelistete Katalogsorten mit dokumentierter Abstammung. Reale Daten; die Reihenfolge ist ausdrücklich keine Wertung. |
| **Meine Sorten** | Kein „Invalid Date“ bei fehlendem Verknüpfungsdatum |
| **Daten & Backup** | Keine irreführende Lokalmodus-Warnung im Servermodus |
| **UI** | Kartenköpfe mit Aktionen brechen auf schmalen Bildschirmen um (gemeinsame Komponente, wirkt app-weit); Sicherheitsübersicht im Konto entzerrt |
| **Leistung** | Ungelesen-Zähler: eine gemeinsame Anfrage statt drei; Sync lädt Fotodateien erst im Leerlauf |

**Unverändert erhalten:**
- Konten und private Daten, Verschlüsselung, RLS und die vier Rollen;
- Offline-Schutz und Offline-Opt-in;
- deutsche Texte;
- keine neuen Abhängigkeiten.

## 4. Tests und Ergebnisse

| Prüfung | Ergebnis |
| --- | --- |
| Server (Vitest, PostgreSQL 16) | **231/231** (neu: Profil-Wettlauf) |
| Frontend (Vitest) | **289/289** (neu: CSV-Tabellenexport) |
| Typecheck / Lint | 0 Fehler |
| `npm audit` (Laufzeit, Frontend + Server) | 0 Schwachstellen |
| Browser-Smoke (Lokalmodus) | bestanden (28 Routen mobil) |
| Offline-Sicherheit (Chromium, echte API) | **16/16** |
| Offline/Mehrkonten, Kontowechsel, Isolation | **26/26** |
| Mobil-Suite (6 Breiten, axe-core, Update-Ablauf) | **16/16**, 0 axe-Verstöße auf 48 Kombinationen |
| Screenshots 31 Seiten × 2 Breiten | 0 JS- oder Konsolenfehler (vor dem Fix: 500 auf „Gemeinsam“) |
| Bereichs-Isolation und Rechte (4 Rollen + Außenstehend) | in den Server-Tests enthalten (31 Bereichstests) |
| **Docker-Upgrade 5.7 → 5.8** (isoliert) | private Daten und Zusammenarbeit bytegleich; `verify-data` 0 Fehler; Backup, Restore-Test, simulierter Verlust → Restore identisch; Rollback auf 5.7 ohne Wiederherstellung (keine Migration) und Roll-forward ✓; keine Hintergrundjobs aktiv |

**Browser:**
- Chromium (Desktop und mobile Emulation) geprüft.
- **WebKit und Firefox nicht verfügbar** (Installation untersagt).
- **Physische Geräte nicht geprüft.**

## 5. Messwerte

Siehe `PHASE5-8-PERFORMANCE-REPORT.md`.

**Kurz:**
- Belegt sind zwei Anfragen weniger je Seite.
- LCP und FCP sind unverändert im Rahmen der Messstreuung; es wird keine Beschleunigung behauptet.
- Der Server ist nicht der Engpass (Katalog-Endpunkte 2–35 ms).

## 6. Grenzen und nächste Schritte

Siehe `PHASE5-8-REMAINING-LIMITATIONS.md`.

**Kurz:**
- keine neuen Datenquellen oder Sortenfotos ohne geklärte Lizenz;
- WebKit/Firefox und Geräte offen;
- für 5.9: Geräteabnahme, Lasttest mit großem Bestand, Prüfung der Betriebsdokumentation, Release-Notizen 6.0.

## 7. Commits und Pull Request

- `f5acb4b` – Journal-Tags und Zeitraum, CSV-Export, Genetik-Ausgangspunkte, Profil-Wettlauf behoben, Ladeverhalten, Version 5.8.0-rc.1
- Dokumentations-Commit, PR-URL und CI-Status: siehe Pull Request (direkt gegen `main`, kein automatischer Merge, kein Deployment).
