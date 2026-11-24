/**
 * Glossar der Academy. Kurze Begriffserklärungen, jeweils mit einem Artikel, der den Begriff vertieft
 * und belegt. Auch über die Befehlspalette (Strg+K) durchsuchbar.
 */
export interface GlossaryTerm {
  id: string;
  term: string;
  /** Weitere Schreibweisen/Abkürzungen für die Suche */
  aka?: string[];
  definition: string;
  article: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  { id: 'autoflowering', term: 'Autoflowering', aka: ['Automatic', 'Auto'], definition: 'Sorten, die weitgehend unabhängig von der Tageslänge in die Blüte gehen.', article: 'anbau-ueberblick' },
  { id: 'botrytis', term: 'Botrytis', aka: ['Grauschimmel', 'Blütenfäule', 'bud rot'], definition: 'Pilz (Botrytis cinerea), der u. a. Blütenfäule und Schimmel nach der Ernte verursacht; begünstigt durch hohe Feuchte.', article: 'krankheiten' },
  { id: 'cbd', term: 'CBD', aka: ['Cannabidiol'], definition: 'Nicht berauschendes Cannabinoid; entsteht beim Erhitzen aus der Säureform CBDA.', article: 'thc-cbd' },
  { id: 'chemotyp', term: 'Chemotyp', aka: ['Chemovar'], definition: 'Einteilung von Pflanzen nach ihrem Inhaltsstoffprofil, z. B. THC-dominant oder CBD-dominant.', article: 'thc-cbd' },
  { id: 'curen', term: 'Curen', aka: ['Curing', 'Fermentieren'], definition: 'Luftdichte, dunkle Lagerung getrockneter Blüten nach dem Trocknen.', article: 'trocknen-curen' },
  { id: 'decarboxylierung', term: 'Decarboxylierung', definition: 'Umwandlung der Cannabinoidsäuren (THCA, CBDA) in THC bzw. CBD durch Wärme; auch beim Trocknen teilweise beobachtet.', article: 'trocknen-curen' },
  { id: 'dli', term: 'DLI', aka: ['Daily Light Integral', 'Tageslichtintegral'], definition: 'Tagessumme des photosynthetisch nutzbaren Lichts in mol·m⁻²·d⁻¹ (PPFD × Beleuchtungsdauer).', article: 'licht-ppfd-dli' },
  { id: 'ec', term: 'EC', aka: ['elektrische Leitfähigkeit', 'Leitwert'], definition: 'Elektrische Leitfähigkeit einer Lösung (meist mS/cm); grobes Maß für die Menge gelöster Salze bzw. Dünger.', article: 'ph-ec' },
  { id: 'ernteindex', term: 'Ernteindex', aka: ['Harvest Index'], definition: 'Anteil der vermarktbaren Blüten an der gesamten oberirdischen Biomasse.', article: 'licht-ppfd-dli' },
  { id: 'fernrot', term: 'Fernrot', aka: ['Far-Red', 'FR'], definition: 'Licht knapp oberhalb von 700 nm; beeinflusst Schattenreaktionen und Blühsteuerung.', article: 'photoperiode' },
  { id: 'gc-ms', term: 'GC-MS', aka: ['Gaschromatographie-Massenspektrometrie'], definition: 'Messverfahren zur Trennung und Identifizierung flüchtiger Stoffe wie Terpene.', article: 'terpene-analytik' },
  { id: 'hlvd', term: 'Hop Latent Viroid', aka: ['HLVd', 'Dudding'], definition: 'Viroid, das Pflanzen verkümmern lässt; vorbeugend nur saubere, getestete Mutterpflanzen verwenden.', article: 'krankheiten' },
  { id: 'hplc', term: 'HPLC', aka: ['Hochleistungsflüssigkeitschromatographie'], definition: 'Übliches Verfahren zur Messung von Cannabinoiden einschließlich ihrer Säureformen.', article: 'laborberichte-lesen' },
  { id: 'hydrokultur', term: 'Hydrokultur', aka: ['DWC', 'Deep Water Culture'], definition: 'Anbau ohne Erde; die Wurzeln stehen in einer Nährlösung oder einem inerten Substrat.', article: 'ph-ec' },
  { id: 'isomer', term: 'Isomer', definition: 'Verbindungen mit gleicher Summenformel, aber unterschiedlicher Struktur, z. B. α- und β-Pinen.', article: 'terpene-analytik' },
  { id: 'mehltau', term: 'Echter Mehltau', aka: ['Powdery Mildew', 'Golovinomyces'], definition: 'Pilzkrankheit mit weißem, mehligem Belag auf Blättern.', article: 'krankheiten' },
  { id: 'monoezisch', term: 'Einhäusig', aka: ['monözisch', 'Zwitter', 'hermaphrodit'], definition: 'Pflanze mit männlichen und weiblichen Blüten.', article: 'geschlecht-zwitter' },
  { id: 'npk', term: 'NPK', aka: ['Stickstoff', 'Phosphor', 'Kalium'], definition: 'Die drei Hauptnährstoffe Stickstoff (N), Phosphor (P) und Kalium (K).', article: 'naehrstoffe-npk' },
  { id: 'ph', term: 'pH-Wert', aka: ['pH'], definition: 'Logarithmisches Maß für den Säuregrad einer Lösung; beeinflusst die Verfügbarkeit von Nährstoffen.', article: 'ph-ec' },
  { id: 'phaenotyp', term: 'Phänotyp', aka: ['Pheno'], definition: 'Erscheinungsbild einer einzelnen Pflanze, geprägt von Genetik und Umwelt.', article: 'genetik' },
  { id: 'photoperiode', term: 'Photoperiode', aka: ['Lichtphase', '12/12'], definition: 'Verhältnis von Licht- und Dunkelzeit pro Tag; steuert die Blüte photoperiodischer Sorten.', article: 'photoperiode' },
  { id: 'ppfd', term: 'PPFD', aka: ['Photonenflussdichte', 'µmol'], definition: 'Photosynthetisch nutzbare Photonen pro Quadratmeter und Sekunde (µmol·m⁻²·s⁻¹).', article: 'licht-ppfd-dli' },
  { id: 'pythium', term: 'Pythium', aka: ['Wurzelfäule'], definition: 'Erreger von Wurzel- und Stängelfäule; begünstigt durch Staunässe und verletzte Wurzeln.', article: 'krankheiten' },
  { id: 'spinnmilbe', term: 'Spinnmilbe', aka: ['Tetranychus urticae', 'Spider Mite'], definition: 'Saugender Schädling auf Blattunterseiten; feine Gespinste und helle Saugpunkte.', article: 'schaedlinge' },
  { id: 'stigma', term: 'Narbe', aka: ['Stigma', 'Blütenhaar', 'Pistille'], definition: 'Teil der weiblichen Blüte; ihre Farbe wird zur Bestimmung des Erntezeitpunkts genutzt.', article: 'erntezeitpunkt' },
  { id: 'terpen', term: 'Terpen', aka: ['Terpenoid'], definition: 'Flüchtige Duftstoffe der Pflanze; Profile schwanken zwischen Pflanzen, Anbau und Trocknung.', article: 'terpene' },
  { id: 'thc', term: 'THC', aka: ['Δ9-THC', 'Tetrahydrocannabinol'], definition: 'Hauptsächlich berauschendes Cannabinoid; entsteht beim Erhitzen aus THCA.', article: 'thc-cbd' },
  { id: 'thca', term: 'THCA', aka: ['Tetrahydrocannabinolsäure'], definition: 'Säureform von THC, in der Pflanze überwiegend vorhanden.', article: 'cannabinoide' },
  { id: 'topfkapazitaet', term: 'Topfkapazität', aka: ['Container Capacity'], definition: 'Wassermenge, die ein Substrat nach dem Abtropfen halten kann; Bezugsgröße für Bewässerung.', article: 'bewaesserung' },
  { id: 'trichom', term: 'Trichom', definition: 'Drüsenhaare, in denen Cannabinoide und Terpene gebildet werden.', article: 'botanik' },
  { id: 'uv', term: 'UV-Licht', aka: ['UVA', 'UVB'], definition: 'Ultraviolette Strahlung; brachte in einer kontrollierten Studie keinen Ertrags- oder Cannabinoidvorteil.', article: 'uv-licht' },
  { id: 'vpd', term: 'VPD', aka: ['Dampfdruckdefizit', 'Vapor Pressure Deficit'], definition: 'Differenz zwischen maximal möglichem und tatsächlichem Wasserdampfdruck der Luft (kPa); treibt die Verdunstung an.', article: 'klima-vpd' },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function searchGlossary(q: string): GlossaryTerm[] {
  const k = norm(q.trim());
  if (k.length < 2) return [];
  return GLOSSARY.filter((g) => [g.term, ...(g.aka ?? [])].some((a) => norm(a).includes(k)));
}
