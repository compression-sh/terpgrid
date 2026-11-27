# Phase 5.9 – Produktionsbericht (Release-Kandidat 5.9.0-rc.1)

**Stand:**
- Basis: `main` @ `917d845` (PR #17 gemergt).
- Branch: `claude/loving-gates-iyhnqa`.
- Nicht veröffentlicht, nicht deployt.

**Begleitdokumente:**

| Dokument | Inhalt |
| --- | --- |
| `PHASE5-9-RELEASE-MATRIX.md` | jede Anforderung mit Status und Nachweis |
| `PHASE5-9-BROWSER-COMPATIBILITY.md` | Chromium, Firefox, WebKit |
| `PHASE5-9-DEVICE-TESTING.md` | Prüfliste für physische Geräte (ausstehend) |
| `PHASE5-9-PERFORMANCE.md` | Last, große Bestände, Ressourcen |
| `PHASE5-9-DISASTER-RECOVERY.md` | Upgrade, Rollback, DR, Klartextsuche, Deployment-Audit |
| `UPGRADE-5.9.md` | manueller Leitfaden für `/opt/terpgrid/deploy` |
| `RELEASE-6.0-CHECKLIST.md` | Gates für 6.0 |

## 1. Ergebnis in Kürze

- **Automatisiert:** Alle Abnahmesuiten bestehen in Chromium, Firefox und WebKit. Ausnahmen sind eine dokumentierte Grenze der WebKit-Testumgebung (Offline-Neuladen mit Service Worker) und eine gelegentliche, nicht abschließend geklärte WebKit-Meldung unter Offline-Emulation, bei der alle Funktionsprüfungen bestehen (B-5).
- **Isoliert getestet:** Upgrades 5.7 → 5.9 und 5.8 → 5.9, Rollback, Unterbrechungen, fehlerhafte Migration und vollständige Disaster Recovery, jeweils mit Prüfsummen über alle privaten Daten, Zugangsdaten, Schlüssel, Zusammenarbeit, Katalog und Proben.
- **Behoben:** 13 Mängel. Keine offenen kritischen oder hohen Befunde.
  - 2 sicherheits- bzw. datenschutzrelevant, niedrig (S-1, S-2);
  - 4 in den Betriebsskripten (S-4 bis S-7);
  - 2 Leistungsengpässe (P-1, P-2);
  - 4 Anwendungsfehler (A-1 bis A-4);
  - 1 Diagnosemeldung.
- **Nicht freigabereif für 6.0**, solange die Geräteabnahme und die betreiberseitigen Gates fehlen (`RELEASE-6.0-CHECKLIST.md`: G3, G6, G7, G8, G10).

## 2. Ausgangslage (M0)

- PR #17 wurde manuell gemergt (`917d845`). Der Branch wurde frisch von `main` gestartet; kein gestapelter PR.
- Baseline: Server 231/231, Frontend 289/289.
- Bisherige Grenzen aus `PHASE5-8-REMAINING-LIMITATIONS.md`:

| Grenze | Ergebnis in 5.9 |
| --- | --- |
| WebKit und Firefox ungeprüft | jetzt mit allen Suiten geprüft |
| Physische Geräte | weiterhin offen, Prüfliste erstellt |
| Admin-Seiten nicht neu gesichtet | jetzt gesichtet, in allen Engines und Breiten |
| Große Bestände nicht gemessen | jetzt gemessen, zwei Engpässe behoben |
| Tabs unter „Gemeinsam“ ohne Hinweis auf weitere Einträge | **weiterhin offen** (kosmetisch) |

## 3. Behobene Mängel

| ID | Bereich | Befund | Fund | Behebung |
| --- | --- | --- | --- | --- |
| A-1 | Gemeinsam | Außenstehende, die nie Mitglied waren, sahen „Zugriff widerrufen … Zwischengespeicherte Inhalte wurden entfernt“ | Zusammenarbeitstest | Nur nach tatsächlichem Zugriff „widerrufen“, sonst „Kein Zugriff“ |
| A-2 | Grow-Seite | 5 px Überlauf bei 360 px, Menü abgeschnitten | Firefox, WebKit | Aktionsleiste bricht um (B-1) |
| A-3 | Auswahlfelder | Text in WebKit abgeschnitten; Formularfelder ohne sichtbaren Pfeil | visuelle Prüfung WebKit | einheitliche Darstellung mit Pfeil (B-3) |
| A-4 | Server | Versionsanzeige ohne `APP_VERSION` zeigte „5.1.0-rc.1“ | Administration im Test | Version aus `package.json`, Test ergänzt |
| P-1 | Sync | Erstabgleich großer Bestände quadratisch (Oberfläche las nach jeder Seite alles neu) | Lasttest großes Konto | gebündelte Benachrichtigungen, Seiten à 500: 18,0 → 5,5 s, mobil 54 → 13 s |
| P-2 | Fotos | Auf neuem Gerät erschienen die neuesten Fotos zuletzt | Lasttest | neueste zuerst: erste Bilder 20,6 → 8,1 s |
| S-1 | Offline-Privatsphäre | Abmelden: In WebKit legte ein nachlaufender Foto-Download (aus 5.8) die gelöschte Konto-Datenbank **leer** neu an; Name mit Kontokennung blieb bis zum nächsten Start | WebKit-Suite | kein Start nach dem Abmelden; gelöschte Datenbanken können nicht durch Nachzügler entstehen; Unit-Test |
| S-2 | Export | CSV-Formel-Injektion (z. B. `=HYPERLINK(…)` aus einem in einen Bereich geteilten und kopierten Text) | Code-Review | Text mit führendem `= + - @` wird als Text markiert; Zahlen bleiben Zahlen; Test |
| S-4 | Betrieb | Nach unterbrochenem Upgrade lief Caddy nicht, `upgrade.sh` meldete Erfolg | isoliertes Upgrade | `wait_healthy` prüft alle Dienste und startet nach; `status.sh` meldet je Dienst |
| S-5 | Betrieb | Fehlgeschlagene Migration ohne Ursache und Rollback-Hinweis | isoliertes Upgrade | Ausgabe der Migration und Rollback-Befehl |
| S-6 | Backup | `restore-test.sh` erkannte Schäden in älteren Snapshots nicht | DR-Übung | `--full-check` (`restic check --read-data`) und Hinweis |
| S-7 | Betrieb | `upgrade.sh` konnte sich während der Ausführung selbst überschreiben | Code-Review | Skript wird vollständig eingelesen |
| – | Diagnose | `status` meldete nach frischer Installation „Backup fehlgeschlagen“ | DR-Übung | „noch kein Lauf“ |

**Neu (ohne neue Abhängigkeiten):**
- `node dist/cli.js status [--verify]` und `deploy/status.sh`. Beide sind nur lesend und geben keine Anmeldenamen, Inhalte oder Schlüssel aus.
- `restore-test.sh --full-check`.

## 4. Sicherheit (abschließende Abnahme)

- **5.7-Befunde F-01 bis F-08:** alle behoben, Regressionstests weiterhin grün. Server 232/232, darunter Authentifizierung, Passkeys, Rotation, RLS, Isolation (5 Konten), Rechte (4 Rollen) und `security57`.
- **Neue Befunde in 5.9:**

| ID | Schwere | Status |
| --- | --- | --- |
| S-1 | niedrig (keine Inhalte, nur leere DB mit Kontokennung) | behoben |
| S-2 | niedrig | behoben |
| S-4 | mittel für den Betrieb (Verfügbarkeit, kein Datenrisiko) | behoben |
| S-5, S-6, S-7 | niedrig | behoben |

- **Kritisch oder hoch: keine.**
- **Geprüft:**
  - Kein Klartext in DB-Dateien, Dump, Dateispeicher, Logs, `/tmp` oder Backup (Marker-Test).
  - Browser-Speicher nach dem Abmelden leer, in drei Engines.
  - Medien für Außenstehende 404.
  - Entzogene Mitglieder verlieren Inhalte.
  - Falscher bzw. fehlender Master-Key wird erkannt; kein Schlüsselmaterial in Ausgaben.
  - Container ohne Privilegien, Secrets nur als Dateien, PostgreSQL und API nicht veröffentlicht.
- **Unverändert akzeptierte Risiken:** R-01 bis R-06 aus `PHASE5-7-SECURITY-REPORT.md`, also unter anderem keine Ende-zu-Ende-Verschlüsselung (Betreiber mit Master-Key kann entschlüsseln) und eine unverschlüsselte Browser-Kopie bei Offline-Freigabe.
- **Keine experimentelle Kryptografie, keine E2EE-Umstellung, keine Schlüsselrotation.**

## 5. Abhängigkeiten und Lieferkette

| Prüfung | Ergebnis |
| --- | --- |
| `npm audit` | Frontend und Server: 0 Schwachstellen, Laufzeit und Entwicklung |
| Direkte Laufzeitabhängigkeiten | 17; alle im Code verwendet; keine hinzugefügt oder entfernt |
| Basis-Images | per Version gepinnt: `node:22.21-alpine3.22`, `caddy:2.10.2-alpine`, `postgres:16.10-alpine3.22` (Tag, nicht Digest) |
| GitHub Actions | per Commit-SHA gepinnt |
| Externe Datensätze | per Commit und SHA-256 geprüft (CI-Strains-Pro `80fbe5d…`, SHA-256 `469fb653…` im Test erneut bestätigt; Smith et al. 2022) |

## 6. Katalog und wissenschaftliche Daten (tatsächliche Zählungen)

| Größe | Anzahl | Art |
| --- | --- | --- |
| Sorten (Katalog) | 16.710 | CI-Strains-Pro, CC BY 4.0 |
| Breeder | 494 | |
| Sorten mit THC-Angabe | 7.376 | Datenbankangabe (Breeder bzw. Händler), keine Messung |
| Sorten mit CBD-Angabe | 3.891 | wie THC |
| Sorten mit genannten Terpenen | 541 (2.140 Nennungen) | nur Namen, keine Mengen |
| **Breeder-spezifische quantitative Terpenprofile** | **0** | im Katalog und in der Anreicherung nur Terpennamen |
| Sorten mit dokumentierter Abstammung | 10.722 (21.386 Eltern-Verweise) | laut Quelle |
| Angereicherte Angaben (StrainAPI, Produktionsdaten im Entwicklungsbestand) | 288 aktiv | Belegart „Datenbank“, mit Ablauf |
| Laborproben | 89.923 (43.148 mit Terpenwerten, 73.414 mit Produktnamen) | Smith et al. 2022, CC0; **Namensabgleich, keine Breeder-Messungen** |
| Lizenzierte Sortenfotos | **0** | Platzhalter bleibt gekennzeichnet |

- Herkunft und Belegart werden je Feld angezeigt.
- Laborproben stehen weiterhin getrennt mit dem Hinweis „Nicht eindeutig zugeordnet“.
- Die Lizenzbewertung der Quellen ist unverändert (`CATALOG.md`, Quellenregister in der Administration).
- Keine Daten wurden erfunden oder ergänzt.
- Der Katalog-Aktualisierungstimer bleibt aus.

## 7. Barrierefreiheit und visuelle Prüfung

- **axe-core** (WCAG-2.x-A/AA-Regeln): 0 Verstöße auf 48 Kombinationen aus 6 Breiten und 8 Seiten, in jeder der drei Engines.
- **Seitenprüfung:**
  - 34 Seiten × 6 Breiten × 3 Engines, ohne Überlauf und ohne JS-/Konsolenfehler.
  - Screenshots aller Seiten bei 390 und 1440 px (Chromium) sowie Vergleichsaufnahmen aus Firefox und WebKit (§10).
- **Tastatur:** Escape schließt Lightbox und Dialoge; Strg+K öffnet die Suche; Formulare per Label bedienbar. Das ist automatisiert über die Suiten belegt, die Steuerelemente über ihre zugänglichen Namen ansprechen.
- **Nicht** behauptet wird volle WCAG-2.2-AA-Konformität. Screenreader (VoiceOver, TalkBack, NVDA) und reduzierte Bewegung auf Geräten sind ausstehend (Geräteprüfliste 19/20).
- **Gestaltung:** Fast-Schwarz und Smaragdgrün beibehalten. Einzige sichtbare Änderung sind die einheitlichen Auswahlfelder mit Pfeil.

## 8. Verbleibende Grenzen

| Thema | Einordnung |
| --- | --- |
| Physische Geräte (iOS, iPadOS, Android, installierte Apps, Passkeys, Kamera, HEIC, Safe Areas, Screenreader) | **ausstehend**, freigabe-blockierend |
| WebKit-Automation: Offline-Neuladen mit Service Worker nicht prüfbar | Testumgebung; auf dem iPhone prüfen |
| WebKit unter Offline-Emulation: gelegentliche Meldung „… due to access control checks“ (B-5), Ursache nicht abschließend geklärt, keine funktionale Auswirkung gefunden | auf dem iPhone prüfen |
| Passkeys in Firefox und WebKit nicht automatisierbar | Geräteabnahme |
| Upload-Begrenzung 150 Fotos/h je Konto; Sync-Status zeigt „Fehler“ statt Fortschritt | dokumentiert, optional für 6.x |
| IP-Begrenzung 600 Anfragen/min betrifft viele aktive Personen hinter einem Anschluss | dokumentiert |
| Insights bei 20.000 Messungen auf langsamen Geräten etwa 4 s | dokumentiert |
| Speicherquote erschöpft: nicht automatisiert simuliert | dokumentiert |
| Basis-Images per Tag statt Digest gepinnt | akzeptiert (Updates bewusst per Release) |
| Tabs unter „Gemeinsam“ mobil ohne Scroll-Hinweis | kosmetisch |
| Tatsächlich produktive Version unbekannt | `UPGRADE-5.9.md` Schritt 1 |

## 9. Dokumentation

- **Neu:** `UPGRADE-5.9.md`, `RELEASE-6.0-CHECKLIST.md` und die sechs Berichte `PHASE5-9-*`.
- **Aktualisiert:**
  - `DEPLOYMENT.md`: `status.sh`.
  - `BACKUP.md`: `--full-check` und die Grenze des normalen Restore-Tests.
  - `RUNBOOK.md`: Erstdiagnose mit `status.sh`, unterbrochenes Upgrade.
  - `PRODUCTION-CHECKLIST.md`, `README.md`, `CHANGELOG.md`.
- **In isolierter Umgebung ausgeführt:**
  - `install.sh --secrets-only`, `preflight.sh`, `import-catalog.sh --file`, `import-samples.sh --file`;
  - `upgrade.sh` (mit und ohne `--no-build`), `rollback.sh`, `status.sh [--verify]`;
  - `backup.sh`, `restore-test.sh [--full-check]`, `restore.sh`;
  - die Diagnosebefehle.
- **Nicht ausgeführt:** `upgrade.sh` **mit** Image-Bau. In der Sandbox scheitert `npm ci` im Container an der Proxy-Zertifizierung, deshalb wurden die Images mit identischen Dockerfiles plus Sandbox-Zertifikat vorab gebaut. Auf dem VPS ohne Proxy ist das der Normalweg aus früheren Phasen.

## 10. Screenshots

`docs/screenshots/phase-5-9/`:
- `chromium/` mit allen 34 Seiten bei 390 und 1440 px;
- `firefox/` und `webkit/` mit einer Auswahl;
- `befunde/` mit vorher/nachher der behobenen Darstellungsfehler.

## 11. Tests (Endstand)

| Prüfung | Ergebnis |
| --- | --- |
| Server (Vitest, PostgreSQL 16) | **232/232** |
| Frontend (Vitest) | **291/291** |
| Typecheck, Lint | 0 Fehler (9 bestehende Warnungen, unverändert) |
| Browser-Suiten × 3 Engines | siehe `PHASE5-9-BROWSER-COMPATIBILITY.md` |
| Docker: 2 Upgrade-Pfade, 2 DR-Übungen, Deployment-Audit, Lasttest | bestanden (Details in DR/PF) |

## 12. Commits und Pull Request

| Commit | Inhalt |
| --- | --- |
| `0896f87` | Abmelden löscht die Arbeitskopie zuverlässig (WebKit), Status-Diagnose, Layout- und Textkorrekturen, Version 5.9.0-rc.1 |
| `898d1cb` | Erstabgleich großer Bestände, CSV-Formelschutz, Safari-Auswahlfelder, `restore-test.sh --full-check` |
| `d029f9d` | Betriebsskripte robuster bei unterbrochenen Upgrades |
| `d2901c5` | `upgrade.sh` meldet fehlgeschlagene Migrationen; Betriebsdoku |
| `4f06d2a` | Berichte, Upgrade-Leitfaden, Screenshots, Browser-Suiten (ohne festes Testpasswort) |

Pull Request: https://github.com/compression-sh/terpgrid/pull/18 – direkt gegen `main`, kein automatischer Merge, kein Deployment.
