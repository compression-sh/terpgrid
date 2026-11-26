# Phase 5.5 – Architektur-Audit: Profile, Freunde, Teilen, Zusammenarbeit

Stand: 26.11.2026 · Grundlage: `main` = `dd3a73c` (5.4.0-rc.1) · Nur Bestandsaufnahme, keine Implementierung.

Ziel: Vor Phase 5.5 festhalten, was bereits existiert (wiederverwenden statt duplizieren), wo die Architektur heute bewusst Grenzen zieht und welche Entscheidungen vor dem Start zu treffen sind.

## 1. Kurzfazit

| Bereich | Heute | Wiederverwendbar |
| --- | --- | --- |
| Private Nutzerprofile | Nur `users.display_name` (≤ 60 Zeichen, geprüft), änderbar über `PATCH /api/account` | `displayNameProblem` (`server/src/identity.ts`), Profilbereich in `AccountPage.tsx` |
| Freundschaften | **nicht vorhanden** | Einladungs-Token-Muster (`invitations`: nur Hash gespeichert, Ablauf, Widerruf, einmalig) |
| Teilen von Ressourcen | **nicht vorhanden**; jede Zeile gehört genau einem Konto | Envelope-Verschlüsselung, AAD-Bindung, Schlüsselgenerationen, Export |
| Gemeinsame Projekte | **nicht vorhanden** | Grow-Workspace, Sync-Engine mit Drei-Wege-Merge |
| Granulare Berechtigungen | Nur Rollen `user`/`admin` (`requireSession`, `requireAdmin` in `server/src/http.ts`) | RLS-Muster mit `app.user_id` (`withUser` in `server/src/db.ts`) |
| Verschlüsselte geteilte Datensätze | **nicht vorhanden**; Model A (serververwaltet), **keine E2EE** | `crypto.ts` (AES-256-GCM, `wrapDekGen`), `rotate-keys`, `verify-data` |
| Private Benachrichtigungen | **nicht vorhanden** in der App. Kalender sagt ausdrücklich „Keine Push-Benachrichtigungen“; `terpgrid-notify@` ist nur für Betreiber (Backup-Fehler) | `GET /api/sync/summary` als Abfragepunkt, `audit_events`-Muster |
| Datenschutz-Center | Vorhanden (statisch beschreibend) mit Export, Kontolöschung, Sitzungen, Gerätemodus | `PrivacyCenter`, `DeviceSection`, `DeleteSection` in `AccountPage.tsx`; `GET /api/account/export`; `DELETE /api/account` |

**Es gibt keine bestehende Teilen-, Freundes- oder Benachrichtigungslogik, die dupliziert werden könnte.** Phase 5.5 baut aber auf fünf vorhandenen Bausteinen auf, die nicht neu erfunden werden dürfen: Token-Muster, Envelope-Krypto, RLS, Sync-Engine und Datenschutz-Center.

## 2. Bestand im Detail

### 2.1 Konten und Profile

* **Tabelle `users`** (`server/migrations/001_init.sql`) mit den Feldern `login_name` (Benutzername oder generierte Konto-ID), `login_kind`, `display_name`, `role`, `status`, `storage_bytes` und Zeitstempeln.
  * Es gibt weder E-Mail noch Klarname, das ist so gewollt.
* **`login_name` ist Teil der Anmeldedaten.** Er darf anderen Nutzern **nicht** angezeigt werden: Bei anonymen Konten wäre er die halbe Zugangsinformation und würde Passwort-Raten erleichtern.
  * Für Profile braucht es deshalb ein eigenes, frei wählbares und änderbares Handle, getrennt vom Login.
* **Anzeigename:** Wird NFKC-normalisiert; Steuer- und Bidi-Zeichen sind verboten. Diese Prüfung bleibt die Grundlage jeder öffentlich sichtbaren Profilzeile.
* **`GET /api/auth/username-available`** existiert für die Registrierung (ratenbegrenzt).
  * Eine Nutzersuche gibt es bewusst nicht. Eine Suche nach Personen würde Konto-Enumeration ermöglichen.

### 2.2 Einladungen

* **Tabelle `invitations`:** `token_hash` (Token selbst nie gespeichert), `expires_at`, `used_at`, `used_by`, `revoked_at`, `note`.
* **Routen:** `GET/POST/DELETE /api/admin/invites` (nur Admin) und `GET /api/auth/invite/:token`.
* **Wiederverwendung:** Dasselbe Muster eignet sich für Freundschafts- und Projekteinladungen per Link oder Code, mit Hash, Ablauf, Einmaligkeit und Widerruf. Nicht kopieren, sondern als gemeinsamen Helfer herausziehen.

### 2.3 Private Datensätze und Dateien

* **`records`:** Schlüssel `(user_id, store, id)` mit `version`, `seq` (globale Sequenz) und `payload` (AES-256-GCM).
  * `store` ist per CHECK auf 12 Bereiche begrenzt; das spiegelt `SYNC_STORES` in `server/src/stores.ts`.
* **`files`:** Schlüssel `(user_id, kind, id, variant)`, verschlüsselte Blobs im Volume, Papierkorb `file_trash`.
* **RLS:** `records_owner` und `files_owner` mit `FORCE ROW LEVEL SECURITY` und der Bedingung `user_id = app.user_id`, gesetzt je Transaktion durch `withUser`.
* **Schlüssel:** Jedes Konto hat einen DEK pro Generation (`user_keys`), verpackt mit dem Master-Key (KEK).
* **AAD:** `rec|v1|<userId>|<store>|<id>` bzw. `file|v1|<userId>|…`. **Ein Chiffrat ist an das Konto gebunden.** Ein Datensatz kann deshalb technisch nicht einfach „mitgelesen“ werden, ohne mit dem DEK des Eigentümers entschlüsselt zu werden.
* **Folge für das Teilen:** Teilen kann **nicht** durch eine gelockerte RLS-Policy auf `records` umgesetzt werden. Das würde
  1. die Eigentümer-Isolation aufweichen, die heute durch Isolationstests abgesichert ist,
  2. den DEK des Eigentümers in fremde Anfragen ziehen,
  3. Widerruf und Schlüsselrotation verkomplizieren.

### 2.4 Synchronisation (Client)

* **Sync-Engine** (`src/lib/sync/engine.ts`, `merge.ts`): Push/Pull gegen `/api/sync/push` und `/api/sync/changes` mit einem Cursor (`seq`) je Konto, Drei-Wege-Merge und Konfliktauflösung.
* **Lokale Kopie:** Je Konto eine eigene IndexedDB, unverschlüsselt. Der Gerätemodus „Geteiltes Gerät“ löscht sie beim Abmelden.
* **Erweiterung für geteilte Bereiche:** Ein zusätzlicher Cursor je Bereich ist nötig; die Daten liegen in einer eigenen lokalen Datenbank je Bereich und werden vom Gerätemodus mit gelöscht. Merge-Logik und Konfliktdialog lassen sich wiederverwenden.

### 2.5 Berechtigungen

* Heute gibt es nur `role in ('user','admin')`.
  * `requireSession` prüft die Anmeldung.
  * `requireAdmin` verlangt die Rolle `admin`.
  * `requireReauth`-ähnliche Flüsse (`/api/auth/reauth`) schützen kritische Aktionen.
* **Admins sehen keine Inhalte.** Das ist eine organisatorische Grenze (Model A) und muss für geteilte Inhalte genauso gelten.

### 2.6 Verschlüsselungsmodell

* `docs/E2EE-DECISION.md`: **Model A ist umgesetzt.** Der Server-Betreiber könnte technisch entschlüsseln. E2EE wurde bewertet und zurückgestellt.
* Das Dokument hält ausdrücklich fest, dass Teilen unter E2EE asymmetrische Schlüssel je Konto (z. B. X25519) erfordern würde.
* **Für 5.5 gilt:** Geteilte Datensätze sind „verschlüsselt auf dem Server gespeichert“, nicht Ende-zu-Ende. Das Datenschutz-Center muss das für geteilte Inhalte genauso ehrlich sagen.

### 2.7 Benachrichtigungen

* In der App gibt es keine Benachrichtigungen.
  * Erinnerungen erscheinen nur bei geöffneter App; für Geräte-Benachrichtigungen gibt es den ICS-Export (`CalendarPage.tsx`).
* **`terpgrid-notify@.service` und `NOTIFY_CMD`** melden dem Betreiber fehlgeschlagene Units. Sie dürfen nie für Nutzerbenachrichtigungen verwendet werden: Die Nachricht ginge an einen externen Dienst des Betreibers.
* Web-Push würde VAPID-Schlüssel und die Push-Dienste der Browserhersteller erfordern. Damit gelangen Metadaten an Dritte; das braucht eine eigene Entscheidung.

### 2.8 Datenschutz-Center und Kontoverwaltung

* **`PrivacyCenter`** (`src/pages/account/AccountPage.tsx`) beschreibt statisch, was wo wie gespeichert ist.
* **Vorhandene Funktionen:**
  * vollständiger Export (`GET /api/account/export`, entschlüsselt je Datensatz),
  * Kontolöschung (`DELETE /api/account`: löscht Dateien, Datensätze und Konto, Krypto-Shredding über Schlüssel),
  * Sitzungen einzeln oder alle beenden, Gerätemodus, Passkeys, TOTP, Recovery-Codes.
* **Sicherheitsprotokoll `audit_events`:** feste Ereignistypen (`AuditType` in `server/src/audit.ts`), IP nur als gekürzter Hash, 180 Tage.

## 3. Architektur-Empfehlung (Vorschlag, nicht umgesetzt)

1. **Profile:** eigene Tabelle `profiles` (1:1 zu `users`).
   * Felder: Handle (eindeutig, änderbar, nie `login_name`), Anzeigename, optionale Kurzbeschreibung, Sichtbarkeit (`private` als Standard, `friends`).
   * Keine öffentliche Profilseite und keine Personensuche. Freunde finden sich nur über Einladungslink oder Code.
2. **Freundschaften:** `friend_invites` (Token-Muster aus 2.2) und `friendships` (Paar, Status, Zeitpunkt).
   * Beidseitige Zustimmung, jederzeit lösbar.
   * Blockieren verhindert neue Einladungen.
3. **Geteilte Bereiche („Spaces“) statt geteilter Einzelzeilen:**
   * Tabellen: `spaces` (Eigentümer, Typ z. B. `grow-project`), `space_members` (Rolle `owner`/`editor`/`commenter`/`viewer`), `space_keys` (eigener DEK je Bereich und Generation, mit dem KEK verpackt wie `user_keys`), `space_records` und `space_files` mit AAD `srec|v1|<spaceId>|<store>|<id>`.
   * RLS über Mitgliedschaft: `EXISTS (SELECT 1 FROM space_members WHERE space_id = … AND user_id = app.user_id)`, schreibend zusätzlich nach Rolle.
   * Teilen heißt: Der Eigentümer legt eine Kopie bzw. Verschiebung in einen Bereich an. Private `records` bleiben unverändert und streng isoliert.
   * Beim Widerruf wird die Mitgliedschaft entfernt. Optional rotiert der Bereichsschlüssel, die vorhandene Rotationslogik wird wiederverwendet.
4. **Gemeinsame Projekte:** ein Bereichstyp `grow-project` mit den vorhandenen Stores `grows`/`plants`/`activities`/`photos`.
   * Die UI des Grow-Workspace wird wiederverwendet, nicht dupliziert.
5. **Berechtigungen:** eine zentrale Prüffunktion `requireSpaceRole(spaceId, min)` in `http.ts`, zusätzlich RLS als zweite Grenze.
   * Isolationstests analog zu den bestehenden: Nichtmitglied, entferntes Mitglied, falsche Rolle, Admin ohne Mitgliedschaft.
6. **Benachrichtigungen:** Tabelle `notifications` je Empfänger.
   * RLS nur für den Empfänger.
   * Inhalt nur als Verweis (Ereignistyp und Ressourcen-ID), keine Klartextinhalte geteilter Daten; Aufbewahrung begrenzt (z. B. 90 Tage).
   * Abruf über den vorhandenen Sync-Zyklus. Kein Web-Push ohne gesonderte Freigabe.
7. **Datenschutz-Center erweitern statt neu bauen:**
   * Abschnitte „Wer sieht was“ (Profil-Sichtbarkeit, Freunde, Bereiche, Mitglieder), „Freigaben widerrufen“ und „Benachrichtigungen“.
   * Export einschließlich eigener Bereiche.
   * Kontolöschung mit Regeln für Bereiche, deren Eigentümer man ist: übertragen oder löschen.
8. **Migrationen:** ab `008_…`, additiv. Bestehende Tabellen bleiben unverändert, bis auf neue Werte in `AuditType`.
9. **Betrieb:** `rotate-keys` muss Bereichsschlüssel mitverpacken; `verify-data` und `restore-test.sh` müssen Bereiche mitprüfen; Backups enthalten sie automatisch.

## 4. Vor dem Start zu entscheiden

1. **Profil-Handle:** frei wählbar oder automatisch erzeugt? Sichtbar nur für Freunde?
2. **Teilen:** Kopie in einen Bereich oder Verschieben mit Eigentümerwechsel des Bereichs?
3. **Rollen:** Reichen `owner`/`editor`/`viewer`, oder ist `commenter` nötig (dann bräuchte es zusätzlich Kommentare als neuen Store)?
4. **Benachrichtigungen:** nur in der App (Empfehlung) oder zusätzlich Web-Push, mit Metadaten bei den Push-Diensten der Browserhersteller?
5. **E2EE:** bleibt für 5.5 außen vor (Empfehlung, gemäß E2EE-DECISION) oder wird vorgezogen? Das wäre ein deutlich größerer Umfang.
6. **Instanzgrenze:** Teilen nur innerhalb derselben selbst gehosteten Instanz (Empfehlung), keine Föderation.

## 5. Arbeitsregeln für Phase 5.5

* Start von aktuellem `main` (`dd3a73c`), **keine gestapelten PRs** ohne ausdrückliche Freigabe.
* Kein automatischer Merge, kein Deployment, keine Branch-Löschung, keine aktivierten Produktions-Jobs.
* Private `records`/`files` und ihre Isolationstests bleiben unverändert gültig; jede Teilen-Funktion braucht eigene Isolationstests.
