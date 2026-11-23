export interface Source {
  id: string;
  short: string;
  citation: string;
  url?: string;
  usedFor: string;
}

/**
 * Literatur- und Behördenquellen, auf denen Formeln, Voreinstellungen und
 * Referenzbereiche basieren.
 */
export const SOURCES: Source[] = [
  {
    id: 'hc-effects',
    short: 'Health Canada – Cannabis health effects',
    citation:
      'Health Canada. Health effects of cannabis. Government of Canada. (Wirkeintritt, Maximum, Wirkdauer und Restwirkungen bei Inhalation vs. Ingestion).',
    url: 'https://www.canada.ca/en/health-canada/services/drugs-medication/cannabis/health-effects/effects.html',
    usedFor: 'Zeitachsen (Wirkeintritt, Maximum, Dauer, Restwirkungen)',
  },
  {
    id: 'hc-edibles',
    short: 'Health Canada – Cannabis: Konsumenteninformationen (u. a. essbares Cannabis)',
    citation:
      'Health Canada. Informationsangebot zu Cannabis, darunter Hinweise zu essbarem Cannabis („start low and go slow“; Einstieg mit Produkten mit ≤ 2,5 mg THC). Government of Canada – Einstiegsseite, von dort zu den Unterseiten.',
    url: 'https://www.canada.ca/en/health-canada/services/drugs-medication/cannabis.html',
    usedFor: 'Einstiegsdosis 2,5 mg, Warnung vor verzögertem Wirkeintritt',
  },
  {
    id: 'cannabis-regs',
    short: 'Cannabis Regulations (SOR/2018-144)',
    citation:
      'Government of Canada. Cannabis Regulations, SOR/2018-144 – Höchstmenge von 10 mg THC pro Packung essbaren Cannabis.',
    url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2018-144/',
    usedFor: '10-mg-Grenze für Edible-Packungen',
  },
  {
    id: 'lrcug',
    short: 'Fischer et al. 2022 – LRCUG',
    citation:
      'Fischer B, Robinson T, Bullen C, et al. Lower-Risk Cannabis Use Guidelines (LRCUG) for reducing health harms from non-medical cannabis use: A comprehensive evidence and recommendations update. Int J Drug Policy. 2022;99:103381.',
    url: 'https://doi.org/10.1016/j.drugpo.2021.103381',
    usedFor: 'Risikohinweise, Potenz, Risikogruppen',
  },
  {
    id: 'grotenhermen',
    short: 'Grotenhermen 2003',
    citation:
      'Grotenhermen F. Pharmacokinetics and pharmacodynamics of cannabinoids. Clin Pharmacokinet. 2003;42(4):327–360.',
    url: 'https://doi.org/10.2165/00003088-200342040-00003',
    usedFor: 'Bioverfügbarkeit Rauchen (ca. 10–35 %) und oral (ca. 4–12 %), Pyrolyseverlust',
  },
  {
    id: 'huestis',
    short: 'Huestis 2007',
    citation: 'Huestis MA. Human cannabinoid pharmacokinetics. Chem Biodivers. 2007;4(8):1770–1804.',
    url: 'https://doi.org/10.1002/cbdv.200790152',
    usedFor: 'Spannweite der Bioverfügbarkeit beim Rauchen (2–56 %)',
  },
  {
    id: 'lindgren',
    short: 'Lindgren et al. 1981',
    citation:
      'Lindgren JE, Ohlsson A, Agurell S, Hollister L, Gillespie H. Clinical effects and plasma levels of Δ9-tetrahydrocannabinol (Δ9-THC) in heavy and light users of cannabis. Psychopharmacology. 1981;74:208–212.',
    url: 'https://doi.org/10.1007/BF00427095',
    usedFor: 'Profil-abhängige Bereiche (gelegentlich vs. regelmäßig Konsumierende)',
  },
  {
    id: 'freeman',
    short: 'Freeman & Lorenzetti 2020',
    citation:
      "Freeman TP, Lorenzetti V. 'Standard THC units': a proposal to standardize dose across all cannabis products and methods of administration. Addiction. 2020;115(7):1207–1216.",
    url: 'https://doi.org/10.1111/add.14842',
    usedFor: 'Standard-THC-Einheit (5 mg)',
  },
  {
    id: 'wang',
    short: 'Wang et al. 2016',
    citation:
      'Wang M, Wang YH, Avula B, et al. Decarboxylation study of acidic cannabinoids: a novel approach using ultra-high-performance supercritical fluid chromatography/photodiode array-mass spectrometry. Cannabis Cannabinoid Res. 2016;1(1):262–271.',
    url: 'https://doi.org/10.1089/can.2016.0020',
    usedFor: 'Decarboxylierung von THCA (Temperatur/Zeit, Abbau)',
  },
  {
    id: 'schwabe',
    short: 'Schwabe et al. 2023',
    citation:
      'Schwabe AL, Johnson V, Harrelson J, McGlaughlin ME. Uncomfortably high: Testing reveals inflated THC potency on retail Cannabis labels. PLOS ONE. 2023;18(4):e0282396.',
    url: 'https://doi.org/10.1371/journal.pone.0282396',
    usedFor: 'Unsicherheit der THC-Angabe auf Etiketten',
  },
  {
    id: 'barrus',
    short: 'Barrus et al. 2016',
    citation:
      'Barrus DG, Capogrossi KL, Cates SC, et al. Tasty THC: Promises and challenges of cannabis edibles. Methods Rep RTI Press. 2016.',
    url: 'https://doi.org/10.3768/rtipress.2016.op.0035.1611',
    usedFor: 'Risiken von Edibles (verzögerter Wirkeintritt, Überdosierung, Dosierungsungenauigkeit)',
  },
];

export interface FormulaDoc {
  title: string;
  formula: string;
  explanation: string;
}

export const FORMULAS: FormulaDoc[] = [
  {
    title: 'Gesamt-THC aus THC und THCA',
    formula: 'THC_gesamt = THC + 0,877 × THCA',
    explanation:
      '0,877 ist das Verhältnis der Molmassen von THC (314,47 g/mol) und THCA (358,48 g/mol). Steht auf dem Etikett bereits „Gesamt-THC“ (Total THC), wird der Faktor nicht noch einmal angewandt.',
  },
  {
    title: 'Theoretische THC-Menge',
    formula: 'mg_theor = Gramm × 1000 × (THC_gesamt % ÷ 100)',
    explanation: 'Die maximal mögliche Menge bei vollständiger Decarboxylierung und ohne jeden Verlust.',
  },
  {
    title: 'Nach Decarboxylierung',
    formula: 'mg_decarb = Gramm × 1000 × (THC_frei + 0,877 × THCA × η_decarb) ÷ 100',
    explanation:
      'η_decarb wirkt nur auf den THCA-Anteil. Ist die Aufteilung unbekannt (nur Gesamt-THC), wird η_decarb auf den Gesamtwert angewandt – bei Blüten liegt THC überwiegend als THCA vor.',
  },
  {
    title: 'THC im Fett und Konzentration',
    formula: 'mg_Fett = mg_decarb × η_extraktion;   c = mg_Fett ÷ g_Fett',
    explanation:
      'η_extraktion ist der Anteil, der in die gesamte Fettphase übergeht. Fett, das beim Abseihen im Pflanzenmaterial bleibt, hat dieselbe Konzentration – es verringert nur die zurückgewonnene Menge. Verluste werden so nicht doppelt gezählt.',
  },
  {
    title: 'Rezept und Portion',
    formula: 'mg_Rezept = c × g_Butter_im_Rezept;   mg_Portion = mg_Rezept ÷ Portionen',
    explanation: 'Gleichmäßige Verteilung im Teig wird angenommen – in der Praxis schwankt der Gehalt zwischen Portionen.',
  },
  {
    title: 'Unsicherheitsbereich',
    formula: 'unten = mg × (1 − u) × η_min…;   oben = mg × (1 + u) × η_max…',
    explanation:
      'u = relative Unsicherheit der THC-Angabe; η_decarb ± 10 Prozentpunkte und η_extraktion ± 15 Prozentpunkte (auf 0–100 % begrenzt). Alle Faktoren werden gleichzeitig ungünstig bzw. günstig angesetzt – ein konservativer Worst-/Best-Case, kein statistisches Konfidenzintervall.',
  },
  {
    title: 'Umkehrrechnung',
    formula: 'g_Cannabis = (c_Ziel × g_Fett) ÷ (THC-Ausbeute pro g Cannabis)',
    explanation: 'c_Ziel ergibt sich aus Ziel-mg pro Portion × Portionen ÷ g Butter im Rezept.',
  },
  {
    title: 'Systemische Aufnahme beim Rauchen',
    formula: 'mg_systemisch ≈ mg_theor × Anteil_konsumiert ÷ Personen × F (F ≈ 0,10–0,35)',
    explanation:
      'F ist die Bioverfügbarkeit. Sie variiert in Studien zwischen ca. 2 und 56 %. Das Ergebnis ist eine sehr grobe Größenordnung, keine Messung.',
  },
];
