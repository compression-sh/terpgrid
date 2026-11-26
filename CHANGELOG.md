# Änderungsprotokoll

## 5.7.0-rc.1 – 26.11.2026 (Release-Kandidat, nicht veröffentlicht)

Phase 5.7 „Sicherheit, Datenschutz, Verschlüsselung und Infrastruktur“. Migration 009 ist rein additiv
(Anmeldemethode je Sitzung). Rollback auf 5.6 nur per `backup/restore.sh --version 5.6.0-rc.1 <snapshot>`.
Bericht: `docs/PHASE5-7-SECURITY-REPORT.md`.

### Sicherheit (Befunde behoben)
- **F-01** Abmelden ohne Verbindung meldet jetzt alle Tabs sofort ab; die Server-Abmeldung wird bei Rückkehr der
  Verbindung nachgeholt (nicht erst beim nächsten Start).
- **F-03** 2FA einschalten beendet alle anderen Sitzungen.
- **F-02** Sitzungsübersicht mit Anmeldemethode; „Alle Sitzungen beenden (auch diese)“.
- **F-05** Profilbilder mit eingebetteten Metadaten (EXIF/XMP, z. B. Standort) werden serverseitig abgelehnt.
- **F-04** Sicherheitsverlauf um Passkey-, Abmelde- und Wiederherstellungsereignisse ergänzt; Aufbewahrung über
  `AUDIT_RETENTION_DAYS` einstellbar.
- **F-06** Rollback über Migrationen: `restore.sh --version` startet direkt mit der Zielversion.
- **F-07** Kontolöschung räumt lokale Kopie und Offline-Freigabe sauber ab; Datenschutz-Texte aktualisiert.
- **F-08** `restore-test.sh` prüft das Repository (`restic check`) und verifiziert wiederhergestellte Inhalte.

### Neu
- Sicherheits-Regressionstests mit mehreren Konten und direkten API-Aufrufen, Klartext-Suche über alle Tabellen und
  Dateien, Rotation unter Last, Browser-Tests der Offline-Sicherheit, isolierte Notfalltests (Beschädigung, falsches
  Passwort, falscher Master-Key, Rollback, Totalverlust).
- Dokumente: Bedrohungsmodell 3.0, Verifikationsmatrix, Verschlüsselungs-Audit, E2EE-Machbarkeitsstudie,
  Offline-Sicherheit, VPS-Härtung, Notfallwiederherstellung; SBOM (CycloneDX) unter `docs/sbom/`.

### Unverändert
- Keine E2EE (Studie ohne Umsetzung), keine automatische Schlüsselrotation, Web-Push deaktiviert,
  Katalog-Aktualisierungstimer deaktiviert.

## 5.6.0-rc.1 – 26.11.2026 (Release-Kandidat, nicht veröffentlicht)

Phase 5.6 „Native Mobile Experience, PWA 3.0 & sichere Offline-Intelligenz“. Keine Server- oder Schemaänderung;
Rollback auf 5.5.0-rc.1 ohne Wiederherstellung möglich. Bericht: `docs/PHASE5-6-MOBILE-REPORT.md`.

### Neu
- **Offline-Nutzung als Opt-in** je Konto und Gerät (Konto → Dieses Gerät; einmalige Frage nach dem ersten Login).
  Ohne Freigabe wird die lokale Arbeitskopie beim Abmelden und beim Kontowechsel gelöscht – nie mit ausstehenden
  Änderungen. „Geteiltes Gerät“ erzwingt „aus“.
- **PWA 3.0:** Update erst nach „Aktualisieren“ (kein Neuladen mitten in einer Eingabe), Offline-Ersatzseite,
  Manifest mit App-Verknüpfungen, Apple-Icon 180 px, einmalige Installationskarte, Anleitungen für iPhone, iPad,
  Android und Desktop (Einstellungen → App).
- **Schnellerfassung** über den Plus-Knopf: Messung/Beobachtung, Foto, Journal, Aufgabe, Sammlungs- und
  Ausrüstungsnotiz, Laborbericht, Pflanze, Grow – mit Rückmeldung „lokal gespeichert“ bzw. „synchronisiert“.
- **Foto-Studio 3.0:** Originalauflösung (Metadaten weiterhin entfernt), Abbrechen, erneut versuchen, Beschreibung je
  Foto, klare Hinweise zu HEIC und RAW.
- **Mobil:** Bottom Sheets mit Wischgeste, Discover-Filter als Sheet, Academy-Inhaltsverzeichnis und „An der letzten
  Stelle weiterlesen“, Scroll-Wiederherstellung, Ziehen zum Synchronisieren (installierte App), Safe Areas,
  16-px-Eingaben gegen iOS-Zoom, „Bewegung reduzieren“.

### Geändert
- **Einheitliche Sync-Zustände:** Synchronisiert, Änderungen ausstehend, Offline, Synchronisierung läuft, Konflikt
  erkannt, Synchronisierung fehlgeschlagen, Zugriff widerrufen.
- **Abmelden ohne Verbindung:** Die Serversitzung wird beim nächsten Kontakt beendet, bevor Daten geladen werden.
- **Performance:** Diagramm-Bibliothek wird nicht mehr bei jedem Start geladen (Übersicht kalt: JS 277 → 172 kB,
  LCP 1,69 → 1,10 s bei 4× CPU-Drosselung).
- **Passkeys:** genauere Fehlermeldungen, keine Biometrie-Versprechen.

### Behoben
- Leere Seite nach dem Abmelden in neueren Chromium-Versionen (`window.scrollTo()` liefert dort ein Promise).
- Dialoge ohne zugänglichen Namen (`aria-labelledby`).

### Bewusst nicht umgesetzt
- Web-Push (externe Push-Dienste, Schlüsselverwaltung und Hintergrunddienst bräuchten Freigabe) – weiterhin
  In-App-Benachrichtigungen ohne Inhalte.

## 5.5.0-rc.1 – 26.11.2026 (Release-Kandidat, nicht veröffentlicht)

Phase 5.5 „Private Zusammenarbeit“. Migration 008 ist rein additiv; private Datensätze, Dateien und ihre Verschlüsselung
sind unverändert. Bericht: `docs/PHASE5-5-COLLABORATION-REPORT.md`.

### Neu
- **Private Profile:** Anzeigename, frei wählbares Handle (nie der Anmeldename), neu erzeugbare Social-ID, Avatar, Bio,
  Akzent, Lieblingssorten und -terpene, Interessen. Sichtbarkeit je Feld, standardmäßig privat. Eigener Profilschlüssel.
- **Freunde:** Anfragen über exaktes Handle oder Social-ID, ohne Verzeichnis und ohne Enumeration. Einladungslinks
  (ablaufend, widerrufbar, einmalig), private Spitznamen, Blockieren.
- **Gemeinsame Bereiche:**
  - Eigener versionierter Schlüssel je Bereich.
  - Rollen Eigentümer, Bearbeiten, Kommentieren und Ansehen.
  - Zugriffsstufen je Eintrag (vererbt an Pflanzen, Einträge, Fotos und Kommentare).
  - Einladungen nur unter Freunden, Eigentumsübertragung mit Annahme, Aktivitätsverlauf, Export, Schlüsselrotation.
- **Teilen:** Kopie (Standard) oder Verschieben (Grows, Journal, Laborberichte), mit Vorschau und Optionen. Mengen und
  Kosten der Sammlung bleiben standardmäßig privat.
- **Kommentare** mit Antworten; **Benachrichtigungen** nur in der App, mit Kategorien, Einstellungen und ohne Inhalte.
- **Datenschutz-Center 2.0:** alle Freigaben, Mitgliedschaften und Einladungen mit sofortigem Widerruf und
  Erklärungen der Folgen.

### Geändert
- **Kontoexport:** enthält zusätzlich `social.json` (eigenes Profil, Freunde, Blockierungen, Mitgliedschaften).
- **Kontolöschung:** nicht möglich, solange man Bereiche mit weiteren Mitgliedern besitzt (erst übertragen oder löschen).
- **Wartung:** `rotate-keys`, `rotate-user-keys`, `purge-retired-keys` und `verify-data` berücksichtigen Bereiche,
  Profile, Spitznamen und Blockierungs-Labels.
- **`restore-test.sh`:** gibt zusätzlich Bereiche, Mitgliedschaften, Einträge, Dateien und Freundschaften aus.

## 5.4.0-rc.1 – 25.11.2026 (Release-Kandidat, nicht veröffentlicht)

Phase 5.4 „Data Intelligence“. Migration 007 (nur öffentliche Katalogtabellen); Nutzerdaten unverändert.
Baut auf PR #10 (5.3.2-rc.1) auf. Bericht: `docs/PHASE5-4-DATA-INTELLIGENCE-REPORT.md`.

### Neu
- **Öffentliche Laborproben** (Smith et al. 2022, PLoS ONE, CC0): 89.923 Blütenproben mit berechneten
  Cannabinoid-Gesamtwerten und 14 Terpenen je Probe (`import-samples`, `deploy/import-samples.sh`).
  - Anzeige nur bei photoperiodischen Sorten mit exakt gleichem Namen inkl. Version.
  - Gekennzeichnet als „Wissenschaftliche Quelle“ und „Nicht eindeutig zugeordnet“, mit Anzahl gleichnamiger Breeder.
  - Verteilung (Median, mittlere 50 %, Nachweisquote, n). Es entsteht kein Sortenprofil.
- **Terpen-Atlas:** Messwerte je Verbindung und Produktnamen mit höchstem Median. Isomer-Summen (Ocimen, Nerolidol)
  sind gekennzeichnet.
- **Discover:** Filter „Mit Laborproben“.
- **Vergleich:** Zeilen „Laborproben (gleichnamig)“ und „Terpene laut Proben“.
- **Eigene Laborberichte** lassen sich auf der Sortenseite im Browser neben die öffentlichen Proben stellen (privat,
  keine Übertragung).
- **Datenqualität:** `catalog-validate` sowie Admin-Bereich mit Prüfregeln nach Schweregrad, Beispielen und
  empfohlener Aktion (nur lesend).
- **Quellenregister:** 12 geprüfte Quellen mit Lizenz, Einstufung und Entscheidung, dazu der letzte Import bzw. Lauf.
- **Audit:** Abdeckung durch Laborproben, mit Kennzeichnung „nur Namensgleichheit“.
- **Academy:** Abschnitt „Gleicher Name, andere Probe“.

### Verbessert
- **CISP-Parser v4:** Doppelt kodierte Elternnamen werden repariert statt abgeschnitten (486 Felder).
  Nach dem Upgrade `./import-catalog.sh` ausführen.

## 5.3.2-rc.1 – 25.11.2026 (Release-Kandidat, nicht veröffentlicht)

Abschluss-Review der Phase 5.3 (Bericht: `docs/PHASE5-3-REVIEW.md`). Keine Migration, keine neuen Abhängigkeiten.

### Korrigiert
- PWA: Die App startet schon nach dem ersten Besuch offline (Vorab-Cache aller gehashten Dateien; bisher leere Seite).
- PWA: Cache-Treffer trotz „Vary: Origin“ des Servers (nur öffentliche, gehashte Dateien).
- „Offline weiter“: Nach Rückkehr des Servers wird automatisch synchronisiert. Bei weiterhin unerreichbarem
  Server bleibt der Offline-Modus bestehen.
- Sammlung mobil: Einträge lesbar, Mengen- und Aktionsknöpfe unter dem Inhalt.
- Lab Insights mobil: Y-Achse des Cannabinoid-Diagramms nicht mehr abgeschnitten.

### Aufgeräumt
- Doppelte Wiederholungslogik im Kalender zusammengeführt; neun ungenutzte Exporte entfernt.

## 5.3.1-rc.1 – 25.11.2026 (Release-Kandidat, nicht veröffentlicht)

Phase 5.3 „Grow Studio“: Verbindungen zwischen bestehenden Bereichen, Grow-Workspace und mobile Bedienung.
Keine Datenbank-Migration, keine neuen Abhängigkeiten, keine Server-Änderungen.

### Neu
- **Grow-Übersicht:** Karten „Anstehend“ (offene Erinnerungen je Serie), „Sorten & Genetik“ (Breeder, Katalog- und
  Abstammungslink nur bei echter Katalogverknüpfung) und „Bereich & Ausrüstung“ (über die Bereichs-Zuordnung der
  Pflanzen; Strom nur als Schätzung aus vollständigen eigenen Angaben).
- **Suche:** Treffer aus Journal, Sammlung und Laborberichten öffnen den konkreten Eintrag und heben ihn hervor.
- **Kalender:** Listenansicht (Agenda über 30 Tage, Erinnerungen abhakbar) und Pflanzenfilter innerhalb eines Grows.
- **Grow-Vergleich:** CSV-Export für Kennzahlen und gemessenen Verlauf.
- **Genetik:** Abstammungsgraph im Vollbild (Escape beendet).
- **Journal:** Entwurf eines neuen Eintrags bleibt im Tab erhalten (nur sessionStorage, je Konto getrennt).

### Verbessert
- Foto-Raster nach Monat gruppiert, Aufnahmedatum je Kachel.
- Mobil: kompakte Aktionsleiste im Grow (weitere Aktionen im Menü), Phasen zweispaltig,
  Discover-Filter einklappbar mit Anzahl aktiver Filter.
- Touch-Ziele: Terpen-Chips und Brotkrumen der Sortenseite mindestens 24 px.

### Korrigiert
- Befehlspalette: direkt nach Strg+K getippte Zeichen gingen verloren.
- Kalender: Wiederholungstext liest beschädigte Regeln sicher.

## 5.3.0-rc.1 – 25.11.2026 (Release-Kandidat, nicht veröffentlicht)

Phase 5.3: Premium Experience, Feature-Integration und Produktionsqualität. Keine Datenbank-Migration; neue Felder sind
optionale Teile bestehender, verschlüsselter Datensätze. Baut auf den Korrekturen aus PR #7 auf.

### Neu
- **Insights als persönlicher Daten-Explorer:** Zeitraum- und Grow-Filter für alle Karten, CSV-Exporte (Messwerte,
  Ausgaben, Journal, Laborberichte; Excel-tauglich), Vergleichstabelle eigener Laborberichte ohne aufgefüllte Lücken.
- **Monitoring:** Systemansicht zeigt Sortenkatalog (Version, Stand), StrainAPI-Zwischenspeicher (gültig, bald/abgelaufen),
  letzten Anreicherungslauf und die gesamte Dateibelegung.
- **Sortenseite:** „Gleiche Elternangaben“ und „Weitere Sorten von …“ – nur aus dokumentierten Daten, keine abgeleitete Verwandtschaft.
- **Academy:** Prüfstatus je Artikel (Volltext, teilweise, bibliografisch) mit Hinweis auf ausstehende externe Fachprüfung.
- **Terpen-Atlas:** chemische Systematik (Mono-/Sesquiterpene und Terpenoide nach funktioneller Gruppe).
- **Sammlung:** Mengenverlauf je Eintrag und Filter nach Tags.
- **Pflanzenprofil:** Phänotyp-Notizen aus Experimenten direkt sichtbar; lange Verläufe werden schrittweise geladen.

### Verbessert
- Dashboard-Erinnerungen je Serie mit Rhythmus statt mehrfacher Einträge derselben Erinnerung.
- Journal mobil: Suche immer sichtbar, weitere Filter einklappbar, Monatsgruppen.
- Seitenleiste auf niedrigen Bildschirmen nicht mehr abgeschnitten.
- Mobil: kein horizontaler Überlauf bei 360 px; Touch-Ziele in Atlas und Academy mindestens 24 px.
- **CISP-Parser v3:** Aroma- und Werbetext wird nicht mehr als Elternsorte übernommen (auffällige Angaben 388 → 4).
  Nach dem Upgrade `./import-catalog.sh` ausführen.

### Korrigiert
- Eine einzelne Ansicht mit fehlerhaftem Datensatz legt nicht mehr die ganze App lahm (Fehlergrenze je Seite).
- Unbekannte oder beschädigte Wiederholungsregeln im Kalender führten zu einem leeren Bildschirm.
- Fotos erschienen nach der Anmeldung auf einem neuen Gerät erst nach einem Neuladen.
- Academy: Aussagen älterer Artikel (Genetik, Cannabinoide, Begriffe) gegen die Quellen geprüft und korrigiert; PubChem-Beleg für THC/THCA-Umrechnung.

## 5.2.0-rc.1 – 24.11.2026 (Release-Kandidat, nicht veröffentlicht)

Cannabis 101 & Terpen-Atlas, Expansion 2.1. Migration 006 (nur Katalog-Metadaten); Nutzerdaten unverändert.

### Neu
- **Katalog-Anreicherung mit Herkunft je Feld:** Vollständigkeits-Audit (`catalog-audit`), Anreicherung aus StrainAPI gemäß Nutzungsbedingungen (`enrich-catalog`, Probelauf, Fortsetzung), konservativer Abgleich (Name + Breeder), Admin-Ansicht mit Feldabdeckung, Läufen und Prüfliste. Find My Seeds bleibt deaktiviert (automatisierte Abrufe abgewiesen).
- **Belegarten auf der Sortenseite:** Laborbestätigt (eigene Berichte, je Probe), Breeder-, Seedbank-, Datenbank-Angabe, Widersprüchlich, Keine Daten; „Kein belegtes Terpenprofil verfügbar.“
- **CISP-Parser v2:** Typ-Bezeichnung und Abstammungstext der Quelle.
- **Terpen-Atlas 3.0:** 27 Verbindungen mit PubChem-Identität, 2D-Strukturformel, belegtem Geruch, Cannabis-Beleg aus geprüfter Literatur, Sammelnamen ohne Isomer-Zuordnung, Katalogsorten je Terpen, Vergleich, Filter.
- **Academy:** 17 Kategorien, 18 neue Leitfäden (30 Artikel), Lernpfade, Glossar (auch in Strg+K), interaktive Diagramme (VPD, DLI, Lebenszyklus, Narbenstufen), Kontexthilfe in Growlogs, Laborberichten und Grow-Vergleich.

### Nach PR-Prüfung ergänzt
- Gedrosselte Aktualisierung abgelaufener StrainAPI-Angaben (`enrich-catalog --refresh`, `deploy/refresh-catalog.sh`, optionaler systemd-Timer, nicht automatisch aktiv).

### Korrigiert
- Belegart Breeder/Seedbank je Feld statt je Sorte.
- Quellenangabe Smith et al. (2022): PLoS One statt Nature Plants (falsche DOI aus Phase 5).
- Kontexthilfe auf schmalen Bildschirmen abgeschnitten.
- Beim erneuten Abruf entfallen Felder, die die Quelle nicht mehr liefert.
- „Pinen“ ohne Isomerangabe wurde als α-Pinen gedeutet; jetzt Sammelname.
- Lesefortschritt erreicht am Seitenende 100 %.
- StrainAPI-Fotos werden nicht übernommen (Rechte und Zuordnung nicht belegt).

## 5.1.0-rc.1 – 24.11.2026 (Release-Kandidat, nicht veröffentlicht)

Abschluss offener Punkte aus Phase 5. Keine Datenbank-Migration; neue Felder sind optionale Teile bestehender, verschlüsselter Datensätze.

### Neu
- **Genetics Explorer mit dem lokalen Katalog:** Abstammungsgraph aus dokumentierten Elternangaben (bis 4 Generationen), mehrdeutige Namen bleiben getrennt (Kandidaten einzeln als Zentrum öffnen), unbekannte Eltern und abweichende Angaben anderer Seedbanks gekennzeichnet, Textalternative.
- **Grow-Vergleich** für bis zu vier Projekte: Kennzahlen, Verlauf in Grow-Tagen, Messkontext- und Zeitraumfilter, Warnung bei vermischten Messkontexten, Fotos.
- **Projektbericht** mit wählbaren Abschnitten, Diagrammen und Foto-Auswahl; druckoptimiert, PDF über den Druckdialog.
- **Experimente & Phänotyp-Journal** je Grow: Ziel, Pflanzen, Zeitraum, Messgrößen, Beobachtungen, Ergebnis; Phänotyp-Notizen mit Nebeneinander-Vergleich.
- **Dokumentationsstand** je Grow und **Datenlage** je Katalogsorte (vorhanden / fehlt / widersprüchlich) – ohne Punktwerte.

### Oberfläche
- Übersicht neu: Begrüßung mit Kurzstatus, kompakte Schnellaktionen, Statuskarten aktiver Grows (Phasen, letzte Messwerte, Höhenverlauf, nächste Aufgabe, Dokumentationsstand), Widget „Favoriten“.
- Katalogkarten ohne Foto im kompakten Format; Standard-Sortierung nach Seedbank-Angeboten bzw. Sortenzahl.
- Barrierefreiheit: axe (WCAG 2.1 A/AA) auf 17 Kernseiten ohne Verstöße; Kalender-Semantik und Kontoübersicht korrigiert.
- Korrigierte Texte: Hinweise „nur auf diesem Gerät“ waren im Servermodus falsch (Fotos, Journal, Einstellungen und THC-Lab-Eingaben werden synchronisiert).

### Betrieb
- Restore-Test zählt den Sortenkatalog; Backup/Restore inkl. Katalog und ein abgebrochener Import in Docker geprüft (siehe BACKUP.md).
- Fix: Insights zählte Kontext-/Gerätefelder als Messgrößen.

## 5.0.0-rc.1 – 24.11.2026 (Release-Kandidat, nicht veröffentlicht)

### Sortenkatalog & Breeder
- **Lokaler Katalog aus CI-Strains-Pro** (CC BY 4.0) in PostgreSQL: 21.210 Seedbank-Angebote → 16.710 Breeder-spezifische Sorten, 494 Breeder. Import mit Prüfsumme, Probelauf, Qualitätsbericht, einer Transaktion und stabilen IDs (`import-catalog`, `deploy/import-catalog.sh`, Migration 005).
- Strenge Bereinigung: kaputte Zeichenkodierung, unplausible Werte (z. B. THC 0,03 % oder 8.211 %), Shop-Fließtext als „Abstammung“ werden verworfen statt korrigiert; gleichnamige Sorten verschiedener Breeder werden nie zusammengeführt. Details: `docs/CATALOG.md`.
- Discover startet mit dem Katalog: serverseitige Suche (Trigramm + Volltext) mit Trefferarten und echten Gesamtzahlen, Filter (Typ, Auto, Samentyp, Terpen-Nennung, Abstammung, THC-Angabe, Elternsorte), Sortierung. StrainAPI bleibt unter „Live & Bilder“.
- Sortenseite mit Angeboten je Seedbank und Quell-URL, Widersprüchen, verworfenen Werten, Abstammung inkl. Mehrdeutigkeit, Nachkommen und gleichnamigen Linien anderer Breeder.
- **Breeder-Verzeichnis** (A–Z, Suche, Kooperationen, „auch Seedbank“) und Breeder-Profile; Breeder merken, zuletzt angesehene Sorten.
- Katalogsorten lassen sich merken, vergleichen und mit Pflanze, Grow und Journal verknüpfen.

### Growlogs
- **Messwerte Pro:** pH und EC mit Messkontext (Gießwasser, Nährlösung, Drainage, Substrat), EC/TDS in mS/cm, µS/cm oder ppm (Skala 500/700, kanonisch gespeichert), Blatt-/Wasser-/Substrattemperatur, Substratfeuchte, CO₂, PPFD, Lichtstunden, Messgerät.
- VPD (Tetens) und DLI werden berechnet angezeigt – mit offengelegter Formel und Annahmen, nie gespeichert.
- Diagramme mit Zeitraum, Kontextfilter, **eigenen Zielbereichen** (ohne Vorgaben), Abweichungen als Raute und Text, CSV-Export.
- **Grow-Bereiche** (Zelt, Raum, Gewächshaus, Outdoor, Zone), Ausrüstung mit Hersteller, Modell, Leistung, Laufzeit, Garantie und Standort, Wartungsprotokoll, Stromschätzung je Bereich aus eigenen Angaben.
- Pflanzen mit Standort und Tags; **Schnell-Log** für Beobachtung, Messung und Pflege (mobil, Entwurf bleibt erhalten, offline speicherbar).
- **Pflanzen-Etiketten** mit QR-Link zur Pflanzenseite (druckbar; ohne Anmeldung wirkungslos).

### Oberfläche
- Befehlspalette durchsucht zusätzlich Katalog, Breeder (nur eigene Instanz) und Cannabis-101-Artikel; Aktion Schnell-Log.
- Dashboard-Widget „Letzte Messwerte“.
- Design-System: semantische Farb-Tokens; gedämpfte Textfarben auf WCAG-Kontrast ≥ 4,5:1 angehoben (vorher 2,0 bzw. 3,6:1).

### Qualität
- Server: 134 Tests (u. a. Parser, Import, Katalog-API, Rechte der Laufzeitrolle). Frontend: 218 Tests (u. a. EC-Umrechnung, VPD/DLI, Kontextfilter, Formular).
- Neue Abhängigkeit im Frontend: `qrcode` 1.5.4 (bereits im Server im Einsatz).

## 4.0.0-rc.1 – 24.11.2026 (Release-Kandidat, nicht veröffentlicht)

### Sicherheit
- **Passkeys (WebAuthn)** mit @simplewebauthn: Registrierung nach Re-Auth, Anmeldung ohne Kennung, mehrere Passkeys, umbenennen, entfernen; Recovery entfernt alle Passkeys.
- **Rotation des Datenschlüssels je Konto**: versionierte Generationen, fortsetzbar, geprüft, Purge nur nach Frist.
- Behoben: 2FA-Codes ließen sich mit immer neuen Anmeldevorgängen durchprobieren (jetzt kontoweite Grenze).
- Behoben: Fehlversuche eines Angreifers konnten ein Konto überall aussperren (Backoff jetzt je Kennung + IP, kontoweit erst ab 50).
- Behoben: THC-Lab-Eingaben waren für andere Konten auf demselben Gerät sichtbar (jetzt je Konto).
- Foto-Cache im Speicher wird beim Abmelden/Kontowechsel geleert; Modus „Geteiltes Gerät“.
- Proxy reicht Fehlerseiten der Sortendaten-Quellen nicht mehr durch.
- Schema-Schutz: API startet nicht mit einer neueren Datenbank (Rollback ohne Restore).

### Synchronisation
- Drei-Wege-Merge: Änderungen an verschiedenen Feldern werden automatisch zusammengeführt; echte Feldkonflikte nennen die Felder.
- THC-Lab-Entwürfe werden geräteübergreifend synchronisiert (je Rechner zusammengeführt).
- Erneute Versuche mit wachsendem Abstand bei instabiler Verbindung; klarere Statusanzeige.

### Discover
- Relevanz-Sortierung für Suchen (Live-Befund: „gelato“ liefert 225 Treffer, nur 8 mit dem Begriff im Namen).

### Betrieb
- `preflight.sh`, `upgrade.sh` (Backup-Pflicht, Health-Prüfung, `--no-build`), `rollback.sh` (Schemaprüfung), Backup-Benachrichtigung, Datei-Papierkorb für Backup-Konsistenz, System Health ohne personenbezogene Daten, Runbook und Produktions-Checkliste.
- Gemessener Ressourcenbedarf dokumentiert; Argon2id-Standard 64 MiB/t=3.

### Oberfläche
- Neue Seite „Verlauf“ (persönliche Zeitachse), „Insights“ mit Kennzahlen, Sicherheitsstatus im Konto, überarbeiteter Foto-Upload (Status je Datei, Wiederholen, Kamera), mobile Prüfung aller Routen in 6 Breiten.

### Qualität
- GitHub Actions CI (least privilege, gepinnt), ESLint, gitleaks; behoben: ICS-Export maskierte Semikolons nicht.

### Migrationen
- 002 Passkeys, 003 Schlüsselgenerationen + Datei-Papierkorb, 004 Leserecht auf den Schemastand. Upgrade von 3.0.0 getestet; Rollback auf 3.0.0 nur per Restore (siehe DEPLOYMENT.md).
