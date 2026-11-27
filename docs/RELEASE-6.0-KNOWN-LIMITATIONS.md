# TERPGRID 6.0 – Bekannte Grenzen

Stand: 6.0.0. Ehrliche Liste dessen, was 6.0 **nicht** kann oder was **nicht geprüft** ist.

## 1. Freigabe-blockierend (offen)

| Thema | Stand | Was nötig ist |
| --- | --- | --- |
| Abnahme auf physischen Geräten (iPhone Safari und installiert, Android Chrome und installiert, Firefox Desktop) | **nicht durchgeführt** – in dieser Umgebung gibt es keine Geräte | Betreiber: `DEVICE-TESTING-6.0.md` |
| Restore-Test mit dem echten Offsite-Repository der Produktion | nur durch den Betreiber möglich | `backup/restore-test.sh latest` (G6) |
| Offline-Sicherung von `master_keys` und `hmac_secret` bestätigt | nur durch den Betreiber möglich | `MAINTENANCE.md` §4 (G7) |
| Laufende Produktionsversion | **unbekannt** | `UPGRADE-6.0.md` Schritt 1; abweichende Version isoliert nachtesten |
| Ausdrückliche Freigabe | offen | G10 |

## 2. Testumgebung (nicht Produktfehler)

| Thema | Einordnung |
| --- | --- |
| Playwrights WebKit ist nicht Safari auf iOS | Geräteabnahme ersetzt sie |
| WebKit-Automation: Offline-Neuladen mit Service Worker nicht prüfbar | auf dem iPhone prüfen (Schritt 13) |
| WebKit unter Offline-Emulation: gelegentliche Meldung „… due to access control checks“ (B-5) ohne funktionale Auswirkung | auf dem iPhone beobachten |
| Passkeys nur in Chromium (virtueller Authenticator) automatisiert | Geräteabnahme Schritte 5–6 |
| Kamera, HEIC-Dekodierung, Safe Areas, Screenreader nicht automatisierbar | Geräteabnahme |
| Lasttest auf dem Entwicklungsrechner, nicht auf dem VPS | Werte sind Größenordnungen (`PHASE5-9-PERFORMANCE.md`) |

## 3. Bekannte Produktgrenzen (dokumentiert, akzeptiert)

| Thema | Auswirkung |
| --- | --- |
| Serverseitige Verschlüsselung, **keine** Ende-zu-Ende-Verschlüsselung | Betreiber mit Master-Key kann Inhalte entschlüsseln (`RELEASE-6.0-SECURITY.md` R-05) |
| Lokale Browser-Kopie unverschlüsselt (nur mit Offline-Freigabe über die Sitzung hinaus) | in App und Doku erklärt |
| Offline-Gerät behält nach Entzug einer Mitgliedschaft die lokale Kopie bis zur nächsten Verbindung | technisch bedingt |
| Upload-Begrenzung 300 Uploads/h je Konto (Foto mit Vorschaubild zählt doppelt, etwa 150 Fotos/h); der Sync-Status zeigt beim Erreichen „Fehler“ statt eines Fortschritts | Upload läuft nach Ablauf des Fensters weiter |
| 600 API-Anfragen/min je IP | viele aktive Personen hinter einem Anschluss können gedrosselt werden |
| Ratenlimits im Arbeitsspeicher, eine API-Instanz | Neustart setzt Zähler zurück; keine horizontale Skalierung |
| Insights bei sehr großen Beständen (20.000 Messungen) auf langsamen Geräten etwa 4 s | dokumentiert |
| Speicherquote erschöpft: nicht automatisiert simuliert | Meldung serverseitig getestet, UI nicht |
| StrainAPI-Angaben verfallen ohne Aktualisierungstimer und werden dann ausgeblendet | gewollt, solange der Timer aus bleibt (`MAINTENANCE.md` §10) |
| PostgreSQL-Hauptversionswechsel nicht skriptgestützt | `MAINTENANCE.md` §5 |
| Basis-Images per Tag statt Digest gepinnt | Updates bewusst per Release |
| Tabs unter „Gemeinsam“ mobil ohne Scroll-Hinweis | kosmetisch |

## 4. Daten – was es nicht gibt (und nicht erfunden wird)

| Thema | Stand |
| --- | --- |
| Quantitative, breeder-spezifische Terpenprofile | **0** – nur Terpen-Nennungen (541 Sorten) und Laborproben über Namensabgleich (Smith et al. 2022) |
| Sortenfotos | **0** lizenzierte Fotos; der Platzhalter ist als solcher gekennzeichnet |
| THC-/CBD-Angaben | nur für 7.376 bzw. 3.891 von 16.710 Sorten |
| Abstammung | für 10.722 Sorten; Rest unbekannt |
| Laborproben | Namensabgleich, keine Aussage über eine bestimmte Breeder-Linie |

## 5. Bewusst nicht Teil von 6.0

- Web-Push.
- Katalog-Aktualisierungstimer.
- Zusätzliche Hintergrundjobs; die bestehenden Backup- und Restore-Test-Timer schaltet der Betreiber selbst ein.
- Automatische Schlüsselrotation.
- Ende-zu-Ende-Verschlüsselung.
- Neue Katalogquellen oder Sortenfotos ohne geklärte Lizenz.
- Veröffentlichung von Images in einer Registry: TERPGRID baut die Images auf dem Server aus dem Quellcode (`RELEASE-6.0-REPORT.md` §7).
