import { t } from '../i18n';export interface Source {
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
    get citation() { return t('lab.src.hcEffects'); },
    url: 'https://www.canada.ca/en/health-canada/services/drugs-medication/cannabis/health-effects/effects.html',
    get usedFor() { return t('lab.src.uTimelines'); },
  },
  {
    id: 'hc-edibles',
    short: 'Health Canada – Cannabis: Konsumenteninformationen (u. a. essbares Cannabis)',
    get citation() { return t('lab.src.hcInfo'); },
    url: 'https://www.canada.ca/en/health-canada/services/drugs-medication/cannabis.html',
    get usedFor() { return t('lab.src.uStart'); },
  },
  {
    id: 'cannabis-regs',
    short: 'Cannabis Regulations (SOR/2018-144)',
    get citation() { return t('lab.src.regs'); },
    url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2018-144/',
    get usedFor() { return t('lab.src.uLimit'); },
  },
  {
    id: 'lrcug',
    short: 'Fischer et al. 2022 – LRCUG',
    citation:
      'Fischer B, Robinson T, Bullen C, et al. Lower-Risk Cannabis Use Guidelines (LRCUG) for reducing health harms from non-medical cannabis use: A comprehensive evidence and recommendations update. Int J Drug Policy. 2022;99:103381.',
    url: 'https://doi.org/10.1016/j.drugpo.2021.103381',
    get usedFor() { return t('lab.src.uLrcug'); },
  },
  {
    id: 'grotenhermen',
    short: 'Grotenhermen 2003',
    citation:
      'Grotenhermen F. Pharmacokinetics and pharmacodynamics of cannabinoids. Clin Pharmacokinet. 2003;42(4):327–360.',
    url: 'https://doi.org/10.2165/00003088-200342040-00003',
    get usedFor() { return t('lab.src.uBio'); },
  },
  {
    id: 'huestis',
    short: 'Huestis 2007',
    citation: 'Huestis MA. Human cannabinoid pharmacokinetics. Chem Biodivers. 2007;4(8):1770–1804.',
    url: 'https://doi.org/10.1002/cbdv.200790152',
    get usedFor() { return t('lab.src.uSpan'); },
  },
  {
    id: 'lindgren',
    short: 'Lindgren et al. 1981',
    citation:
      'Lindgren JE, Ohlsson A, Agurell S, Hollister L, Gillespie H. Clinical effects and plasma levels of Δ9-tetrahydrocannabinol (Δ9-THC) in heavy and light users of cannabis. Psychopharmacology. 1981;74:208–212.',
    url: 'https://doi.org/10.1007/BF00427095',
    get usedFor() { return t('lab.src.uProfile'); },
  },
  {
    id: 'freeman',
    short: 'Freeman & Lorenzetti 2020',
    citation:
      "Freeman TP, Lorenzetti V. 'Standard THC units': a proposal to standardize dose across all cannabis products and methods of administration. Addiction. 2020;115(7):1207–1216.",
    url: 'https://doi.org/10.1111/add.14842',
    get usedFor() { return t('lab.src.uUnit'); },
  },
  {
    id: 'wang',
    short: 'Wang et al. 2016',
    citation:
      'Wang M, Wang YH, Avula B, et al. Decarboxylation study of acidic cannabinoids: a novel approach using ultra-high-performance supercritical fluid chromatography/photodiode array-mass spectrometry. Cannabis Cannabinoid Res. 2016;1(1):262–271.',
    url: 'https://doi.org/10.1089/can.2016.0020',
    get usedFor() { return t('lab.src.uDecarb'); },
  },
  {
    id: 'schwabe',
    short: 'Schwabe et al. 2023',
    citation:
      'Schwabe AL, Johnson V, Harrelson J, McGlaughlin ME. Uncomfortably high: Testing reveals inflated THC potency on retail Cannabis labels. PLOS ONE. 2023;18(4):e0282396.',
    url: 'https://doi.org/10.1371/journal.pone.0282396',
    get usedFor() { return t('lab.src.uLabel'); },
  },
  {
    id: 'barrus',
    short: 'Barrus et al. 2016',
    citation:
      'Barrus DG, Capogrossi KL, Cates SC, et al. Tasty THC: Promises and challenges of cannabis edibles. Methods Rep RTI Press. 2016.',
    url: 'https://doi.org/10.3768/rtipress.2016.op.0035.1611',
    get usedFor() { return t('lab.src.uEdibles'); },
  },
];

export interface FormulaDoc {
  title: string;
  formula: string;
  explanation: string;
}

export const FORMULAS: FormulaDoc[] = [
  {
    get title() { return t('lab.fm.total'); },
    get formula() { return t('lab.fm.totalF'); },
    get explanation() { return t('lab.fm.totalE'); },
  },
  {
    get title() { return t('lab.fm.theo'); },
    get formula() { return t('lab.fm.theoF'); },
    get explanation() { return t('lab.fm.theoE'); },
  },
  {
    get title() { return t('lab.fm.decarb'); },
    get formula() { return t('lab.fm.decarbF'); },
    get explanation() { return t('lab.fm.decarbE'); },
  },
  {
    get title() { return t('lab.fm.fat'); },
    get formula() { return t('lab.fm.fatF'); },
    get explanation() { return t('lab.fm.fatE'); },
  },
  {
    get title() { return t('lab.fm.recipe'); },
    get formula() { return t('lab.fm.recipeF'); },
    get explanation() { return t('lab.fm.recipeE'); },
  },
  {
    get title() { return t('lab.fm.unc'); },
    get formula() { return t('lab.fm.uncF'); },
    get explanation() { return t('lab.fm.uncE'); },
  },
  {
    get title() { return t('lab.fm.rev'); },
    get formula() { return t('lab.fm.revF'); },
    get explanation() { return t('lab.fm.revE'); },
  },
  {
    get title() { return t('lab.fm.smoke'); },
    get formula() { return t('lab.fm.smokeF'); },
    get explanation() { return t('lab.fm.smokeE'); },
  },
];
