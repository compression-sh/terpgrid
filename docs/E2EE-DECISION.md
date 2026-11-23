# Entscheidung: Verschlüsselungsmodell

**Status:** Umgesetzt ist **Model A – serververwaltete Verschlüsselung at rest**. **Ende-zu-Ende-Verschlüsselung (E2EE) ist nicht umgesetzt** und wird von TERPGRID nicht behauptet.

## Model A (umgesetzt)

* **Algorithmus:** AES-256-GCM (Node `crypto`, OpenSSL), 96-Bit-Zufalls-Nonce je Verschlüsselung, 128-Bit-Tag.
* **Envelope:** Jeder Benutzer hat einen zufälligen 256-Bit-Daten-Schlüssel (DEK). Der DEK wird mit dem Master-Key (KEK) per AES-256-GCM verpackt und mit KEK-Version in `users` gespeichert.
* **Gebundene Metadaten (AAD):** Datensätze `rec|v1|<userId>|<store>|<id>`, Dateien `file|v1|<userId>|<kind>|<fileId>|<variant>`, TOTP-Schlüssel `totp|v1|<userId>`, DEK `dek|v1|<userId>`. Ein Chiffrat kann daher nicht unbemerkt einem anderen Benutzer/Datensatz untergeschoben werden.
* **Format:** `0x01 ‖ nonce(12) ‖ tag(16) ‖ ciphertext` (versioniert).
* **Master-Key:** 32 Byte, als Datei (Docker Secret, read-only) – **nicht** in der Datenbank, **nicht** im Image, **nicht** im Git. Mehrere Versionen möglich (`1:…,2:…`), aktuelle Version konfigurierbar; `npm run keys:rotate` verpackt alle DEKs neu.
* **Verschlüsselt:** alle Datensatzinhalte (Growlogs, Pflanzen, Aktivitäten, Fotos-Metadaten, Journal, Sorten, Sammlung, Ausgaben, Erinnerungen, Berechnungen, Laborberichte, Einstellungen), alle Dateien (Fotos, Vorschaubilder, Laborberichtsdokumente), TOTP-Schlüssel.
* **Nicht verschlüsselt (Metadaten):** Benutzername/Konto-ID, Anzeigename, Store-Name und ID je Datensatz, Versions-/Zeitstempel, Dateigrößen, Session-Metadaten.

### Was passiert bei …

| Szenario | Folge |
| --- | --- |
| Datenbank-Dump gestohlen | Inhalte unlesbar ohne Master-Key; Metadaten lesbar; Passwort-Hashes nur per teurem Offline-Angriff angreifbar |
| Dateispeicher gestohlen | Unlesbar ohne DEK/Master-Key |
| Backup gestohlen | Doppelt verschlüsselt (restic + Model A); ohne restic-Passwort und Master-Key unlesbar |
| VPS vollständig kompromittiert (Root, laufender Prozess) | **Angreifer kann Daten entschlüsseln** (Master-Key ist zur Laufzeit verfügbar) und Passwörter beim nächsten Login abgreifen |
| Administrator mit Zugriff auf Secrets | **Kann technisch entschlüsseln.** Die Admin-Oberfläche bietet dafür bewusst keine Funktion; das ist eine organisatorische, keine kryptografische Grenze |
| Master-Key verloren | **Alle verschlüsselten Inhalte sind unwiederbringlich verloren.** Deshalb separate, offline gesicherte Kopie (siehe BACKUP.md) |

## Model B – E2EE (bewertet, nicht umgesetzt)

**Ziel:** Journal, Fotos und Laborberichte nur im Browser entschlüsseln.

**Mögliches Design:** Pro Konto zufälliger Inhalts-Schlüssel im Browser; verpackt mit einem aus dem Passwort abgeleiteten Schlüssel (Argon2id/WebCrypto im Browser, *getrennt* vom Login-Hash) und zusätzlich mit einem Wiederherstellungsschlüssel; Server speichert nur verpackte Schlüssel. Login müsste dann ein PAKE-Verfahren (z. B. OPAQUE über eine geprüfte Bibliothek) nutzen, damit der Server das Passwort nie sieht – sonst ist „Zero Knowledge“ falsch.

**Auswirkungen:**
* Passwortänderung → Schlüssel neu verpacken (machbar); Passwort-Recovery ohne Wiederherstellungsschlüssel → **Datenverlust** (Recovery-Codes stellen dann nur den Login, nicht die Inhalte wieder her).
* Serverseitige Suche, Vorschaubilder, Quotas nach Inhalt, Admin-Hilfe bei Problemen: entfallen.
* Neue Geräte benötigen Passwort oder Wiederherstellungsschlüssel; Schlüssel im Browser-Speicher sind an Gerätesicherheit gebunden.
* Teilen erfordert asymmetrische Schlüssel je Benutzer (z. B. X25519) – zusätzliche Komplexität.
* Ein kompromittierter Server kann manipuliertes JavaScript ausliefern – E2EE in Web-Apps schützt nur gegen passive Server-Kompromittierung.

**Entscheidung:** Für eine kleine, selbst gehostete Instanz unter Freunden bietet Model A mit gehärtetem Host den besten Kompromiss aus Sicherheit, Wiederherstellbarkeit und Wartbarkeit. E2EE wird erst eingeführt, wenn (1) eine geprüfte PAKE-Bibliothek (OPAQUE) integriert, (2) ein Wiederherstellungsschlüssel-Konzept getestet und (3) eine unabhängige Prüfung erfolgt ist. Bis dahin lautet die korrekte Aussage: **„Verschlüsselt auf dem Server gespeichert – der Server-Betreiber könnte technisch entschlüsseln.“**
