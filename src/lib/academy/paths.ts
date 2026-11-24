/**
 * Lernpfade: kuratierte Reihenfolgen vorhandener Artikel. Der Fortschritt ergibt sich aus dem
 * Lesefortschritt je Artikel (Kontoeinstellung kbProgress) – es wird nichts zusätzlich gespeichert.
 */
export interface LearningPath {
  id: string;
  title: string;
  description: string;
  articles: string[];
  color: string;
}

export const LEARNING_PATHS: LearningPath[] = [
  {
    id: 'einstieg-anbau',
    title: 'Einstieg in den Anbau',
    description: 'Phasen, Licht, Klima und Messwerte – die Grundlagen für den ersten eigenen Grow.',
    articles: ['anbau-ueberblick', 'lebenszyklus', 'licht-ppfd-dli', 'klima-vpd', 'ph-ec', 'bewaesserung'],
    color: '#5fe39a',
  },
  {
    id: 'licht-klima',
    title: 'Licht & Klima vertiefen',
    description: 'Was Lichtmenge, Photoperiode, UV und Luftfeuchte laut Studien tatsächlich bewirken.',
    articles: ['licht-ppfd-dli', 'photoperiode', 'uv-licht', 'klima-vpd'],
    color: '#f5d061',
  },
  {
    id: 'gesund-bis-ernte',
    title: 'Gesund bis zur Ernte',
    description: 'Nährstoffe, Symptome, Krankheiten, Schädlinge – und der richtige Erntezeitpunkt.',
    articles: ['naehrstoffe-npk', 'organisch-mineralisch', 'mangel-erkennen', 'krankheiten', 'schaedlinge', 'erntezeitpunkt', 'trocknen-curen'],
    color: '#38bdf8',
  },
  {
    id: 'wirkstoffe-risiko',
    title: 'Wirkstoffe & Risiken',
    description: 'Cannabinoide, Terpene, Laborwerte und was beim Konsum zu beachten ist.',
    articles: ['cannabinoide', 'thc-cbd', 'terpene', 'terpene-analytik', 'laborberichte-lesen', 'wirkungsdauer', 'edibles-fahren', 'risikominimierung'],
    color: '#fbbf24',
  },
];

/** Anteil gelesener Artikel eines Pfads (0–1) und nächster ungelesener Artikel */
export function pathProgress(p: LearningPath, progress: Record<string, number>) {
  const done = p.articles.filter((id) => (progress[id] ?? 0) >= 0.98).length;
  return { done, total: p.articles.length, ratio: done / p.articles.length, next: p.articles.find((id) => (progress[id] ?? 0) < 0.98) };
}
