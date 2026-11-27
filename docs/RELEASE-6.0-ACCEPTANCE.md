# TERPGRID 6.0 – Abnahme und Release-Matrix

Stand: 6.0.0 (Branch `claude/loving-gates-iyhnqa`, Basis `main` fc35fe7 = 5.9.0-rc.1 nach Merge von PR #18).

**Einstufungen:**
- **Bestanden** – geprüft, Nachweis vorhanden.
- **Teilweise** – geprüft mit dokumentierter Einschränkung.
- **Manuell ausstehend** – nur auf physischen Geräten oder durch den Betreiber prüfbar.
- **Blockiert** – in dieser Umgebung nicht durchführbar.
- **Fehlgeschlagen** – Fehler offen.
- **n. a.** – nicht anwendbar.

Alle Zahlen stammen aus Läufen in dieser Umgebung; nichts ist geschätzt oder übernommen, außer wo ausdrücklich „5.9“ steht.

## 1. Freigabe-Gates (`RELEASE-6.0-CHECKLIST.md`)

| Gate | Anforderung | Status 6.0 | Nachweis / offen |
| --- | --- | --- | --- |
| G1 | Keine offenen kritischen/hohen Sicherheitsbefunde | **Bestanden** | `RELEASE-6.0-SECURITY.md` |
| G2 | Automatisierte Abnahme Chromium, Firefox, WebKit | **Bestanden** (WebKit mit Testumgebungs-Grenze B-4) | §3 |
| G3 | Geräteabnahme iPhone, Android, Firefox Desktop | **Manuell ausstehend** | `DEVICE-TESTING-6.0.md` |
| G4 | Isoliertes Upgrade von der produktiven Version | **Bestanden** für 5.7/5.8/5.9 · produktive Version **unbekannt** | §5 |
| G5 | DR-Übung in frischer Umgebung | **Bestanden** | §6 |
| G6 | Restore-Test auf dem Produktionsserver (Offsite-Repository) | **Manuell ausstehend** (Betreiber) | `UPGRADE-6.0.md` Schritt 2 |
| G7 | Offline-Sicherung `master_keys`/`hmac_secret` bestätigt | **Manuell ausstehend** (Betreiber) | `MAINTENANCE.md` §4 |
| G8 | Produktion auf 5.9 bzw. 6.0 betrieben ohne neue P1/P2 | **Manuell ausstehend** (Betreiber) | – |
| G9 | Dokumentation vollständig | **Bestanden** | §9 |
| G10 | Ausdrückliche Freigabe | **ausstehend** | – |

**Ergebnis: 6.0.0 ist technisch vorbereitet, aber nicht freigegeben.** G3, G6, G7, G8 und G10 sind offen. Ein Verzicht auf die Geräteabnahme (G3) ist nur mit ausdrücklicher Zustimmung möglich und wurde nicht erteilt.

## 2. Regression gegenüber 5.9

| Prüfung | 5.9.0-rc.1 | 6.0.0 | Status |
| --- | --- | --- | --- |
| Frontend-Tests | 291 | **295** (+4: `api.test.ts`) | Bestanden |
| Server-Tests (PostgreSQL 16) | 232 | **232** | Bestanden |
| Lint-Warnungen | 9 | **0** | Bestanden |
| Typecheck Frontend/Server | sauber | sauber | Bestanden |
| `npm audit` Frontend/Server | 0/0 | **0/0** | Bestanden |
| Secret-Scan (gitleaks, CI-Konfiguration) | keine Funde | **keine Funde** in `HEAD` und `origin/main` | Bestanden (§7) |
| Migrationen | 009 | **009** (keine neue) | Bestanden |
| Seitenprüfung 34 Routen × 6 Breiten | 0 Überlauf, 0 Fehler | siehe §3 | |

## 3. Browser (automatisiert, **keine** physischen Geräte)

Engines: Chromium 157, Firefox 155, WebKit 26.6 (Playwright). Build: Produktions-Build des Release-Stands, Vorschau gegen die Entwicklungs-API mit PostgreSQL.

<!-- BROWSER -->

**Wichtig:** Diese Ergebnisse ersetzen die Geräteabnahme nicht. Playwrights WebKit ist nicht Safari auf iOS; installierte Apps, Kamera, HEIC, echte Passkeys, Safe Areas und Screenreader sind nur auf Geräten prüfbar (G3).

## 4. Anwendungsabnahme

| Modul | Status | Nachweis |
| --- | --- | --- |
| Übersicht, Grow Studio, Pflanzen, Messwerte (pH/EC/VPD/DLI) | Bestanden | Workflows (Dialoge, Diagramm), Seitenprüfung |
| Foto-Studio, Galerie, Lightbox, Upload, EXIF-Entfernung | Bestanden | Workflows (Upload, Escape, ausgelieferte Fotos ohne EXIF/GPS) |
| Grow-Vergleich, Bericht, Experimente | Bestanden | Seitenprüfung |
| Sortenkatalog, Breeder, Genetik, Vergleich | Bestanden | Workflows, Seitenprüfung |
| Terpen-Atlas (27 Verbindungen), Academy (30 Artikel) | Bestanden | Seitenprüfung, `academy.test` |
| THC Lab (Edibles, Rauchwaren), Laborberichte | Bestanden | Formel-Tests, Seitenprüfung |
| Journal, Sammlung, Kalender, Insights, Zeitachse | Bestanden | Workflows (Tags, Filter, CSV, Aufgabe → Kalender); Zeitachse: Seitenprüfung und `timeline*.test` nach dem Lint-Umbau |
| Entdecken: Suche ↔ URL, Direktlinks, Filter | Bestanden | nach Lint-Umbau in 3 Engines (Lokal- und Servermodus) |
| Globale Suche | Bestanden | Workflows (Strg+K → Treffer → Navigation) |
| Freunde, Profile, Bereiche, Rollen, Kommentare, Benachrichtigungen | Bestanden | Zusammenarbeit-Suite in 3 Engines; `collab.test` |
| Konto, Sitzungen, 2FA, Passkeys, Datenschutz-Center | Bestanden (Passkeys nur Chromium) | Workflows; `passkeys.test` |
| Administration | Bestanden | Workflows, `auth.test` |
| Offline, PWA, Update, Abmelden | Bestanden Chromium/Firefox · Teilweise WebKit (B-4) | Offline-Suiten |
| Einstellungen, Daten & Backup (Export) | Bestanden | Workflows (JSON-Export) |

## 5. Upgrades (isolierte Docker-Installationen)

Je Pfad eine frische Installation der Ausgangsversion aus ihrem Merge-Commit:
- Katalog und 89.923 Laborproben importiert;
- 3 Konten, ein Konto mit 108 Datensätzen und 6 Fotos;
- ein gemeinsamer Bereich mit 76 Einträgen, 8 Dateien und einem Mitglied mit der Rolle „Kommentieren“.

Prüfsummen vor und nach jedem Schritt über private Daten, Zugangsdaten, Schlüssel, Zusammenarbeit sowie Katalog und Proben. Images aus d8f4e8e gebaut. Der spätere Fix 676eea1 ändert nur das Web-Frontend und berührt Datenbank, Upgrade und Restore nicht.

| Schritt | 5.9 → 6.0 | 5.8 → 6.0 | 5.7 → 6.0 |
| --- | --- | --- | --- |
| Abbruch (Strg+C) | beim Starten der Container | **während des Image-Baus** | beim Starten der Container |
| Daten nach Abbruch | ✓ | ✓ (alte Version lief weiter) | ✓ |
| Erneutes `upgrade.sh` | ✓ 65 s | ✓ 40 s | ✓ 62 s |
| Nach Upgrade: Prüfsummen, Fotos bytegleich 6/6, fremde Daten unsichtbar, Mitglied liest (200), schreibt nicht (403) | ✓ | ✓ | ✓ |
| `status.sh --verify` (Entschlüsselung 110 Datensätze, 12 Dateien, 76 + 8 Bereich) | ✓ Fehler 0 | ✓ Fehler 0 | ✓ Fehler 0 |
| `rollback.sh 5.4.0-rc.1` (unbekannte Migrationen) | korrekt abgelehnt, Exit 1 | korrekt abgelehnt | korrekt abgelehnt |
| Rollback auf Ausgangsversion, Prüfsummen | ✓ | ✓ | ✓ |
| Roll-forward mit Verfügbarkeitsprobe (4 Hz) | 172 Proben/44 s · **Ausfall 1,5 s** | 173/43 s · **2,3 s** | 176/44 s · **2,5 s** |
| Fehlerhafte Migration (`010_failtest`) | Exit 1 nach 9 s, Migration zurückgerollt (Schema 9, Testtabelle fehlt) | Exit 1 | Exit 1 nach 8 s |
| Rollback danach, Prüfsummen | ✓ | ✓ | ✓ |

Dauer: einschließlich Preflight und Backup; die Images waren vorab gebaut. Auf dem VPS kommt die Bauzeit hinzu, während die alte Version weiterläuft.

Ausfallzeit: Zeit zwischen erster und letzter fehlgeschlagener Probe beim Neustart von API und Caddy.

**Nicht getestet:** ≤ 5.6 → 6.0 und die tatsächlich produktive Version, weil sie unbekannt ist (`UPGRADE-6.0.md` §2).

## 6. Disaster Recovery (isoliert, auf der 6.0-Installation)

| Schritt | Ergebnis |
| --- | --- |
| Klartextsuche mit synthetischem Marker (privat und Kommentar): DB-Dateien, `pg_dump`, Dateispeicher, Container-Logs, `/tmp` | **0 Treffer** je Ort; Gegenprobe über die API entschlüsselt lesbar |
| Backup | 6,2 s · ✓; restic-Repository 0 Marker-Treffer; `restic check --read-data` ok |
| Totalverlust | Container, Volumes und Installationsverzeichnis entfernt; nur die Offline-Sicherung der Schlüssel blieb |
| Neuinstallation nach `RUNBOOK.md` §3 | `install.sh --secrets-only` mit gesicherten Schlüsseln, Preflight bestanden, leere Instanz gesund nach 44,6 s |
| `restore-test.sh` (isoliert) | 9,6 s · ✓ |
| `restore.sh` | 8,3 s einschließlich `verify-data`: 111 Datensätze, 12 Dateien, Bereich 76 + 8 entschlüsselt, **Fehler 0** |
| Vergleich mit dem Stand vor dem Verlust | Prüfsummen ✓, alle Datei-Blobs per SHA-256 ✓, Fotos bytegleich 6/6, Mitgliedsrechte (200/403) ✓ |
| `status.sh` nach Restore | alles ✓ außer „Backup: noch kein Lauf“. Das ist erwartet, weil der Backup-Status zur gelöschten Installation gehörte; `RUNBOOK.md` §3 verlangt danach ein neues Backup |
| Beschädigtes Repository (6 Bytes verändert) | `restore-test.sh` → Exit 1, „Wiederherstellung fehlgeschlagen oder Inhalte beschädigt“ |
| Falscher Master-Key | `verify-data` → Exit 2, 0 entschlüsselt, keine Schlüssel in der Ausgabe |
| Fehlende Schlüsselversion | `status` → Exit 2, „FEHLENDE Versionen im Ring: 1“ |
| Laufende Instanz nach den Negativtests | unverändert ✓ |

## 7. Secret-Scan

- gitleaks v8.21.2 (Image per Digest wie in der CI), `.gitleaks.toml` unverändert, keine neuen Ausnahmen.
- `HEAD` und `origin/main`: **keine Funde**.
- Ein Scan über **alle lokalen** Refs findet den bekannten, entfernten Testwert in 9076e9d. Dieser Commit liegt nur noch im lokalen Sicherungs-Branch `backup/pr18-vor-bereinigung` aus der genehmigten Historienbereinigung von PR #18. Er ist nicht gepusht, nicht Teil des Releases und wurde nicht automatisch gelöscht.

## 8. Katalog und Wissen (gezählt, nicht geschätzt)

| Bestand | Wert |
| --- | --- |
| Sorten / Breeder / Angebote | 16.710 / 494 / 21.210 (CI-Strains-Pro, Commit `80fbe5d4`) |
| THC- / CBD-Angaben | 7.376 / 3.891 |
| Sorten mit Terpen-Nennungen | 541 (2.140 Nennungen) |
| Quantitative breeder-spezifische Terpenprofile | **0** |
| Sorten mit Abstammung | 10.722 (21.386 Elternverweise) |
| Laborproben | 89.923; 43.148 mit Terpenwerten; 73.414 mit Produktname; 3.087 Produktnamen (Smith et al. 2022, CC0) |
| Lizenzierte Sortenfotos | **0** |
| Academy | 30 Artikel (12 Basis + 18 Academy), 17 Kategorien, 32 Glossarbegriffe, 4 Lernpfade, 63 Quellenverweise |
| Terpen-Atlas | 27 Verbindungen |

## 9. Dokumentation

| Dokument | Zweck |
| --- | --- |
| `RELEASE-6.0-REPORT.md` | Gesamtbericht |
| `RELEASE-6.0-ACCEPTANCE.md` | diese Matrix |
| `RELEASE-6.0-SECURITY.md` | Sicherheitsabnahme |
| `RELEASE-6.0-KNOWN-LIMITATIONS.md` | Grenzen |
| `UPGRADE-6.0.md` | Upgrade für `/opt/terpgrid/deploy` |
| `MAINTENANCE.md` | laufende Wartung |
| `DEVICE-TESTING-6.0.md` | Geräteabnahme |
| `RELEASE-NOTES-6.0.md` | GitHub-Release-Text (Entwurf) |
| `CHANGELOG.md`, `README.md` | aktualisiert |
| `screenshots/6.0/` | Chromium 390/1440 aller Routen, Firefox- und WebKit-Stichproben |
