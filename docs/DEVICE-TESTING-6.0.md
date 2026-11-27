# TERPGRID 6.0 – Geräteabnahme (für den Betreiber)

**Status: ausstehend.** Kein Punkt wurde auf einem physischen Gerät geprüft.
- Die automatisierten Tests in Chromium, Firefox und WebKit (`RELEASE-6.0-ACCEPTANCE.md`) ersetzen diese Abnahme nicht.
- Playwrights WebKit ist nicht Safari auf dem iPhone.

**Dauer:** etwa 60–90 Minuten für alle fünf Umgebungen.

**Ergebnis eintragen:** ✓ bestanden · ✗ Fehler (mit kurzer Beschreibung und Screenshot) · – nicht anwendbar.

## Vorbereitung (einmalig)

1. Testinstanz mit echter Domain und gültigem Zertifikat. Passkeys, Service Worker und Installation brauchen HTTPS. Am besten die Produktionsinstanz **nach** dem Upgrade auf 6.0.0, mit zwei eigens angelegten Testkonten. **Keine echten privaten Daten** verwenden.
2. Zwei Einladungen erzeugen: `docker compose exec api node dist/cli.js invite 1 "Gerätetest"` (zweimal).
3. Konto **A** und Konto **B** anlegen.
4. In A:
   - einen Grow „Gerätetest“ mit einer Pflanze anlegen;
   - in „Gemeinsam“ einen Bereich anlegen und B mit der Rolle „Bearbeiten“ einladen (vorher Freundschaft über das Handle).
5. Ein iPhone-Foto im HEIC-Format bereithalten. Standard bei iOS-Kamera ist „Hohe Effizienz“.

## Reihenfolge der Umgebungen (Priorität)

| Kürzel | Umgebung |
| --- | --- |
| **IS** | iPhone, Safari |
| **IP** | iPhone, installierte App |
| **AC** | Android, Chrome |
| **AP** | Android, installierte App |
| **FD** | Firefox Desktop |

## Prüfschritte

| # | Schritt | Erwartet | IS | IP | AC | AP | FD |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Installation** – IS: Seite öffnen, Karte „TERPGRID als App installieren“ → „So geht’s“ → Teilen → „Zum Home-Bildschirm“. AC: Menü → „App installieren“ | Symbol „TERPGRID“ auf dem Home-Bildschirm; Start ohne Browserleiste (IP/AP) | | – | | – | – |
| 2 | **Anmeldung** mit A (Passwort) | Übersicht erscheint; Tastatur verdeckt keine Felder; kein Zoom beim Antippen der Felder | | | | | |
| 3 | **Falsches Passwort** | Neutrale Meldung, kein Hinweis, ob das Konto existiert | | | | | |
| 4 | **2FA einrichten** (Konto → Sicherheit → Einrichten, Code aus einer Authenticator-App), abmelden, mit Code anmelden | Anmeldung verlangt den Code; falscher Code wird abgelehnt | | | | | |
| 5 | **Passkey anlegen** (Konto → Passkeys → hinzufügen; Face ID bzw. Fingerabdruck) | Passkey erscheint in der Liste | | | | | |
| 6 | Abmelden → **„Mit Passkey anmelden“** | Anmeldung ohne Kennung und Passwort | | | | | |
| 7 | **Kamera:** Plus-Knopf → Foto → „Kamera“, Foto aufnehmen, Grow „Gerätetest“ wählen | Foto erscheint im Grow und unter „Fotos“ | | | | | – |
| 8 | **HEIC aus der Mediathek** hochladen | Wird angenommen und angezeigt. Falls der Browser HEIC nicht dekodiert: verständliche Meldung, kein Absturz | | | – | – | – |
| 9 | **Mehrere Fotos** (5) aus der Mediathek | Fortschritt je Datei; alle fünf in der Galerie | | | | | |
| 10 | **Standortdaten:** ein hochgeladenes Foto über „Daten & Backup → Fotos exportieren“ speichern und mit einer EXIF-App ansehen | Keine GPS- bzw. EXIF-Daten | | | | | |
| 11 | **Safe Areas** hoch und quer | Nichts unter Notch/Dynamic Island/Home-Leiste; untere Navigation und Plus-Knopf tippbar | | | | | – |
| 12 | **Offline vorbereiten:** Konto → Dieses Gerät → „Offline-Nutzung“ einschalten | Hinweis zur unverschlüsselten lokalen Kopie erscheint | | | | | |
| 13 | **Offline-Start:** Flugmodus an, App bzw. Tab schließen und neu öffnen | „Offline weiter als …“; Grow „Gerätetest“ sichtbar. **Wichtig, da in der WebKit-Automation nicht prüfbar** | | | | | |
| 14 | **Offline bearbeiten:** im Flugmodus Messung (pH 6,2) und Journal-Eintrag anlegen | Sync-Status „ausstehend“ | | | | | |
| 15 | **Synchronisation:** Flugmodus aus | Status wird „Synchronisiert“; Messung und Eintrag erscheinen auf einem zweiten Gerät mit A | | | | | |
| 16 | **Kontowechsel:** abmelden, mit B anmelden | Keine Inhalte von A sichtbar (Übersicht, Suche, Fotos, Benachrichtigungen); der gemeinsame Bereich ist sichtbar | | | | | |
| 17 | **Zusammenarbeit:** B bearbeitet einen Eintrag im Bereich. A entzieht B danach die Mitgliedschaft | B sieht „Zugriff widerrufen“; Inhalte des Bereichs verschwinden | | | | | |
| 18 | **Abmelden** (ohne Offline-Freigabe) | Anmeldeseite. Safari: Einstellungen → Safari → Erweitert → Website-Daten → keine TERPGRID-Datenbank mehr für das Konto | | | | | |
| 19 | **Abmelden mit ausstehenden Änderungen** (offline etwas ändern, dann abmelden) | Rückfrage statt stillem Verwerfen | | | | | |
| 20 | **App-Update:** nach einem Server-Update die App öffnen | Hinweis „Neue Version verfügbar“ → „Aktualisieren“ lädt die neue Version (Administration → System zeigt sie) | | | | | |
| 21 | **Screenreader** (VoiceOver bzw. TalkBack; FD: NVDA oder Orca): Navigation, Plus-Menü, ein Dialog, ein Formularfehler | Elemente werden sinnvoll vorgelesen; Dialoge halten den Fokus, Zurück bzw. Escape schließt | | | | | |

## Freigabe

- **Pflicht für 6.0:** Alle anwendbaren Zeilen in IS, IP, AC und FD sind ✓. AP ist empfohlen.
- Ein Fehler (✗) in einer Pflichtumgebung blockiert 6.0 bis zur Behebung, oder bis zu einer **ausdrücklichen** schriftlichen Freigabe mit Begründung als bekannte Grenze.
- Ergebnis bitte als Tabelle (diese Datei ausgefüllt) oder als Liste der ✗-Punkte zurückgeben.
