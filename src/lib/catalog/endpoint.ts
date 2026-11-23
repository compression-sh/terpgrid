/**
 * Ziel der Katalog-Anfragen: im Lokalmodus direkt bei den Anbietern,
 * im Servermodus über den festen Proxy der eigenen Instanz (/api/catalog/…).
 * Persönliche Daten werden in keinem Modus an die Anbieter gesendet.
 */
const DIRECT = {
  strainapi: 'https://www.strainapi.com/wp-json/strainapi/v1',
  cannalib: 'https://api.cannalib.org',
};

let proxyOrigin: string | null = null;

export function setCatalogProxy(origin: string | null): void {
  proxyOrigin = origin;
}
export const catalogViaProxy = () => proxyOrigin !== null;
export const strainapiBase = () => (proxyOrigin ? `${proxyOrigin}/api/catalog/strainapi` : DIRECT.strainapi);
export const cannalibBase = () => (proxyOrigin ? `${proxyOrigin}/api/catalog/cannalib` : DIRECT.cannalib);
/** Proxy braucht das Session-Cookie der eigenen Instanz; Anbieter erhalten nie Cookies. */
export const catalogCredentials = (): RequestCredentials => (proxyOrigin ? 'same-origin' : 'omit');

/** Bildquelle: im Servermodus über den Bild-Proxy (kein direkter Kontakt des Browsers zum Anbieter). */
export function imageSrc(url: string): string {
  return proxyOrigin ? `${proxyOrigin}/api/catalog/image?u=${encodeURIComponent(url)}` : url;
}
