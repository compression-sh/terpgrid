import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import App from './App';
import { initPwa } from './lib/pwa/pwa';
import { applyReduceMotion } from './lib/pwa/prefs';
import { initLocale } from './i18n';

applyReduceMotion();

// Sprache vor dem ersten Rendern festlegen (Gerätewahl → Browsersprache → Deutsch), damit nichts umspringt.
void initLocale()
  .catch(() => {})
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );

// PWA: nur die öffentliche App-Hülle wird gecacht (siehe public/sw.js) – nie API-Antworten.
// Updates werden erst nach Bestätigung aktiviert (src/lib/pwa/pwa.ts).
initPwa(import.meta.env.PROD);
