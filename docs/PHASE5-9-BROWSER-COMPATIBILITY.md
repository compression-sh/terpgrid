# Phase 5.9 – Browser-Kompatibilität (Chromium, Firefox, WebKit)

Stand: 5.9.0-rc.1.

## 1. Engines und wie sie installiert wurden

| Engine | Version | Herkunft |
| --- | --- | --- |
| Chromium | 157.0.8103.78 | in der Umgebung vorinstalliert (Playwright 1.63) |
| Firefox | 155.0 (Playwright-Build) | `playwright install firefox webkit` in ein **eigenes** Verzeichnis (`PLAYWRIGHT_BROWSERS_PATH`), das vorinstallierte Chromium blieb unberührt |
| WebKit | 26.6 (Playwright-Build für Linux) | wie Firefox; Systembibliotheken per `apt-get` (GTK 4, GStreamer, libsecret u. a.) |

- Der Download war zunächst durch die Netzwerkrichtlinie der Umgebung blockiert (`cdn.playwright.dev`).
- Mit Zustimmung wurden die beiden Download-Hosts für diese Umgebung freigegeben.

**Reproduzierbar:**

```bash
export PLAYWRIGHT_BROWSERS_PATH=$HOME/pw-browsers
npx playwright@1.63.0 install firefox webkit
sudo npx playwright@1.63.0 install-deps webkit        # bzw. die fehlenden Bibliotheken laut Warnung per apt-get
ENGINE=webkit node scripts/browser-acceptance/workflows.cjs …   # Anleitung: scripts/browser-acceptance/README.md
```

> **Wichtig:** Playwrights WebKit unter Linux ist **nicht** Safari auf iPhone oder iPad. Es fehlen Standalone-Modus, iCloud-Schlüsselbund und WebAuthn-Backend, die echte Kamera und HEIC-Dekodierung, Safe Areas und VoiceOver. Diese Prüfungen stehen in `PHASE5-9-DEVICE-TESTING.md` und sind **ausstehend**.

## 2. Prüfungen je Engine

- Alle Läufe gegen den Preview-Build mit echter API und PostgreSQL, ohne Mocks.
- Im Repository: `scripts/browser-acceptance/` (`workflows.cjs`, `sweep.cjs`).
- Die übrigen Suiten (`e2e-offline`, `offline-sec`, `mobile-suite`, `e2e-55`, `e2e-passkey`, `large-ui`) stammen aus den Phasen 5.5–5.7 der Entwicklungsumgebung und wurden für die Engine-Auswahl erweitert.
- Alle Suiten liefen zweimal vollständig in allen drei Engines: nach den ersten Korrekturen und mit dem endgültigen Stand (`898d1cb`, Frontend unverändert bis zum PR). Die Tabelle zeigt den endgültigen Stand.

| Suite | Inhalt | Chromium | Firefox | WebKit |
| --- | --- | --- | --- | --- |
| **UI-Workflows** (`workflows.cjs`, neu) | Registrierung über das Formular, Recovery-Codes, Grow/Pflanze/Messung über Dialoge, Messwert-Diagramm, **Foto-Upload per Dateiauswahl**, Galerie, Lightbox (Escape), **keine EXIF/GPS-Daten** in ausgelieferten Fotos, Journal mit Tags und Filter, **CSV-Download**, Aufgabe → Kalender, Sammlung, globale Suche (Strg+K), Katalogsuche, Sortenseite, Genetik-Graph, Terpen-Atlas, Academy, THC Lab, Insights-Diagramme, **JSON-Export-Download**, **2FA einrichten** (TOTP), Abmelden, falscher Code abgelehnt, Anmeldung mit 2FA, andere Sitzung beenden, Rollenwechsel per CLI beendet Sitzungen, Administration | **30/30** | **30/30** | **30/30** |
| **Offline/Mehrkonten** (`e2e-offline`) | Standard „offline aus“, Abmelden löscht die Arbeitskopie, Offline-Freigabe, Offline-Start aus dem Service Worker, Kontowechsel, Isolation, ausstehende Änderungen, Offline-Abmeldung, geteiltes Gerät, SW-Cache ohne private Inhalte | **26/26** | **26/26** | **22/23** (siehe §3) |
| **Offline-Sicherheit** (`offline-sec`) | Abmeldung wirkt auf alle Tabs, ausstehendes Abmelden wird nachgeholt, keine privaten Inhalte in irgendeinem Browserspeicher nach dem Abmelden, Konto B sieht nichts von A, widerrufene Sitzung | **16/16** | **16/16** | 1. Lauf **16/16**; 2. Lauf 15/16 – alle Funktionsprüfungen bestanden, nur die Prüfung „keine JS-Fehler“ meldete B-5 |
| **Mobil/Barrierefreiheit** (`mobile-suite`) | 6 Breiten × 8 Seiten mit axe-core (WCAG 2.x A/AA-Regeln), Überlauf, Plus-Knopf, 16-px-Eingabefelder, Installationskarte, **App-Update-Ablauf** (neue Version wartet, „Aktualisieren“, alter Cache entfernt) | **16/16** | **16/16** | **16/16** |
| **Zusammenarbeit** (`e2e-55`) | 6 Konten: Freundschaften, Bereich, Rollen Eigentümer/Bearbeiten/Kommentieren/Ansehen, serverseitige 403, Zugriffsstufen, Benachrichtigungen ohne Inhalt, Außenstehende, **Entzug der Mitgliedschaft**, keine Anmeldenamen in fremden Ansichten | **26/26** | **26/26** | **26/26** |
| **Seitenprüfung** (`sweep.cjs`, neu) | 34 Seiten × 360/390/430/768/1024/1440 px: horizontaler Überlauf, JS- und Konsolenfehler | 204 Aufrufe, 0/0 | 204, 0/0 | 204, 0/0 |
| **Passkeys** (`e2e-passkey`) | virtueller Authenticator: Registrieren, Umbenennen, Anmelden ohne Kennung, Ablehnung ohne Nutzerverifikation | **bestanden** | nicht automatisierbar¹ | nicht automatisierbar¹ |
| **Großes Konto** (`large-ui.cjs`) | 20.000 Messungen, 1.000 Fotos: Erstabgleich, Diagramme, Galerie | bestanden | bestanden | bestanden |

¹ Playwright bietet einen virtuellen Authenticator nur für Chromium (CDP).
- **Firefox** zeigt den Knopf „Mit Passkey anmelden“ und wartet nach dem Klick auf den Browser-Dialog, also auf einen Sicherheitsschlüssel. Das ist das normale Verhalten.
- **WebKit für Linux** hat kein WebAuthn-Backend (`PublicKeyCredential` ist dort kein Konstruktor). Die App blendet den Passkey-Knopf deshalb aus, die Passwort-Anmeldung bleibt.
- **In Safari** ist WebAuthn vorhanden. Passkeys sind daher Teil der Geräteabnahme.

## 3. Gefundene Unterschiede und Korrekturen

| # | Befund | Engine | Ursache | Ergebnis |
| --- | --- | --- | --- | --- |
| B-1 | Grow-Seite bei 360 px: 5 px horizontaler Überlauf, Menüknopf „⋯“ abgeschnitten, „Schnell-Log“ zweizeilig | Firefox, WebKit (Chromium knapp unauffällig) | Aktionsleiste ohne Umbruch, Schriftmetrik je Engine leicht verschieden | **behoben**: Leiste bricht um, Knopftext bleibt einzeilig. Danach 0 Überläufe in allen Engines |
| B-2 | Nach dem Abmelden blieb in WebKit eine **leere** Konto-Datenbank (Name mit Kontokennung) bis zum nächsten Start bestehen | WebKit (2 von 4 Versuchen) | Der in 5.8 eingeführte verzögerte Foto-Download startete nach dem Abmelden noch (WebKit hat kein `requestIdleCallback`, daher Zeitgeber 1,5 s) und legte die gelöschte Datenbank neu an | **behoben**: kein Start nach `stop()`; gelöschte Arbeitskopien können nicht durch Nachzügler neu entstehen (Unit-Test). Danach 3/3 sauber in WebKit, Chromium und Firefox |
| B-3 | Kompakte Auswahlfelder (Insights, Breeder, Kalender u. a.): Text vertikal abgeschnitten | WebKit (Touch, 16-px-Schrift) | Native Select-Darstellung bei fester Höhe | **behoben**: einheitliche Darstellung ohne native Optik, mit sichtbarem Pfeil. Zugleich bekommen Formular-Auswahlfelder (`SelectField`) erstmals einen Pfeil; vorher waren sie in allen Engines nicht als Auswahl erkennbar |
| B-5 | Meldung „Fetch API cannot load …/api/… due to access control checks“ als Seitenfehler | WebKit, nur unter Playwrights Offline-Emulation, nicht in jedem Lauf | **Nicht abschließend geklärt.** In app-unabhängigen Minimalbeispielen (offline, mit und ohne Service Worker, Fehler abgefangen) nicht reproduzierbar; die App fängt die betroffenen Netzfehler ab, und alle Funktionsprüfungen bestehen | dokumentiert; Offline-Verhalten auf dem iPhone prüfen (Geräteprüfliste 11, 12, 16) |
| B-4 | Offline-Neuladen mit Service Worker schlägt fehl („WebKit encountered an internal error“) | WebKit | **Grenze der Testumgebung:** Eine app-unabhängige Minimalseite mit Cache-first-Service-Worker scheitert identisch. Normale Netzfehler (`fetch` offline) behandelt WebKit korrekt. | Test markiert „nicht prüfbar“. Die Folgemeldung „due to access control checks“ (1 von 23) entsteht nur in diesem Zustand. **Offline-Start auf iPhone und iPad bleibt Teil der Geräteabnahme (Pflicht).** |

## 4. Abdeckung der geforderten Themen

| Thema | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| Anmeldung, Registrierung, 2FA | ✓ | ✓ | ✓ |
| Passkeys | ✓ (virtuell) | Darstellung ✓, Ablauf nicht automatisierbar | nicht vorhanden (Testbuild) |
| Navigation, Dialoge, Diagramme | ✓ | ✓ | ✓ |
| Datei-Upload, Galerie | ✓ | ✓ | ✓ |
| Offline-Speicher, Service Worker | ✓ | ✓ | Speicher ✓, Offline-Neuladen nicht prüfbar (B-4) |
| Synchronisation, Kontowechsel, Abmelden | ✓ | ✓ | ✓ (nach B-2) |
| Zusammenarbeit, Rechteentzug | ✓ | ✓ | ✓ |
| App-Update (Service Worker) | ✓ | ✓ | ✓ |
| 360/390/430/768/1024/1440 px | ✓ | ✓ (ohne `isMobile`, von Firefox nicht unterstützt) | ✓ |

## 5. Screenshots

`docs/screenshots/phase-5-9/` – siehe `PHASE5-9-PRODUCTION-REPORT.md` §10.
