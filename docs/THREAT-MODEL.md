# TERPGRID – Bedrohungsmodell

Basis: OWASP ASVS 5.0 (Kapitel V2 Authentifizierung, V3 Sessions, V4 Zugriffskontrolle, V5 Validierung, V6 Kryptografie, V8 Datenschutz, V12 Dateien, V13 Konfiguration) und OWASP Cheat Sheets (Password Storage, Session Management, CSRF, Authentication, File Upload, SSRF, REST Security, Docker Security).

## Schutzgüter
Growlogs, Pflanzen, Fotos (inkl. Standortbezug), Journal (Konsumangaben – besonders sensibel), Laborberichte/Dokumente, Sammlung, Zugangsdaten, Session-Tokens, Master-Key, Backups.

## Vertrauensgrenzen
1. Browser ↔ Internet ↔ Caddy (TLS) 2. Caddy ↔ API (internes Docker-Netz) 3. API ↔ PostgreSQL (internes Netz, RLS) 4. API ↔ Dateispeicher (Volume) 5. API ↔ Master-Key (Secret-Datei, read-only) 6. API ↔ externe Sortendaten-APIs 7. VPS ↔ Offsite-Backup.

## Bedrohungen und Gegenmaßnahmen

| # | Bedrohung | Maßnahme (umgesetzt) | Restrisiko |
| --- | --- | --- | --- |
| T1 | Unberechtigte Konten | Invite-only (Standard), Einladungen einmalig, ablaufend, widerrufbar, Token gehasht; Registrierungs-Rate-Limit | Wer einen gültigen Einladungslink erhält, kann ein Konto anlegen |
| T2 | Kompromittierte Zugangsdaten | Argon2id, optional TOTP oder Passkey, Sitzungsübersicht + Widerruf, „überall abmelden“, Re-Auth für sensible Aktionen, Sicherheitsstatus im Konto | Ohne 2. Faktor genügt das Passwort |
| T3 | Brute Force | Progressives Backoff je Kennung + IP, kontoweiter Backoff ab 50 Fehlversuchen, IP-Limit, Argon2-Parallelitätslimit | Verteilte Angriffe mit vielen IPs werden nur verlangsamt |
| T4 | Credential Stuffing | wie T3 + Mindestlänge 12 + Liste häufiger Passwörter; einheitliche Fehlermeldungen | – |
| T5 | Konto-Enumeration | Gleiche Antwort und vergleichbare Laufzeit für unbekannte Konten (Dummy-Hash); Registrierung meldet belegte Namen nur nach gültiger Einladung | Verfügbarkeitsprüfung des Benutzernamens verrät Existenz (bewusst, nur mit Einladung) |
| T6 | Cross-Account-Leaks / BOLA / IDOR | Benutzer-ID nur aus Server-Session; jede Abfrage `WHERE user_id = $session`; PK `(user_id, store, id)`; RLS als zweite Schicht; Isolationstests A/B | – |
| T7 | Bösartige Uploads | Allowlist, Magic-Byte-Prüfung, Größen-/Quota-Limits, zufällige Dateinamen, Speicherung außerhalb Web-Root, nie ausgeführt, `Content-Disposition`/`nosniff` bei Auslieferung; Bilder clientseitig neu kodiert (EXIF/GPS entfernt) | Serverseitig keine Neu-Kodierung (keine Bildbibliothek im Server) – nur Signaturprüfung |
| T8 | SQL-Injection | Ausschließlich parametrisierte Queries (`pg`), feste Store-Allowlist | – |
| T9 | XSS | React-Escaping, kein `dangerouslySetInnerHTML`, externe HTML nur als Text, strikte CSP (`script-src 'self'`) | Kompromittierte Abhängigkeiten |
| T10 | CSRF | `SameSite=Strict`-Cookie, Origin-Prüfung, Synchronizer-Token im Header für alle schreibenden Anfragen | – |
| T11 | Session-Hijacking | Opaque 256-Bit-Token, nur Hash in DB, `__Host-`-Cookie, `HttpOnly`, `Secure`, Rotation bei Login/Rechteänderung, Idle- und absolutes Timeout | Malware im Browser kann aktive Session nutzen |
| T12 | DB-Diebstahl | Inhalte AES-256-GCM-verschlüsselt, DEKs mit Master-Key verpackt, Master-Key nicht in der DB; Passwörter Argon2id; Tokens/Codes gehasht | Metadaten (Anzahl/Größe/Zeitpunkte der Datensätze, Store-Namen, Benutzernamen) sind lesbar |
| T13 | VPS-Kompromittierung | Nicht vollständig abwehrbar: Ein Angreifer mit Laufzeitzugriff kann Master-Key lesen und Daten entschlüsseln. Minderung: non-root, read-only FS, keine Capabilities, Secrets als Dateien, Host-Härtung | **Hoch** – siehe E2EE-DECISION.md |
| T14 | Gestohlene Backups | restic verschlüsselt (AES-256 + Poly1305); DB-Inhalte zusätzlich mit Master-Key verschlüsselt; Master-Key separat gesichert | Wer Backup **und** restic-Passwort **und** Master-Key hat, kann alles lesen |
| T15 | Geleakte Secrets | Keine Secrets im Git/Image/Bundle; `.env.example` ohne Werte; Secrets als Dateien (Verzeichnis 0700); DB-Init liest Passwörter selbst aus Secret-Dateien (nicht in der Prozessliste); Rotation dokumentiert (Master-Key-Versionen, HMAC-Secret, DB-Passwörter) | Rotation des HMAC-Secrets macht Recovery-Codes und offene Einladungen ungültig (dokumentiert) |
| T16 | Gestohlene/verlorene Geräte | Server-Sessions widerrufbar; lokale Kopie je Konto, bei Logout optional löschbar | Lokale IndexedDB-Kopie ist **nicht** verschlüsselt |
| T17 | Verlust aller Recovery-Wege | Klare Warnung bei Registrierung; Daten bleiben auf dem Server, sind aber ohne Login nicht zugänglich; kein Admin-Backdoor | Konto kann endgültig verloren sein |
| T18 | Bösartige API-Antworten | Normalisierung mit Typprüfung, HTML nur als Text, Bild-URLs nur von erlaubtem Host, Proxy mit Größen-/Typ-/Zeitlimits, Magic-Byte-Prüfung für Bilder, keine Redirects, feste Zielhosts (kein SSRF); API-Antworten mit `sandbox`-CSP | – |
| T19 | Versehentliches Löschen | Bestätigungsdialoge, Löschmarken statt hartem Löschen im Sync, Server-Backups mit Aufbewahrung | Gelöschte Daten nach Ablauf der Backup-Aufbewahrung endgültig weg |
| T20 | Fehlerhafte Migrationen | Transaktionale SQL-Migrationen, Versionstabelle, Backup vor Upgrade (dokumentiert), Client-Schema-Migration additiv | – |
| T21 | Cache-Leaks zwischen Konten | IndexedDB je Konto, Service Worker cached **keine** API-/Bildantworten, `Cache-Control: no-store` für private Antworten | Lokaler Gerätezugriff durch Dritte |
| T22 | Admin-Missbrauch | Keine UI zum Lesen fremder Inhalte; Admin-API nur aggregiert; Re-Auth | Server-Betreiber mit Shell-Zugriff kann technisch entschlüsseln (Model A) |
| T23 | Metadaten über die globale Sync-Sequenz | Cursor sind nur eigene Sequenznummern; keine fremden Inhalte | Lücken in der Sequenz verraten grob, wie viel andere Konten schreiben (gering) |
| T24 | Geheimnisse in Logs (URL-Pfade, Header) | Kein Query-String in API-Logs, Einladungs-Token im Pfad geschwärzt (API und Caddy), Cookie/Authorization/CSRF-Header entfernt, Set-Cookie entfernt | Host-Zugriff auf Docker-Logs zeigt weiterhin Zeitpunkte/Pfade |
| T25 | Gemeinsam genutzte Geräte | Datenbank je Konto, Abmelden mit optionalem Löschen der lokalen Kopie, Warnung bei ausstehenden Änderungen, Sitzungsablagen gelöscht, Service Worker cacht nur die öffentliche App-Hülle | Wer das entsperrte Gerät nutzt, sieht die lokale Kopie eines nicht abgemeldeten Kontos |
| T26 | Lieferkette (npm, Images) | Exakt gepinnte Versionen, Lockfiles, `npm audit` (0 Befunde), feste Image-Tags, mehrstufige Builds ohne Dev-Abhängigkeiten im Laufzeit-Image | Kompromittierte Upstream-Pakete bleiben ein Restrisiko |
| T27 | Stiller Import fremder Gerätedaten | Altdaten (IndexedDB/localStorage) werden nie automatisch in ein Konto übernommen – nur über den Assistenten mit Vorschau, Zielkonto und Bestätigung | – |

| T28 | 2FA-Codes durchprobieren mit bekanntem Passwort | Kontoweite Grenze für falsche TOTP-Codes über alle Anmeldevorgänge, Re-Auth und 2FA-Aktivierung (Phase 4; vorher je Vorgang 5 neue Versuche) | – |
| T29 | Aussperren fremder Konten durch Fehlversuche | Backoff je Kennung + IP; kontoweite Bremse erst ab 50 Fehlversuchen (Phase 4) | Massiv verteilte Angriffe können ein Konto bis zu 15 Min. je Stunde bremsen |
| T30 | Passkey-Missbrauch (Replay, fremde Origin, Credential-Substitution) | Prüfung durch @simplewebauthn: einmalige Challenge, Origin, RP-ID, UV, Signatur, Zähler; Credential-ID eindeutig je Konto; Re-Auth für Änderungen | Synchronisierte Passkeys liegen beim Anbieter des Passwort-Managers |
| T31 | Schlüsselverlust bei Rotation | Generationen an jeder Zeile, Rotation fortsetzbar, Prüfung vor Ausmusterung, Purge nur nach Frist und ohne Verwendung | Purge vor Ablauf alter Backups macht diese Backups für das Konto unlesbar |
| T32 | Rollback ohne Restore (DB neuer als Programm) | Schema-Schutz beim Start, rollback.sh prüft mit der Zielversion | Versionen vor 4.0 haben diese Prüfung nicht |
| T33 | Fremdinhalte der Sortendaten-Quellen (z. B. Firewall-HTML) | Proxy reicht Fehlerinhalte nie durch, nur eigenes JSON | – |
| T35 | Manipulierter Katalogdatensatz (Upstream oder Transport) | Fester Commit + SHA-256-Vergleich vor dem Import, Abbruch bei Abweichung; Validierung aller Felder, nur `https:`-Quell-URLs (DB-CHECK), Text nie als HTML gerendert, externe Links mit `noopener noreferrer nofollow` | Inhaltliche Fehler der Quelle bleiben möglich – Werte sind als Shop-Angaben gekennzeichnet |
| T36 | Katalog-API als Datenleck/Seitenkanal | Nur angemeldet; nur öffentliche Referenzdaten; App-Rolle nur `SELECT` (Test); Suchbegriffe nicht geloggt, nicht an Dritte; persönliche Favoriten nur im verschlüsselten Konto | Ein angemeldeter Nutzer kann den Katalog vollständig abfragen (gewollt, öffentliche CC-BY-Daten) |
| T37 | QR-Etiketten | QR enthält nur den App-Link mit zufälliger Datensatz-ID, keine Tokens; Anzeige erfordert Anmeldung und Besitz (Konto-Datenbank) | Wer ein Etikett sieht, erfährt Pflanzenname/Sorte, die aufgedruckt sind – Aufdruck der Sorte abschaltbar |
| T34 | Lieferkette CI | Actions per SHA, Images per Digest, `contents: read`, keine Secrets, `pull_request` statt `pull_request_target`, gitleaks | Kompromittierte Upstream-Commits hinter einem gepinnten SHA sind ausgeschlossen, neue Versionen müssen geprüft werden |

**Stand:** Alle Maßnahmen in der Spalte „umgesetzt“ sind im Code vorhanden und durch automatisierte Tests oder die dokumentierte Stack-Prüfung belegt (siehe SECURITY.md und FINAL-REPORT.md).
