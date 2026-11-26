# TERPGRID als App – Installation, Updates und Offline-Nutzung

Stand: 5.6.0-rc.1. TERPGRID ist eine Progressive Web App (PWA). Es gibt keine separate App aus einem App-Store: Die installierte App ist dieselbe Weboberfläche, nur mit eigenem Symbol und ohne Browserleisten.

> Voraussetzung: TERPGRID läuft über HTTPS mit gültigem Zertifikat (bei der Installation per `deploy/install.sh` und Caddy automatisch). Über reines HTTP ist keine Installation möglich, außer auf `localhost`.

## Installation

### iPhone (Safari)
1. TERPGRID in **Safari** öffnen.
2. Unten auf **Teilen** tippen (Quadrat mit Pfeil nach oben).
3. **Zum Home-Bildschirm** wählen.
4. Mit **Hinzufügen** bestätigen.

### iPad (Safari)
1. TERPGRID in **Safari** öffnen.
2. Oben rechts auf **Teilen** tippen.
3. **Zum Home-Bildschirm** wählen und mit **Hinzufügen** bestätigen.

### Android (Chrome)
1. TERPGRID in **Chrome** öffnen.
2. Erscheint in TERPGRID die Karte „TERPGRID als App installieren“, auf **Installieren** tippen. Alternativ oben rechts das Menü (⋮) öffnen und **App installieren** bzw. **Zum Startbildschirm hinzufügen** wählen.
3. Mit **Installieren** bestätigen.

### Computer
- **Chrome oder Edge:** Installationssymbol in der Adressleiste anklicken (Bildschirm mit Pfeil) und **Installieren** wählen. Alternativ in TERPGRID unter **Einstellungen → App → Installieren**.
- **Safari auf dem Mac (ab Version 17):** Menü **Ablage → Zum Dock hinzufügen**.
- **Firefox:** Der Desktop-Firefox bietet keine PWA-Installation. TERPGRID funktioniert dort normal im Browser.

Die Installationskarte erscheint auf der Übersicht nur einmal. Nach **Nicht jetzt** kommt sie nicht wieder. Die Anleitungen stehen jederzeit unter **Einstellungen → App**.

### App-Verknüpfungen
Ein langes Drücken auf das App-Symbol (Android, Desktop-Chromium) bietet die Kurzbefehle **Schnellerfassung**, **Foto aufnehmen**, **Growlogs** und **Discover**. iOS unterstützt diese Verknüpfungen für Web-Apps nicht.

## Updates

- Ist eine neue Version auf dem Server installiert, erscheint in der App **„Neue Version verfügbar“**. Die App wird **nicht** automatisch neu geladen.
- **Aktualisieren** lädt die neue Version. Lokal gespeicherte Einträge bleiben erhalten; ungespeicherte Formulareingaben vorher speichern.
- **Später** blendet den Hinweis für diese Sitzung aus.
- Manuelle Prüfung: **Einstellungen → App → Nach Updates suchen**. Dort steht auch die laufende Version.

Für Betreibende: Ein Upgrade per `deploy/upgrade.sh` liefert automatisch eine neue `sw.js` aus (Version im Dateiinhalt, `Cache-Control: no-cache`). Ein Rollback per `deploy/rollback.sh` liefert die alte Hülle wieder aus. Ältere Service Worker (vor 5.6) aktivieren sich selbst sofort.

## Offline-Nutzung

Standardmäßig bleiben private Daten **nicht** über die Sitzung hinaus auf dem Gerät. Offline-Nutzung lässt sich je Konto und Gerät einschalten:

1. Nach dem ersten Login fragt die Übersicht einmalig: **„Auf diesem Gerät auch offline arbeiten?“**
2. Jederzeit änderbar unter **Konto → Dieses Gerät → Offline-Nutzung auf diesem Gerät**.

Mit Offline-Nutzung:
- bleibt nach dem Abmelden eine Kopie deiner privaten Daten in diesem Browser (unverschlüsselt, geschützt nur durch das Gerät);
- startet TERPGRID ohne Verbindung („Offline weiter als …“), solange du dich nicht abgemeldet hast;
- werden Änderungen gesammelt und übertragen, sobald der Server erreichbar ist.

Ohne Offline-Nutzung wird die Kopie beim Abmelden und beim Kontowechsel gelöscht, aber **nie**, solange Änderungen noch nicht übertragen sind.

**Geteiltes Gerät** (Konto → Dieses Gerät) schaltet Offline-Nutzung für alle Konten ab und löscht beim Abmelden immer.

Nicht offline verfügbar: **gemeinsame Bereiche** (Rechte können sich ändern) und der **Sortenkatalog** (wird nie vollständig heruntergeladen). Academy, Glossar und Terpen-Atlas funktionieren offline.

Speicherbelegung, Aufschlüsselung je Bereich, **Jetzt synchronisieren** und **Lokale Kopie löschen** stehen unter **Konto → Dieses Gerät**.

## Synchronisationsstatus

| Anzeige | Bedeutung |
| --- | --- |
| Synchronisiert | Der Server hat alle Änderungen bestätigt. |
| Änderungen ausstehend (n) | Änderungen liegen auf diesem Gerät und werden gleich übertragen. |
| Synchronisierung läuft | Übertragung läuft. |
| Offline | Keine Verbindung zum Server; Änderungen werden gesammelt. |
| Konflikt erkannt | Dieselben Felder wurden anderswo geändert; unter Konto → Synchronisation entscheiden. |
| Synchronisierung fehlgeschlagen | Server hat abgelehnt oder ist fehlerhaft; Details unter Konto → Synchronisation. |
| Zugriff widerrufen | (gemeinsame Bereiche) Du bist kein Mitglied mehr; zwischengespeicherte Inhalte wurden entfernt. |

In der installierten App startet **Ziehen am Seitenanfang** eine Synchronisation. Im Browser übernimmt der Browser diese Geste selbst.

## Mobile Bedienung

- **Plus-Knopf** unten rechts: Schnellerfassung für Messung/Beobachtung, Foto, Journal, Aufgabe, Sammlungs- und Ausrüstungsnotiz, Laborbericht, Pflanze und Grow. Alles wird sofort lokal gespeichert; die App meldet, ob schon synchronisiert wurde.
- **Bottom Sheets** lassen sich am Griff nach unten wischen, über ✕ schließen oder mit Esc.
- **Zurück** stellt die vorherige Scroll-Position wieder her.
- Eingabefelder haben auf Touch-Geräten mindestens 16 px Schrift, damit iOS beim Antippen nicht zoomt.
- **Einstellungen → App → Bewegung reduzieren** schaltet Animationen auf diesem Gerät ab.

## Benachrichtigungen

Neuigkeiten erscheinen in der App (Glocke). Push-Benachrichtigungen auf das Gerät gibt es bewusst nicht, weil sie externe Push-Dienste der Browserhersteller einbinden würden (Begründung im Bericht).

## Passkeys

Passkeys werden unter **Konto → Passkeys** eingerichtet. Welche Abfrage erscheint (Gerätesperre, Fingerabdruck, Gesicht, PIN oder Sicherheitsschlüssel), entscheidet dein Gerät; TERPGRID erhält keine biometrischen Daten. Ohne Verbindung ist keine Anmeldung möglich, weder mit Passkey noch mit Passwort. Eine E-Mail-Adresse ist nie nötig.
