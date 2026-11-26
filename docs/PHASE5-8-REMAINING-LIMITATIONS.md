# Phase 5.8 – Verbleibende Grenzen und Anforderungen für Phase 5.9

Stand: 5.8.0-rc.1.

## Bewusst nicht umgesetzt (mit Begründung)

| Thema | Grund |
| --- | --- |
| **Weitere Katalog-Datenquellen** | Keine neue Quelle mit geklärter Lizenz für Weitergabe an selbst gehostete Instanzen gefunden; die Bewertungen der Phasen 5.2–5.4 (`docs/`) gelten weiter. Keine erfundenen Sortendaten. |
| **Sortenfotos** | Keine Fotos mit geklärten Rechten und belegbarer Zuordnung Bild → Breeder-Linie. Der Platzhalter bleibt ausdrücklich als Platzhalter gekennzeichnet. |
| **Laborproben** | Bleiben als Namensabgleich (Smith et al. 2022) getrennt von Breeder-Angaben – unverändert. |
| **E2EE** | Siehe `PHASE5-7-E2EE-FEASIBILITY.md` – keine Umsetzung ohne Freigabe. |
| **Web-Push, Katalog-Aktualisierungstimer, Hintergrundjobs** | Bleiben deaktiviert. |
| **Neue Abhängigkeiten** | Keine hinzugefügt. |

## Nicht geprüft

- **WebKit und Firefox:** In dieser Umgebung nicht installiert; die Installation per `playwright install` ist untersagt. Getestet ist nur Chromium, einschließlich mobiler Emulation.
- **Physische Geräte:** Keine verfügbar.
- **Administrationsseiten:** In 5.8 nicht neu gesichtet. Die Rechte sind durch Tests belegt.
- **Große Datenbestände:** Tausende Fotos oder Messungen je Konto wurden nicht gemessen.

## Bekannte kleinere Punkte

- Die Tabs unter „Gemeinsam“ sind mobil horizontal scrollbar, ohne sichtbaren Hinweis auf weitere Einträge.
- LCP der Katalogseiten liegt unter 4× CPU-Drosselung kalt bei etwa 2,3–2,4 s. Ursache sind Client-Rendering und Chunks, nicht der Server (siehe Performance-Bericht).
- Bei fehlender Fotogröße in importierten Altdaten zeigt „Daten & Backup“ 0 B für Fotos.

## Anforderungen für Phase 5.9 (Produktionsreife)

1. Geräteabnahme auf iPhone (Safari und installiert), Android (Chrome) und Firefox Desktop. Prüfliste: `PHASE5-6-MOBILE-REPORT.md` Abschnitt 3 und `PHASE5-7-SECURITY-REPORT.md` Abschnitt 6.
2. Lasttest mit realistischem Datenbestand (z. B. 5.000 Fotos und 50.000 Messungen) und Offsite-Backup-Repository.
3. Betriebsdokumentation final prüfen:
   - `DEPLOYMENT.md`, `RUNBOOK.md`, `PHASE5-7-VPS-HARDENING.md`, `PHASE5-7-DISASTER-RECOVERY.md`;
   - Monitoring-Schwellen.
4. Release-Notizen für 6.0 und Bereinigung der „rc“-Versionierung.
5. Entscheidung über einen optionalen privaten Tresor (E2EE-Studie, Variante 2) – nicht Teil von 6.0, sofern nicht ausdrücklich gewünscht.
