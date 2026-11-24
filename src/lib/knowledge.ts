/**
 * Cannabis 101 – redaktionelle Wissensartikel.
 * Grundsatz: sachlich, zurückhaltend, mit überprüfbaren Quellen. Keine Heil-
 * versprechen, keine individuellen Dosis- oder Wirkungsprognosen.
 */

/** Die 17 Academy-Kategorien (Reihenfolge = Anzeige) */
export const KB_CATEGORIES = [
  'Grundlagen',
  'Pflanze & Botanik',
  'Genetik & Züchtung',
  'Anbau-Grundlagen',
  'Substrat & Bewässerung',
  'pH, EC & Nährstoffe',
  'Licht',
  'Klima & VPD',
  'Pflanzengesundheit',
  'Schädlinge',
  'Ernte',
  'Trocknung & Lagerung',
  'Cannabinoide',
  'Terpene',
  'Labor & Analytik',
  'Konsum & Risiko',
  'Nachschlagen',
] as const;
export type KbCategory = (typeof KB_CATEGORIES)[number];
export type KbLevel = 'Einsteiger' | 'Fortgeschritten';
/** Interaktive Diagramme, die in einen Abschnitt eingebettet werden können */
export type KbDiagram = 'vpd' | 'dli' | 'lifecycle' | 'stigma';

export interface KbSource {
  label: string;
  url: string;
}

export interface KbSection {
  heading: string;
  paragraphs: string[];
  /** Hervorgehobener Hinweis */
  note?: string;
  /** Interne Verweise auf App-Bereiche */
  links?: { label: string; to: string }[];
  diagram?: KbDiagram;
}

export interface KbArticle {
  id: string;
  title: string;
  category: KbCategory;
  level?: KbLevel;
  summary: string;
  updated: string;
  sections: KbSection[];
  related: string[];
  sources: KbSource[];
}

import { ACADEMY_ARTICLES } from './academy/articles';

export const KB_UPDATED = '2026-11-23';

const S = {
  hcEffects: { label: 'Health Canada – Health effects of cannabis', url: 'https://www.canada.ca/en/health-canada/services/drugs-medication/cannabis/health-effects/effects.html' },
  lrcug: { label: 'Fischer B et al. (2022). Lower-Risk Cannabis Use Guidelines (LRCUG). Int J Drug Policy 99:103381.', url: 'https://doi.org/10.1016/j.drugpo.2021.103381' },
  grotenhermen: { label: 'Grotenhermen F (2003). Pharmacokinetics and pharmacodynamics of cannabinoids. Clin Pharmacokinet 42(4):327–360.', url: 'https://doi.org/10.2165/00003088-200342040-00003' },
  elsohly: { label: 'ElSohly MA et al. (2017). Phytochemistry of Cannabis sativa L. Prog Chem Org Nat Prod 103:1–36.', url: 'https://doi.org/10.1007/978-3-319-45541-9_1' },
  wang: { label: 'Wang M et al. (2016). Decarboxylation study of acidic cannabinoids. Cannabis Cannabinoid Res 1(1):262–271.', url: 'https://doi.org/10.1089/can.2016.0020' },
  booth: { label: 'Booth JK, Bohlmann J (2019). Terpenes in Cannabis sativa – From plant genome to humans. Plant Science 284:67–72.', url: 'https://doi.org/10.1016/j.plantsci.2019.03.022' },
  hanus: { label: 'Hanuš LO, Hod Y (2020). Terpenes/Terpenoids in Cannabis: Are They Important? Med Cannabis Cannabinoids 3(1):25–60.', url: 'https://doi.org/10.1159/000509733' },
  russo: { label: 'Russo EB (2011). Taming THC: potential cannabis synergy and phytocannabinoid-terpenoid entourage effects. Br J Pharmacol 163(7):1344–1364.', url: 'https://doi.org/10.1111/j.1476-5381.2011.01238.x' },
  schwabe2019: { label: 'Schwabe AL, McGlaughlin ME (2019). Genetic tools weed out misconceptions of strain reliability in Cannabis sativa. J Cannabis Res 1:3.', url: 'https://doi.org/10.1186/s42238-019-0001-1' },
  smith2022: { label: 'Smith CJ et al. (2022). The phytochemical diversity of commercial Cannabis in the United States. Nature Plants 8:1240–1249.', url: 'https://doi.org/10.1038/s41477-022-01242-9' },
  schwabe2023: { label: 'Schwabe AL et al. (2023). Uncomfortably high: Testing reveals inflated THC potency on retail Cannabis labels. PLOS ONE 18(4):e0282396.', url: 'https://doi.org/10.1371/journal.pone.0282396' },
  hirvonen: { label: 'Hirvonen J et al. (2012). Reversible and regionally selective downregulation of brain cannabinoid CB1 receptors in chronic daily cannabis smokers. Mol Psychiatry 17:642–649.', url: 'https://doi.org/10.1038/mp.2011.82' },
  freeman: { label: "Freeman TP, Lorenzetti V (2020). 'Standard THC units'. Addiction 115(7):1207–1216.", url: 'https://doi.org/10.1111/add.14842' },
  huestis: { label: 'Huestis MA (2007). Human cannabinoid pharmacokinetics. Chem Biodivers 4(8):1770–1804.', url: 'https://doi.org/10.1002/cbdv.200790152' },
};

const BASE_ARTICLES: KbArticle[] = [
  {
    id: 'cannabinoide',
    title: 'Was sind Cannabinoide?',
    category: 'Grundlagen',
    summary: 'Cannabinoide sind eine Stoffgruppe, die in der Cannabispflanze vor allem als Säuren entsteht. Erst Erhitzen wandelt sie in die bekannten Formen wie THC und CBD um.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Eine große Stoffgruppe',
        paragraphs: [
          'In Cannabis sativa L. wurden über hundert verschiedene Phytocannabinoide beschrieben. Mengenmäßig bedeutend sind meist nur wenige – vor allem THC und CBD bzw. deren Vorstufen.',
          'Gebildet werden sie überwiegend in den Drüsenhaaren (Trichomen) der weiblichen Blütenstände, zusammen mit Terpenen.',
        ],
      },
      {
        heading: 'Säureformen und Decarboxylierung',
        paragraphs: [
          'Die Pflanze bildet überwiegend die Carbonsäuren THCA und CBDA. Durch Wärme spalten diese CO₂ ab (Decarboxylierung) und werden zu THC bzw. CBD.',
          'Weil dabei Masse verloren geht, entspricht 1 g THCA höchstens etwa 0,877 g THC. Laborberichte weisen deshalb oft „Gesamt-THC = THC + 0,877 × THCA“ aus.',
        ],
        note: 'Beim Erhitzen für Edibles wird die Umwandlung selten vollständig erreicht; gleichzeitig kann THC abgebaut werden.',
        links: [
          { label: 'Edibles-Rechner', to: 'lab/edibles' },
          { label: 'Laborberichte', to: 'lab-reports' },
        ],
      },
    ],
    related: ['thc-cbd', 'begriffe', 'terpene'],
    sources: [S.elsohly, S.wang, S.grotenhermen],
  },
  {
    id: 'thc-cbd',
    title: 'THC und CBD',
    category: 'Cannabinoide',
    summary: 'Δ9-THC ist der hauptsächlich berauschende Bestandteil von Cannabis. CBD wirkt nicht in vergleichbarer Weise berauschend. Beide werden im Körper unterschiedlich verarbeitet.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Δ9-THC',
        paragraphs: [
          'THC bindet als partieller Agonist an den CB1-Rezeptor des Endocannabinoid-Systems, der im Gehirn weit verbreitet ist. Darauf beruhen die berauschenden Wirkungen.',
          'Wie stark THC wirkt, hängt von Menge, Konsumform, Toleranz und individuellen Faktoren ab. Eine verlässliche Vorhersage für Einzelpersonen ist nicht möglich.',
        ],
      },
      {
        heading: 'CBD',
        paragraphs: [
          'CBD hat eine andere Pharmakologie als THC und ruft keinen vergleichbaren Rausch hervor. Viele kursierende Gesundheitsversprechen sind wissenschaftlich nicht belegt.',
          'Als Arzneimittel ist CBD in mehreren Ländern für eng umrissene Indikationen zugelassen – das ist keine Aussage über frei verkäufliche Produkte.',
        ],
      },
      {
        heading: 'Gehalte richtig lesen',
        paragraphs: [
          'Prozentangaben beziehen sich auf das Gewicht des Materials. 20 % THC bedeuten rechnerisch 200 mg THC pro Gramm – nicht die Menge, die im Körper ankommt.',
          'Untersuchungen zeigen, dass Angaben auf Verpackungen häufig höher sind als nachgemessen.',
        ],
        links: [{ label: 'Dosierung & Potenz', to: 'lab/dosage' }],
      },
    ],
    related: ['cannabinoide', 'wirkungsdauer', 'toleranz'],
    sources: [S.grotenhermen, S.hcEffects, S.schwabe2023],
  },
  {
    id: 'terpene',
    title: 'Terpene in Cannabis',
    category: 'Terpene',
    summary: 'Terpene prägen Geruch und Geschmack. Dass sie die Wirkung von Cannabis spürbar verändern („Entourage-Effekt“), ist eine Hypothese mit begrenzter Evidenz.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Duftstoffe der Pflanze',
        paragraphs: [
          'Terpene sind flüchtige Kohlenwasserstoffe, die in vielen Pflanzen vorkommen – etwa Limonen in Zitrusschalen oder Pinen in Nadelhölzern. In Cannabis werden sie in den Trichomen gebildet.',
          'Ihr Anteil liegt in getrockneten Blüten typischerweise im niedrigen einstelligen Prozentbereich und schwankt stark zwischen Proben.',
        ],
        links: [{ label: 'Terpen-Atlas', to: 'discover/terpenes' }],
      },
      {
        heading: 'Entourage-Hypothese',
        paragraphs: [
          'Es wurde vorgeschlagen, dass Terpene und Cannabinoide gemeinsam anders wirken als einzeln. Übersichtsarbeiten bewerten die Belege beim Menschen bislang als dünn.',
        ],
        note: 'Das Vorkommen eines Terpens in einer Sorte ist keine Aussage über gesundheitliche oder psychoaktive Wirkungen.',
      },
    ],
    related: ['cannabinoide', 'genetik', 'begriffe'],
    sources: [S.booth, S.hanus, S.russo],
  },
  {
    id: 'botanik',
    title: 'Cannabis-Botanik',
    category: 'Pflanze & Botanik',
    summary: 'Cannabis ist meist zweihäusig: Es gibt männliche und weibliche Pflanzen. Die harzreichen weiblichen Blütenstände enthalten die meisten Cannabinoide.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Aufbau',
        paragraphs: [
          'Botanisch gehört Cannabis zur Familie der Hanfgewächse (Cannabaceae). Für den Gehalt an Wirkstoffen sind die Trichome entscheidend – mikroskopisch kleine Drüsenhaare, besonders auf Blütenkelchen und kleinen Blättern.',
          'Unbefruchtete weibliche Blütenstände bilden besonders viel Harz.',
        ],
      },
      {
        heading: 'Photoperiode und Autoflower',
        paragraphs: [
          'Photoperiodische Pflanzen beginnen zu blühen, wenn die Nächte länger werden. Autoflower-Pflanzen – mit Erbgut aus Cannabis ruderalis – blühen weitgehend altersabhängig.',
          'Zeitangaben zu Blütedauer und Ernte sind immer nur Richtwerte; Umgebung, Genetik und Pflege verändern sie deutlich.',
        ],
        links: [{ label: 'Growlogs', to: 'grows' }],
      },
    ],
    related: ['lebenszyklus', 'genetik'],
    sources: [S.elsohly, S.booth],
  },
  {
    id: 'genetik',
    title: 'Genetik, Kreuzungen und Sortennamen',
    category: 'Genetik & Züchtung',
    summary: 'Sortennamen sind nicht genormt. Gleich benannte Proben können genetisch verschieden sein, und die Einteilung in „Indica“ und „Sativa“ spiegelt die Chemie nur schlecht wider.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Kreuzungen lesen',
        paragraphs: [
          '„A × B“ bezeichnet eine Kreuzung zweier Elternsorten. „BX“ steht für eine Rückkreuzung mit einem Elternteil, „F1“ für die erste Nachkommengeneration. Ein „Pheno“ oder „Cut“ ist eine ausgewählte Einzelpflanze, die als Steckling weitergegeben wird.',
        ],
        links: [{ label: 'Genetics Explorer', to: 'discover/genetics' }],
      },
      {
        heading: 'Namen sind keine Garantie',
        paragraphs: [
          'Genetische Untersuchungen fanden, dass Proben mit demselben Sortennamen teils weniger verwandt waren als Proben verschiedener Namen.',
          'Eine große Analyse kommerzieller Proben zeigte, dass „Indica“- und „Sativa“-Etiketten die tatsächliche chemische Zusammensetzung kaum vorhersagen.',
        ],
        note: 'TERPGRID führt gleichnamige Sorten verschiedener Breeder deshalb nie automatisch zusammen.',
      },
    ],
    related: ['botanik', 'terpene', 'forschung'],
    sources: [S.schwabe2019, S.smith2022],
  },
  {
    id: 'lebenszyklus',
    title: 'Der Lebenszyklus einer Cannabispflanze',
    category: 'Anbau-Grundlagen',
    summary: 'Von der Keimung bis zur Aushärtung – die typischen Phasen und warum feste Zeitpläne trügen.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Die Phasen',
        paragraphs: [
          'Keimung → Sämling → vegetative Phase → Blüte → Ernte → Trocknung → Aushärtung (Curing). Diese Meilensteine kannst du in deinen Growlogs mit eigenen Daten erfassen; TERPGRID berechnet daraus Phasendauern, sagt aber nichts voraus.',
          'Wie lange eine Phase dauert, hängt von Genetik, Licht, Temperatur, Medium und Pflege ab.',
        ],
        links: [{ label: 'Growlogs', to: 'grows' }],
      },
      {
        heading: 'Rechtliches',
        paragraphs: ['Ob und in welchem Umfang privater Anbau erlaubt ist, unterscheidet sich je nach Land. Bitte die geltenden Regeln beachten.'],
      },
    ],
    related: ['botanik', 'begriffe'],
    sources: [S.booth],
  },
  {
    id: 'konsumformen',
    title: 'Konsumformen im Überblick',
    category: 'Konsum & Risiko',
    summary: 'Inhalieren und Essen unterscheiden sich grundlegend in Wirkeintritt, Dauer und Dosierbarkeit. mg-Angaben sind zwischen Konsumformen nicht vergleichbar.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Inhalation',
        paragraphs: [
          'Beim Rauchen und Verdampfen wirkt THC innerhalb von Sekunden bis Minuten. Nur ein Teil des enthaltenen THC gelangt ins Blut – Studien berichten stark schwankende Anteile.',
          'Verbrennung erzeugt Schadstoffe. Verdampfen vermeidet die Verbrennung, ist aber nicht risikofrei.',
        ],
        links: [{ label: 'Joint-Rechner', to: 'lab/smoking' }],
      },
      {
        heading: 'Essen und Trinken',
        paragraphs: [
          'Bei Edibles setzt die Wirkung nach 30 Minuten bis 2 Stunden ein und hält deutlich länger an. In der Leber entsteht vermehrt 11-Hydroxy-THC.',
          'Selbst hergestellte Edibles sind schwer gleichmäßig zu dosieren.',
        ],
        note: 'Häufigster Fehler: nachlegen, weil „noch nichts passiert“.',
        links: [{ label: 'Edibles-Rechner', to: 'lab/edibles' }],
      },
    ],
    related: ['wirkungsdauer', 'risikominimierung', 'toleranz'],
    sources: [S.grotenhermen, S.huestis, S.hcEffects, S.lrcug],
  },
  {
    id: 'wirkungsdauer',
    title: 'Wirkungsdauer und ihre Unsicherheit',
    category: 'Konsum & Risiko',
    summary: 'Typische Zeitbereiche laut Health Canada – und warum sie für den Einzelfall nur Orientierung sind.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Typische Bereiche',
        paragraphs: [
          'Inhalation: Wirkeintritt nach Sekunden bis Minuten, Maximum nach etwa 30 Minuten, Wirkung bis etwa 6 Stunden, Restwirkungen bis 24 Stunden.',
          'Essen: Wirkeintritt nach 30 Minuten bis 2 Stunden, Maximum nach etwa 4 Stunden, Wirkung bis etwa 12 Stunden, Restwirkungen bis 24 Stunden.',
        ],
        links: [{ label: 'Zeitachse', to: 'lab/timeline' }],
      },
      {
        heading: 'Warum Einzelfälle abweichen',
        paragraphs: ['Mageninhalt, Stoffwechsel, Toleranz, Dosis und Produkt beeinflussen den Verlauf. Beeinträchtigungen – etwa der Fahrtüchtigkeit – können länger anhalten als spürbare Wirkungen.'],
      },
    ],
    related: ['konsumformen', 'toleranz'],
    sources: [S.hcEffects, S.grotenhermen],
  },
  {
    id: 'toleranz',
    title: 'Toleranz',
    category: 'Konsum & Risiko',
    summary: 'Regelmäßiger Konsum führt zu Toleranz. Im Gehirn nimmt die Zahl verfügbarer CB1-Rezeptoren ab – nach einer Pause erholt sie sich wieder.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Was passiert',
        paragraphs: [
          'Bildgebende Studien zeigten bei täglich Konsumierenden eine verringerte Verfügbarkeit von CB1-Rezeptoren in bestimmten Hirnregionen, die sich nach einigen Wochen Abstinenz weitgehend normalisierte.',
          'Toleranz entwickelt sich nicht für alle Wirkungen gleich; Beeinträchtigungen können trotz Gewöhnung bestehen bleiben.',
        ],
      },
      {
        heading: 'Nach einer Pause',
        paragraphs: ['Wer nach einer Pause wieder konsumiert, reagiert oft stärker als erwartet. Frühere Mengen können dann zu viel sein.'],
        note: 'Toleranz ist kein Schutz – häufiger Konsum ist mit einem höheren Risiko für eine Abhängigkeit verbunden.',
      },
    ],
    related: ['risikominimierung', 'thc-cbd'],
    sources: [S.hirvonen, S.lrcug],
  },
  {
    id: 'risikominimierung',
    title: 'Risiken verringern',
    category: 'Konsum & Risiko',
    summary: 'Zusammenfassung der Lower-Risk Cannabis Use Guidelines: Wer konsumiert, kann einige Risiken gezielt senken.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Kernempfehlungen (LRCUG)',
        paragraphs: [
          'Nicht zu konsumieren ist die risikoärmste Wahl. Später beginnen (nicht im Jugendalter), seltener konsumieren und Produkte mit niedrigerem THC-Gehalt bevorzugen senkt Risiken.',
          'Synthetische Cannabinoide meiden. Verbrennung vermeiden; nicht tief inhalieren oder die Luft anhalten. Nicht mit Alkohol oder anderen Substanzen kombinieren.',
          'Nach dem Konsum mindestens sechs Stunden kein Fahrzeug führen – je nach Person und Produkt auch länger.',
        ],
      },
      {
        heading: 'Wer besser verzichtet',
        paragraphs: ['Schwangere und Stillende sowie Personen mit eigener oder familiärer Vorgeschichte von Psychosen oder Suchterkrankungen sollten laut Leitlinien auf Cannabis verzichten.'],
        note: 'Bei starken Beschwerden nicht allein bleiben; bei Notfällen den Notruf wählen (EU: 112).',
      },
    ],
    related: ['toleranz', 'konsumformen', 'wirkungsdauer'],
    sources: [S.lrcug, S.hcEffects],
  },
  {
    id: 'forschung',
    title: 'Forschung richtig einordnen',
    category: 'Labor & Analytik',
    summary: 'Laborwerte, Studien und Online-Datenbanken haben unterschiedliche Aussagekraft. Worauf es beim Lesen ankommt.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Laborwerte',
        paragraphs: [
          'Ein Analysezertifikat (COA) gilt für eine bestimmte Charge. Werte anderer Chargen derselben Sorte können deutlich abweichen.',
          'Untersuchungen fanden, dass deklarierte THC-Gehalte im Handel häufig höher angegeben werden als nachgemessen.',
        ],
        links: [{ label: 'Laborberichte dokumentieren', to: 'lab-reports' }],
      },
      {
        heading: 'Sortendatenbanken',
        paragraphs: [
          'Online-Kataloge sammeln Angaben aus unterschiedlichen Quellen. TERPGRID zeigt deshalb den Evidenzstatus der Quelle (belegt, berichtet, umstritten, unzureichend) und übernimmt keine fehlenden Werte.',
          'Berichtete Erfahrungen sind subjektiv und keine Wirkungsgarantie.',
        ],
        links: [{ label: 'Discover', to: 'discover' }],
      },
    ],
    related: ['genetik', 'begriffe'],
    sources: [S.schwabe2023, S.smith2022, S.freeman],
  },
  {
    id: 'begriffe',
    title: 'Begriffe von A bis Z',
    category: 'Nachschlagen',
    summary: 'Kurze Erklärungen häufiger Fachbegriffe – vom Analysezertifikat bis zur Trichome.',
    updated: KB_UPDATED,
    sections: [
      {
        heading: 'Glossar',
        paragraphs: [
          'Analysezertifikat (COA): Laborbericht zu einer bestimmten Charge mit Cannabinoid- und ggf. Terpenwerten.',
          'Autoflower: Pflanze, die weitgehend unabhängig von der Tageslänge blüht.',
          'Chemotyp: Einteilung nach chemischer Zusammensetzung (z. B. THC- oder CBD-dominant) – aussagekräftiger als „Indica/Sativa“.',
          'Curing (Aushärtung): kontrollierte Lagerung nach der Trocknung.',
          'Decarboxylierung: Umwandlung von THCA/CBDA in THC/CBD durch Wärme.',
          'Gesamt-THC: THC + 0,877 × THCA – die maximal mögliche THC-Menge.',
          'Phänotyp: die sichtbaren und messbaren Eigenschaften einer einzelnen Pflanze.',
          'Photoperiode: Abhängigkeit der Blüte von der Tageslänge.',
          'Standard-THC-Einheit: vorgeschlagene Einheit von 5 mg THC zur Vergleichbarkeit.',
          'Trichome: Drüsenhaare, in denen Cannabinoide und Terpene gebildet werden.',
        ],
      },
    ],
    related: ['cannabinoide', 'genetik', 'forschung'],
    sources: [S.freeman, S.elsohly, S.wang],
  },
];

export const KB_ARTICLES: KbArticle[] = [...BASE_ARTICLES, ...ACADEMY_ARTICLES];

export function kbSearch(q: string, articles = KB_ARTICLES): KbArticle[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return articles;
  const score = (a: KbArticle) => {
    let s = 0;
    if (a.title.toLowerCase().includes(needle)) s += 5;
    if (a.summary.toLowerCase().includes(needle)) s += 3;
    for (const sec of a.sections) {
      if (sec.heading.toLowerCase().includes(needle)) s += 2;
      for (const p of sec.paragraphs) if (p.toLowerCase().includes(needle)) s += 1;
    }
    return s;
  };
  return articles
    .map((a) => ({ a, s: score(a) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);
}

export function readingMinutes(a: KbArticle): number {
  const words = [a.summary, ...a.sections.flatMap((s) => [s.heading, ...s.paragraphs, s.note ?? ''])].join(' ').split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
