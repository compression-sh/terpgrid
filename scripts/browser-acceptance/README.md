# Browser-Abnahme (Chromium, Firefox, WebKit)

Diese Suiten aus Phase 5.9 prüfen echte Abläufe gegen eine **lokale Entwicklungsinstanz**: Preview-Build und API mit PostgreSQL. Nie gegen Produktion ausführen, denn die Suiten legen Testkonten an und ändern Rollen.

| Datei | Prüft |
| --- | --- |
| `workflows.cjs` | 30 Abläufe über die Oberfläche, Einzelheiten unten |
| `sweep.cjs` | 34 Seiten × 360/390/430/768/1024/1440 px: horizontaler Überlauf, JS- und Konsolenfehler, Screenshots |

Abläufe in `workflows.cjs`:
- Registrierung, Recovery-Codes, 2FA;
- Grow, Pflanze, Messung, Diagramm;
- Foto-Upload, Galerie, EXIF-Entfernung;
- Journal mit CSV, Kalender, Sammlung, Suche;
- Katalog, Genetik, Atlas, Academy, THC Lab, Insights;
- JSON-Export, Sitzungen, Administration.

Ergebnisse in 5.9: `docs/PHASE5-9-BROWSER-COMPATIBILITY.md`.

## Voraussetzungen

```bash
# Browser-Engines (Playwright 1.63) in ein eigenes Verzeichnis
export PLAYWRIGHT_BROWSERS_PATH=$HOME/pw-browsers
npx playwright@1.63.0 install chromium firefox webkit
sudo npx playwright@1.63.0 install-deps          # Systembibliotheken (u. a. für WebKit)

# API (Entwicklung) und Preview-Build
# dev.env (nicht im Repository, eigene Werte): PUBLIC_ORIGIN=http://localhost:4173, COOKIE_INSECURE_DEV=true,
# INVITE_ONLY=false, DATABASE_URL, DATABASE_MIGRATE_URL, MASTER_KEYS (node dist/cli.js generate-key), HMAC_SECRET, FILE_STORAGE_DIR, PORT=8080
cd server && set -a && . /pfad/zu/dev.env && set +a && npx tsx src/cli.ts migrate && npx tsx src/index.ts &
cd .. && npm run build && TERPGRID_API_PROXY=http://127.0.0.1:8080 npx vite preview --port 4173 --strictPort &
```

**Ratenbegrenzung:**
- Die Registrierung ist auf 5 pro Stunde und IP begrenzt.
- `workflows.cjs` setzt je Lauf eine eigene `X-Forwarded-For`-Adresse. Die API vertraut ihr nur von Loopback bzw. privaten Netzen (`TRUST_PROXY`).
- Alternativ die API zwischen den Läufen neu starten.

## Ausführen

```bash
cd scripts/browser-acceptance
for e in chromium firefox webkit; do
  ENGINE=$e DEVENV=/pfad/zu/dev.env node workflows.cjs out/$e /pfad/zu/bildern   # plant1.jpg, plant2.jpg mit EXIF
  ENGINE=$e TEST_PASSWORD=… node sweep.cjs <konto-mit-daten> out/$e/sweep
done
```

## Grenzen

- WebKit ist hier Playwrights Linux-Build, **nicht** Safari auf iOS. Offline-Neuladen mit Service Worker und Passkeys sind dort nicht prüfbar (siehe Bericht).
- Firefox unterstützt die Playwright-Option `isMobile` nicht. Die Breiten werden trotzdem geprüft.
