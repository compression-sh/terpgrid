/**
 * Terpen-Atlas: kuratierte Grunddaten zu häufig in Cannabis beschriebenen Terpenen.
 * Chemische Angaben nach PubChem (NIH). Aroma- und Vorkommensangaben nach den
 * genannten Übersichtsarbeiten. Es werden bewusst KEINE gesundheitlichen Wirkungen
 * behauptet – das Vorkommen eines Terpens ist keine Wirkungsaussage.
 */

export type AromaFamily = 'erdig' | 'zitrisch' | 'würzig' | 'harzig' | 'blumig' | 'krautig' | 'fruchtig' | 'holzig';

export interface TerpeneSource {
  label: string;
  url: string;
}

export interface TerpeneInfo {
  id: string;
  name: string;
  /** Alternative Schreibweisen (für die Zuordnung von API-Namen) */
  aliases: string[];
  className: 'Monoterpen' | 'Monoterpenoid (Alkohol)' | 'Sesquiterpen';
  formula: string;
  molarMass: number;
  cas: string;
  pubchemCid: number;
  aroma: string[];
  families: AromaFamily[];
  occurrences: string[];
  summary: string;
  color: string;
  sources: TerpeneSource[];
}

const BOOTH = { label: 'Booth JK, Bohlmann J (2019). Terpenes in Cannabis sativa – From plant genome to humans. Plant Science 284:67–72.', url: 'https://doi.org/10.1016/j.plantsci.2019.03.022' };
const HANUS = { label: 'Hanuš LO, Hod Y (2020). Terpenes/Terpenoids in Cannabis: Are They Important? Med Cannabis Cannabinoids 3(1):25–60.', url: 'https://doi.org/10.1159/000509733' };
const RUSSO = { label: 'Russo EB (2011). Taming THC: potential cannabis synergy and phytocannabinoid-terpenoid entourage effects. Br J Pharmacol 163(7):1344–1364.', url: 'https://doi.org/10.1111/j.1476-5381.2011.01238.x' };
const pubchem = (cid: number, name: string): TerpeneSource => ({ label: `PubChem: ${name} (CID ${cid})`, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}` });

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
    sources: [pubchem(31253, 'Myrcene'), BOOTH, HANUS],
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
    sources: [pubchem(440917, 'D-Limonene'), BOOTH, HANUS],
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
    sources: [pubchem(5281515, 'beta-Caryophyllene'), { label: 'Gertsch J et al. (2008). Beta-caryophyllene is a dietary cannabinoid. PNAS 105(26):9099–9104.', url: 'https://doi.org/10.1073/pnas.0803601105' }, BOOTH],
  },
  {
    id: 'pinene',
    name: 'α-Pinen',
    aliases: ['pinene', 'alpha-pinene', 'α-pinene', 'a-pinene', 'alpha pinene', 'alpha_pinene', 'pinen', 'α-pinen', 'alpha-pinen'],
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
    sources: [pubchem(6654, 'alpha-Pinene'), BOOTH, HANUS],
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
    sources: [pubchem(6549, 'Linalool'), BOOTH, RUSSO],
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
    sources: [pubchem(5281520, 'alpha-Humulene'), BOOTH, HANUS],
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
    sources: [pubchem(11463, 'Terpinolene'), BOOTH, HANUS],
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

const ALIAS_INDEX = new Map<string, TerpeneInfo>();
for (const t of TERPENES) for (const a of [t.id, t.name, ...t.aliases]) ALIAS_INDEX.set(key(a), t);

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
  return matchTerpene(name)?.name ?? name.replace(/_/g, '-');
}
