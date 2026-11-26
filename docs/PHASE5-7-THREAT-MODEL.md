# TERPGRID – Bedrohungsmodell 3.0 (einheitlich)

Stand: 5.7.0-rc.1.

Fasst die bisherigen Modelle zusammen und ersetzt sie als Überblick:
- `THREAT-MODEL.md` (Basis, T1–T32);
- `PHASE5-5-THREAT-MODEL.md` (Zusammenarbeit);
- `PHASE5-6-MOBILE-THREAT-MODEL.md` (mobil/offline).

Die Detailtabellen dort bleiben gültig.

**Architektur in einem Satz:** Selbst gehostete Instanz (Caddy → API → PostgreSQL + Dateispeicher). Inhalte werden **serverseitig** mit AES-256-GCM verschlüsselt, mit Schlüsseln je Konto, je Bereich und je Profil, die mit einem Master-Key verpackt sind. Der Server hält den Master-Key, deshalb gibt es **keine** Ende-zu-Ende-Verschlüsselung.

## 1. Vertrauensgrenzen

```
[Browser/Gerät] ──TLS──▶ [Caddy] ──intern──▶ [API] ──intern (ohne Internet)──▶ [PostgreSQL]
   │  IndexedDB, Web Storage, SW-Cache           │ ├─▶ [Dateispeicher (Volume, Chiffrat)]
   │                                             │ ├─▶ [Secrets: Master-Key, HMAC, DB-Passwort (read-only)]
   │                                             │ └─egress─▶ [StrainAPI / CannaLib (nur öffentliche Sortendaten)]
   └─ andere Tabs desselben Browsers             └─▶ [Backup: restic (zusätzlich verschlüsselt) → Offsite]
```

| Grenze | Was sie trennt | Durchgesetzt durch |
| --- | --- | --- |
| B1 Internet ↔ Caddy | Fremde ↔ Instanz | TLS, HSTS, Security-Header, Größenlimits |
| B2 Caddy ↔ API | Öffentlich ↔ Anwendung | Nur `/api/*`, internes Netz, `X-Forwarded-For` nur von Caddy |
| B3 Anonym ↔ angemeldet | Fremde ↔ Konten | Argon2id, 2FA/Passkey, Session-Token (nur Hash gespeichert), CSRF-Token, Origin-Prüfung |
| B4 Konto ↔ Konto | Private Daten | `user_id` nur aus der Session, RLS (`app.user_id` je Transaktion), AAD bindet Konto/ID |
| B5 Mitglied ↔ Bereich | Gemeinsame Inhalte | Rechtematrix `can()`, Mitgliedschaft je Request neu geladen, RLS, Bereichsschlüssel |
| B6 API ↔ Datenbank | Laufzeit ↔ Schema | Laufzeitrolle ohne Owner-Rechte, ohne BYPASSRLS; Migrationen nur im eigenen Job |
| B7 Anwendung ↔ Betreiber | Inhalte ↔ Infrastruktur | Verschlüsselung ruhender Daten; **endet** beim laufenden Server (Master-Key im Prozess) |
| B8 Gerät ↔ andere Person am Gerät | Arbeitskopie | Opt-in-Offline, Löschen beim Abmelden/Kontowechsel, Tab-übergreifendes Abmelden; **keine** Browser-Verschlüsselung |
| B9 Instanz ↔ externe Anbieter | Öffentliche Sortendaten | Feste Ziele, keine Nutzerdaten, keine Weiterleitungen, Größen- und Zeitlimits |

## 2. Akteure, Schutz und Grenzen

| Akteur | Wogegen TERPGRID schützt | Wogegen nicht |
| --- | --- | --- |
| **Externe Angreifende** | Raten von Zugangsdaten (Argon2id, Backoff), Enumeration bei Anmeldung, Wiederherstellung und Freundschaftsanfragen, CSRF, XSS (CSP, React-Escaping), SSRF (feste Proxy-Ziele), bösartige Uploads (Signaturprüfung, Sandbox-CSP) | Verteilte Angriffe werden nur verlangsamt; bei offener Registrierung verrät die Verfügbarkeitsprüfung belegte Benutzernamen (R-01) |
| **Böswillige angemeldete Nutzende** | Zugriff auf fremde Daten (BOLA/IDOR, RLS), Rechteausweitung, Massenzuweisung, Pfadmanipulation, Ressourcenerschöpfung (Quotas, Limits) | – |
| **Unberechtigte Mitglieder** (Ansehen/Kommentieren) | Schreiben, Mitgliederverwaltung, eingeschränkte Einträge und Dateien, Exporte ohne Freigabe | Gesehenes kopieren (Bildschirmfoto, Export bei Freigabe) |
| **Entfernte Mitglieder** | Weiterer Zugriff (404 sofort), Einspielen alter Offline-Änderungen | Früher heruntergeladene Kopien lassen sich nicht fernlöschen |
| **Übernommenes Konto** | Begrenzung durch 2FA/Passkey; Sitzungsübersicht mit Anmeldemethode; „Alle Sitzungen beenden“; 2FA-Aktivierung und Passwortwechsel beenden andere Sitzungen; Sicherheitsverlauf | Wer Passwort **und** zweiten Faktor hat, ist das Konto |
| **Gestohlenes gesperrtes Gerät** | Server-Sitzungen widerrufbar; ohne Offline-Freigabe keine dauerhafte Kopie | Mit Offline-Freigabe liegt eine unverschlüsselte Kopie im Browser – Schutz nur durch Gerätesperre und Geräteverschlüsselung |
| **Geteiltes Gerät** | „Geteiltes Gerät“: Kopie wird beim Abmelden immer gelöscht; Kontowechsel bereinigt; Tab-übergreifendes Abmelden (auch offline) | Wer den entsperrten, angemeldeten Browser bedient, ist für die App die angemeldete Person |
| **Datenbankdiebstahl** | Inhalte, Profile, Bereiche, Kommentare, 2FA-Geheimnisse verschlüsselt; Passwörter Argon2id; Tokens und Codes gehasht | Metadaten lesbar: Kennungen, Zeitpunkte, Anzahlen und Größen, Handles, Rollen, Freundschafts- und Mitgliedschaftsbeziehungen |
| **Backup-Diebstahl** | restic-Verschlüsselung **plus** Inhaltsverschlüsselung; beschädigte oder manipulierte Backups werden erkannt | Wer Backup, restic-Passwort **und** Master-Key besitzt, kann alles lesen |
| **Kompromittiertes Admin-Konto** | Keine Admin-Funktion liefert Inhalte, Schlüssel, Hashes, Tokens oder Codes (getestet); Admins können Konten sperren und Einladungen verwalten, aber keine Daten lesen | Sperren und Einladungen sind missbrauchbar (Verfügbarkeit) |
| **Bösartiger importierter Datensatz** (Katalog) | Import aus lokaler Datei mit Prüfsumme, transaktional, nur öffentliche Tabellen, keine Ausführung von Inhalten, React-Escaping | Falsche Fakten im Katalog (Datenqualität, keine Sicherheitsgrenze) |
| **Kompromittierte Abhängigkeit** | Wenige Laufzeitabhängigkeiten (9 Frontend, 8 Server), Lockfiles, `npm audit` in CI, gepinnte Actions (SHA), SBOM | Eine bösartige Version einer genutzten Bibliothek hätte die Rechte der App |
| **Server-Kompromittierung** (Root, Laufzeit) | Härtung (non-root, read-only, keine Capabilities, internes DB-Netz) erschwert, verhindert aber nicht | **Nicht abgedeckt:** Der laufende Server hält den Master-Key und kann alle Inhalte entschlüsseln |
| **Browser-Kompromittierung** (Schadsoftware, bösartige Erweiterung) | – | **Nicht abgedeckt:** Zugriff auf alles, was die angemeldete App anzeigt oder speichert |
| **Offline-Datenexposition** | Opt-in, Löschung beim Abmelden und Kontowechsel, nie private Daten im SW-Cache, Schlüssel nie im Browser | Freigegebene Kopien sind unverschlüsselt; nicht übertragene Änderungen bleiben bis zur Übertragung (siehe Offline-Dokument) |

## 3. Was ausdrücklich **nicht** behauptet wird

- Keine Ende-zu-Ende-Verschlüsselung. Schutz gegen einen vollständig kompromittierten Server besteht nicht.
- Keine Fernlöschung heruntergeladener oder offline gespeicherter Kopien.
- Ein Offline-Gerät kann eine Serversitzung nicht sofort beenden. Das Abmelden wird beim nächsten Serverkontakt nachgeholt.
- Keine Verschlüsselung im Browser.
- Keine Konformität oder Zertifizierung. Automatisierte Tests decken nur einen Teil der Kriterien ab.

## 4. Verweise

- Befunde: `PHASE5-7-SECURITY-REPORT.md`
- Nachweise je Anforderung: `PHASE5-7-SECURITY-MATRIX.md`
- Kryptografie: `PHASE5-7-ENCRYPTION-AUDIT.md`
- E2EE-Optionen: `PHASE5-7-E2EE-FEASIBILITY.md`
- Gerät/Browser: `PHASE5-7-OFFLINE-SECURITY.md`
- Host: `PHASE5-7-VPS-HARDENING.md`
- Wiederherstellung: `PHASE5-7-DISASTER-RECOVERY.md`
