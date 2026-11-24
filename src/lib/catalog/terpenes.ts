/**
 * Terpen-Atlas: kuratierte Grunddaten zu häufig in Cannabis beschriebenen Terpenen.
 * Chemische Angaben nach PubChem (NIH). Aroma- und Vorkommensangaben nach den
 * genannten Übersichtsarbeiten. Es werden bewusst KEINE gesundheitlichen Wirkungen
 * behauptet – das Vorkommen eines Terpens ist keine Wirkungsaussage.
 */

import chemData from './terpene-chem.json';

export type AromaFamily = 'erdig' | 'zitrisch' | 'würzig' | 'harzig' | 'blumig' | 'krautig' | 'fruchtig' | 'holzig';

export interface TerpeneSource {
  label: string;
  url: string;
}

export type TerpeneClass =
  | 'Monoterpen'
  | 'Monoterpenoid (Alkohol)'
  | 'Monoterpenoid (Ether)'
  | 'Monoterpenoid (Keton)'
  | 'Aromatischer Monoterpen-Kohlenwasserstoff'
  | 'Sesquiterpen'
  | 'Sesquiterpenoid (Alkohol)'
  | 'Sesquiterpenoid (Epoxid)';

export interface TerpeneInfo {
  id: string;
  name: string;
  /** Alternative Schreibweisen (für die Zuordnung von API-Namen) */
  aliases: string[];
  className: TerpeneClass;
  formula: string;
  molarMass: number;
  cas: string;
  pubchemCid: number;
  /** Deutsche Stichworte – nur aus belegten Geruchsbeschreibungen (PubChem bzw. genannte Übersichtsarbeiten) */
  aroma: string[];
  families: AromaFamily[];
  /** Vorkommen außerhalb von Cannabis (nur bei Einträgen mit Literaturbeleg, sonst leer) */
  occurrences: string[];
  summary: string;
  color: string;
  sources: TerpeneSource[];
}

const BOOTH = { label: 'Booth JK, Bohlmann J (2019). Terpenes in Cannabis sativa – From plant genome to humans. Plant Science 284:67–72.', url: 'https://doi.org/10.1016/j.plantsci.2019.03.022' };
const HANUS = { label: 'Hanuš LO, Hod Y (2020). Terpenes/Terpenoids in Cannabis: Are They Important? Med Cannabis Cannabinoids 3(1):25–60.', url: 'https://doi.org/10.1159/000509733' };
const RUSSO = { label: 'Russo EB (2011). Taming THC: potential cannabis synergy and phytocannabinoid-terpenoid entourage effects. Br J Pharmacol 163(7):1344–1364.', url: 'https://doi.org/10.1111/j.1476-5381.2011.01238.x' };
const BOOTH17 = {
  label: 'Booth JK, Page JE, Bohlmann J (2017). Terpene synthases from Cannabis sativa. PLoS One 12(3):e0173911 (Open Access, Volltext geprüft)',
  url: 'https://doi.org/10.1371/journal.pone.0173911',
};
const JANTA24 = {
  label: 'Janta P, Vimolmangkang S (2024). Chemical profiling and clustering of various dried cannabis flowers revealed by volatilomics and chemometric processing. J Cannabis Res 6:44 (Open Access, Volltext geprüft; Identifizierung laut Autoren vorläufig)',
  url: 'https://doi.org/10.1186/s42238-024-00252-w',
};
const pubchem = (cid: number, name: string): TerpeneSource => ({ label: `PubChem: ${name} (CID ${cid})`, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}` });

/** Chemische Identität aus PubChem (abgerufen über PUG REST, siehe terpene-chem.json und scripts/verify-terpenes.mjs) */
export interface TerpeneChem {
  cid: number;
  /** Titel des PubChem-Eintrags (zeigt u. a., ob eine bestimmte Stereoform gemeint ist) */
  title: string;
  formula: string;
  mw: number;
  iupac: string;
  inchikey: string;
  /** Erste von PubChem gelistete CAS-Nummer (Prüfziffer validiert); casListed = Anzahl gelisteter CAS-Nummern */
  cas: string | null;
  casListed: number;
  odor: { text: string; section: string; source: string }[];
  structure: { a: (string | number)[][]; b: number[][] };
}
export const CHEM_META = { retrieved: chemData.retrieved, source: chemData.source };
const CHEM = chemData.compounds as unknown as Record<string, TerpeneChem>;
export function terpeneChem(id: string): TerpeneChem | undefined {
  return CHEM[id];
}
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
export const prettyFormula = (f: string) => f.replace(/\d/g, (d) => SUB[d] ?? d);
function chemOf(id: string) {
  const c = CHEM[id];
  if (!c) throw new Error(`PubChem-Daten fehlen: ${id}`);
  return { formula: prettyFormula(c.formula), molarMass: c.mw, cas: c.cas ?? '', pubchemCid: c.cid };
}

export const TERPENES: TerpeneInfo[] = [
  {
    id: 'myrcene',
    name: 'Myrcen',
    aliases: ['myrcene', 'beta-myrcene', 'β-myrcene', 'b-myrcene', 'beta myrcene', 'beta_myrcene', 'myrcen', 'β-myrcen'],
    className: 'Monoterpen',
    formula: 'C₁₀H₁₆',
    molarMass: 136.23,
    cas: '123-35-3',
    pubchemCid: 31253,
    aroma: ['erdig', 'moschusartig', 'krautig', 'leicht fruchtig'],
    families: ['erdig', 'krautig', 'fruchtig'],
    occurrences: ['Hopfen', 'Zitronengras', 'Lorbeer', 'Thymian'],
    summary: 'Acyclisches Monoterpen und in vielen Cannabis-Chemotypen eines der mengenmäßig häufigsten Terpene. Prägt erdig-krautige Noten.',
    color: '#8fbf7f',
    sources: [pubchem(31253, 'Myrcene'), BOOTH, HANUS, BOOTH17],
  },
  {
    id: 'limonene',
    name: 'Limonen',
    aliases: ['limonene', 'd-limonene', 'delta-limonene', 'δ-limonene', '(+)-limonene', 'limonen', 'd-limonen'],
    className: 'Monoterpen',
    formula: 'C₁₀H₁₆',
    molarMass: 136.23,
    cas: '5989-27-5',
    pubchemCid: 440917,
    aroma: ['zitrisch', 'frisch', 'orangenartig'],
    families: ['zitrisch', 'fruchtig'],
    occurrences: ['Schalen von Zitrusfrüchten (Orange, Zitrone)', 'Kümmel', 'Dill'],
    summary: 'Zyklisches Monoterpen mit typischem Zitrusduft. Die (R)-(+)-Form (D-Limonen) ist der Hauptbestandteil vieler Zitrusschalenöle.',
    color: '#f5d061',
    sources: [pubchem(440917, 'D-Limonene'), BOOTH, HANUS, BOOTH17],
  },
  {
    id: 'caryophyllene',
    name: 'β-Caryophyllen',
    aliases: ['caryophyllene', 'beta-caryophyllene', 'β-caryophyllene', 'b-caryophyllene', 'beta caryophyllene', 'trans-caryophyllene', 'caryophyllen', 'β-caryophyllen', 'beta-caryophyllen'],
    className: 'Sesquiterpen',
    formula: 'C₁₅H₂₄',
    molarMass: 204.35,
    cas: '87-44-5',
    pubchemCid: 5281515,
    aroma: ['pfeffrig', 'würzig', 'holzig'],
    families: ['würzig', 'holzig'],
    occurrences: ['Schwarzer Pfeffer', 'Gewürznelke', 'Hopfen', 'Rosmarin'],
    summary:
      'Bicyclisches Sesquiterpen mit würzig-pfeffrigem Aroma. In Laborstudien bindet es an den CB2-Rezeptor (Gertsch et al. 2008) – daraus lässt sich keine gesundheitliche Wirkung beim Konsum ableiten.',
    color: '#d39a5b',
    sources: [pubchem(5281515, 'beta-Caryophyllene'), { label: 'Gertsch J et al. (2008). Beta-caryophyllene is a dietary cannabinoid. PNAS 105(26):9099–9104.', url: 'https://doi.org/10.1073/pnas.0803601105' }, BOOTH, BOOTH17],
  },
  {
    id: 'alpha-pinene',
    name: 'α-Pinen',
    aliases: ['alpha-pinene', 'α-pinene', 'a-pinene', 'alpha pinene', 'alpha_pinene', 'α-pinen', 'alpha-pinen', '(+)-alpha-pinene'],
    className: 'Monoterpen',
    formula: 'C₁₀H₁₆',
    molarMass: 136.23,
    cas: '80-56-8',
    pubchemCid: 6654,
    aroma: ['harzig', 'kiefernartig', 'frisch'],
    families: ['harzig', 'holzig'],
    occurrences: ['Kiefern und andere Nadelhölzer', 'Rosmarin', 'Basilikum'],
    summary: 'Bicyclisches Monoterpen, Hauptbestandteil von Terpentinöl. Verleiht harzig-frische Nadelholznoten.',
    color: '#5fb39a',
    sources: [pubchem(6654, 'alpha-Pinene'), BOOTH, HANUS, BOOTH17],
  },
  {
    id: 'linalool',
    name: 'Linalool',
    aliases: ['linalool', 'linalol', 'beta-linalool'],
    className: 'Monoterpenoid (Alkohol)',
    formula: 'C₁₀H₁₈O',
    molarMass: 154.25,
    cas: '78-70-6',
    pubchemCid: 6549,
    aroma: ['blumig', 'lavendelartig', 'leicht süß'],
    families: ['blumig'],
    occurrences: ['Lavendel', 'Koriander', 'Basilikum', 'Zimt'],
    summary: 'Terpenalkohol mit blumigem Duft, der in vielen Duftpflanzen vorkommt. In Cannabis meist in geringeren Mengen gemessen.',
    color: '#b39ddb',
    sources: [pubchem(6549, 'Linalool'), BOOTH, RUSSO, BOOTH17],
  },
  {
    id: 'humulene',
    name: 'α-Humulen',
    aliases: ['humulene', 'alpha-humulene', 'α-humulene', 'a-humulene', 'alpha humulene', 'humulen', 'α-humulen', 'alpha-caryophyllene'],
    className: 'Sesquiterpen',
    formula: 'C₁₅H₂₄',
    molarMass: 204.35,
    cas: '6753-98-6',
    pubchemCid: 5281520,
    aroma: ['erdig', 'holzig', 'hopfig'],
    families: ['erdig', 'holzig', 'krautig'],
    occurrences: ['Hopfen (Humulus lupulus)', 'Salbei', 'Ginseng'],
    summary: 'Monocyclisches Sesquiterpen, Isomer des β-Caryophyllens. Namensgebend ist Hopfen, in dem es reichlich vorkommt.',
    color: '#a3a06a',
    sources: [pubchem(5281520, 'alpha-Humulene'), BOOTH, HANUS, BOOTH17],
  },
  {
    id: 'terpinolene',
    name: 'Terpinolen',
    aliases: ['terpinolene', 'terpinolen', 'alpha-terpinolene', 'δ-terpinene'],
    className: 'Monoterpen',
    formula: 'C₁₀H₁₆',
    molarMass: 136.23,
    cas: '586-62-9',
    pubchemCid: 11463,
    aroma: ['frisch', 'krautig', 'leicht blumig', 'harzig'],
    families: ['krautig', 'blumig', 'harzig'],
    occurrences: ['Teebaumöl', 'Muskatnuss', 'Nadelhölzer'],
    summary: 'Monocyclisches Monoterpen. In Cannabis kommt es nur in einem Teil der Chemotypen als dominantes Terpen vor.',
    color: '#7cc7d9',
    sources: [pubchem(11463, 'Terpinolene'), BOOTH, HANUS, BOOTH17],
  },
  {
    id: 'beta-pinene',
    name: 'β-Pinen',
    aliases: ['beta-pinene', 'β-pinene', 'b-pinene', 'beta pinene', 'beta_pinene', 'β-pinen', 'beta-pinen', '(+)-beta-pinene'],
    className: 'Monoterpen',
    ...chemOf('beta-pinene'),
    aroma: ['kiefernartig', 'harzig', 'holzig', 'terpentinartig'],
    families: ['harzig', 'holzig'],
    occurrences: [],
    summary: 'Bicyclisches Monoterpen, Strukturisomer des α-Pinens (exocyclische statt ringständige Doppelbindung). In Cannabis-Blüten neben α-Pinen gemessen.',
    color: '#4f9f88',
    sources: [pubchem(14896, 'beta-Pinene'), BOOTH17],
  },
  {
    id: 'beta-ocimene',
    name: 'β-Ocimen',
    aliases: ['beta-ocimene', 'β-ocimene', 'b-ocimene', 'beta ocimene', 'trans-beta-ocimene', '(e)-beta-ocimene', 'cis-beta-ocimene', '(z)-beta-ocimene', 'β-ocimen'],
    className: 'Monoterpen',
    ...chemOf('beta-ocimene'),
    aroma: ['warm', 'krautig'],
    families: ['krautig'],
    occurrences: [],
    summary: 'Acyclisches Monoterpen mit (E)- und (Z)-Form. Booth et al. (2017) nennen (E)-β-Ocimen unter den Hauptbestandteilen des Harzes der Sorte ‚Finola‘.',
    color: '#9ccf7a',
    sources: [pubchem(18756, 'beta-Ocimene'), BOOTH17],
  },
  {
    id: 'trans-nerolidol',
    name: 'trans-Nerolidol',
    aliases: ['trans-nerolidol', '(e)-nerolidol', 'e-nerolidol', 'trans nerolidol'],
    className: 'Sesquiterpenoid (Alkohol)',
    ...chemOf('trans-nerolidol'),
    aroma: ['schwach holzig-blumig', 'leicht nach Rosen und Apfel'],
    families: ['holzig', 'blumig', 'fruchtig'],
    occurrences: [],
    summary: 'Acyclischer Sesquiterpenalkohol; die (E)-Form ist hier abgebildet. In getrockneten Cannabisblüten per HS-SPME-GC-MS (vorläufig) identifiziert.',
    color: '#c7a3c9',
    sources: [pubchem(5284507, 'Nerolidol'), JANTA24],
  },
  {
    id: 'bisabolol',
    name: 'α-Bisabolol',
    aliases: ['bisabolol', 'alpha-bisabolol', 'α-bisabolol', 'a-bisabolol', 'alpha bisabolol', 'levomenol'],
    className: 'Sesquiterpenoid (Alkohol)',
    ...chemOf('bisabolol'),
    aroma: ['fruchtig', 'nussig', 'leicht nach Kokos'],
    families: ['fruchtig', 'blumig'],
    occurrences: [],
    summary: 'Monocyclischer Sesquiterpenalkohol. Der PubChem-Eintrag ohne Stereoangabe wird verwendet, da Quellen die Form meist nicht angeben; die natürliche (–)-Form heißt Levomenol.',
    color: '#e8c3a0',
    sources: [pubchem(10586, 'alpha-Bisabolol (Stereochemie nicht festgelegt)'), JANTA24],
  },
  {
    id: 'eucalyptol',
    name: 'Eukalyptol (1,8-Cineol)',
    aliases: ['eucalyptol', '1,8-cineole', '1,8-cineol', 'cineole', 'cineol', 'eukalyptol'],
    className: 'Monoterpenoid (Ether)',
    ...chemOf('eucalyptol'),
    aroma: ['kampferartig'],
    families: ['krautig'],
    occurrences: [],
    summary: 'Bicyclischer Monoterpen-Ether. In getrockneten Cannabisblüten nur in einzelnen Proben und in Spuren identifiziert.',
    color: '#9fd3c7',
    sources: [pubchem(2758, 'Eucalyptol'), JANTA24],
  },
  {
    id: 'camphene',
    name: 'Camphen',
    aliases: ['camphene', 'camphen', 'kamphen'],
    className: 'Monoterpen',
    ...chemOf('camphene'),
    aroma: ['kampferartig', 'kühlend', 'nach Kiefernholz'],
    families: ['harzig', 'holzig'],
    occurrences: [],
    summary: 'Bicyclisches Monoterpen. Nebenprodukt einer Cannabis-Terpensynthase (Booth et al. 2017) und in getrockneten Blüten identifiziert.',
    color: '#78b59a',
    sources: [pubchem(6616, 'Camphene'), BOOTH17, JANTA24],
  },
  {
    id: 'delta-3-carene',
    name: 'δ-3-Caren',
    aliases: ['delta-3-carene', 'delta 3 carene', 'δ-3-carene', '3-carene', 'delta3-carene', 'carene', 'δ3-caren', 'delta-3-caren'],
    className: 'Monoterpen',
    ...chemOf('delta-3-carene'),
    aroma: ['süßlich', 'terpentinartig'],
    families: ['harzig'],
    occurrences: [],
    summary: 'Bicyclisches Monoterpen. Wird in Seedbank-Texten häufig genannt; ein Cannabis-Vorkommen ist in den hier geprüften Quellen nicht belegt.',
    color: '#8db3a0',
    sources: [pubchem(26049, '3-Carene')],
  },
  {
    id: 'geraniol',
    name: 'Geraniol',
    aliases: ['geraniol', 'trans-geraniol'],
    className: 'Monoterpenoid (Alkohol)',
    ...chemOf('geraniol'),
    aroma: ['süß nach Rosen', 'geranienartig', 'blumig'],
    families: ['blumig'],
    occurrences: [],
    summary: 'Acyclischer Monoterpenalkohol ((E)-Form). Booth et al. (2017) beschreiben Monoterpenalkohole wie Linalool und Geraniol als häufig in manchen Cannabissorten.',
    color: '#d7a6c8',
    sources: [pubchem(637566, 'Geraniol'), BOOTH17],
  },
  {
    id: 'borneol',
    name: 'Borneol',
    aliases: ['borneol', 'endo-borneol'],
    className: 'Monoterpenoid (Alkohol)',
    ...chemOf('borneol'),
    aroma: ['kiefernartig', 'kampferartig'],
    families: ['harzig', 'krautig'],
    occurrences: [],
    summary: 'Bicyclischer Monoterpenalkohol. Ein Cannabis-Vorkommen ist in den hier geprüften Quellen nicht belegt.',
    color: '#a5c2b0',
    sources: [pubchem(64685, 'Borneol')],
  },
  {
    id: 'sabinene',
    name: 'Sabinen',
    aliases: ['sabinene', 'sabinen'],
    className: 'Monoterpen',
    ...chemOf('sabinene'),
    aroma: [],
    families: [],
    occurrences: [],
    summary: 'Bicyclisches Monoterpen. Booth et al. (2017) fanden es als Produkt einer Cannabis-Terpensynthase (CsTPS5FN); PubChem enthält keine Geruchsbeschreibung.',
    color: '#9bbf8a',
    sources: [pubchem(18818, 'Sabinene'), BOOTH17],
  },
  {
    id: 'alpha-terpineol',
    name: 'α-Terpineol',
    aliases: ['alpha-terpineol', 'α-terpineol', 'a-terpineol', 'alpha terpineol', 'l-alpha-terpineol'],
    className: 'Monoterpenoid (Alkohol)',
    ...chemOf('alpha-terpineol'),
    aroma: ['blumig', 'fliederartig'],
    families: ['blumig'],
    occurrences: [],
    summary: 'Monocyclischer Monoterpenalkohol. In getrockneten Cannabisblüten identifiziert.',
    color: '#b8a3d6',
    sources: [pubchem(17100, 'alpha-Terpineol'), JANTA24],
  },
  {
    id: 'valencene',
    name: 'Valencen',
    aliases: ['valencene', 'valencen'],
    className: 'Sesquiterpen',
    ...chemOf('valencene'),
    aroma: [],
    families: [],
    occurrences: [],
    summary: 'Bicyclisches Sesquiterpen. Booth et al. (2017) beschreiben es als Produkt von Cannabis-Terpensynthasen (u. a. CsTPS8); PubChem enthält keine Geruchsbeschreibung.',
    color: '#e2b86a',
    sources: [pubchem(9855795, 'Valencene'), BOOTH17],
  },
  {
    id: 'alpha-phellandrene',
    name: 'α-Phellandren',
    aliases: ['alpha-phellandrene', 'α-phellandrene', 'a-phellandrene', 'alpha phellandrene'],
    className: 'Monoterpen',
    ...chemOf('alpha-phellandrene'),
    aroma: ['pfeffrig', 'holzig', 'krautig'],
    families: ['würzig', 'holzig', 'krautig'],
    occurrences: [],
    summary: 'Monocyclisches Monoterpen. In den geprüften Cannabis-Quellen ist nur das Isomer β-Phellandren belegt, nicht α-Phellandren.',
    color: '#b9a56d',
    sources: [pubchem(7460, 'alpha-Phellandrene')],
  },
  {
    id: 'pulegone',
    name: 'Pulegon',
    aliases: ['pulegone', 'pulegon', '(+)-pulegone'],
    className: 'Monoterpenoid (Keton)',
    ...chemOf('pulegone'),
    aroma: ['zwischen Pfefferminze und Kampfer'],
    families: ['krautig'],
    occurrences: [],
    summary: 'Monocyclisches Monoterpen-Keton (abgebildet: (R)-(+)-Pulegon). Ein Cannabis-Vorkommen ist in den hier geprüften Quellen nicht belegt.',
    color: '#8cc6b0',
    sources: [pubchem(442495, '(+)-Pulegone')],
  },
  {
    id: 'guaiol',
    name: 'Guaiol',
    aliases: ['guaiol', 'guajol'],
    className: 'Sesquiterpenoid (Alkohol)',
    ...chemOf('guaiol'),
    aroma: [],
    families: [],
    occurrences: [],
    summary: 'Bicyclischer Sesquiterpenalkohol (Guajan-Gerüst). In getrockneten Cannabisblüten identifiziert; PubChem enthält keine Geruchsbeschreibung.',
    color: '#b59b78',
    sources: [pubchem(227829, 'Guaiol'), JANTA24],
  },
  {
    id: 'fenchol',
    name: 'Fenchol',
    aliases: ['fenchol', 'fenchyl alcohol', 'beta-fenchol', 'b-fenchol', 'fenchylalkohol'],
    className: 'Monoterpenoid (Alkohol)',
    ...chemOf('fenchol'),
    aroma: ['kampferartig'],
    families: ['krautig', 'harzig'],
    occurrences: [],
    summary: 'Bicyclischer Monoterpenalkohol. In getrockneten Cannabisblüten (als β-Fenchol) identifiziert.',
    color: '#a0c9b8',
    sources: [pubchem(15406, 'Fenchol'), JANTA24],
  },
  {
    id: 'caryophyllene-oxide',
    name: 'Caryophyllenoxid',
    aliases: ['caryophyllene oxide', 'caryophyllene-oxide', 'caryophyllenoxid', 'beta-caryophyllene oxide', 'β-caryophyllene oxide'],
    className: 'Sesquiterpenoid (Epoxid)',
    ...chemOf('caryophyllene-oxide'),
    aroma: ['süß-fruchtig'],
    families: ['fruchtig'],
    occurrences: [],
    summary: 'Epoxid des β-Caryophyllens, entsteht u. a. durch Oxidation. In getrockneten Cannabisblüten identifiziert.',
    color: '#c89a72',
    sources: [pubchem(1742210, 'Caryophyllene oxide'), JANTA24],
  },
  {
    id: 'p-cymene',
    name: 'p-Cymol',
    aliases: ['p-cymene', 'para-cymene', 'p-cymol', 'cymene', 'cymol'],
    className: 'Aromatischer Monoterpen-Kohlenwasserstoff',
    ...chemOf('p-cymene'),
    aroma: ['süßlich-aromatisch', 'mild', 'rein: schwach zitrisch'],
    families: ['zitrisch'],
    occurrences: [],
    summary: 'Aromatischer Monoterpen-Kohlenwasserstoff (Benzolring). In den geprüften Cannabis-Quellen ist nur o-Cymol belegt, nicht p-Cymol.',
    color: '#d9cf8a',
    sources: [pubchem(7463, 'p-Cymene')],
  },
  {
    id: 'alpha-terpinene',
    name: 'α-Terpinen',
    aliases: ['alpha-terpinene', 'α-terpinene', 'a-terpinene', 'alpha terpinene'],
    className: 'Monoterpen',
    ...chemOf('alpha-terpinene'),
    aroma: ['erfrischend', 'zitronig-zitrisch'],
    families: ['zitrisch'],
    occurrences: [],
    summary: 'Monocyclisches Monoterpen. Hauptprodukt (61 %) der Terpensynthase CsTPS33PK aus ‚Purple Kush‘ (Booth et al. 2017).',
    color: '#e6d36f',
    sources: [pubchem(7462, 'alpha-Terpinene'), BOOTH17],
  },
  {
    id: 'gamma-terpinene',
    name: 'γ-Terpinen',
    aliases: ['gamma-terpinene', 'γ-terpinene', 'g-terpinene', 'gamma terpinene'],
    className: 'Monoterpen',
    ...chemOf('gamma-terpinene'),
    aroma: ['erfrischend', 'krautig-zitrisch'],
    families: ['zitrisch', 'krautig'],
    occurrences: [],
    summary: 'Monocyclisches Monoterpen. Zweites Produkt (39 %) der Terpensynthase CsTPS33PK aus ‚Purple Kush‘ (Booth et al. 2017).',
    color: '#cbd77a',
    sources: [pubchem(7461, 'gamma-Terpinene'), BOOTH17],
  },
];

export const AROMA_FAMILIES: { id: AromaFamily; color: string }[] = [
  { id: 'zitrisch', color: '#f5d061' },
  { id: 'fruchtig', color: '#f59e8b' },
  { id: 'blumig', color: '#b39ddb' },
  { id: 'krautig', color: '#8fbf7f' },
  { id: 'harzig', color: '#5fb39a' },
  { id: 'holzig', color: '#a3a06a' },
  { id: 'würzig', color: '#d39a5b' },
  { id: 'erdig', color: '#8c7a5b' },
];

/**
 * Sammelnamen: Quellen nennen oft nur „Pinen“ oder „Ocimen“, ohne Isomer. Solche Nennungen werden
 * NICHT einem bestimmten Isomer zugeordnet, sondern einer Gruppe mit den möglichen Formen.
 */
export interface TerpeneGroup {
  id: string;
  name: string;
  aliases: string[];
  members: string[];
  note: string;
}
export const TERPENE_GROUPS: TerpeneGroup[] = [
  { id: 'pinene-unspecified', name: 'Pinen (Isomer nicht angegeben)', aliases: ['pinene', 'pinen', 'pinenes'], members: ['alpha-pinene', 'beta-pinene'], note: '„Pinen“ kann α- oder β-Pinen (oder beide) meinen.' },
  { id: 'ocimene-unspecified', name: 'Ocimen (Isomer nicht angegeben)', aliases: ['ocimene', 'ocimen'], members: ['beta-ocimene'], note: '„Ocimen“ umfasst α-Ocimen sowie (E)- und (Z)-β-Ocimen.' },
  { id: 'nerolidol-unspecified', name: 'Nerolidol (Isomer nicht angegeben)', aliases: ['nerolidol'], members: ['trans-nerolidol'], note: 'Nerolidol kommt als (E)- und (Z)-Form vor; der Atlas bildet die (E)-Form ab.' },
  { id: 'terpineol-unspecified', name: 'Terpineol (Isomer nicht angegeben)', aliases: ['terpineol'], members: ['alpha-terpineol'], note: '„Terpineol“ kann α-, β-, γ-Terpineol oder Terpinen-4-ol meinen.' },
  { id: 'phellandrene-unspecified', name: 'Phellandren (Isomer nicht angegeben)', aliases: ['phellandrene', 'phellandren'], members: ['alpha-phellandrene'], note: '„Phellandren“ kann α- oder β-Phellandren meinen; in Cannabis belegt ist β-Phellandren.' },
  { id: 'farnesene-unspecified', name: 'Farnesen (Isomer nicht angegeben)', aliases: ['farnesene', 'farnesen'], members: [], note: 'Farnesen umfasst mehrere α- und β-Isomere; für keines liegt im Atlas ein geprüfter Eintrag vor.' },
];
const GROUP_INDEX = new Map<string, TerpeneGroup>();

const ALIAS_INDEX = new Map<string, TerpeneInfo>();
for (const t of TERPENES) for (const a of [t.id, t.name, ...t.aliases]) ALIAS_INDEX.set(key(a), t);
for (const g of TERPENE_GROUPS) for (const a of [g.id, ...g.aliases]) GROUP_INDEX.set(key(a), g);

/** Sammelname ohne Isomerangabe (z. B. „pinene“) → Gruppe, sonst undefined. */
export function matchTerpeneGroup(name: string): TerpeneGroup | undefined {
  return GROUP_INDEX.get(key(name));
}
export function terpeneGroupById(id: string): TerpeneGroup | undefined {
  return TERPENE_GROUPS.find((g) => g.id === id);
}

function key(s: string): string {
  return s
    .toLowerCase()
    .replace(/β/g, 'beta')
    .replace(/α/g, 'alpha')
    .replace(/δ/g, 'delta')
    .replace(/[^a-z0-9]+/g, '');
}

/** Ordnet einen Terpennamen aus einer Quelle einem Atlas-Eintrag zu (sonst undefined). */
export function matchTerpene(name: string): TerpeneInfo | undefined {
  return ALIAS_INDEX.get(key(name));
}

export function terpeneById(id: string): TerpeneInfo | undefined {
  return TERPENES.find((t) => t.id === id);
}

/** Anzeigename: Atlas-Name, falls bekannt, sonst Originalschreibweise der Quelle. */
export function terpeneLabel(name: string): string {
  return matchTerpene(name)?.name ?? matchTerpeneGroup(name)?.name.replace(' (Isomer nicht angegeben)', '') ?? name.replace(/_/g, '-');
}
