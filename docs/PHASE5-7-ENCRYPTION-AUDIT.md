# Phase 5.7 – Audit der Verschlüsselung

Stand: 5.7.0-rc.1. Geprüft wurde der tatsächliche Code (`server/src/crypto.ts`, `records.ts`, `files.ts`, `userkeys.ts`, `rotation.ts`, `keys.ts`, `collab/keys.ts`, `social/profiles.ts`) mit synthetischen Testdaten. Produktionsgeheimnisse wurden weder verwendet noch ausgegeben.

## 1. Schlüsselhierarchie

| Ebene | Schlüssel | Herkunft und Ablage | Zweck |
| --- | --- | --- | --- |
| KEK | **Master-Key(s)**, versioniert (`MASTER_KEYS=1:…,2:…`, `MASTER_KEY_CURRENT`) | Secret-Datei, read-only in den Container gemountet; **nie** in der DB, im Image, im Browser oder im Backup-Dump | Verpackt alle Datenschlüssel |
| DEK | **Kontoschlüssel** je Konto und Generation (`user_keys`: `dek_wrapped`, `kek_version`, `state`) | Zufällig (32 Byte), mit KEK verpackt; AAD `dek|v1|<user>` bzw. ab Generation 2 `dek|v2|<user>|<gen>` | Private Datensätze, Dateien, 2FA-Geheimnis, Spitznamen, Blockierungs-Labels |
| DEK | **Bereichsschlüssel** je Bereich und Generation (`space_keys`) | Zufällig, mit KEK verpackt; AAD `sdek|v1|<space>|<gen>` | Inhalte, Dateien, Kommentare, Metadaten gemeinsamer Bereiche |
| DEK | **Profilschlüssel** je Konto und Generation | Zufällig, mit KEK verpackt; AAD `pkey|v1|<user>|<gen>` | Profilangaben (getrennt vom Konto, damit Freunde nur das Profil lesen) |
| MAC | **Record-MAC-Schlüssel** | HKDF-SHA-256 aus dem jeweiligen DEK (`record-mac`) | Erkennt unveränderte Inhalte (keine unnötige Neuversion) |
| HMAC | **HMAC-Secret** → Unterschlüssel per HKDF: `recovery-codes`, `invitations`, `ip-tags`, `account-key` | Secret-Datei | Gehashte Recovery-Codes und Einladungen, nicht umkehrbare IP-Kennzeichen, Kontoschlüssel für Browser-DB-Namen |

## 2. Primitive und Format

| Prüfpunkt | Befund |
| --- | --- |
| Algorithmus | AES-256-GCM (Node `crypto`/OpenSSL), 128-Bit-Tag. Keine Eigenbauten, keine experimentellen Verfahren. |
| Nonce | 96 Bit aus `randomBytes` je Verschlüsselung. Bei der Datenmenge einer selbst gehosteten Instanz und Schlüsseln je Konto bzw. Bereich liegt die Zahl der Verschlüsselungen je Schlüssel um Größenordnungen unter der Grenze für Zufalls-Nonces (2³² empfohlenes Maximum). Test: neue Nonce je Aufruf (`crypto.test.ts`). |
| AAD | Bindet jeden Ciphertext an seinen Kontext: Konto/Bereich, Speicherbereich, ID, Variante, Generation. Ein Austausch zwischen Konten, Einträgen oder Dateien schlägt fehl (`crypto.test.ts` „bindet Benutzer, Bereich und ID“). |
| Formatversion | Erstes Byte `0x01`; unbekannte Version wird abgelehnt (vorwärtskompatibel erweiterbar). |
| Fehlerbehandlung | `CryptoError` ohne Details; die API antwortet mit einer generischen 500 ohne Stacktrace (`security57` C4). `verify-data` nennt nur Speicherbereich und ID, keine Inhalte. |
| Integrität | GCM-Tag schützt Inhalt und AAD; Manipulation von Chiffrat, Tag oder Nonce wird erkannt (`crypto.test.ts`). |
| Schlüssellänge | 32 Byte, beim Entpacken geprüft. |
| Speicherhygiene | Entpackte Schlüssel werden nach Gebrauch mit `wipe()` überschrieben (JavaScript bietet keine garantierte Speicherlöschung – Best Effort). |

## 3. Abdeckung – was ist verschlüsselt?

| Daten | Verschlüsselt | Nachweis |
| --- | --- | --- |
| Private Datensätze (alle synchronisierten Bereiche inkl. Einstellungen) | ja, Kontoschlüssel | `isolation-all.test.ts`, Klartext-Scan |
| Private Dateien (Fotos, Vorschaubilder, Labordokumente) | ja, Kontoschlüssel; Dateiname zufällig | `security57` D2, Klartext-Scan über alle Dateien |
| 2FA-Geheimnis | ja, Kontoschlüssel | `auth.test.ts` |
| Bereichsinhalte, -dateien, -kommentare, -name/-beschreibung | ja, Bereichsschlüssel | `collab.test.ts`, Klartext-Scan |
| Profilangaben (Anzeigename, Bio, Avatar, Favoriten) | ja, Profilschlüssel | `collab.test.ts` |
| Spitznamen, Blockierungs-Labels | ja, Kontoschlüssel | `collab.test.ts` |
| Passwörter | Argon2id-Hash (m = 64 MiB, t = 3 in der Compose-Vorgabe) | `auth.test.ts` |
| Session-Token, Recovery-Codes, Einladungen | SHA-256 bzw. HMAC-SHA-256 | `security57` A3 |
| **Unverschlüsselt (Metadaten)** | Kennung (Anmeldename), Rolle, Status, Zeitpunkte, Größen und Anzahlen, Speicherbereich und ID der Datensätze, Handle und Social-ID, Freundschafts- und Mitgliedschaftsbeziehungen, Rollen, Sicherheitsprotokoll (ohne Inhalte, IP nur als HMAC), öffentlicher Katalog | dokumentiert, R-02 |

**Klartext-Suche (Phase 5.7):**
- Ein neuer Test legt markierte Inhalte an: privates Journal, Bereichsname und -beschreibung, Kommentar, Foto-Inhalt.
- Danach durchsucht er **jede Zeile jeder Tabelle** (als Text, `bytea` als Hex) und **jede Datei** im Dateispeicher nach den Markierungen.
- Ergebnis: **keine Funde** (`collab.test.ts` „kein Klartext …“).

Weitere Ablageorte:

| Ablageort | Befund |
| --- | --- |
| Logs | Nur Methode, Pfad ohne Query (Einladungs-Token geschwärzt) und Status. Cookies, CSRF- und Authorization-Header werden entfernt (API und Caddy). |
| Fehlerantworten | Generisch (`security57` C4). |
| Temporäre Dateien | Uploads werden verschlüsselt mit `wx` als `.tmp-<zufall>` geschrieben und atomar umbenannt; es entsteht nie eine Klartext-Zwischendatei. Exporte entstehen im Arbeitsspeicher (fflate) und werden direkt gesendet. |
| Backup-Dumps | Enthalten dieselben Chiffrate (der Master-Key ist nicht im Dump). Der Restore-Test entschlüsselt mit dem separat aufbewahrten Master-Key. |
| Browser | Siehe `PHASE5-7-OFFLINE-SECURITY.md`: Klartext nur in der Konto-IndexedDB (unverschlüsselt, dokumentiert), nie im Service-Worker-Cache; Schlüssel nie im Browser. |

## 4. Rotation und Versionierung

| Vorgang | Verfahren | Nachweis |
| --- | --- | --- |
| **Master-Key-Rotation** | Neue Version in `MASTER_KEYS` ergänzen, `MASTER_KEY_CURRENT` erhöhen, `rotate-keys` verpackt alle Konto-, Bereichs- und Profilschlüssel neu (Inhalte bleiben unverändert). Alte Version erst nach Ablauf der Backup-Aufbewahrung entfernen. | `collab.test.ts` (Master- und Bereichsrotation), Docker-Tests früherer Phasen |
| **Kontoschlüssel-Rotation** | `rotate-user-keys`: neue Generation sofort aktiv, Umschlüsseln in kleinen Transaktionen (Zeile atomar: Inhalt und Generation), fortsetzbar, Abschluss erst nach vollständiger Testentschlüsselung, alte Generation erst per `purge-retired-keys` nach Frist entfernt | `rotation.test.ts` (unterbrochen, beschädigter Schlüssel, andere Konten unberührt, Purge) und **neu** `security57` K1: 6 parallele Schreibstapel während des Umschlüsselns – nichts verloren, 66 Einträge lesbar, `verify-data` fehlerfrei |
| **Bereichsschlüssel-Rotation** | Manuell durch den Eigentümer (`POST /api/spaces/:id/rotate-key`, empfohlen nach dem Entfernen eines Mitglieds); neue Generation, Umschlüsseln, alte Generationen bleiben bis zur Bereinigung | `collab.test.ts` |
| **Unterbrechung** | Jede Zeile trägt ihre Generation; ein Neustart setzt fort | `rotation.test.ts` |
| **Backup nach Rotation** | Backups enthalten verpackte alte und neue Generationen; deshalb alte Master-Key-Versionen bis zum Ablauf der Aufbewahrung behalten | Restore-Tests; dokumentiert in `DEPLOYMENT.md` |
| **Automatische Rotation** | **Keine** – bewusst nur manuell (Regel: keine automatische Rotation in Produktion) | – |

## 5. Befunde dieses Audits

- **Keine kryptografischen Befunde.** Keine Änderungen an Algorithmen, Formaten oder Schlüsselverwaltung nötig. Keine neuen Primitive eingeführt.
- **Hinweis (dokumentiert, keine Änderung):** Die HMAC-Unterschlüssel hängen am HMAC-Secret. Dessen Rotation macht Recovery-Codes und offene Einladungen ungültig und ändert die Kontoschlüssel der Browser-Datenbanknamen; lokale Kopien werden dann neu geladen. Das steht schon in `THREAT-MODEL.md` (T15) und `DEPLOYMENT.md`.
- **Grenze:** Der laufende Server hält den Master-Key im Speicher. Gegen eine Kompromittierung des laufenden Servers schützt die Verschlüsselung ruhender Daten nicht (siehe E2EE-Studie).
