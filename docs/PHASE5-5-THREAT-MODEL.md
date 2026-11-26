# Phase 5.5 – Bedrohungsmodell private Zusammenarbeit

Stand: 5.5.0-rc.1 · Ergänzt `docs/THREAT-MODEL.md` · Instanzgrenze: nur innerhalb derselben selbst gehosteten TERPGRID-Instanz. Keine Föderation, keine öffentlichen Profile, Links oder Feeds, keine externen Identitäten.

## Schutzgüter

1. Private Daten jedes Kontos. Sie dürfen durch Zusammenarbeit weder sichtbar werden noch sich verändern.
2. Inhalte gemeinsamer Bereiche: sichtbar nur gemäß Rolle und Zugriffsstufe.
3. Identität: Der Anmeldename (die halbe Zugangsinformation) wird nie preisgegeben.
4. Soziale Metadaten: Wer mit wem befreundet ist, wer wen blockiert und wer welche Anfragen erhalten hat.
5. Verfügbarkeit und Integrität: kein stilles Überschreiben, kein Datenverlust durch Verschieben, Entzug oder Löschen.

## Akteure

| Akteur | Fähigkeiten |
| --- | --- |
| Außenstehendes Konto (gleiche Instanz) | Kennt eventuell Handle, Social-ID oder Bereichs-IDs; manipuliert Anfragen beliebig |
| Mitglied mit niedriger Rolle (Ansehen/Kommentieren) | Gültige Sitzung, versucht Rechteausweitung über API, verschachtelte Ressourcen, Dateien, Exporte, Client-Zustand |
| Entferntes Mitglied | Hat Daten zwischengespeichert und Offline-Änderungen in der Warteschlange |
| Blockierte Person | Versucht weiter Kontakt aufzunehmen |
| Betreiber / Server-Kompromittierung | Zugriff auf Datenbank, Backups, gegebenenfalls Master-Key |

## Bedrohungen und Gegenmaßnahmen

| # | Bedrohung | Gegenmaßnahme | Nachweis |
| --- | --- | --- | --- |
| T1 | **Kontoenumeration** über Freundschaftsanfragen (existiert ein Handle/eine Social-ID?) | Immer gleiche Antwort (202, gleicher Text), egal ob das Ziel existiert, Anfragen abgeschaltet hat oder blockiert. Abgelehnte Anfragen bleiben für den Absender „ausstehend“. Kein Verzeichnis, keine Suche. Ratenbegrenzung 20/h je Konto. | `collab.test.ts` (Enumeration, Missbrauch), E2E |
| T2 | **Anmeldename sichtbar** für andere | Handle ist eine eigene Kennung, darf nicht gleich dem Anmeldenamen sein; keine API für andere Konten gibt `login_name` aus | Test: keine Anmeldenamen in allen Antworten an andere; E2E: keine Anmeldenamen in fremden Ansichten |
| T3 | **Zugriff Außenstehender** auf Bereiche (IDs erraten oder geleakt) | Jede Route lädt die Mitgliedschaft neu (`requireSpace`); Nichtmitglieder erhalten 404. RLS (ENABLE) auf allen neuen Tabellen | Test: 404 überall; direkte SQL-Abfrage als App-Rolle ohne Mitgliedschaft liefert 0 Zeilen |
| T4 | **Rechteausweitung** (Kommentieren schreibt, Bearbeiten verwaltet Mitglieder, Rolle „owner“ vergeben) | Rechtematrix im Code (`can()`) und in RLS; Rolle `owner` nicht vergebbar (Schema und Policy); Eigentum nur per Übertragung mit Annahme und Re-Auth | Rechtematrix-Tests, `collab.test.ts` |
| T5 | **Verschachtelte Ressourcen**: Pflanze/Foto/Kommentar eines eingeschränkten Grows lesen; Kind in öffentlichen Baum umhängen | Elternbezug serverseitig aus dem Inhalt abgeleitet; Kinder erben die Zugriffsstufe; Dateien, Kommentare und Verlauf werden über die zugehörige Ressource autorisiert; Umhängen zwischen Stufen nur durch den Eigentümer | Tests „Nur Bearbeitende“, „Schreibgeschützt“, Leak-Versuch |
| T6 | **Manipulierte Datenbankzugriffe** bei Logikfehlern in der App (z. B. Einladungsrolle ändern, sich selbst aufnehmen, fremde Kommentare umschreiben, Benachrichtigungen fälschen) | Schutz-Trigger für unveränderliche Felder und Statuswechsel; INSERT in `space_members` nur bei passender offener Einladung; Benachrichtigungen nur über `tg_notify()` (Auslöser = angemeldetes Konto) | Direkte RLS-Tests als App-Rolle |
| T7 | **Entzogenes Mitglied** behält Zugriff (Cache, Offline-Warteschlange) | Rechte bei jedem Request neu; Client verwirft Bereichs-Cache bei 404 und sendet ausstehende Änderungen nie erneut (nur lokal herunterladbar); bei Rollenwechsel vollständiges Neuladen; früher sichtbare, jetzt eingeschränkte Einträge kommen als inhaltslose Löschmarke | Client-Tests `spaceSync.test.ts`, E2E (entfernt → „Kein Zugriff“) |
| T8 | **Replay** von Einladungscodes oder Bereichseinladungen | Einladungscodes nur als HMAC gespeichert, einmalig, ablaufend, widerrufbar, atomar eingelöst (`tg_redeem_friend_invite`); Bereichseinladungen nur für das Ziel, Statuswechsel per Trigger, Annahme genau einmal | Tests Replay, Widerruf, Ablauf |
| T9 | **Einladungscode im Log** | Code steht nur im URL-Fragment (`#/together/invite/…`, nie an den Server); Vorschau und Einlösung per POST-Body | Design |
| T10 | **Spam / Belästigung** | Einladen in Bereiche nur unter bestätigten Freunden; Blockieren beendet Freundschaft, Anfragen und Einladungen, entfernt aus eigenen Bereichen, unterdrückt Benachrichtigungen; Ratenbegrenzungen | Test Blockieren |
| T11 | **Medien-URLs** ohne Autorisierung | Keine öffentlichen URLs; jede Datei über `/api/spaces/:id/files/...` mit Rollen- und Ressourcenprüfung, `Content-Disposition: attachment`, `no-store`, CSP sandbox | Tests Datei 404 nach Einschränkung/Entzug |
| T12 | **Exporte** als Umweg | Export nur lesbarer Ressourcen; Kommentieren/Ansehen nur mit Freigabe „Export erlauben“ | Test Export |
| T13 | **Sensible Inhalte in Benachrichtigungen** | Benachrichtigungen enthalten nur Typ, Auslöser und Verweise; Text baut der Client ohne Inhalte; Deep-Links werden beim Öffnen regulär autorisiert | Test „ohne Inhalte“, E2E |
| T14 | **Cache-Isolation** (Browser, Service Worker, Kontowechsel) | `Cache-Control: no-store` auf allen API-Antworten; Service Worker cacht nie `/api/*`; Bereichs-Cache nur im Arbeitsspeicher; Warteschlange im kontobezogenen localStorage-Präfix (bei „Geteiltes Gerät“ gelöscht); Abmelden verwirft alle Bereichssitzungen | Test no-store; Code |
| T15 | **Verlust fremder Daten** durch Kontolöschung oder Verschieben | Kontolöschung blockiert, solange man Bereiche mit weiteren Mitgliedern besitzt (`spaces.owner_id ON DELETE RESTRICT`); Verschieben in einer Transaktion, alte Blobs erst in den Papierkorb, bei Fehler bleibt alles unverändert | Tests Kontolöschung, fehlgeschlagenes Verschieben |
| T16 | **Gleichzeitige Änderungen** überschreiben sich | Optimistische Versionen, Konflikte, Drei-Wege-Merge nur bei verschiedenen Feldern, sonst bewusste Entscheidung | Server- und Client-Tests |
| T17 | **Datenbank- oder Backup-Diebstahl** | Inhalte mit Bereichs- bzw. Profilschlüssel verschlüsselt, Schlüssel mit Master-Key verpackt; Backups zusätzlich mit restic verschlüsselt | `verify-data`, Restore-Test |
| T18 | **Kompromittierter Server oder Betreiber** | **Nicht abgedeckt** (keine E2EE). Ehrlich dokumentiert in der Oberfläche, im Datenschutz-Center und in `PHASE5-5-ENCRYPTION.md` | – |

## Bewusst nicht umgesetzt (Sicherheitsentscheidung)

* Web-Push (Phase 5.6 vorbereitet: Kanal-Schnittstelle `NotificationChannel`), E-Mail und Push-Dienste Dritter.
* Öffentliche oder anonyme Freigabelinks, Föderation, externe Identitätsanbieter.
* Personensuche oder -vorschläge.

## Restrisiken

* Mitglieder können Gesehenes kopieren (Export, Bildschirmfoto). Das ist technisch nicht verhinderbar und in der Oberfläche erklärt.
* Soziale Metadaten (Freundschaften, Mitgliedschaften) sind für den Betreiber sichtbar.
* Ratenbegrenzungen sind prozesslokal (eine API-Instanz, wie bisher dokumentiert).
