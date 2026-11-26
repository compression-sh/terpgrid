# Phase 5.5 – Private Zusammenarbeit: Bericht

Stand: 26.11.2026 · Version 5.5.0-rc.1 (Release-Kandidat, nicht veröffentlicht) · Basis: `main` = `be8dfe9`

**Nicht automatisch mergen. Kein Deployment, keine aktivierten Jobs, der Katalog-Refresh-Timer bleibt aus.**

Weitere Dokumente:
* `docs/PHASE5-5-PERMISSION-MATRIX.md`: Rechtematrix, per Test mit dem Code abgeglichen
* `docs/PHASE5-5-THREAT-MODEL.md`: Bedrohungsmodell
* `docs/PHASE5-5-ENCRYPTION.md`: Schlüssel, Garantien und Grenzen
* `docs/screenshots/phase-5-5/`: Browser-Screenshots Desktop und Mobil

## 1. Umgesetzt

| Bereich | Umfang |
| --- | --- |
| **Profile** | Anzeigename, frei wählbares Handle (≠ Anmeldename, serverseitig erzwungen), zufällige und neu erzeugbare Social-ID (`TG-XXXX-XXXX`), Avatar (im Browser auf 256 px verkleinert, Signatur geprüft), Bio, Akzentfarbe, Lieblingssorten, Lieblingsterpene, Interessen. Sichtbarkeit je Feld; Standard privat, nur der Anzeigename ist für Freunde sichtbar. Profil vor einzelnen Freunden verbergbar. Vorschau „So sehen dich Freunde“. |
| **Freunde** | Anfragen über exaktes Handle oder Social-ID ohne Enumeration. Ablaufende (1–30 Tage), widerrufbare, einmalige Einladungslinks. Ein- und ausgehende Anfragen, annehmen, ablehnen, zurückziehen, entfernen. Blockieren und Aufheben. Private, verschlüsselte Spitznamen. Anfragen über Handle/ID abschaltbar. |
| **Gemeinsame Bereiche** | Arten Grow-Projekt, Sammlung, Allgemein. Eigener versionierter Schlüssel je Bereich, explizite Mitgliedschaft, vier Rollen, Zugriffsstufen je Ressource mit Vererbung, Einladungen (nur Freunde, 14 Tage, widerrufbar), Eigentumsübertragung mit Annahme und Re-Auth, Aktivitätsverlauf, Export, Schlüsselrotation, Löschen mit Namensbestätigung und Re-Auth. |
| **Teilen** | **Kopie (Standard):** neue IDs, gekennzeichnet als „Geteilte Kopie“, Original unverändert, keine spätere Übertragung privater Änderungen. **Verschieben:** nur Grows (mit Pflanzen, Einträgen, Fotos), Journal-Einträge und Laborberichte, mit Bestätigungsdialog und Erklärung; transaktional, Dateien neu verschlüsselt. Optionen: Fotos, Erinnerungen als Aufgaben, Notizen, Mengen und Kosten (Sammlung, Standard aus), Originaldokumente. Serverseitige Vorschau vor jedem Teilen. Vorher wird synchronisiert; geteilt wird nur der bestätigte Stand. |
| **Integration** | „Teilen“ auf Grow, Pflanze und Sorte; Auswahl-Dialog in Journal, Sammlung und Laborberichten. Im Bereich: Grows mit Pflanzen, Einträgen, Messwert-Diagrammen (bestehende `MeasurementCharts` wiederverwendet), Fotos; dazu Sorten, Journal, Sammlung, Laborberichte (mit Dokument), Projektnotizen, Aufgaben. Ein Navigationseintrag „Gemeinsam“ (nur mit Server-Konto) mit Unterseiten statt weiterer Einträge in der Seitenleiste. |
| **Kommentare** | Auf jeder lesbaren Ressource, eine Antwortebene, eigene bearbeiten und löschen, Eigentümer moderiert. Mit dem Bereichsschlüssel verschlüsselt. |
| **Benachrichtigungen** | Nur in der App. Ungelesen-Zähler, Kategorien, gelesen/ungelesen, „Alle gelesen“, Entfernen, Einstellungen je Kategorie („Rechte & Zugriff“ immer an), Deep-Links. Keine Inhalte in Vorschauen. Gleichartige Meldungen werden zusammengefasst. Erweiterungspunkt `NotificationChannel` für Web-Push in 5.6, nichts davon aktiv. Vollständig getrennt von Betreiber-Meldungen. |
| **Datenschutz-Center 2.0** | Abschnitt „Zusammenarbeit & Freigaben“: Profil-Sichtbarkeit, Freunde, Blockierte, eigene Bereiche und geteilte Einträge, Mitgliedschaften mit Rolle, offene Einladungen und Anfragen, Benachrichtigungen. Jeweils mit sofortigem Widerruf und Erklärungen zu acht Fällen (Freund entfernen, blockieren, verlassen, widerrufen, löschen, Konto löschen, übertragen, Downloads nicht widerrufbar). |
| **Sync** | Bereichs-Sync im Client nach denselben Regeln wie die private Engine: Versionen, Drei-Wege-Merge (`merge3` wiederverwendet), bewusste Konfliktauflösung, Offline-Warteschlange je Konto. Nach Entzug kein erneutes Senden; nicht übertragene Änderungen lassen sich nur lokal sichern. |

## 2. Architekturentscheidungen

* **Getrennte Bereiche statt gelockerter Policies:** `records` und `files` sowie ihre RLS-Policies sind unverändert. Geteilte Inhalte liegen in eigenen Tabellen (`space_records`, `space_files`) mit eigenem Schlüssel.
* **Rechte nur auf dem Server:** `requireSpace()` lädt die Mitgliedschaft bei jeder Anfrage neu. `can()` ist die einzige Quelle der Rechtematrix. RLS bildet dieselben Grenzen in der Datenbank ab; zusätzlich schützen Trigger unveränderliche Felder.
* **SECURITY-DEFINER-Funktionen** geben nur Wahrheitswerte oder eng begrenzte Zeilen für das angemeldete Konto zurück. Die neuen Tabellen nutzen `ENABLE` (nicht `FORCE`) RLS, damit diese Prüfungen nicht rekursiv werden; die Laufzeitrolle ist nie Eigentümerin.
* **Kein Verzeichnis:** Freunde nur über exakte Kennungen oder Einladungscodes. Antworten verraten nicht, ob ein Konto existiert.
* **Teilen serverseitig:** Der Kontoschlüssel bleibt im Kontext des Besitzers. Der Client schickt nur IDs und Optionen, nie die zu teilenden Daten.
* **Kontolöschung schützt fremde Daten:** `spaces.owner_id ON DELETE RESTRICT`. Löschen ist erst möglich, wenn eigene Bereiche mit weiteren Mitgliedern übertragen oder ausdrücklich gelöscht sind.
* **Blockieren und Mitgliedschaften:** Blockieren beendet Freundschaft, Anfragen und Einladungen und entfernt die Person aus den eigenen Bereichen (abwählbar). In Bereichen anderer Eigentümer bleiben beide Mitglied, weil sonst Daten Dritter betroffen wären; man kann sie verlassen.
* **Keine Hintergrundjobs:** Ablauf von Anfragen und Einladungen sowie das Aufräumen alter Benachrichtigungen passieren beim Lesen.

## 3. Datenbankmigration 008 (`server/migrations/008_collaboration.sql`)

* **Neu:** `profiles`, `friendships`, `friend_settings`, `friend_requests`, `friend_invites`, `blocks`, `spaces`, `space_keys`, `space_members`, `space_invites`, `space_records`, `space_files`, `space_comments`, `space_activity`, `notifications` sowie 26 Hilfs- und Schutzfunktionen (inkl. Trigger-Funktionen).
* **Rein additiv:** Bestehende Tabellen und Policies bleiben unverändert.
* **Rechte der Laufzeitrolle:** nur die nötigen Rechte; `notifications` ohne INSERT (Zustellung nur über `tg_notify()`).

## 4. Verschlüsselung (Kurzfassung)

* **Schlüssel:** Eigener 256-Bit-Schlüssel je Bereich und Generation sowie je Profil, jeweils mit dem Master-Key verpackt.
* **Bindung:** Alle Inhalte nutzen AES-256-GCM mit an Bereich, Ressource oder Konto gebundenem AAD.
* **Keine Schlüssel beim Client:** Clients erhalten nie Schlüssel, Mitglieder nie Kontoschlüssel.
* **Rotation und Prüfung:** Master-Key-Rotation, Kontoschlüssel-Rotation und `verify-data` decken Bereiche, Profile, Spitznamen und Labels ab. Eine Bereichsrotation ist fortsetzbar und wird vor dem Ausmustern vollständig geprüft.
* **Keine Ende-zu-Ende-Verschlüsselung:** Das steht so in der Oberfläche, im Datenschutz-Center und in der Dokumentation.

Details: `docs/PHASE5-5-ENCRYPTION.md`.

## 5. Sicherheitstests (Ergebnisse)

**Server-Integrationstests** (`server/test/collab.test.ts`, 30 Szenarien) mit fünf Konten (Eigentümer, Bearbeiten, Kommentieren, Ansehen, Außenstehend). Alle bestehen:

| Geprüft | Ergebnis |
| --- | --- |
| Außenstehender auf jeder Bereichsroute (Details, Änderungen, Push, Kommentare, Verlauf, Export, Liste) | 404 bzw. leer |
| Rollen gegen Schreiben, Kommentieren, Mitglieder, Einladen, Rollen ändern, Bereich ändern, Übertragen | gemäß Matrix (403) |
| Verschachtelte Ressourcen „Nur Bearbeitende“ (Grow → Pflanze → Foto, Kommentare, Dateien) | unsichtbar; inhaltslose Löschmarken für früher Sichtbares |
| Umhängen eines eingeschränkten Kindes in einen öffentlichen Grow (Bearbeiten) | abgelehnt |
| „Schreibgeschützt“: Ändern und neue Kinder durch Bearbeiten | abgelehnt |
| Rollenwechsel während der Synchronisation | nächster Push 403 |
| Entzug, auch für später eintreffende Offline-Änderungen und Dateien | 404 |
| Einladungs-Replay, widerrufene und abgelaufene Einladungscodes, Bereichseinladungen | 404 |
| Enumeration über Anfragen (unbekannt, abgeschaltet, existierend) | identische Antworten |
| Missbrauch: mehr als 20 Anfragen pro Stunde | 429 |
| Medien ohne Recht; `no-store` und `attachment` | 404 bzw. gesetzt |
| Export bei verbotener Option; Export ohne eingeschränkte Inhalte | 403 bzw. geprüft |
| Benachrichtigungen fremder Konten markieren | 0 betroffen |
| Inhalte in Benachrichtigungen | keine |
| Direkte SQL-Abfragen als App-Rolle ohne Mitgliedschaft auf 7 Bereichstabellen | 0 Zeilen |
| Selbstaufnahme als Eigentümer oder Bearbeiten, Benachrichtigung fälschen, Einladungsrolle ändern | abgelehnt (RLS bzw. Trigger) |
| Teilen fremder oder nicht vorhandener IDs; Teilen mit Rolle Ansehen | 404 bzw. 403 |
| Konto mit Bereichen und Mitgliedern löschen | 409 |
| Mitglied löscht Konto | Kommentar bleibt als „Gelöschtes Konto“ |
| Bereich löschen (falscher Name, Nicht-Eigentümer, Eigentümer) | 400 / 403 / 200; Mitglieder benachrichtigt |
| Bereichsschlüssel-Rotation und Master-Key-Rotation | danach `verify-data` ohne Fehler |
| Private Datensätze, die nie geteilt wurden | Prüfsumme über Chiffrat, MAC und Version identisch |
| Anmeldenamen in Antworten an andere Konten | nie enthalten |

**Weitere Tests:**
* **Rechtematrix:** 4 Tests, darunter Dokument ↔ Code und „Zugriffsstufen schränken nur ein“.
* **Client:** 7 Tests in `spaceSync.test.ts` (Merge, Konflikt, Entzug ohne erneutes Senden, Rollenwechsel, Warteschlange, Benachrichtigungstexte ohne Inhalte).
* **Gesamt:** Server 205/205, Frontend 267/267.
* **Gefundener und behobener Fehler:** Ein zeitweise fehlschlagender RLS-Test (lokal und in der CI) zeigte, dass drei Routen (Freundschaftsanfrage, Bereichseinladung, Kommentar) ihre Antwort noch innerhalb der Datenbanktransaktion, also vor dem COMMIT, sendeten. Clients konnten „angelegt“ erhalten, bevor die Daten festgeschrieben waren. Jetzt wird erst nach dem COMMIT geantwortet; danach waren 15 von 15 vollständigen Läufen grün. Der Test prüft zusätzlich, dass die Einladung für die eingeladene Person sofort sichtbar ist.

**Browser-Abläufe** (echte Oberfläche und API, fünf Konten, eines mobil mit 390 px): **26/26 bestanden**. Geprüft u. a.:
* Profil, Handle-Regel und neutrale Anfrage-Meldung; keine Enumeration.
* Glocke, Annehmen und Ablehnen; die abgelehnte Anfrage bleibt für den Absender „ausstehend“.
* Teilen per Dialog in einen neuen Bereich; Original unverändert; Vorschau ohne Mengen und Kosten.
* Einladen mit Rollenauswahl; Nicht-Freunde lassen sich nicht einladen; Beitreten.
* Rollen in der Oberfläche:
  * Bearbeiten legt Einträge an und kommentiert.
  * Kommentieren hat keinen Bearbeiten-Knopf; Schreibversuche lehnt der Server ab.
  * Ansehen hat kein Kommentarfeld.
* Zugriffsstufe: Bereinigung im Client nach der Einschränkung.
* Benachrichtigungen ohne Inhalte.
* Außenstehender sieht „Kein Zugriff“ (API 404); ein entferntes Mitglied verliert den Zugriff sofort.
* Keine fremden Anmeldenamen in Ansichten.

**Barrierefreiheit** (axe, WCAG 2.2 AA): **0 Verstöße** auf allen 12 neuen bzw. geänderten Ansichten und im Teilen-Dialog, bei 1280 und 390 px. Geprüfte Ansichten: Übersicht, Freunde, Freundesprofil, Profil, Benachrichtigungen, Einstellungen, Bereich (Inhalte, Mitglieder, Aktivität, Einstellungen), geteilte Ressource, Konto mit Datenschutz-Center.

## 6. Kontoübergreifende Isolation

* **Private Daten:**
  * `records` und `files` sind unverändert durch die bestehenden RLS-Policies geschützt; die bestehenden Isolationstests sind grün.
  * Der Kontoexport enthält zusätzlich `social.json` mit eigenem Profil, Freunden, Blockierungen und Mitgliedschaften; der Isolationstest prüft diese Datei auf fremde Daten.
* **Bereiche:** Nichtmitglieder sehen weder Bereiche noch Schlüssel, Mitglieder, Datensätze, Dateien, Kommentare oder Verlauf (API und SQL geprüft).
* **Profile:** Andere sehen sie nur als Freunde, Mitglieder eines gemeinsamen Bereichs oder Empfänger einer Anfrage. Feldfilter je Beziehung; Blockierung beendet die Sichtbarkeit.

## 7. Backup, Restore, Upgrade (isoliert, Docker, Produktions-Compose)

Upgrade 5.4.0-rc.1 (`be8dfe9`) → 5.5.0-rc.1 (`0bb22bd`, Images mit Proxy-Zertifikat der Sandbox gebaut, sonst identisch):

| Schritt | Ergebnis |
| --- | --- |
| `upgrade.sh --no-build` (Backup → Migration 008 → Health) | erfolgreich, Schema passt |
| Private Daten vor und nach dem Upgrade (110 Datensätze, 12 Dateien; Prüfsumme über Chiffrat, MAC, Version, Sequenz, Generation) | **identisch** |
| Laufzeitrolle ohne Benutzerkontext liest `spaces` | 0 Zeilen |
| Bestehende Prüfungen (Fotos bytegleich 6/6, keine fremden Daten) | bestanden |
| Zusammenarbeit anlegen (Freundschaft, Bereich, Grow als Kopie: 76 Einträge, 8 Dateien, Kommentar) | erfolgreich; private Daten danach **identisch** |
| Mitglied (Kommentieren) liest Bereich, Foto und Kommentar; Schreiben | 200 (JPEG bytegleich übertragen) bzw. 403 |
| `verify-data` | 3 Konten, 110 Datensätze, 12 Dateien, 1 Bereich (76 Datensätze, 8 Dateien), **0 Fehler** |
| `backup.sh` und `restore-test.sh` (isoliert, ohne Netz) | Zusammenarbeit: 1 Bereich, 2 Mitgliedschaften, 76 Einträge, 8 Dateien, 1 Freundschaft; Entschlüsselung **0 Fehler** |
| Simulierter Verlust (`delete from spaces`) → `restore.sh` | Bereiche, Mitglieder, Einträge, Dateien und Kommentare wiederhergestellt; private Daten identisch; Mitglied liest wieder |
| `rollback.sh 5.4.0-rc.1` nach Migration 008 | korrekt verweigert (Restore zuerst) |
| Aktive Timer oder Jobs | 0 |

## 8. Leistung (Entwicklungsrechner, 4 Kerne, PostgreSQL 16)

| Operation | Median | p95 |
| --- | --- | --- |
| Teilen-Vorschau (Grow mit 505 Einträgen) | 15 ms | – |
| Teilen als Kopie (505 Einträge) | 567 ms | – |
| Vollabruf Bereich, 505 Einträge (Mitglied) | 18,2 ms | 24,1 ms |
| Inkrementeller Abruf ohne Änderung (Polling alle 20 s) | 3,5 ms | 3,9 ms |
| Push einer Änderung (inkl. Rechteprüfung, Verlauf, Benachrichtigung) | 7,4 ms | 15,1 ms |
| Bereichsdetails | 3,4 ms | 7,7 ms |
| Bereichsliste | 8,8 ms | 11,7 ms |
| Ungelesen-Zähler | 1,6 ms | 2,8 ms |
| Benachrichtigungsliste | 3,7 ms | 7,1 ms |
| Datenschutz-Übersicht | 12,0 ms | 12,5 ms |
| Kommentar schreiben | 5,5 ms | 6,7 ms |
| Private Synchronisation, Pull 500 (Vergleich, unverändert) | 10,2 ms | 15,9 ms |

**Frontend-Bundle:** Das Haupt-Bundle wächst von 490 auf 523 KB (gzip 154 → 164 KB), vor allem durch Glocke und Zusammenarbeits-Hooks. Alle Seiten der Zusammenarbeit werden nachgeladen.

## 9. Screenshots (`docs/screenshots/phase-5-5/`)

**Desktop (1280 px):**
* `01-profil`
* `02-freunde-anfrage`
* `03-gemeinsam-wartet`
* `04-teilen-dialog`
* `05-einladen-rolle`
* `06-mitglieder`
* `07-grow-bereich-kommentare`
* `08-zugriffsstufe`
* `09-benachrichtigungen-panel`
* `10-benachrichtigungen-einstellungen`
* `11-aktivitaet`
* `12-datenschutz-center`
* `13-kein-zugriff`

**Mobil (390 px):**
* `m1-ansehen-grow-mobil`
* `m2-gemeinsam-mobil`
* `m3-freunde-mobil`
* `m4-profil-mobil`
* `m5-entzogen-mobil`

## 10. Grenzen und offene Punkte

* **Keine E2EE:** Der Server-Betreiber könnte entschlüsseln. Eine eigene Sicherheitsphase ist dafür vorgesehen.
* **Nicht widerrufbar:** Exporte, Downloads und Bildschirmfotos von Mitgliedern lassen sich nicht aus der Ferne entfernen. Das ist in der Oberfläche erklärt.
* **Bereichsinhalte sind online-zentriert:** Der Zwischenspeicher liegt im Arbeitsspeicher; offline möglich ist nur das Schreiben über die Warteschlange. Fotos lassen sich nur online hochladen.
* **Verschieben nur für Grows, Journal-Einträge und Laborberichte:** Sorten, Sammlung und einzelne Pflanzen werden geteilt, aber nie verschoben, weil private Verweise sonst brechen würden. Private Erinnerungen und Ausgaben eines verschobenen Grows bleiben privat; die Vorschau weist auf verlorene Verknüpfungen hin.
* **Bearbeitung in Bereichen nutzt schlanke Formulare:** Die privaten Grow-Komponenten schreiben direkt in die private Datenbank. Deshalb wurden nur reine Darstellungskomponenten (Messwert-Diagramme) und die Merge-Logik wiederverwendet; das Bearbeiten in Bereichen ist bewusst einfacher gehalten.
* **Kontingent:** Dateien eines Bereichs zählen zum Kontingent des Eigentümers. Bearbeitende können es füllen; der Eigentümer steuert, wen er einlädt.
* **Ratenbegrenzungen sind prozesslokal:** wie bisher, bei einer API-Instanz.
* **Web-Push:** Nur die Schnittstelle ist vorbereitet (Phase 5.6), nichts ist aktiv.

## 11. Nach dem Merge (manuell)

1. `./upgrade.sh`: Backup, Migration 008, Health-Prüfung.
2. `backup/backup.sh` und `backup/restore-test.sh latest`; in der Ausgabe erscheint die Zeile „Zusammenarbeit“.
3. Optional `docker compose exec -T api node dist/cli.js verify-data`.

Keine Katalog-Neuimporte nötig, keine neuen Timer. Rollback nach Migration 008 nur mit Restore des Backups von vor dem Upgrade (`docs/UPGRADE-5.4.md`, Abschnitt 4, gilt sinngemäß).
