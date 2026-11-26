# Phase 5.6 – Bedrohungsmodell mobil & offline

Stand: 5.6.0-rc.1 · Ergänzt `docs/THREAT-MODEL.md` und `docs/PHASE5-5-THREAT-MODEL.md`.

## Schutzgüter

1. Private Daten jedes Kontos auf dem Server, im Browser (IndexedDB) und im Cache.
2. Kontoisolation auf gemeinsam genutzten Geräten (mehrere Konten in einem Browser).
3. Inhalte gemeinsamer Bereiche nach Rechteentzug.
4. Nicht übertragene Änderungen (Verfügbarkeit, kein stiller Verlust).
5. Sitzungen (Abmelden muss wirken, auch ohne Verbindung).

## Akteure

| Akteur | Fähigkeiten |
| --- | --- |
| Finder/Dieb eines **gesperrten** Geräts | physischer Zugriff, keine Entsperrung |
| Person mit Zugriff auf ein **entsperrtes** Gerät bzw. denselben Browser | kann App öffnen, Entwicklerwerkzeuge nutzen, Speicher lesen |
| Weiteres Konto auf demselben Gerät | meldet sich nach einer anderen Person im selben Browser an |
| Entferntes Bereichsmitglied | hat Inhalte zwischengespeichert und Änderungen in der Warteschlange |
| Netzwerkangreifer | sieht/manipuliert Verkehr außerhalb von TLS (z. B. öffentliches WLAN) |
| Schadsoftware auf dem Gerät | voller Zugriff auf Browserdaten |

## Bedrohungen und Gegenmaßnahmen

| # | Bedrohung | Gegenmaßnahme | Nachweis |
| --- | --- | --- | --- |
| M1 | Private Inhalte im **generischen Service-Worker-Cache** (kontoübergreifend lesbar) | SW cacht nie `/api/*`, keine fremden Origins, keine `no-store`/`private`-Antworten; API sendet überall `no-store` | Unit-Test (Sandbox-Ausführung von `sw.js`); Browser-Regression durchsucht alle Caches nach privaten Inhalten; Docker-Upgrade prüft Header |
| M2 | **Arbeitskopie bleibt nach Abmelden** im Browser | Offline-Nutzung ist Opt-in; ohne Freigabe Löschung beim Abmelden und Kontowechsel; „Geteiltes Gerät“ erzwingt Löschung | Browser-Regression (2 Konten, 26 Prüfungen) |
| M3 | **Nächstes Konto sieht Daten des vorherigen** | getrennte IndexedDB je Konto; Bereichs-Cache nur im Arbeitsspeicher und bei Abmeldung verworfen; Sitzungsablagen (`sessionStorage`) geleert; Foto-URL-Cache geleert | Browser-Regression „Kontoisolation“ |
| M4 | **Abmelden ohne Verbindung** wirkt nicht (HttpOnly-Cookie bleibt gültig) | ausstehendes Abmelden wird gemerkt und beim nächsten Serverkontakt vor dem Laden der Daten ausgeführt | Browser-Regression: danach `/api/auth/session` = 401 |
| M5 | **Offline-Start ohne Passwort** nach bewusstem Abmelden | „Offline weiter als …“ nur, wenn die Sitzung nicht beendet wurde und eine Offline-Freigabe besteht; Abmelden entfernt die Kennung | Browser-Regression |
| M6 | **Entzogene Bereichsrechte** – Inhalte offline weiter lesbar, Warteschlange wird später eingespielt | Bereiche sind nie offline gespeichert; jede Operation wird serverseitig neu autorisiert; bei 404 wird verworfen und nie erneut gesendet; Zustand „Zugriff widerrufen“ | Phase-5.5-Tests (`spaceSync.test.ts`, `collab.test.ts`), Docker-Upgrade („Schreiben als Kommentieren: 403“) |
| M7 | **Stiller Datenverlust** durch Bereinigung | nie bei ausstehenden Änderungen (private Outbox + Bereichs-Warteschlangen); Abmelden fragt nach | Unit-Tests `selectPurgeable`, Browser-Regression |
| M8 | **Update mitten in einer Eingabe** (Datenverlust ungespeicherter Formulare) | kein automatisches `skipWaiting`; Update nur nach „Aktualisieren“ | Unit-Test, Browser-Test Update-Ablauf |
| M9 | **Veraltete Hülle mit Sicherheitsfix** bleibt aktiv | Hinweis bei jedem Zurückkehren in die App; manuelle Prüfung in den Einstellungen; `sw.js` mit `no-cache` ausgeliefert | Docker-Upgrade (Header), Browser-Test |
| M10 | **Foto-Metadaten** (GPS, Gerät) verlassen das Gerät | Neukodierung über Canvas in beiden Qualitätsstufen, auch bei „Originalauflösung“; Originaldatei liegt nur im Arbeitsspeicher und wird nie gespeichert | bestehende EXIF-Tests, Code |
| M11 | **Biometrie-Missverständnis** bei Passkeys | keine Biometrie-Versprechen; TERPGRID erhält keine biometrischen Daten; Prüfung auf dem Gerät durch das Betriebssystem | Texte |
| M12 | **Push-Dienste Dritter** erfahren Nutzungsmetadaten | Web-Push bewusst nicht umgesetzt (siehe Bericht); nur In-App-Benachrichtigungen ohne Inhalte | – |
| M13 | **Installationsaufforderung als Belästigung/Täuschung** | native Aufforderung nur nach Klick; Karte erscheint einmal, „Nicht jetzt“ wird gemerkt | Browser-Test |

## Nicht abgedeckt (ehrlich)

- **Entsperrtes Gerät / Schadsoftware:** Wer den entsperrten Browser bedienen kann, kann eine freigegebene Arbeitskopie lesen. IndexedDB ist nicht verschlüsselt. Hier helfen nur Gerätesperre, Geräteverschlüsselung und der Verzicht auf die Offline-Freigabe.
- **Fernlöschung:** Nicht möglich. „Andere Sitzungen beenden“ und Passwortwechsel beenden Serversitzungen; eine freigegebene lokale Kopie auf einem verlorenen Gerät bleibt lesbar für alle, die das Gerät entsperren können.
- **Bildschirmfotos und App-Umschalter-Vorschauen** des Betriebssystems sind außerhalb der Kontrolle einer Web-App.
- **Browser räumt Speicher:** Ohne zugesagten dauerhaften Speicher kann der Browser die Kopie entfernen. Die Daten bleiben auf dem Server, nicht übertragene Änderungen gehen dann verloren.
- **Kompromittierter Server/Betreiber:** wie bisher nicht abgedeckt (keine Ende-zu-Ende-Verschlüsselung).

## Empfehlungen in der Oberfläche

- Offline-Nutzung nur auf eigenen, gesperrten Geräten einschalten.
- Auf fremden oder gemeinsam genutzten Geräten „Geteiltes Gerät“ aktivieren.
- Vor dem Abmelden synchronisieren („Jetzt synchronisieren“ unter Konto → Dieses Gerät).
