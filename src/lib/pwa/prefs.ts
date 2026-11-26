/** Geräteeinstellungen der App-Darstellung (nur dieser Browser, keine privaten Daten). */
const REDUCE_KEY = 'terpgrid.device.reduceMotion';

export function reduceMotionPref(): boolean {
  try {
    return localStorage.getItem(REDUCE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setReduceMotionPref(on: boolean): void {
  try {
    if (on) localStorage.setItem(REDUCE_KEY, '1');
    else localStorage.removeItem(REDUCE_KEY);
  } catch {
    /* ignorieren */
  }
  applyReduceMotion();
}

export function applyReduceMotion(): void {
  if (typeof document === 'undefined') return;
  if (reduceMotionPref()) document.documentElement.dataset.reduceMotion = '1';
  else delete document.documentElement.dataset.reduceMotion;
}
