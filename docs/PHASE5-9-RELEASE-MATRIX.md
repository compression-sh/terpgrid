# Phase 5.9 – Release-Matrix (Freigabereife für 6.0)

Stand: 5.9.0-rc.1.

**Einstufungen:**
- **Bestanden** – geprüft, Nachweis vorhanden.
- **Teilweise** – geprüft mit dokumentierter Einschränkung.
- **Gerät ausstehend** – nur auf physischen Geräten prüfbar.
- **Blockiert** – in dieser Umgebung nicht durchführbar.
- **Fehlgeschlagen** – Fehler offen.
- **n. a.** – nicht anwendbar.

**Nachweis-Kürzel:**

| Kürzel | Datei bzw. Fundstelle |
| --- | --- |
| BR | `PHASE5-9-BROWSER-COMPATIBILITY.md` |
| DR | `PHASE5-9-DISASTER-RECOVERY.md` |
| PF | `PHASE5-9-PERFORMANCE.md` |
| DT | `PHASE5-9-DEVICE-TESTING.md` |
| PR | `PHASE5-9-PRODUCTION-REPORT.md` |
| UG | `UPGRADE-5.9.md` |
| ST | Server-Tests (232) |
| FT | Frontend-Tests (291) |

## Freigabe-blockierend (vor 6.0 zu erledigen)

| # | Anforderung | Status | Nachweis / nächster Schritt |
| --- | --- | --- | --- |
| RB-1 | Geräteabnahme iPhone (Safari und installiert), Android (Chrome und installiert), Firefox Desktop | **Gerät ausstehend** | DT; Checkliste mit 22 Punkten |
| RB-2 | Restore-Test auf dem Produktionsserver mit dem echten (Offsite-)Repository, einschließlich `--full-check` | **ausstehend (Betreiber)** | `backup/restore-test.sh --full-check latest` auf dem VPS |
| RB-3 | Offline-Sicherung von `master_keys` und `hmac_secret` bestätigt | **ausstehend (Betreiber)** | `RUNBOOK.md` §5 |
| RB-4 | Produktion auf 5.9 aktualisieren, Beobachtungszeitraum ohne neue P1/P2 | **ausstehend (Betreiber)** | UG; `RELEASE-6.0-CHECKLIST.md` G8 |

Alle übrigen Anforderungen unten sind bestanden oder mit Begründung als nicht blockierend eingestuft.

## 3. Anwendungsabnahme

| Modul | Status | Nachweis |
| --- | --- | --- |
| Übersicht, Grow Studio, Pflanzenprofile, Messwerte | Bestanden | BR Workflows (Dialoge, Diagramm), Seitenprüfung 3 Engines × 6 Breiten |
| Foto-Studio, Galerie, Lightbox, Upload | Bestanden | BR (Upload per Dateiauswahl, Escape, EXIF/GPS entfernt) |
| Grow-Vergleich, Bericht, Experimente | Bestanden | Seitenprüfung (0 Fehler, 0 Überlauf) |
| Sortenkatalog, Breeder, Genetik, Terpen-Atlas, Academy | Bestanden | BR Workflows, Seitenprüfung |
| THC Lab, Laborberichte | Bestanden | BR, FT (Formel-Tests) |
| Journal, Sammlung, Kalender, Insights, Verlauf | Bestanden | BR (Tags, Filter, CSV, Aufgabe → Kalender) |
| Globale Suche | Bestanden | BR (Strg+K → Treffer → Navigation) |
| Freunde, private Profile, Bereiche, Kommentare, Benachrichtigungen | Bestanden | BR Zusammenarbeit 26/26 × 3 Engines |
| Datenschutz-Center, Konto, Sitzungen, 2FA | Bestanden | BR Workflows (2FA einrichten/anmelden, Sitzung beenden) |
| Administration | Bestanden | BR (Rollenwechsel per CLI, Seite) |
| Offline, PWA, Update | Bestanden in Chromium/Firefox · Teilweise in WebKit | BR (B-4: Offline-Neuladen in WebKit-Automation nicht prüfbar) |
| Einstellungen, Daten & Backup | Bestanden | BR (JSON-Export-Download) |
| Gefundene Fehler | 4 Anwendungsfehler behoben | PR §3 |

## 4. Browser

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Chromium, Firefox, WebKit mit echten Abläufen | Bestanden (WebKit: B-4 Testgrenze, B-5 ungeklärte Meldung ohne Funktionsauswirkung) | BR §2 |
| Breiten 360/390/430/768/1024/1440 | Bestanden | BR Seitenprüfung, Mobil-Suite |
| Passkeys je Engine | Teilweise | Chromium ✓; Firefox und WebKit nicht automatisierbar → DT |
| Chromium-Emulation ≠ Safari | beachtet | BR §1, DT |

## 5. Physische Geräte

| Anforderung | Status |
| --- | --- |
| iPhone Safari, installierte iPhone-App, iPad, Android Chrome, installierte Android-App, Firefox Desktop | **Gerät ausstehend** (DT) |

## 6. Sicherheit

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Authentifizierung, Passwort-Hashing (Argon2id), TOTP, Sitzungen, Wiederherstellung | Bestanden | ST (auth, security57), BR |
| Passkeys | Bestanden (Server, Chromium) · Geräte ausstehend | ST passkeys, BR, DT |
| PostgreSQL-RLS, Kontoisolation, Bereichs- und Ressourcenrechte | Bestanden | ST (isolation, isolation-all, permissions, collab), BR Zusammenarbeit |
| Medienautorisierung | Bestanden | BR (Außenstehende 404, entfernte Mitglieder) |
| Offline-Privatsphäre, ausstehendes Abmelden, Kontowechsel | Bestanden (nach Behebung S-1) | BR offline-sec 16/16 × 3, PR §4 |
| Administration | Bestanden | ST security57 V1/V2 |
| Externe Anbieter (Katalog-Proxy) | unverändert seit 5.7, Bestanden | `PHASE5-7-SECURITY-MATRIX.md` |
| Offene kritische/hohe Befunde | **keine** | PR §4 |

## 7. Verschlüsselung und Datenintegrität

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Kein Klartext in DB-Dateien, Dump, Dateispeicher, Logs, `/tmp`, Backup | Bestanden | DR §1 (Marker 0 Treffer, Gegenprobe über API lesbar) |
| Browser-Speicher nach dem Abmelden | Bestanden | BR offline-sec |
| Export-Staging (`/var/tmp`) | Bestanden (Backup und Restore hinterlassen nichts) | DR §1 |
| Schlüsselversionen, falscher/fehlender Schlüssel | Bestanden | DR §6 |
| Unterbrochene Vorgänge | Bestanden | DR §2 (Upgrade-Abbrüche), 5.0 (Katalogimport) |
| Server-Verschlüsselung ≠ E2EE klar getrennt | Bestanden | `SECURITY.md`, `PHASE5-7-E2EE-FEASIBILITY.md` |

## 8. Offline

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Offline an/aus, geteiltes Gerät, ausstehende Änderungen, Neustart, doppelter Sync, Konflikte, abgelaufene Sitzung, Kontowechsel, Offline-Abmeldung, Rechteänderung, Entzug, SW-Update | Bestanden (Chromium/Firefox), WebKit ohne Offline-Neuladen | BR, FT (sync, merge, offline) |
| Speicherquote erschöpft | Teilweise | App fordert dauerhaften Speicher an und zeigt Belegung; Erschöpfung nicht automatisiert simuliert (PR §8) |
| Grenzen des Offline-Widerrufs dokumentiert | Bestanden | `PHASE5-7-OFFLINE-SECURITY.md`, DT |

## 9. Deployment

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Rechte, Read-only, `cap_drop`, `no-new-privileges`, Limits, Restart, Health, Netze, Secrets, Volumes, TLS, Header | Bestanden | DR §4 (Audit der laufenden Instanz) |
| PostgreSQL und API nicht veröffentlicht | Bestanden | DR §4 |
| Verträglich mit nftables und CrowdSec | Bestanden (nur 80/443 veröffentlicht, keine Firewall-Änderung) | `PHASE5-7-VPS-HARDENING.md` |
| Keine Änderung am Produktionsserver | eingehalten | – |

## 10. Upgrade

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| 5.7.0-rc.1 → 5.9 und 5.8.0-rc.1 → 5.9 mit Prüfsummen (Konten, Zugangsdaten, Schlüssel, private Daten, Fotos, Bereiche, Mitgliedschaften, Kommentare, Benachrichtigungen, Katalog, Proben, Academy-Fortschritt, Einstellungen) | Bestanden | DR §2 |
| Unterbrochenes Upgrade (Bau, Umschalten) | Bestanden nach Behebung S-4 | DR §2 |
| Fehlgeschlagene Migration | Bestanden (transaktional, Rollback) nach Verbesserung S-5 | DR §2 |
| Nicht unterstützter Rollback wird abgelehnt | Bestanden | DR §2 |
| Wiederherstellungsverfahren dokumentiert | Bestanden | UG §5, RUNBOOK §4 |
| Tatsächlich produktive Version | unbekannt | UG Schritt 1; abweichender Pfad → isoliert nachtesten |

## 11. Backup und Disaster Recovery

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Restore in frische Umgebung nach RUNBOOK §3 | Bestanden | DR §3 |
| DB, Medien, Entschlüsselung, Anmeldung, private und gemeinsame Daten, Katalog, Proben, Rechte | Bestanden | DR §3 (SHA-256 aller Blobs identisch) |
| Dauer, Größe, Platz, Speicher gemessen | Bestanden | DR §5 |
| Beschädigtes Backup, fehlender Schlüssel | Bestanden nach Verbesserung S-6 (`--full-check`) | DR §6 |
| RTO/RPO dokumentiert | Bestanden | DR §7 |

## 12. Diagnose

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Version, Schema, Container, DB, Speicher, Backup, Katalog, Proben, Verschlüsselung, Migrationen | Bestanden | `status.sh` / `cli status --verify` (neu) |
| Fehlgeschlagene Synchronisationen | Teilweise | Clientseitig (Konto → Synchronisation: abgelehnte Änderungen, Konflikte); serverseitig nicht protokolliert (bewusst, keine Inhalte in Logs) |

## 13. Performance

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| 1/5/10/25 gleichzeitige Nutzer, Ressourcen, Engpass | Bestanden | PF §1 |
| Große Growlogs und Galerien | Bestanden, 2 Engpässe behoben | PF §2 |
| Laden der App, mobil | Bestanden | PF §5 |
| Keine Kapazitätszusage aus der Entwicklungsmaschine | beachtet | PF |

## 14. Katalog und wissenschaftliche Daten

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Zählungen erhoben, Herkunft und Belegarten unverändert, Laborproben getrennt, keine erfundenen Daten, keine Fotos ohne Lizenz, Timer aus | Bestanden | PR §6 |

## 15. Barrierefreiheit und Optik

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| axe-core auf 6 Breiten in 3 Engines: 0 Verstöße | Bestanden | BR Mobil-Suite |
| Tastatur, Fokus, Dialoge (Escape), Labels | Bestanden (automatisiert, Stichproben) | BR Workflows |
| Screenreader, reduzierte Bewegung | **Gerät ausstehend** | DT 19/20 |
| Keine Behauptung voller WCAG-2.2-AA-Konformität | beachtet | PR §7 |

## 16. Abhängigkeiten und Lieferkette

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| `npm audit` (Laufzeit) 0, keine ungenutzten Abhängigkeiten, Images gepinnt, Actions gepinnt | Bestanden | PR §5 |

## 17./18. Dokumentation und Upgrade-Leitfaden

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Betriebsdoku aktualisiert, Befehle isoliert geprüft | Bestanden | PR §9 |
| Exakter Upgrade-Leitfaden für `/opt/terpgrid/deploy` | Bestanden | UG |

## Optionale Verbesserungen (nicht blockierend)

- Konfigurierbare Upload-Begrenzung; Fortschrittsanzeige statt Sync-Status „Fehler“ bei 429 (PF §2).
- Insights und Diagramme bei sehr großen Beständen in einen Worker auslagern (PF §2).
- Thumbnail-first beim Erstabgleich großer Galerien (PF §2).
- Simulation einer erschöpften Speicherquote im Browser-Test.
