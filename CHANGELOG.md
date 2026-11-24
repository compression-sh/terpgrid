# Änderungsprotokoll

## 4.0.0-rc.1 – 24.11.2026 (Release-Kandidat, nicht veröffentlicht)

### Sicherheit
- **Passkeys (WebAuthn)** mit @simplewebauthn: Registrierung nach Re-Auth, Anmeldung ohne Kennung, mehrere Passkeys, umbenennen, entfernen; Recovery entfernt alle Passkeys.
- **Rotation des Datenschlüssels je Konto**: versionierte Generationen, fortsetzbar, geprüft, Purge nur nach Frist.
- Behoben: 2FA-Codes ließen sich mit immer neuen Anmeldevorgängen durchprobieren (jetzt kontoweite Grenze).
- Behoben: Fehlversuche eines Angreifers konnten ein Konto überall aussperren (Backoff jetzt je Kennung + IP, kontoweit erst ab 50).
- Behoben: THC-Lab-Eingaben waren für andere Konten auf demselben Gerät sichtbar (jetzt je Konto).
- Foto-Cache im Speicher wird beim Abmelden/Kontowechsel geleert; Modus „Geteiltes Gerät“.
- Proxy reicht Fehlerseiten der Sortendaten-Quellen nicht mehr durch.
- Schema-Schutz: API startet nicht mit einer neueren Datenbank (Rollback ohne Restore).

### Synchronisation
- Drei-Wege-Merge: Änderungen an verschiedenen Feldern werden automatisch zusammengeführt; echte Feldkonflikte nennen die Felder.
- THC-Lab-Entwürfe werden geräteübergreifend synchronisiert (je Rechner zusammengeführt).
- Erneute Versuche mit wachsendem Abstand bei instabiler Verbindung; klarere Statusanzeige.

### Discover
- Relevanz-Sortierung für Suchen (Live-Befund: „gelato“ liefert 225 Treffer, nur 8 mit dem Begriff im Namen).

### Betrieb
- `preflight.sh`, `upgrade.sh` (Backup-Pflicht, Health-Prüfung, `--no-build`), `rollback.sh` (Schemaprüfung), Backup-Benachrichtigung, Datei-Papierkorb für Backup-Konsistenz, System Health ohne personenbezogene Daten, Runbook und Produktions-Checkliste.
- Gemessener Ressourcenbedarf dokumentiert; Argon2id-Standard 64 MiB/t=3.

### Oberfläche
- Neue Seite „Verlauf“ (persönliche Zeitachse), „Insights“ mit Kennzahlen, Sicherheitsstatus im Konto, überarbeiteter Foto-Upload (Status je Datei, Wiederholen, Kamera), mobile Prüfung aller Routen in 6 Breiten.

### Qualität
- GitHub Actions CI (least privilege, gepinnt), ESLint, gitleaks; behoben: ICS-Export maskierte Semikolons nicht.

### Migrationen
- 002 Passkeys, 003 Schlüsselgenerationen + Datei-Papierkorb, 004 Leserecht auf den Schemastand. Upgrade von 3.0.0 getestet; Rollback auf 3.0.0 nur per Restore (siehe DEPLOYMENT.md).
