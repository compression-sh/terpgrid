# Phase 5.9 – Geräteabnahme (Prüfliste für die manuelle Verifikation)

Stand: 5.9.0-rc.1.

> **Status: ausstehend.** In dieser Umgebung gibt es keine physischen Geräte. Kein Punkt dieser Liste wurde auf einem echten Gerät geprüft.
> Die automatisierten Prüfungen in Chromium, Firefox und WebKit (`PHASE5-9-BROWSER-COMPATIBILITY.md`) ersetzen diese Abnahme **nicht**:
> - Playwrights WebKit unter Linux ist nicht Safari auf iOS.
> - Es fehlen Standalone-Modus, iCloud-Schlüsselbund, Kamera, HEIC-Dekodierung durch das System, echte Safe Areas und VoiceOver/TalkBack.

## Geräte und Zielumgebungen

| Kürzel | Umgebung | Mindestens |
| --- | --- | --- |
| **IS** | iPhone, Safari (Browser) | aktuelles iOS und Vorgängerversion |
| **IP** | iPhone, installierte Web-App („Zum Home-Bildschirm“) | wie IS |
| **PD** | iPad, Safari, quer und hoch, mit und ohne Tastatur | aktuelles iPadOS |
| **AC** | Android, Chrome (Browser) | aktuelles Android, ein Gerät mit Notch/Punch-Hole |
| **AP** | Android, installierte Web-App (Chrome „App installieren“) | wie AC |
| **FD** | Firefox Desktop (Windows oder macOS oder Linux) | aktuelle Version und ESR |

## Vorbereitung

1. Testinstanz mit eigener Domain und gültigem TLS-Zertifikat. Passkeys, Service Worker und Installation funktionieren nur über HTTPS.
2. Zwei Testkonten **A** und **B** mit synthetischen Daten:
   - mindestens ein Grow mit Pflanzen, Messwerten und 5 Fotos;
   - ein gemeinsamer Bereich, Eigentümer A, B mit Rolle „Bearbeiten“.
3. Keine echten privaten Daten verwenden.
4. Ergebnis je Zeile eintragen:
   - ✓ = bestanden;
   - ✗ = Fehler, mit Beschreibung und Screenshot;
   - – = nicht anwendbar.

## Prüfliste

| # | Prüfung | Erwartung | IS | IP | PD | AC | AP | FD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Installation** | IS: Karte „TERPGRID als App installieren“ mit Anleitung (Teilen → Zum Home-Bildschirm). AC: Installations-Angebot. Danach Start ohne Browserleiste, Symbol und Name korrekt | | | | | | – |
| 2 | **Anmeldung mit Passwort** | Anmeldung klappt; falsches Passwort → neutrale Meldung; Tastatur verdeckt die Felder nicht | | | | | | |
| 3 | **2FA (TOTP)** | Einrichtung per QR-Code mit einer Authenticator-App auf einem zweiten Gerät; Anmeldung mit Code; falscher Code wird abgelehnt | | | | | | |
| 4 | **Passkey registrieren** | Konto → Passkeys → hinzufügen; iOS: Face ID/Touch ID und iCloud-Schlüsselbund; Android: Google-Passwortmanager | | | | | | |
| 5 | **Passkey-Anmeldung** | „Mit Passkey anmelden“ ohne Passwort; nach dem Entfernen des Passkeys keine Anmeldung damit | | | | | | |
| 6 | **Kamera-Aufnahme** | Plus → Foto → „Kamera“ öffnet die Kamera direkt; Bild erscheint nach dem Hochladen in der Galerie | | | | | | – |
| 7 | **HEIC-Upload** | iPhone-Foto im HEIC-Format aus der Mediathek: wird angenommen und als JPEG/WebP gespeichert. Ohne Unterstützung im Browser: verständliche Meldung, kein Absturz | | | | | | |
| 8 | **Mediathek, Mehrfachauswahl** | 5 Fotos auf einmal; Fortschritt je Datei; keine Standortdaten im gespeicherten Bild (Gegenprobe: Bild exportieren und mit einem EXIF-Werkzeug prüfen) | | | | | | |
| 9 | **Tastaturverhalten** | Eingabefelder ≥ 16 px (kein Auto-Zoom auf iOS); Bottom Sheets und Dialoge bleiben bei geöffneter Tastatur bedienbar; „Weiter/Fertig“ springt sinnvoll | | | | | | |
| 10 | **Safe Areas** | Hoch- und Querformat: keine Inhalte unter Notch/Dynamic Island/Home-Indikator; untere Navigation und Plus-Knopf vollständig tippbar | | | | | | – |
| 11 | **Offline-Start** | Konto → Dieses Gerät → Offline-Nutzung ein; Flugmodus; App neu starten → „Offline weiter als …“, lokale Daten sichtbar. **In WebKit-Automation nicht prüfbar (siehe Browserbericht) – hier besonders wichtig** | | | | | | |
| 12 | **Offline bearbeiten** | Im Flugmodus Messung und Journal-Eintrag erfassen → „ausstehend“ sichtbar; nach Rückkehr des Netzes automatisch synchronisiert; auf zweitem Gerät sichtbar | | | | | | |
| 13 | **Synchronisation über Geräte** | Änderung auf Gerät 1 erscheint auf Gerät 2 nach Fokuswechsel oder spätestens beim nächsten Abgleich; gleichzeitige Änderung desselben Felds → Konfliktanzeige mit Feldvergleich | | | | | | |
| 14 | **Kontowechsel** | A abmelden, B anmelden: keine Inhalte von A sichtbar (Übersicht, Suche, Fotos, Benachrichtigungen) | | | | | | |
| 15 | **Abmelden** | Ohne Offline-Freigabe: Safari → Einstellungen → Erweitert → Website-Daten: keine Konto-Datenbank mehr (IndexedDB). Mit ausstehenden Änderungen: Rückfrage statt stillem Verwerfen | | | | | | |
| 16 | **Offline-Abmelden** | Im Flugmodus abmelden → Anmeldeseite; nach Rückkehr des Netzes ist die Serversitzung beendet (Konto → Sitzungen auf anderem Gerät prüfen) | | | | | | |
| 17 | **App-Update** | Nach einem Server-Update: Hinweis „Neue Version verfügbar“ statt automatischem Neuladen; „Aktualisieren“ lädt die neue Version; installierte App (IP/AP) aktualisiert sich ebenso | | | | | | |
| 18 | **Zusammenarbeit** | B bearbeitet einen Eintrag im Bereich von A; A entfernt B → B sieht „Zugriff widerrufen“, zwischengespeicherte Inhalte verschwinden | | | | | | |
| 19 | **Screenreader** | VoiceOver (iOS/iPadOS), TalkBack (Android), NVDA oder Orca (FD): Navigation, Plus-Menü, Dialoge (Fokus gefangen, Escape bzw. Zurück schließt), Formularfehler werden vorgelesen, Diagramme haben Textalternative/Tabelle | | | | | | |
| 20 | **Bewegung reduzieren** | Systemeinstellung „Bewegung reduzieren“: keine größeren Animationen | | | | | | |
| 21 | **Druck/PDF** | Grow → Bericht → Drucken/Als PDF: lesbar, keine abgeschnittenen Tabellen | | | | | | |
| 22 | **Querformat/Tablet** | PD quer mit Tastatur: Seitenleiste, Tastenkürzel (Strg/⌘+K Suche) | – | – | | – | – | |

## Bekannte plattformbedingte Grenzen (vorab dokumentiert)

- **iOS-Speicher:** Safari kann Website-Daten nach längerer Nichtnutzung löschen; installierte Web-Apps sind weniger betroffen. Eine Offline-Kopie ist daher kein Backup.
- **Web-Push** ist absichtlich deaktiviert. Es gibt keine Benachrichtigungen bei geschlossener App.
- **Offline-Widerruf:** Wird einem Gerät der Zugriff entzogen, während es offline ist, bleibt die lokale Kopie bis zur nächsten Verbindung lesbar. Siehe `PHASE5-7-OFFLINE-SECURITY.md`.

## Abschluss

- Die Abnahme gilt als bestanden, wenn alle anwendbaren Zeilen in IS, IP, AC und FD ✓ sind.
- PD und AP sind empfohlen.
- Fehler werden als Issues erfasst und vor 6.0 behoben oder mit Begründung als bekannte Grenze dokumentiert (`RELEASE-6.0-CHECKLIST.md`, Gate G3).
