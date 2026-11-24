# TERPGRID Phase 5 – Bericht

Stand: 24.11.2026 · Branch `claude/phase-5` · Release-Kandidat **5.0.0-rc.1** (kein Tag, nicht veröffentlicht, nicht deployt)

Phase 5 war sehr umfangreich angelegt (38 Abschnitte). Umgesetzt und getestet wurden die höchsten Prioritäten:
Sortendatensatz, Breeder, Discover, Messwerte, Grow-Workspace, Etiketten, Suche und ein Barrierefreiheits-Fix im
Design-System. Mehrere Abschnitte sind **nicht** umgesetzt; sie sind unten einzeln aufgeführt.

## 1. Feature-Inventar (geprüft am Code von `main`, Stand Phase 4)

Legende: ✅ vollständig · 🟡 vorhanden, verbesserungsfähig · 🟠 teilweise · ⬜ fehlt · Maßnahme in Phase 5

| Bereich | Zustand vor Phase 5 | Phase 5 |
| --- | --- | --- |
| Dashboard | ✅ Widgets, Anpassen, Schnellaktionen | **erweitert:** Widget „Letzte Messwerte“, Schnell-Log |
| THC Lab | ✅ (Edibles, Joint, Dosierung, Zeitachse, Vergleich) | unverändert; Unit-Tests + Smoke-Test als Regression |
| Growlogs / Pflanzen | ✅ Projekte, Phasen, Aktivitäten, 5 Messgrößen | **erweitert:** 12 Messgrößen, Kontexte, Standort, Tags, Schnell-Log, Etiketten |
| Messwert-Diagramme | 🟡 nur Rohpunkte, keine Filter | **erweitert:** Zeitraum, Kontext, eigene Zielbereiche, Abweichungen, CSV, VPD/DLI |
| Discover (StrainAPI) | 🟡 nur Live-Abfrage, Summen nur der Quelle | **ergänzt:** lokaler Katalog als Start; StrainAPI unter „Live & Bilder“ |
| Breeder | ⬜ nur Textfeld/Filter | **neu:** Verzeichnis + Profile |
| Sortendatensatz | ⬜ (ci-strains-pro in Phase 2 geprüft, nicht eingebunden) | **neu:** Import in PostgreSQL |
| Genetics Explorer | 🟡 StrainAPI-basiert | unverändert (Katalogsorten: Eltern/Nachkommen auf der Sortenseite) |
| Terpen-Atlas, Cannabis 101 | ✅ | unverändert (101-Artikel jetzt in der Befehlspalette) |
| Laborberichte | ✅ | unverändert |
| Journal | ✅ | unverändert |
| Sammlung | 🟡 Inventar ohne Gerätedetails | **erweitert:** Grow-Bereiche, Gerätedaten, Wartung, Tags, Archiv |
| Fotos / Zeitraffer | ✅ (Phase 4 überarbeitet) | unverändert |
| Kalender / Erinnerungen | ✅ Monat/Woche, wiederkehrend, ICS | Wartungs-Erinnerung aus der Sammlung vorbelegt |
| Befehlspalette | 🟡 nur eigene Daten + Navigation | **erweitert:** Katalog, Breeder, Wissen, Schnell-Log |
| Konto, Sync, Admin, Backup | ✅ (Phase 3/4) | unverändert; neue Felder laufen über die bestehenden verschlüsselten Datensätze |
| Design-System | 🟡 Kontrast der gedämpften Texte unter WCAG | **korrigiert** + semantische Tokens |
| Teilen von Grows | ⬜ | **nicht umgesetzt** |
| Redundanzen | keine gefunden, die sich gefahrlos entfernen ließen | nichts entfernt |

## 2. Umgesetzt

### Sortenkatalog (M1/M2)
- CI-Strains-Pro (CC BY 4.0) geprüft. Die tatsächlichen Werte weichen von den Projektangaben ab: 21.210 Zeilen und 53 Spalten statt 21.282 und 51. Dazu kaputte Kodierung (116 Ersatzzeichen, Mojibake-Ketten) und unplausible Werte. Alles Weitere steht in `docs/CATALOG.md`.
- Pipeline `server/src/catalog/`:
  - Parser und Validierung;
  - Import mit Probelauf, SHA-256-Prüfung, Idempotenz, einer Transaktion, Upsert mit stabilen IDs und Entfernen entfallener Einträge;
  - Qualitätsbericht.
- Migration 005: 4 Tabellen, `pg_trgm`, gewichteter Volltext. Die App-Rolle hat nur Leserechte.
- API `/api/catalog/local/*`: Status, Suche, Sorte, Name→Sorten, Breeder-Liste und -Profil, Bericht.
- Oberfläche:
  - Katalogseite;
  - Sortenseite mit Angeboten und Quellen;
  - Breeder-Verzeichnis und -Profil;
  - Favoriten, Vergleich und Verknüpfung mit Pflanze, Grow und Journal;
  - „zuletzt angesehen“ und gemerkte Breeder (synchronisierte, verschlüsselte Einstellungen).
- Deploy: `deploy/import-catalog.sh` lädt auf dem Host, prüft die Prüfsumme und importiert im `migrate`-Container.

### Growlogs Pro (M4/M5)
- Neue Messgrößen:
  - Blatttemperatur (Häkchen „geschätzt“);
  - CO₂;
  - Wassertemperatur, Substrattemperatur, Substratfeuchte;
  - PPFD, Lichtstunden;
  - Messgerät.
- pH/EC mit Kontext. EC wird kanonisch in mS/cm gespeichert, die Originaleingabe (µS/cm, ppm 500, ppm 700) bleibt zur Nachvollziehbarkeit erhalten.
- VPD (Tetens) und DLI werden nur berechnet angezeigt; Basis und Annahmen stehen dabei.
- Eigene Zielbereiche je Grow, ohne Voreinstellungen. Abweichungen erscheinen als Raute im Diagramm und als Text in der Tabelle.
- Messwert-Filter: Zeitraum (7/30/90 Tage) und Messkontext. CSV-Export mit Dezimalkomma.
- Grow-Bereiche, Ausrüstung (Leistung, Laufzeit, Garantie, Standort), Wartungsprotokoll, Stromschätzung je Bereich (kWh/Tag aus eigenen Angaben).
- Schnell-Log:
  - Pflanzen der aktiven Grows, zuletzt dokumentierte zuerst;
  - strukturierte Beobachtung, ausdrücklich ohne Diagnose;
  - Messwerte und anschließendes Foto;
  - Entwurf je Konto im Tab.
- Pflanzen-Etiketten (50×30 oder 70×40 mm) mit QR-Link. Der Code enthält keine Zugangsdaten; die Seite öffnet nur mit Anmeldung und eigenem Besitz.

### Oberfläche (M3/M8)
- Befehlspalette mit den Gruppen Katalog, Breeder und Wissen. Hinweis im Fuß der Palette, wohin gesucht wird.
- Barrierefreiheit: Die gedämpften Textstufen sind auf ≥ 4,5:1 angehoben (gemessen: ink-500 von 2,0 auf 4,7, ink-400 von 3,6 auf 5,8).
- Semantische Tokens und Hilfsklassen.
- Mobil ist das Filterfeld des Katalogs nicht mehr fixiert (spart Platz beim Scrollen).

## 3. Datenbank-Migrationen
`005_catalog.sql`: Die Migration ist additiv und berührt keine bestehende Tabelle.
- Getestet in den Integrationstests (frische Datenbank).
- Auf dem Docker-Stack getestet: Upgrade 4.0.0-rc.1 → 5.0.0-rc.1 mit Bestandsdaten in 38 s. Schema passt, Altdaten inklusive alter Messwerte lesbar.

Alle neuen persönlichen Felder sind optionale Felder bestehender Datensätze:
- Messkontexte, Geräte- und Bereichsdaten, Tags, Beobachtungen, Zielbereiche;
- `favoriteBreeders` und `recentCultivars` in den Einstellungen.

Sie werden also wie bisher je Konto mit AES-256-GCM verschlüsselt und synchronisiert. Ein neuer Datenspeicher war nicht nötig. Für ältere Datensätze ist keine Migration nötig.

## 4. Sicherheit
- Katalog: öffentliche Daten ohne Personenbezug.
  - Import nur mit Owner-Rolle nach Prüfsumme; die Laufzeitrolle hat nur `SELECT` (Test).
  - API nur angemeldet (Test); `LIKE`-Platzhalter maskiert (Test).
  - Alle SQL-Abfragen parametrisiert, Parameter per Allowlist/Regex.
- Suchbegriffe gehen nur an die eigene Instanz. Persönliche Daten werden nie an Katalog-Anbieter gesendet; auch die Palette sucht eigene Daten nur lokal.
- Quell-URLs aus dem Datensatz: nur `https:` (Parser und DB-CHECK), Links mit `noopener noreferrer nofollow` und ohne Referrer.
- QR-Etiketten: nur der App-Link mit zufälliger Datensatz-ID (Bedrohungsmodell T37).
- Schnell-Log-Entwurf: `sessionStorage`, Schlüssel je Kontodatenbank, wird nach dem Speichern oder Verwerfen gelöscht.
- Bedrohungsmodell um T35–T37 ergänzt.
- `npm audit`: 0 Befunde (Frontend und Server). gitleaks läuft in der CI.

## 5. Abhängigkeiten
- Frontend: `qrcode` 1.5.4 und `@types/qrcode` 1.5.6 (dev). Dieselbe Bibliothek nutzt der Server bereits für TOTP.
- Server: keine neuen Pakete. Der CSV-Parser ist eigen (RFC 4180, getestet).

## 6. Tests

| Prüfung | Ergebnis |
| --- | --- |
| Server (Vitest gegen PostgreSQL 16) | **134/134** grün, darunter neu: Parser (16), Katalog-API und Import (12), Deploy-Skript-Abgleich (1) |
| Frontend (Vitest) | **218/218** grün, darunter neu: Messwerte (15) |
| TypeScript (Frontend + Server) | ohne Fehler |
| ESLint | 0 Fehler (10 bestehende Warnungen zu Hook-Abhängigkeiten) |
| `npm audit` | 0 / 0 |
| Browser-Smoke-Test (Lokalmodus, `npm run e2e`) | bestanden (28 Routen mobil) |
| Browser-E2E Katalog (Servermodus, voller Datensatz) | siehe unten |
| Browser-E2E Grow-Workspace (390 px, Touch) | siehe unten |
| Mobil-/Breitenmatrix | **35 Routen × 6 Breiten** (360, 390, 430, 768, 1024, 1440 px): kein horizontaler Überlauf, keine JS-Fehler |
| Docker-Stack | Upgrade 4.0 → 5.0 mit Bestandsdaten, `import-catalog.sh --dry-run`, Import (6,7 s), erneuter Import „bereits aktiv“, API-Abfragen, 401 ohne Anmeldung |

**Browser-E2E Katalog:**
- Katalog zeigt „16.710 Sorten von 494 Breedern“.
- Suche „gelato“: 637 Treffer in fünf Trefferarten; die Gruppensumme entspricht der Gesamtzahl. Exakte Namen stehen oben.
- Filter „nur Auto“ funktioniert.
- Sortenseite mit 7 Angeboten und Quellen; Merken → Favorit.
- Vergleich enthält die Katalogsorte; „Meine Sorten“ ebenfalls.
- Breeder-Profil und Breeder merken funktionieren; Buchstabe B zeigt 39 Breeder.
- Keine Anfragen des Browsers an Dritte.

**Browser-E2E Grow-Workspace:**
- Bereich und Gerät anlegen, Wartung eintragen.
- Grow und Pflanze mit Standort und Tags anlegen.
- Schnell-Log: pH „6,2“ (Komma) mit Kontext Drainage; EC 700 ppm (500) ergibt 1,4 mS/cm; VPD-Vorschau 1,27 kPa als „Luft-VPD“.
- Zweite Messung außerhalb des Zielbereichs; Entwurf übersteht Schließen und Öffnen.
- Zielbereich 5,8–6,5: „1 von 2 außerhalb“.
- Kontextfilter, Tabelle und CSV korrekt.
- VPD-Reihe als berechnet gekennzeichnet; Etikett mit QR-Code.
- Keine JS-Fehler.

**Gemessene Leistung:**
- Katalogsuche in der Datenbank: 5–11 ms.
- Import des vollen Datensatzes: ca. 3,5 s lokal, 6,7 s im Container.
- Katalog in PostgreSQL: ca. 50 MB (frische Installation).
- API im Leerlauf: 36 MiB RAM.

## 7. Nicht umgesetzt bzw. nicht geprüft

- **Teilen von Grows** (Abschnitt 25): nicht umgesetzt. Das bräuchte ein neues Berechtigungsmodell mit eigenen Isolationstests und sollte nicht halbfertig ausgeliefert werden.
- **Grow-Vergleich (bis 4 Projekte) und Berichte/PDF** (17): nicht umgesetzt.
- **Genetics Explorer 2.0** (8): kein Graph für Katalogsorten. Eltern, Mehrdeutigkeit und Nachkommen gibt es nur auf der Sortenseite.
- **Terpen-Atlas/Cannabinoid-Lexikon, Cannabis 101, THC Lab, Lab Insights, Journal 2.0** (9, 18–20, 26): inhaltlich unverändert. Nur Regressionstests liefen.
- **Experimente/Phänotyp-Journal, Datenqualitäts-Anzeigen, Personal Data Explorer** (16, 28, 29): nicht umgesetzt. Ausnahme Katalog: Widersprüche und verworfene Werte werden je Sorte angezeigt.
- **Fotos, Kalender-Listenansicht, PWA** (14, 24, 32): unverändert gegenüber Phase 4.
- **Design-System:** Es gab keine flächendeckende Überarbeitung aller Komponenten und keine neuen Animationen, sondern gezielte Korrekturen (Kontrast, Tokens). Vorher/Nachher-Screenshots aller Bereiche wurden nicht erstellt.
- **Find My Seeds:** nicht untersucht, weil `www.findmyseeds.com` vom Netzwerk dieser Sitzung blockiert wird (Proxy 403). Keine Integration.
- **Backup/Restore** wurde mit den Katalogtabellen nicht erneut auf dem Stack ausgeführt. Die Tabellen sind Teil des normalen `pg_dump` und lassen sich jederzeit neu importieren.
- **Kein echter VPS**, kein externer Pentest. Der Branch-Schutz für `main` ist weiterhin nicht gesetzt.

## 8. Commits

```
7 Commits auf claude/phase-5 (seit main) – siehe Pull Request
```

## 9. Nächste Schritte (Empfehlung)
1. PR prüfen und mergen. Danach auf dem Server `./upgrade.sh`, dann `./import-catalog.sh --dry-run` und `./import-catalog.sh`.
2. Teilen von Grows als eigene Phase mit Rechte-Modell und Isolationstests.
3. Genetics-Graph auf Katalogbasis (Mehrdeutigkeit je Breeder), Grow-Vergleich und Berichte.
4. Freigabe für `www.findmyseeds.com`, falls die API genutzt werden soll; danach Nutzungsbedingungen prüfen.
