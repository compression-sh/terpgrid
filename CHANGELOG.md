# Änderungsprotokoll

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
