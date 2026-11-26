/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Strikte Content-Security-Policy im Produktions-Build:
 * Verbindungen nur zur eigenen Instanz ('self') und – im Lokalmodus ohne Server –
 * zu den öffentlichen Sortendaten-APIs. Im Self-Hosting setzt Caddy zusätzlich eine
 * strengere CSP per Header (nur 'self'); Browser wenden beide an (Schnittmenge).
 */
function cspPlugin(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.strainapi.com",
    "font-src 'self' data:",
    // Ausschließlich die dokumentierten Sortendaten-APIs – keine Analyse-/Tracking-Dienste.
    "connect-src 'self' https://www.strainapi.com https://api.cannalib.org",
    "frame-src blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

// Entwicklung mit lokalem Backend: TERPGRID_API_PROXY=http://127.0.0.1:8080 npm run dev
const apiProxy = process.env.TERPGRID_API_PROXY ? { '/api': { target: process.env.TERPGRID_API_PROXY, changeOrigin: false } } : undefined;

/** Versioniert den Service Worker je Build (alter Cache wird beim Aktivieren gelöscht). */
function swVersionPlugin(): Plugin {
  return {
    name: 'sw-version',
    apply: 'build',
    writeBundle(options, bundle) {
      const file = `${options.dir ?? 'dist'}/sw.js`;
      // Alle gehashten Assets der App-Hülle (JS, CSS, Schriften) – damit die App schon nach dem
      // ersten Besuch offline startet, nicht erst nach einem weiteren Online-Laden.
      const precache = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && /\.(js|css|woff2)$/.test(f))
        .sort();
      try {
        const src = readFileSync(file, 'utf8');
        writeFileSync(
          file,
          src.replace('__TERPGRID_SW_VERSION__', `${pkg.version}-${Date.now().toString(36)}`).replace('/*__TERPGRID_PRECACHE__*/', precache.map((f) => JSON.stringify(f)).join(', ')),
        );
      } catch {
        /* kein Service Worker im Build */
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin(), swVersionPlugin()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    rollupOptions: {
      output: {
        // Nur die Diagramm-Bibliothek selbst (inkl. d3/victory) in einen eigenen Chunk – gemeinsame
        // Abhängigkeiten wie React bleiben im Einstiegs-Chunk, sonst wird „charts“ bei jedem Start geladen.
        manualChunks(id) {
          if (/node_modules\/(recharts|d3-[^/]+|victory-vendor|internmap|decimal\.js-light|recharts-scale|es-toolkit|eventemitter3|immer|reselect|@reduxjs|redux|react-redux|use-sync-external-store\/with-selector)\//.test(id)) return 'charts';
          // Rollup zieht nicht zugeordnete Abhängigkeiten eines manuellen Chunks in diesen hinein –
          // React deshalb ausdrücklich eigenem Chunk zuordnen (wird ohnehin beim Start gebraucht).
          if (/node_modules\/(react|react-dom|scheduler|react-is)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
