# Phase 5.6 – Sichere Offline-Architektur

Stand: 5.6.0-rc.1 · Ergänzt `docs/ARCHITECTURE.md` und `docs/PHASE5-5-ENCRYPTION.md`.

## Grundsatz

TERPGRID trennt drei Arten lokaler Speicherung strikt:

| Ebene | Inhalt | Wo | Wie lange |
| --- | --- | --- | --- |
| **Öffentliche App-Hülle** | HTML, JS, CSS, Schriften, Icons, Manifest, Academy-Texte (Teil des JS-Bundles) | Cache Storage des Service Workers (`terpgrid-shell-<version>`) | bis zur nächsten Version (alter Cache wird bei Aktivierung gelöscht) |
| **Private Arbeitskopie** | eigene Grows, Pflanzen, Einträge, Fotos, Journal, Sammlung, Laborberichte, Einstellungen, Outbox, Konflikte | IndexedDB je Konto (`terpgrid-u-<kontoschlüssel>`) | während der Sitzung; **darüber hinaus nur mit Offline-Freigabe** |
| **Gemeinsame Bereiche** | Inhalte geteilter Bereiche | nur Arbeitsspeicher; ausstehende Bereichsänderungen im kontobezogenen localStorage | bis zum Schließen bzw. bis zur Bestätigung durch den Server |

Der Service Worker cacht **nie**:
- `/api/*` (Sitzungen, private Datensätze, Fotos, Exporte, Katalog-Proxy);
- fremde Origins;
- Antworten mit `Cache-Control: no-store` oder `private`.

Die API sendet auf allen Antworten `Cache-Control: no-store`. Damit kann der generische Cache keine privaten Inhalte enthalten. Das ist per Test belegt: In der Browser-Regression wird der gesamte Cache nach privaten Grow-Namen durchsucht.

## Offline-Freigabe (Opt-in)

Die Freigabe gilt je Konto und Gerät. Sie wird im Browser unter `terpgrid.device.offlineDbs` gespeichert und enthält nur Datenbanknamen, keine Inhalte.

| | Aus (Standard) | Ein |
| --- | --- | --- |
| Arbeitskopie während der Sitzung | ja (nötig für Synchronisation, Konflikte, schnelle Oberfläche) | ja |
| Nach dem Abmelden | **gelöscht** (ohne Rückfrage, wenn nichts aussteht) | bleibt; beim Abmelden kann sie gelöscht werden |
| Kontowechsel auf dem Gerät | Kopien anderer Konten ohne Freigabe werden entfernt | Kopie bleibt |
| Start ohne Verbindung („Offline weiter als …“) | nein | ja, solange die Sitzung nicht beendet wurde |
| Dauerhafter Speicher (`navigator.storage.persist()`) | nicht angefragt | angefragt (der Browser kann ablehnen, das wird angezeigt) |

„Geteiltes Gerät“ erzwingt „Aus“ für alle Konten und löscht bestehende Freigaben.

Nach dem ersten Login fragt die Übersicht einmalig nach der Offline-Freigabe. „Nicht jetzt“ wird gemerkt. Die Einstellung lässt sich jederzeit unter **Konto → Dieses Gerät** ändern; **Einstellungen → App** verlinkt dorthin.

### Nie still verwerfen

Eine Arbeitskopie wird **nie** automatisch gelöscht, solange es nicht übertragene Änderungen gibt. Das betrifft die private Outbox und die Bereichs-Warteschlangen. Die Entscheidungslogik ist eine reine Funktion mit Tests (`selectPurgeable` in `src/lib/offline.ts`):

- nie die aktive Datenbank;
- nie die Datenbank des Lokalmodus (`terpgrid`);
- nie freigegebene Konten, außer auf geteilten Geräten;
- nie Datenbanken mit ausstehenden Änderungen.

Beim Abmelden mit ausstehenden Änderungen erscheint immer eine Rückfrage. Auf geteilten Geräten sagt sie ausdrücklich, dass die Änderungen verloren gehen.

### Abmelden ohne Verbindung

Das Sitzungs-Cookie ist HttpOnly und kann vom Client nicht gelöscht werden. Schlägt `POST /api/auth/logout` mangels Verbindung fehl, merkt sich der Browser `terpgrid.pendingLogout`. Beim nächsten Serverkontakt wird die Sitzung zuerst beendet, bevor Daten geladen werden. Die Browser-Regression belegt das: Nach Offline-Abmelden und Neustart antwortet `/api/auth/session` mit 401. Eine neue Online-Anmeldung hebt die Markierung auf.

## Was im Browser liegt – und was nicht

- **Nie im Browser:** Master-Key, Kontoschlüssel, Bereichs- und Profilschlüssel. Sie existieren nur auf dem Server, die Verschlüsselung ruhender Daten erfolgt serverseitig (Modell A, keine Ende-zu-Ende-Verschlüsselung).
- **IndexedDB ist nicht verschlüsselt.** Schutz bieten nur Betriebssystem, Geräteverschlüsselung und Gerätesperre. Eine Verschlüsselung im Browser würde einen Schlüssel auf demselben Gerät erfordern und gegen Personen mit Zugriff auf das entsperrte Gerät nichts nützen. Das wird in der Oberfläche so erklärt.
- **localStorage** enthält nur Geräteeinstellungen, Entwürfe und Bereichs-Warteschlangen unter dem Präfix `terpgrid.u.<kontoschlüssel>.`. Diese werden bei Bereinigung und Löschung mit entfernt.

## Inhalte und ihr Offline-Verhalten

| Inhalt | Offline | Begründung |
| --- | --- | --- |
| Eigene private Daten | mit Freigabe | IndexedDB, siehe oben |
| Gemeinsame Bereiche | **nein** (nur online, Arbeitsspeicher) | Rechte können sich jederzeit ändern; jede Änderung wird serverseitig neu autorisiert; bei Entzug (404) wird der Zwischenspeicher verworfen, ausstehende Änderungen werden nie erneut gesendet, nur lokal zum Herunterladen angeboten (Phase 5.5) |
| Sortenkatalog (Discover) | **nein** | wird nie vollständig heruntergeladen; Lizenz der Quelle erlaubt keine Weitergabe ganzer Bestände an Endgeräte; zuletzt angesehene Sorten bleiben als Verweise in den Einstellungen |
| Academy-Artikel, Glossar, Terpen-Atlas | ja | öffentlich, Teil der App-Hülle (vorab gecachte JS-Dateien) |
| Fotos | mit Freigabe | Teil der privaten Arbeitskopie, bereits verkleinert und ohne Metadaten |

## Service-Worker-Lebenszyklus (PWA 3.0)

1. **Erstinstallation:** Der Worker cacht die Hülle und alle gehashten Dateien und aktiviert sofort, weil es noch keinen aktiven Worker gibt.
2. **Update:** Der neue Worker installiert sich und **wartet**. Die App zeigt „Neue Version verfügbar“. Erst „Aktualisieren“ sendet `SKIP_WAITING`; bei `controllerchange` lädt die App neu. So gibt es nie ein Neuladen mitten in einer Eingabe.
3. **Aktivierung:** Alte `terpgrid-*`-Caches werden gelöscht.
4. **Navigation offline ohne gecachte Hülle:** eine schlichte deutsche Offline-Seite (`no-store`).
5. **Suche nach Updates:** beim Zurückkehren in die App (`visibilitychange`) und manuell unter Einstellungen → App.

## Bekannte Grenzen

- `indexedDB.databases()` fehlt in älteren Browsern. Dort entfällt die Bereinigung fremder Kopien beim Kontowechsel; das Löschen beim Abmelden funktioniert weiterhin.
- Der Browser kann nicht als dauerhaft markierten Speicher bei Platzmangel räumen. Die Daten bleiben auf dem Server; nicht übertragene Änderungen wären dann verloren. Deshalb wird „dauerhafter Speicher“ angefragt und das Ergebnis angezeigt.
- Eine Fernlöschung ist nicht möglich. „Andere Sitzungen beenden“ beendet nur Serversitzungen; eine lokale Kopie auf einem verlorenen Gerät bleibt bestehen. Ohne Offline-Freigabe wird sie beim nächsten Start mit Serververbindung und beendeter Sitzung entfernt, sofern nichts aussteht. Mit Freigabe bleibt sie, bis jemand sie im Browser löscht (siehe Bedrohungsmodell).
