# Phase 5.5 – Verschlüsselung gemeinsamer Bereiche und Profile

Stand: 5.5.0-rc.1 · Modell: **serverseitige Verschlüsselung (Model A)** wie in `docs/E2EE-DECISION.md`. **Keine Ende-zu-Ende-Verschlüsselung.** Der Server-Betreiber könnte technisch entschlüsseln; E2EE bleibt einer eigenen Sicherheitsphase vorbehalten.

## Schlüsselhierarchie

```
Master-Key (KEK, Datei/Docker-Secret, versioniert 1:…,2:…)
├── Kontoschlüssel je Konto und Generation (user_keys)        ← unverändert seit 4.0
│     ├── private Datensätze, Dateien, TOTP                    ← unverändert
│     └── NEU: private Spitznamen (friend_settings), Blockierungs-Labels (blocks)
├── NEU: Bereichsschlüssel je Bereich und Generation (space_keys)
│     ├── Bereichs-Metadaten (Name, Beschreibung, Akzent)
│     ├── Bereichsdatensätze (space_records), Bereichsdateien (space_files)
│     └── Kommentare (space_comments)
└── NEU: Profilschlüssel je Konto (profiles.key_wrapped)
      └── Profilangaben (Anzeigename, Bio, Akzent, Avatar, Favoriten, Interessen)
```

| Schlüssel | Erzeugung | Speicherung | AAD der Verpackung |
| --- | --- | --- | --- |
| Bereichsschlüssel | `crypto.randomBytes(32)` je Bereich und Generation | `space_keys.dek_wrapped`, AES-256-GCM mit KEK | `sdek|v1|<spaceId>|<gen>` |
| Profilschlüssel | `crypto.randomBytes(32)` je Konto | `profiles.key_wrapped`, AES-256-GCM mit KEK | `pkey|v1|<userId>|<gen>` |

## Gebundene Metadaten (AAD) der Inhalte

| Inhalt | Schlüssel | AAD |
| --- | --- | --- |
| Bereichsdatensatz | Bereichsschlüssel | `srec|v1|<spaceId>|<store>|<id>` |
| Bereichsdatei (Foto, Dokument) | Bereichsschlüssel | `sfile|v1|<spaceId>|<kind>|<id>|<variant>` |
| Kommentar | Bereichsschlüssel | `scom|v1|<spaceId>|<commentId>` |
| Bereichs-Metadaten | Bereichsschlüssel | `smeta|v1|<spaceId>` |
| Profil | Profilschlüssel | `prof|v1|<userId>` |
| Spitzname | Kontoschlüssel des Besitzers | `nick|v1|<ownerId>|<friendId>` |
| Blockierungs-Label | Kontoschlüssel des Blockierenden | `blk|v1|<blocker>|<blocked>` |

Ein Chiffrat kann deshalb weder in einen anderen Bereich, an eine andere Ressource noch zu einem anderen Konto verschoben werden, ohne dass die Entschlüsselung fehlschlägt. Format und Algorithmus sind identisch zu privaten Daten: `0x01 ‖ Nonce(12) ‖ Tag(16) ‖ Chiffrat`, AES-256-GCM, Node `crypto`/OpenSSL, keine Eigenbauten.

Idempotenz und Konflikterkennung nutzen wie bei privaten Daten einen HMAC über den kanonischen Inhalt. Dessen Schlüssel ist ein per HKDF abgeleiteter Unterschlüssel des Bereichsschlüssels (`terpgrid:space-record-mac`).

## Trennung von Konto- und Bereichsschlüsseln

* **Teilen als Kopie oder Verschieben** läuft vollständig serverseitig im Kontext des Besitzers: Mit dessen Kontoschlüssel entschlüsseln, mit dem Bereichsschlüssel neu verschlüsseln. Mitglieder erhalten nie einen Kontoschlüssel und nie ein Chiffrat unter einem Kontoschlüssel.
* **Kein Schlüssel verlässt den Server.** Clients erhalten nur Klartext, den ihre Rolle laut Rechtematrix lesen darf, über TLS. Es gibt keine Schlüssel im Browser und keine Bereichsschlüssel in API-Antworten.
* **Profile haben einen eigenen Schlüssel.** Freunde lesen damit nur das Profil (der Server filtert Felder nach Sichtbarkeit). Eine Kompromittierung eines Profilschlüssels betrifft keine privaten Daten.
* **Spitznamen und Blockierungs-Labels** sind private Notizen des Besitzers und daher mit seinem Kontoschlüssel verschlüsselt.

## Lebenszyklus und Rotation

| Vorgang | Wirkung | Werkzeug |
| --- | --- | --- |
| Bereich anlegen | Generation 1 erzeugt, sofort aktiv | `POST /api/spaces` |
| Bereichsschlüssel erneuern | Neue Generation wird aktiv, die alte wird „retiring“. Datensätze, Dateien (neuer Blob, alter in den Papierkorb) und Kommentare werden in kleinen Transaktionen umgeschlüsselt, dann Metadaten. Danach folgt eine vollständige Testentschlüsselung, erst dann ist die alte Generation „retired“. Der Vorgang ist fortsetzbar. | Eigentümer im Bereich (Re-Auth) bzw. `POST /api/spaces/:id/rotate-key` |
| Master-Key-Rotation | `rotate-keys` verpackt nun zusätzlich alle Bereichsschlüssel (alle Generationen) und alle Profilschlüssel neu, je Bereich bzw. Konto im RLS-Kontext | `node dist/cli.js rotate-keys` |
| Kontoschlüssel-Rotation | `rotate-user-keys` verschlüsselt zusätzlich Spitznamen und Blockierungs-Labels um; ausgemusterte Generationen werden nur gelöscht, wenn auch diese sie nicht mehr nutzen | `rotate-user-keys`, `purge-retired-keys` |
| Bereich löschen | Schlüssel, Inhalte, Dateieinträge werden gelöscht; Blobs kommen in den Papierkorb. Verbleibende Blob-Reste und Backups sind ohne Bereichsschlüssel nicht mehr lesbar (Krypto-Shredding nach Ablauf der Backup-Aufbewahrung). | Eigentümer (Re-Auth, Namensbestätigung) |
| Integritätsprüfung | `verify-data` entschlüsselt zusätzlich jedes Profil, jeden Spitznamen und jedes Label sowie je Bereich Metadaten, Datensätze, Dateien und Kommentare | `verify-data`, `restore-test.sh` |

**Warum ein Mitglied beim Entfernen keine Rotation braucht:** Bereichsschlüssel erreichen nie einen Client. Ein entferntes Mitglied besitzt also keinen Schlüssel, den es behalten könnte. Der Entzug wirkt über die Autorisierung, die bei jeder Anfrage neu geprüft wird. Die Rotation dient der Schlüsselhygiene, z. B. nach einem vermuteten Datenbank- und Master-Key-Leck.

## Garantien

* Inhalte gemeinsamer Bereiche, Kommentare, Bereichsnamen und Profilangaben liegen in Datenbank und Backups nur verschlüsselt vor. Geprüft mit `verify-data` und dem isolierten Restore-Test.
* Unverschlüsselt sind nur Strukturdaten: IDs, Rollen, Zeitpunkte, Zugriffsstufen, Elternbezüge, Handle, Social-ID, Sichtbarkeitsschalter und Benachrichtigungstyp.
* Private Datensätze, Dateien und ihre Verschlüsselung sind durch Phase 5.5 unverändert. Die Prüfsumme über Chiffrat, MAC, Version und Sequenz ist vor und nach Migration 008, nach dem Teilen und nach dem Restore identisch.

## Grenzen

* **Keine E2EE:** Wer den laufenden Server vollständig kontrolliert (Root, Master-Key), kann alle Bereiche und Profile entschlüsseln. Die Administration hat dafür bewusst keine Funktion.
* **Nicht widerrufbar:** Was ein Mitglied gesehen oder exportiert hat (Download, Export-ZIP, Bildschirmfoto), kann nicht aus der Ferne entfernt werden.
* **Metadaten:** Der Betreiber sieht, wer mit wem befreundet ist und wer in welchem Bereich welche Rolle hat. Inhalte sieht er nicht ohne Master-Key.
