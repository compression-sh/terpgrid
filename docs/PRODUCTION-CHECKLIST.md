# TERPGRID – Checkliste für den Produktivstart

> Das Deployment auf einen echten VPS erfolgt erst nach ausdrücklicher Freigabe durch die Betreiberin/den Betreiber. Diese Liste ist für genau diesen Moment.

## Vorbereitung
- [ ] VPS mit ≥ 2 vCPU, ≥ 2 GB RAM, ≥ 20 GB SSD (DEPLOYMENT.md → Ressourcen)
- [ ] Host gehärtet: SSH nur mit Schlüssel, kein Root-Login, ufw (22/80/443), unattended-upgrades, NTP aktiv
- [ ] Domain mit A/AAAA-Eintrag auf den VPS
- [ ] Offsite-Backup-Ziel (sftp/S3/…) erreichbar, eigenes restic-Passwort erzeugt

## Installation
- [ ] `git clone` nach `/opt/terpgrid`, gewünschte Version auschecken (`git checkout v5.0.0-rc.1`, sobald freigegeben)
- [ ] `cd deploy && ./install.sh --secrets-only`, Domain eingeben
- [ ] **Offline-Kopie** von `secrets/master_keys`, `secrets/hmac_secret` und dem restic-Passwort an zwei getrennten Orten
- [ ] `.env` prüfen: `INVITE_ONLY=true`, Argon2-Werte (mit `bench-argon2` gemessen, Ziel 50–250 ms)
- [ ] `backup/backup.env` aus der Vorlage, `chmod 600`, `NOTIFY_CMD` setzen
- [ ] `./preflight.sh` ohne Fehler
- [ ] `./install.sh` → alle Dienste „healthy“

## Nach dem Start
- [ ] `https://<domain>` lädt, Zertifikat gültig, `curl -sI https://<domain>` zeigt HSTS und CSP
- [ ] Erste Einladung per CLI, Admin-Konto registrieren, Recovery-Codes sichern, `promote`
- [ ] Admin-Konto: 2FA oder Passkey einrichten
- [ ] Optional: `./import-catalog.sh --dry-run`, dann `./import-catalog.sh` (Sortenkatalog, CC BY 4.0); Discover zeigt danach „16.710 Sorten von 494 Breedern“
- [ ] `backup/backup.sh` erfolgreich, dann `backup/restore-test.sh` erfolgreich
- [ ] systemd-Timer aktivieren: `terpgrid-backup.timer`, `terpgrid-restore-test.timer`, `OnFailure`-Benachrichtigung testen
- [ ] Admin → System Health: DB ok, Schema aktuell, keine Fehler; Admin → Übersicht: Backup „OK“
- [ ] Öffentliche Registrierung bleibt aus; Einladungen nur über vertrauliche Kanäle

## Regelmäßig
- [ ] Monatlich: Restore-Test-Ergebnis prüfen, `npm audit`/Image-Updates (Upgrade mit `./upgrade.sh`)
- [ ] Jährlich: Offline-Kopie der Schlüssel prüfen; ggf. `rotate-user-keys --all` und Master-Key-Rotation
- [ ] Nach Rotationen: `purge-retired-keys` erst nach Ablauf der Backup-Aufbewahrung
