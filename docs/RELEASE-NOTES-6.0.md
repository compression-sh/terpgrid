# TERPGRID 6.0.0

> Entwurf der Beschreibung für das GitHub-Release `v6.0.0`.
> - Das Release wird **nicht automatisch** veröffentlicht.
> - Der Tag wird erst nach Merge und ausdrücklicher Freigabe vom Betreiber gesetzt.

TERPGRID 6.0 ist die erste stabile Version der selbst gehosteten Grow- und Sortenplattform.

6.0 bündelt die Phasen 5.0 bis 5.9:
- private, serverseitig verschlüsselte Daten mit Sync und Offline-Nutzung;
- Zusammenarbeit in gemeinsamen Bereichen;
- einen Katalog mit 16.710 Sorten und 494 Breedern;
- Terpen-Atlas und Academy;
- einen erprobten Betrieb mit Backup, Restore-Test, Upgrade und Rollback.

Gegenüber 5.9.0-rc.1 gibt es **keine Datenbankmigration** und keine neuen Funktionen. 6.0 ist Abnahme, Bereinigung und Dokumentation.

## Höhepunkte

- **Grow-Workspace:**
  - Grows, Pflanzen, Messwerte (pH, EC, Umwelt, VPD, DLI), Journal mit Tags, Kalender, Fotos mit Foto-Studio;
  - Vergleich, Berichte (PDF), Experimente und Phänotypen.
- **Sorten und Wissen:**
  - Katalog (CI-Strains-Pro, 16.710 Sorten) mit Breeder-Verzeichnis und Genetik-Explorer;
  - 89.923 Laborproben (Smith et al. 2022, CC0) per Namensabgleich;
  - Terpen-Atlas mit 27 Verbindungen;
  - Academy mit 30 Artikeln, 32 Glossarbegriffen und 4 Lernpfaden.
- **THC Lab:** Rechner für Edibles und Rauchwaren; Laborberichte.
- **Zusammenarbeit:**
  - Freunde über Handles; gemeinsame Bereiche mit vier Rollen;
  - Kommentare, Aktivität und Benachrichtigungen;
  - Entzug wirkt sofort.
- **Konto und Sicherheit:**
  - Argon2id, Zwei-Faktor (TOTP), Passkeys, Wiederherstellungscodes;
  - Sitzungsverwaltung; Datenschutz-Center mit Export und Löschung.
- **Mobil und offline:**
  - installierbare App;
  - Offline-Nutzung nur nach ausdrücklicher Freigabe je Gerät;
  - getrennte Kopien je Konto; Abmelden löscht die lokale Kopie.

## Sicherheit und Datenschutz

- Inhalte sind **serverseitig** mit AES-256-GCM verschlüsselt: in Datenbank, Dateispeicher und Backup. Schlüssel je Konto und je Bereich, verpackt mit dem Master-Key des Servers.
- **Keine Ende-zu-Ende-Verschlüsselung:** Wer Server und Master-Key kontrolliert, kann entschlüsseln.
- PostgreSQL Row-Level Security; die Laufzeitrolle hat kein `BYPASSRLS`.
- Keine offenen kritischen oder hohen Befunde. Details: `docs/RELEASE-6.0-SECURITY.md`.

## Änderungen seit 5.9.0-rc.1

- Version 6.0.0 in Oberfläche, API, Service Worker und Image-Tags.
- `install.sh` setzt bei Neuinstallationen die Version aus `server/package.json`. Bisher bekamen frische Installationen den veralteten Wert aus `.env.example`.
- Anmeldung robuster: Eine abgebrochene Serverantwort, etwa beim Neuladen der Seite, führt nicht mehr zu einem Fehler in der App.
- Code-Qualität:
  - 9 Lint-Warnungen behoben (Effekt-Abhängigkeiten in Zeitachse und Entdecken), ohne Verhaltensänderung;
  - ungenutzten Code entfernt.
- Neue Dokumentation: Upgrade-Leitfaden, Wartung, Geräteabnahme, Sicherheitsabnahme, bekannte Grenzen.

## Upgrade

- Aus 5.7, 5.8 oder 5.9: ohne Migration, Rollback ohne Restore möglich. Getestet in isolierten Docker-Installationen.
- Anleitung: **`docs/UPGRADE-6.0.md`**.

```bash
cd /opt/terpgrid/deploy
./preflight.sh && backup/restore-test.sh latest
./upgrade.sh v6.0.0
./status.sh --verify
```

## Bekannte Grenzen

`docs/RELEASE-6.0-KNOWN-LIMITATIONS.md`, kurz:
- Die Abnahme auf physischen Geräten steht beim Betreiber aus.
- Keine quantitativen, breeder-spezifischen Terpenprofile und keine lizenzierten Sortenfotos.
- Web-Push, Katalog-Aktualisierungstimer und automatische Schlüsselrotation sind bewusst nicht enthalten.

## Images

- TERPGRID veröffentlicht keine Images in einer Registry.
- `upgrade.sh` baut `terpgrid-api:6.0.0` und `terpgrid-web:6.0.0` auf dem Server aus dem Quellcode des Tags.
- Basis-Images sind gepinnt: `node:22.21-alpine3.22`, `caddy:2.10.2-alpine`, `postgres:16.10-alpine3.22`.
