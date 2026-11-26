# Phase 5.7 – Offline-Sicherheit (Gerät und Browser)

Stand: 5.7.0-rc.1. Ergänzt `PHASE5-6-OFFLINE-ARCHITECTURE.md`.

Alle Aussagen sind in **Chromium** gemessen: `offline-sec.cjs` (16/16) und die 5.6-Regression (26/26), jeweils mit echter API. Die vollständigen Speicherinventare liegen unter `docs/screenshots/phase-5-7/inventory-offline-off.json` und `inventory-offline-on.json`.

**Nicht geprüft:** WebKit, Firefox und physische Geräte (siehe Sicherheitsbericht, Abschnitt 6).

## 1. Speicherorte im Browser

| Speicher | Inhalt | Privat? | Lebensdauer |
| --- | --- | --- | --- |
| **IndexedDB** `terpgrid-u-<kontoschlüssel>` | Arbeitskopie des Kontos: Datensätze, Fotos (bereinigt), Sync-Zustand, Outbox, Konflikte | **ja, unverschlüsselt** | Sitzung; darüber hinaus nur mit Offline-Freigabe oder solange Änderungen ausstehen |
| IndexedDB `terpgrid` | Nur Lokalmodus (ohne Server) | ja | bis zum Löschen durch die Nutzerin |
| **localStorage**, Geräteeinstellungen `terpgrid.device.*` und `terpgrid.mode` | Geteiltes Gerät, Offline-Freigaben (nur DB-Namen), Installationshinweis, Bewegung reduzieren | nein | dauerhaft |
| localStorage `terpgrid.lastAccount` | Kennung und Anzeigename des zuletzt angemeldeten Kontos | personenbezogen, kein Inhalt | nur mit Offline-Freigabe; beim Abmelden entfernt |
| localStorage `terpgrid.pendingLogout`, `terpgrid.logoutSignal` | Abmeldestatus, Zeitstempel | nein | bis zur Server-Abmeldung bzw. dauerhaft (nur Zeitstempel) |
| localStorage `terpgrid.u.<kontoschlüssel>.*` | THC-Lab-Eingaben, Warteschlangen gemeinsamer Bereiche | ja | wie die Konto-Datenbank (beim Löschen mit entfernt) |
| **sessionStorage** `terpgrid.*` | Formularentwürfe, Schnell-Log-Entwurf, Vergleichsablage | ja | Tab; beim Abmelden geleert |
| **Cache Storage** `terpgrid-shell-<version>` | Öffentliche App-Hülle (HTML, JS, CSS, Schriften, Icons) | **nein** – nie `/api/*`, nie `no-store`/`private` | bis zur nächsten Version |
| **Arbeitsspeicher** | Inhalte gemeinsamer Bereiche, ausgewählte Fotos vor der Verarbeitung, entpackte Daten | ja | bis zum Schließen bzw. Abmelden |
| **Schlüssel** | – | Master-Key und Konto-, Bereichs- oder Profilschlüssel liegen **nie** im Browser | – |
| Sitzungs-Cookie | Opakes Token, `HttpOnly`, `SameSite=Strict`, `__Host-` | für Skripte nicht lesbar | Sitzung (Server prüft Leerlauf und absolute Dauer) |

## 2. Was nach jedem Ablauf auf dem Gerät bleibt (gemessen)

Messmethode: Markierungen im Journal. Danach werden alle IndexedDB-Datenbanken mit allen Stores, localStorage, sessionStorage und Cache Storage vollständig nach der Markierung durchsucht.

| Situation | Ergebnis |
| --- | --- |
| Angemeldet, Offline aus | Markierung **nur** in `idb:terpgrid-u-…/journal` und `/syncState` |
| Abmelden online, Offline aus | Keine Markierung mehr; keine Konto-Datenbank; keine `terpgrid.u.*`-Einträge (übrig: `terpgrid.mode`, `terpgrid.logoutSignal`) |
| **Abmelden offline**, zwei Tabs | Beide Tabs sofort abgemeldet, keine Inhalte sichtbar; Kopie gelöscht (ohne Ausstehendes); Server-Abmeldung bei Rückkehr der Verbindung **ohne** Neustart nachgeholt (Session danach 401) – **behoben in 5.7 (F-01)** |
| Abmelden, Offline **ein** | Kopie bleibt (beabsichtigt, **unverschlüsselt**); kein „Offline weiter“ ohne Passwort; `lastAccount` entfernt |
| Kontowechsel | Konto B sieht weder in der App noch in seiner Datenbank Inhalte von A; Kopien anderer Konten ohne Freigabe und ohne Ausstehendes werden entfernt |
| Sitzung serverseitig widerrufen oder abgelaufen | Anmeldeseite, keine Inhalte; beim nächsten Start Kopie entfernt (Offline aus, nichts ausstehend) |
| Abmelden mit ausstehenden Änderungen | Rückfrage; Kopie bleibt, bis **dasselbe Konto** sich anmeldet und überträgt (geteiltes Gerät: nach ausdrücklicher Bestätigung gelöscht) |
| Gemeinsamer Bereich, Zugriff entzogen oder Rolle herabgestuft | Bereichs-Cache verworfen, Warteschlange nie erneut gesendet (nur als Datei herunterladbar), Server lehnt jede Operation neu autorisiert ab |
| App-Update | Neue Hülle erst nach „Aktualisieren“; alter Shell-Cache gelöscht; IndexedDB unverändert |
| Browser-Neustart | Wie vor dem Neustart; ausstehendes Abmelden wird vor dem Laden der Daten ausgeführt |
| Unterbrochene Synchronisation | Outbox bleibt; erneuter Versuch mit Backoff; „Synchronisiert“ erst nach Serverbestätigung |

## 3. Ausstehende Änderungen beim Abmelden (Verhalten aus 5.6)

Nicht übertragene Änderungen werden nie still verworfen. Sie bleiben in der Datenbank **ihres** Kontos:
- **Anderes Konto am selben Gerät:** Es sieht sie nicht. Getrennte Datenbank, kein Laden fremder Datenbanken, keine Anzeige.
- **Übertragen:** nur nach erfolgreicher Anmeldung **dieses** Kontos, also kontogebundene Wiederherstellung. Die Rechte prüft der Server bei jeder Operation neu.
- **Verwerfen:** Beim Abmelden über „Abmelden und löschen“ (geteiltes Gerät) bzw. unter „Konto → Dieses Gerät → Lokale Kopie löschen“ mit Warnung. Ein anderes Konto kann sie nicht gezielt löschen, aber es könnte über die Browserfunktion „Websitedaten löschen“ alles entfernen. Das ist eine Browsergrenze.
- **Grenze:** Wer den Browser direkt untersucht (Entwicklerwerkzeuge, Dateisystem), kann die unverschlüsselte Datenbank lesen. Dagegen hilft nur die Geräteverschlüsselung bzw. ein eigenes Betriebssystemkonto je Person.

## 4. Abmelden ohne Verbindung – genaue Grenzen

1. Das Sitzungs-Cookie ist HttpOnly. Ohne Verbindung kann der Client die Serversitzung **nicht** beenden.
2. TERPGRID meldet deshalb sofort **lokal** ab: in diesem Tab und in allen anderen Tabs desselben Browsers. Die Arbeitskopie wird gelöscht (ohne Freigabe, ohne Ausstehendes).
3. Die Server-Abmeldung wird gemerkt (`terpgrid.pendingLogout`) und nachgeholt:
   - beim nächsten Start, **bevor** Daten geladen werden;
   - im laufenden Browser bei `online`, beim Zurückkehren in die App und alle 30 s.
4. Bis dahin ist die Sitzung auf dem Server gültig. Wer das Cookie aus dem Gerät extrahiert, könnte sie bis zum Nachholen, bis zum Leerlauf-Timeout (Standard 3 Tage) oder bis „Alle Sitzungen beenden“ von einem anderen Gerät aus nutzen.
5. Sofort beenden lässt sich eine Sitzung nur online: auf einem anderen Gerät unter „Konto → Aktive Sitzungen“.

## 5. Service Worker

- Cacht nur die öffentliche Hülle. `/api/*`, fremde Origins und `no-store`- bzw. `private`-Antworten werden nie gespeichert (Unit-Test in Sandbox, Browser-Inventar: 129 Einträge, alle öffentliche Hülle).
- Keine Hintergrund-Synchronisation, keine Push-Benachrichtigungen (Web-Push bleibt deaktiviert).

## 6. Bewusst nicht umgesetzt

- **Verschlüsselung der IndexedDB:** Der Schlüssel läge auf demselben Gerät. Ohne zusätzliches Geheimnis (Passphrase oder Passkey-PRF bei jedem Start) brächte das keinen echten Schutz. Siehe E2EE-Studie, Variante 2.
- **Fernlöschung:** technisch nicht möglich.
