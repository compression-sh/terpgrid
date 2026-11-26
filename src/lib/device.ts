/**
 * Geräteeinstellungen (nicht kontobezogen, nur dieser Browser).
 *
 * „Geteiltes Gerät“: Die lokale Arbeitskopie wird beim Abmelden immer gelöscht,
 * die zuletzt verwendete Kennung wird nicht gespeichert und Offline-Weiterarbeiten
 * ist deaktiviert. Das schützt nicht vor Schadsoftware oder Personen mit Zugriff
 * auf ein angemeldetes, entsperrtes Gerät.
 */
const SHARED_KEY = 'terpgrid.device.shared';

export function isSharedDevice(): boolean {
  try {
    return localStorage.getItem(SHARED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSharedDevice(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(SHARED_KEY, '1');
      localStorage.removeItem('terpgrid.lastAccount');
      // Geteiltes Gerät erzwingt „Offline-Nutzung aus“ für alle Konten
      localStorage.removeItem('terpgrid.device.offlineDbs');
    } else localStorage.removeItem(SHARED_KEY);
  } catch {
    /* ignorieren */
  }
}

/** Entfernt kontobezogene Einträge eines Kontos aus localStorage (z. B. THC-Lab-Entwürfe). */
export function clearAccountLocalStorage(accountKey: string): void {
  try {
    const prefix = `terpgrid.u.${accountKey}.`;
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
  } catch {
    /* ignorieren */
  }
}
