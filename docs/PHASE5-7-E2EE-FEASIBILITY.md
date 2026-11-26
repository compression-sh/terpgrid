# Phase 5.7 – Machbarkeitsstudie Ende-zu-Ende-Verschlüsselung (E2EE)

Stand: 5.7.0-rc.1.

**Ergebnis:**
- In dieser Phase wurde **nichts** auf E2EE umgestellt.
- Es wurde keine experimentelle Kryptografie in Produktionscode eingeführt.
- Es wurden keine bestehenden Datensätze migriert.

Ergänzt `E2EE-DECISION.md` (Entscheidung für serverseitige Verschlüsselung, Modell A).

## 1. Ausgangslage (Modell A – heute)

Der Server verschlüsselt Inhalte mit Schlüsseln je Konto, Bereich und Profil und verpackt diese mit dem Master-Key. Damit geschützt sind:
- Datenbank- und Backup-Diebstahl;
- Zugriff über die Anwendung auf fremde Daten.

**Nicht** geschützt ist ein kompromittierter oder böswilliger Betreiber mit Zugriff auf den laufenden Server.

Funktionen, die heute **serverseitig Klartext** brauchen:

| Funktion | Warum Klartext auf dem Server | Folge bei E2EE |
| --- | --- | --- |
| Drei-Wege-Merge bei Konflikten (Sync) | Feldweiser Vergleich auf dem Server | müsste vollständig in den Client |
| Gemeinsame Bereiche: Elternbezug, Zugriffsstufen-Vererbung, Verschieben, Kopieren | Server leitet Rechte aus Inhalten ab (z. B. `growId` einer Pflanze) | Server kann Vererbung nicht mehr prüfen → Metadaten müssten unverschlüsselt bleiben oder Rechte würden nur noch im Client durchgesetzt |
| Exporte (Konto, Bereich), Restore-Test, `verify-data` | Entschlüsseln auf dem Server | Export nur im Client; Server kann Backups nicht mehr auf Lesbarkeit prüfen |
| Benachrichtigungen, Aktivitätsverlauf | Nur Metadaten, kein Inhalt | weitgehend unverändert |
| Profile für Freunde | Server entscheidet je Feld, was ein Freund sieht | Feldweise Schlüssel je Freund oder Verzicht auf Feldsteuerung |
| Wiederherstellung per Recovery-Code | Server setzt das Passwort zurück, Daten bleiben lesbar | Ohne nutzerkontrollierten Wiederherstellungsschlüssel wären **alle Daten verloren** |

## 2. Varianten im Vergleich

| | 1. Serverseitig (heute) | 2. Optionale private Tresore (Client) | 3. E2EE-Bereiche (Zusammenarbeit) | 4. Vollständige E2EE |
| --- | --- | --- | --- | --- |
| **Sicherheitsgewinn** | Schutz bei DB-/Backup-Diebstahl | Ausgewählte Inhalte (z. B. Journal, Notizen, Laborberichte, Fotos) auch vor dem Betreiber geschützt | Bereichsinhalte vor dem Betreiber geschützt | Alle Inhalte vor dem Betreiber geschützt |
| **Bleibende Risiken** | Betreiber/Serverübernahme liest alles | Metadaten (Zeitpunkte, Größen, Anzahl); bösartig ausgelieferter Client-Code (der Server liefert die App aus!); Geräteverlust ohne Sicherung | wie 2, zusätzlich Mitgliedschafts-Metadaten; entfernte Mitglieder kennen alte Schlüssel | wie 2; Web-App-Auslieferung bleibt der Schwachpunkt (der Server kann manipuliertes JavaScript ausliefern) |
| **Aufwand** | – | mittel (eigene Stores, Schlüssel je Gerät, Entsperrdialog, eigene Exporte) | hoch (Schlüsselaustausch je Mitglied, Rotation bei Entzug, Rechte teilweise nur im Client) | sehr hoch (Sync-Merge, Teilen, Verschieben, Profile, Export, Wiederherstellung – fast alles neu) |
| **Wiederherstellung** | Recovery-Code setzt Passwort zurück, Daten bleiben | Eigener Tresor-Wiederherstellungsschlüssel nötig; ohne ihn ist der Tresor verloren | Bereich bleibt lesbar, solange ein Mitglied den Schlüssel hat | Ohne Wiederherstellungsschlüssel ist alles verloren |
| **Performance** | Server ver-/entschlüsselt | Client verschlüsselt (WebCrypto AES-GCM: schnell; Fotos merkbar auf schwachen Geräten) | wie 2 plus Schlüsselverteilung | wie 2 für alles |
| **Suche** | Client-Suche über die lokale Kopie (unverändert) | Tresorinhalte nur nach Entsperren durchsuchbar | nur im Client | nur im Client (wie heute, aber nur nach Entsperren) |
| **Zusammenarbeit** | voll | Tresorinhalte nicht teilbar (oder nur per Kopie in einen normalen Bereich, dann wieder Modell A) | ja, aber serverseitige Rechteprüfung auf Inhaltsebene entfällt teilweise | wie 3 |
| **Migration** | – | Opt-in je Eintrag/Bereich; bestehende Daten bleiben in Modell A, bis die Nutzerin sie verschiebt | Neuer Bereichstyp; bestehende Bereiche bleiben | Migration aller Daten im Client nötig (alle Geräte, offline-Fälle) |

## 3. Bausteine, falls Variante 2 umgesetzt wird (Empfehlung für eine spätere Phase)

Nur mit **etablierten Primitiven** des Browsers (WebCrypto), ohne eigene Konstruktionen:

1. **Tresorschlüssel:**
   - zufällig, AES-256-GCM, im Client erzeugt;
   - nie unverpackt an den Server;
   - Inhalte mit AAD wie heute (Tresor, Speicherbereich, ID).
2. **Verpackung je Gerät oder Methode**, mehrere parallel möglich:
   - **Passphrase:** Schlüsselableitung per PBKDF2-SHA-256 mit hoher Iterationszahl (in WebCrypto verfügbar). Argon2id wäre besser, bräuchte aber eine zusätzliche, geprüfte WebAssembly-Bibliothek.
   - **Passkey mit PRF-Erweiterung:**
     - Unterstützung je Browser und Plattform uneinheitlich; muss auf echten Geräten geprüft werden. Bisher **nicht** geprüft, ohne Gerätetest nicht behaupten.
     - Liefert einen geräteseitigen Schlüssel, ohne dass TERPGRID biometrische Daten erhält.
   - **Wiederherstellungsschlüssel:** zufällig, zum Ausdrucken. Ohne ihn und ohne Gerät ist der Tresor verloren. Das muss vor dem Anlegen unmissverständlich erklärt werden.
3. **Speicherung:**
   - Der Server speichert nur verpackte Tresorschlüssel und Chiffrate (Modell A zusätzlich darüber: unschädlich, schützt Metadaten-Spalten aber nicht).
   - Sync wie heute; Merge im Client.
   - Tresor-Einträge sind vom serverseitigen Merge ausgenommen (Konflikt → Entscheidung im Client).
4. **Offline:** Entsperrter Tresorschlüssel nur im Arbeitsspeicher. Beim Sperren oder Abmelden verwerfen; optional automatische Sperre nach Inaktivität.
5. **Grenze, die bleibt:** Die Web-App wird vom selben Server ausgeliefert. Wer den Server kontrolliert, kann manipulierten Code ausliefern, der den Tresorschlüssel beim nächsten Entsperren abgreift. E2EE in einer vom Betreiber ausgelieferten Web-App schützt deshalb vor allem gegen **passive** Zugriffe (Datenbank, Backups, Abbilder, neugierige Administration ohne Code-Änderung), nicht gegen einen **aktiven** Angreifer auf dem Server.
   - Abhilfen sind außerhalb des Projektumfangs: signierte, unabhängig verteilte Clients; Subresource Integrity mit externem Vertrauensanker.

## 4. Variante 3 (E2EE-Bereiche) – zusätzliche Probleme

- **Schlüsselaustausch:**
  - Jedes Mitglied braucht ein öffentliches Schlüsselpaar (z. B. ECDH P-256 in WebCrypto).
  - Der Bereichsschlüssel wird je Mitglied verpackt.
  - Das Vertrauen in öffentliche Schlüssel (Fingerabdruck-Vergleich) wäre neu einzuführen; sonst kann der Server Schlüssel unterschieben.
- **Entzug:** Nach dem Entfernen eines Mitglieds ist eine Rotation **zwingend** (heute optional). Alte Inhalte bleiben für das entfernte Mitglied lesbar, wenn es sie zuvor geladen hat (gilt heute genauso).
- **Rechte:** Zugriffsstufen je Eintrag („nur Bearbeitende“) erfordern eigene Schlüssel je Stufe; die Vererbung von Kindern ließe sich nur noch mit unverschlüsselten Elternbezügen serverseitig prüfen.
- **Mehrere Geräte:** Jedes Gerät eines Mitglieds braucht Zugang zum privaten Schlüssel (Verpackung wie unter 3.2).

## 5. Empfehlung

1. **Modell A beibehalten** für 6.0. Es ist getestet, wiederherstellbar und funktioniert mit allen Funktionen.
2. **Als nächster Schritt, wenn gewünscht: Variante 2** („Privater Tresor“) als **Opt-in** für Journal, Notizen und Laborberichte, später Fotos.
   - Mit klarer Kennzeichnung: „Nur auf deinen Geräten lesbar. Ohne Wiederherstellungsschlüssel unwiederbringlich.“
   - Kein Teilen aus dem Tresor; kein serverseitiger Export.
3. Varianten 3 und 4 erst nach Erfahrungen mit Variante 2 und nur mit einer Lösung für das Vertrauen in ausgelieferten Client-Code.
4. Bis dahin bleibt die Kommunikation unverändert ehrlich: „Self-hosted · Private Daten geschützt“, **keine** E2EE-Aussage.

Diese Studie ist keine Freigabe zur Umsetzung. Eine Migration bestehender Daten erfordert eine ausdrückliche Entscheidung.
