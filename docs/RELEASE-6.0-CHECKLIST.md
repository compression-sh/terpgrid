# TERPGRID 6.0 Stable – Release-Checkliste

Stand: nach 5.9.0-rc.1.

**Regel:** 6.0 wird erst erstellt, wenn alle Pflicht-Gates erfüllt sind und die Freigabe ausdrücklich erteilt wurde. Eine grüne CI allein genügt nicht.
Nachweise und aktueller Status je Anforderung: `PHASE5-9-RELEASE-MATRIX.md`.

## Pflicht-Gates

| Gate | Anforderung | Status nach 5.9 | Nachweis / offen |
| --- | --- | --- | --- |
| **G1** | Keine offenen kritischen oder hohen Sicherheitsbefunde | erfüllt | `PHASE5-9-PRODUCTION-REPORT.md` §4, `PHASE5-7-SECURITY-REPORT.md` |
| **G2** | Automatisierte Abnahme in Chromium, Firefox **und** WebKit grün | erfüllt, mit einer dokumentierten Testumgebungs-Grenze (WebKit-Offline-Neuladen) | `PHASE5-9-BROWSER-COMPATIBILITY.md` |
| **G3** | **Geräteabnahme** auf iPhone (Safari und installiert), Android (Chrome und installiert) und Firefox Desktop | **offen** | `PHASE5-9-DEVICE-TESTING.md` – manuell auszufüllen |
| **G4** | Isoliertes Upgrade von der **tatsächlich produktiv laufenden** Version auf den Release-Stand, mit Prüfsummenvergleich | für 5.7.0-rc.1 und 5.8.0-rc.1 erfüllt | `PHASE5-9-DISASTER-RECOVERY.md` §2. Vor dem Upgrade die laufende Version auf dem VPS ablesen (`UPGRADE-5.9.md` Schritt 1). Weicht sie ab, diesen Pfad isoliert nachtesten. |
| **G5** | Vollständige Disaster-Recovery-Übung in frischer Umgebung | erfüllt (isoliert) | `PHASE5-9-DISASTER-RECOVERY.md` |
| **G6** | **Restore-Test auf dem Produktionsserver** mit dem echten Offsite-Repository (`backup/restore-test.sh latest`, berührt Produktion nicht) | **offen** | Durch den Betreiber vor dem Upgrade auszuführen |
| **G7** | **Offline-Sicherung von `master_keys` und `hmac_secret`** an zwei getrennten Orten, Lesbarkeit geprüft | **offen** (nur Betreiber kann das bestätigen) | `RUNBOOK.md` §5 |
| **G8** | Upgrade der Produktion auf 5.9.0-rc.1 nach `UPGRADE-5.9.md`, danach mindestens 7 Tage Betrieb ohne neue P1/P2-Fehler | **offen** | Betreiber |
| **G9** | Dokumentation vollständig und geprüft | erfüllt für Repository-Doku | `PHASE5-9-PRODUCTION-REPORT.md` §9 |
| **G10** | Ausdrückliche Freigabe für 6.0 | **offen** | – |

## Vorgehen für 6.0, nachdem G1–G10 erfüllt sind

1. Version in `package.json`, `server/package.json`, beiden Lockfiles und `README.md` auf `6.0.0` setzen. Kein `-rc`.
2. `CHANGELOG.md`: Abschnitt „6.0.0“ mit einer Zusammenfassung der Phasen 5.x. Bekannte Grenzen aus `PHASE5-9-PRODUCTION-REPORT.md` §8 übernehmen.
3. Volle Regression wie in 5.9:
   - Server- und Frontend-Tests, Lint, Typecheck, `npm audit`;
   - Browser-Suiten in drei Engines;
   - isoliertes Upgrade 5.9.0-rc.1 → 6.0.0.
4. Pull Request gegen `main`; Merge nur manuell.
5. Tag `v6.0.0` erst nach dem Merge setzen, durch den Betreiber.
6. Produktion: `./upgrade.sh v6.0.0` nach dem Muster von `UPGRADE-5.9.md`.

## Bewusst nicht Teil von 6.0 (ohne gesonderte Freigabe)

- Web-Push.
- Aktivierung des Katalog-Aktualisierungstimers.
- Hintergrundjobs außer den bestehenden Backup- und Restore-Test-Timern.
- Automatische Schlüsselrotation.
- Ende-zu-Ende-Verschlüsselung (Studie: `PHASE5-7-E2EE-FEASIBILITY.md`).
- Neue Katalogquellen und Sortenfotos ohne geklärte Lizenz.
