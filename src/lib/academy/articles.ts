/**
 * Academy-Leitfäden (2.1). Grundsatz wie in Cannabis 101: sachlich, mit überprüfbaren Quellen,
 * keine Heilversprechen. Zahlen stammen aus den Studien in ./sources.ts und sind als Studienbedingungen
 * gekennzeichnet – keine allgemeingültigen Sollwerte.
 */
import type { KbArticle } from '../knowledge';
import { SRC } from './sources';

const U = '2026-11-24';
const FULL = { level: 'volltext', checked: U, note: 'Aussagen gegen die Volltexte der zitierten Open-Access-Studien geprüft (Europe PMC).' } as const;

export const ACADEMY_ARTICLES: KbArticle[] = [
  {
    id: 'anbau-ueberblick',
    title: 'Anbau im Überblick: vom Steckling bis zur Ernte',
    category: 'Anbau-Grundlagen',
    level: 'Einsteiger',
    summary:
      'Welche Phasen eine Cannabispflanze durchläuft, welche Stellgrößen im Innenanbau zählen und warum Ergebnisse aus Studien nicht 1:1 auf jede Sorte passen.',
    updated: U,
    sections: [
      {
        heading: 'Zwei Phasen, ein Schalter',
        paragraphs: [
          'Photoperiodische Cannabispflanzen wachsen vegetativ, solange die Tage lang sind, und beginnen zu blühen, wenn die Dunkelphase lang genug wird. Im Innenanbau wird dieser Wechsel üblicherweise mit einem Lichtplan von 12 Stunden Licht und 12 Stunden Dunkelheit ausgelöst; in der Studie von Rodriguez-Morrison et al. (2021) wuchsen die Pflanzen zuerst zwei Wochen unter 18 Stunden Licht und anschließend zwölf Wochen unter 12 Stunden.',
          'Autoflowering-Sorten blühen dagegen weitgehend unabhängig von der Tageslänge. Für sie gelten die Aussagen zur Photoperiode in diesem Leitfaden nicht.',
        ],
        diagram: 'lifecycle',
      },
      {
        heading: 'Die wichtigsten Stellgrößen',
        paragraphs: [
          'Im geschlossenen Raum bestimmt der Mensch fast alles: Lichtmenge und -dauer, Temperatur und Luftfeuchte, Wasser- und Nährstoffversorgung. Diese Größen hängen zusammen. Mehr Licht erhöht zum Beispiel den Wasserverbrauch, hohe Luftfeuchte bremst die Verdunstung über die Blätter.',
          'Die Academy behandelt jede Größe in einem eigenen Leitfaden: Licht (PPFD und DLI), Photoperiode, Klima und VPD, pH und EC, Nährstoffe, Bewässerung, Pflanzengesundheit, Ernte und Trocknung.',
        ],
        links: [
          { label: 'Licht: PPFD & DLI', to: 'discover/learn/licht-ppfd-dli' },
          { label: 'Klima & VPD', to: 'discover/learn/klima-vpd' },
        ],
      },
      {
        heading: 'Warum Studien keine Rezepte sind',
        paragraphs: [
          'Viele Ergebnisse stammen aus Versuchen mit einer oder wenigen Sorten. Ahrens et al. (2023) fanden zum Beispiel deutliche Unterschiede zwischen zehn Sorten in ihrer Reaktion auf längere Lichtphasen; Crispim Massuela et al. (2026) berichten, dass die Genetik Ertrag und Cannabinoidgehalt stärker beeinflusste als die Bewässerung.',
          'Werte aus Studien beschreiben deshalb, was unter bestimmten Bedingungen beobachtet wurde. Für den eigenen Anbau sind sie ein Ausgangspunkt, den man mit eigenen Messungen überprüft.',
        ],
        note: 'In TERPGRID kannst du Messwerte je Pflanze oder Grow-Bereich erfassen und über die Zeit vergleichen – so werden aus Faustregeln eigene Erfahrungswerte.',
        links: [{ label: 'Growlogs öffnen', to: 'grows' }],
      },
      {
        heading: 'Rechtlicher Rahmen',
        paragraphs: [
          'Ob und in welchem Umfang privater Anbau erlaubt ist, hängt vom Land ab und ändert sich. Dieser Leitfaden ersetzt keine Rechtsauskunft; informiere dich über die Regeln, die für dich gelten.',
        ],
      },
    ],
    related: ['licht-ppfd-dli', 'photoperiode', 'lebenszyklus'],
    review: FULL,
    sources: [SRC.rodriguez2021, SRC.ahrens2023, SRC.massuela2026],
  },
  {
    id: 'licht-ppfd-dli',
    title: 'Licht verstehen: PPFD, DLI und was mehr Licht bringt',
    category: 'Licht',
    level: 'Einsteiger',
    summary:
      'PPFD misst die Lichtmenge pro Sekunde, DLI die Tagesdosis. Zwei kanadische Studien zeigen: Mehr Licht erhöhte den Blütenertrag deutlich – den Cannabinoidgehalt aber nicht.',
    updated: U,
    sections: [
      {
        heading: 'Zwei Kennzahlen',
        paragraphs: [
          'PPFD (photosynthetische Photonenflussdichte) gibt an, wie viele für die Photosynthese nutzbare Photonen (400–700 nm) pro Quadratmeter und Sekunde ankommen, in µmol·m⁻²·s⁻¹. Gemessen wird sie mit einem Quantensensor auf Höhe der Pflanzenspitzen.',
          'DLI (Daily Light Integral) ist die Tagessumme: PPFD × Beleuchtungsdauer in Sekunden, umgerechnet in mol·m⁻²·d⁻¹. Bei 12 Stunden gilt: DLI = PPFD × 12 × 3600 / 1 000 000. Eine PPFD von 800 ergibt so rund 34,6 mol pro Tag.',
        ],
        diagram: 'dli',
        links: [{ label: 'DLI-Rechner', to: 'tools' }],
      },
      {
        heading: 'Was mehr Licht bewirkt hat',
        paragraphs: [
          'Rodriguez-Morrison et al. (2021) ließen Pflanzen zwölf Wochen unter PPFD-Stufen zwischen 120 und 1.800 µmol·m⁻²·s⁻¹ blühen. Der Trockenertrag der Blüten stieg linear bis zur höchsten Stufe, obwohl die Photosynthese einzelner Blätter schon deutlich darunter gesättigt war. Auch Blütendichte und Ernteindex nahmen zu.',
          'Llewellyn et al. (2022) verglichen 600, 800 und 1.000 µmol·m⁻²·s⁻¹: Bei der höchsten Stufe war das Trockengewicht der Blüten 1,6-mal so hoch wie bei der niedrigsten, der Ernteindex lag um 7 % höher.',
        ],
      },
      {
        heading: 'Was mehr Licht nicht bewirkt hat',
        paragraphs: [
          'In beiden Studien änderte die Lichtintensität die Cannabinoidkonzentration in den Blüten nicht; Rodriguez-Morrison et al. fanden nur geringe Effekte auf die Terpenkonzentration. Mehr Licht bedeutet dort also mehr Blütenmasse, nicht „stärkere“ Blüten.',
          'Ob sich mehr Licht lohnt, ist eine Kostenfrage: Strom und Wärmeabfuhr steigen mit der Leistung. Die Autoren empfehlen, die Lichtmenge an den eigenen Kosten und Zielen auszurichten.',
        ],
        note: 'Diese Ergebnisse stammen aus Innenräumen mit kontrolliertem Klima und je einer Sorte. Hohe Lichtmengen setzen ausreichend Wasser, Nährstoffe und passende Temperaturen voraus.',
      },
    ],
    related: ['uv-licht', 'photoperiode', 'klima-vpd'],
    review: FULL,
    sources: [SRC.rodriguez2021, SRC.llewellyn2022],
  },
  {
    id: 'photoperiode',
    title: 'Photoperiode: Sind 12 Stunden wirklich optimal?',
    category: 'Licht',
    level: 'Fortgeschritten',
    summary: 'Die Blüte wird über die Länge der Dunkelphase ausgelöst. Neue Studien zeigen, dass manche Sorten auch bei 13 bis 14 Stunden Licht zuverlässig blühen – und Fernrot-Licht eine Rolle spielt.',
    updated: U,
    sections: [
      {
        heading: 'Die 12/12-Regel',
        paragraphs: [
          'Fast alle Innenanbauer stellen für die Blüte auf 12 Stunden Licht und 12 Stunden Dunkelheit um. Ahrens et al. (2023) prüften, ob das nötig ist: Stecklinge von zehn Sorten wuchsen unter 12, 12,5, 13, 13,5, 14 und 15 Stunden Licht bei etwa 360 µmol·m⁻²·s⁻¹ aus weißen LEDs.',
        ],
      },
      {
        heading: 'Ergebnisse',
        paragraphs: [
          'Die Blüte setzte bei allen Sorten bis einschließlich 14 Stunden ein. Gegenüber 12 Stunden verzögerte sie sich bei 14 Stunden je nach Sorte um null bis etwa vier Tage. Unter 15 Stunden begannen einige Sorten zwar, entwickelten die Blüten aber nicht weiter.',
          'Bei einigen Sorten lagen die besten Werte für zentrale Blühmerkmale zwischen 12 und 13 Stunden. Die Autoren erklären mögliche Mehrerträge mit der höheren Tageslichtmenge (DLI) und raten, die Reaktion der eigenen Sorten zu testen.',
        ],
      },
      {
        heading: 'Fernrot am Tagesende',
        paragraphs: [
          'Peterswald et al. (2025) untersuchten, ob sich die Lichtphase mit Fernrot-Licht verkürzen lässt. Bei der Sorte Northern Lights stieg der Gesamt-Cannabinoidertrag um fast 70 % gegenüber 12 Stunden Licht (0,43 statt 0,25 g pro Pflanze), wenn nach 10 Stunden Licht 2 Stunden Fernrot in der Dunkelphase folgten. Dieser Plan würde laut Autoren 5,5 % Strom sparen.',
        ],
        note: 'Ein einzelner Versuch mit wenigen Sorten. Lichtpläne mit Fernrot sind Gegenstand aktueller Forschung, keine erprobte Standardmethode.',
      },
    ],
    related: ['licht-ppfd-dli', 'anbau-ueberblick', 'lebenszyklus'],
    review: FULL,
    sources: [SRC.ahrens2023, SRC.peterswald2025],
  },
  {
    id: 'uv-licht',
    title: 'UV-Licht: Mehr THC durch UV-B?',
    category: 'Licht',
    level: 'Fortgeschritten',
    summary: 'Ein verbreiteter Rat lautet, UV-Licht steigere den THC-Gehalt. In einem kontrollierten Versuch brachte UV weder mehr Ertrag noch mehr Cannabinoide in den Blüten.',
    updated: U,
    sections: [
      {
        heading: 'Der Versuch',
        paragraphs: [
          'Llewellyn et al. (2022) bestrahlten die THC-reiche Sorte ‚Meridian‘ zusätzlich zu 600 µmol·m⁻²·s⁻¹ entweder 45 Tage lang mit UVA (50 µmol·m⁻²·s⁻¹, 385-nm-LEDs) oder in den letzten 20 Tagen täglich fünf Stunden mit UVA und UVB (3,0 µmol·m⁻²·s⁻¹ aus einer Leuchtstoffquelle).',
        ],
      },
      {
        heading: 'Ergebnis',
        paragraphs: [
          'UV veränderte weder die oberirdische Biomasse noch die Cannabinoidkonzentration der Blüten. Nur die kleinen Blätter an den Blüten („Sugar Leaves“) hatten unter UVA+UVB etwa 30 % höhere THC-Konzentrationen – ohne Effekt auf die Gesamtmenge an THC in diesem Gewebe.',
          'Die Autoren fanden keinen wirtschaftlich relevanten Nutzen von UV im Innenanbau. Mehr Lichtintensität (PPFD) erhöhte dagegen den Ertrag deutlich.',
        ],
        note: 'UV-B kann Haut und Augen schädigen. Wer UV-Leuchten einsetzt, braucht geeigneten Schutz.',
      },
    ],
    related: ['licht-ppfd-dli', 'photoperiode'],
    review: FULL,
    sources: [SRC.llewellyn2022],
  },
  {
    id: 'klima-vpd',
    title: 'Klima & VPD: Luftfeuchte richtig einordnen',
    category: 'Klima & VPD',
    level: 'Einsteiger',
    summary:
      'Das Dampfdruckdefizit (VPD) verbindet Temperatur und Luftfeuchte zu einer Größe, die die Verdunstung der Pflanze antreibt. Dauerhaft sehr hohe Luftfeuchte verzögerte in einer Studie die Blüte um drei Wochen.',
    updated: U,
    sections: [
      {
        heading: 'Was VPD bedeutet',
        paragraphs: [
          'Warme Luft kann mehr Wasserdampf aufnehmen als kalte. Das Dampfdruckdefizit ist die Differenz zwischen dem, was die Luft bei ihrer Temperatur maximal aufnehmen könnte (Sättigungsdampfdruck), und dem, was sie tatsächlich enthält. Je größer das Defizit, desto stärker „zieht“ die Luft Wasser aus den Blättern.',
          'Berechnet wird zuerst der Sättigungsdampfdruck, zum Beispiel mit der Tetens-Gleichung: SVP = 0,61078 × e^(17,27 × T / (T + 237,3)) kPa. Daraus folgt VPD = SVP × (1 − rF/100). Bei 25 °C und 60 % relativer Feuchte ergibt das rund 1,27 kPa.',
        ],
        diagram: 'vpd',
        links: [{ label: 'VPD-Rechner', to: 'tools' }],
      },
      {
        heading: 'Was hohe Luftfeuchte bewirkte',
        paragraphs: [
          'Corredor-Perilla et al. (2025) zogen eine CBD-reiche Sorte bei niedriger (37–58 %) und hoher (78–98 %) relativer Feuchte. Unter hoher Feuchte lag das VPD in der Blüte nur bei 0,62 bis 0,25 kPa. Die Blüte begann drei Wochen später, die Gesamtbiomasse war um 75 % und die Blütenbiomasse um 71 % geringer, die Konzentrationen von CBDA und CBD sanken um etwa das 4,9- bzw. 3,2-Fache.',
          'Die Autoren nennen aus der Literatur übliche VPD-Bereiche: 0,5–1 kPa für Stecklinge und Sämlinge, 0,7–1,2 kPa in der Wachstumsphase und 1,0–1,5 kPa in der Blüte. Das sind Orientierungswerte aus Sekundärquellen, keine für jede Sorte geprüften Optima.',
        ],
      },
      {
        heading: 'Feuchte und Schimmel',
        paragraphs: [
          'Hohe Feuchte begünstigt außerdem Pilzkrankheiten. Punja (2021) nennt das Senken der Luftfeuchte und eine gute Luftbewegung als Maßnahme gegen Umfallkrankheit und Blütenfäule (Botrytis).',
        ],
        links: [{ label: 'Krankheiten erkennen', to: 'discover/learn/krankheiten' }],
      },
    ],
    related: ['krankheiten', 'licht-ppfd-dli', 'bewaesserung'],
    review: FULL,
    sources: [SRC.corredor2025, SRC.punja2021],
  },
  {
    id: 'ph-ec',
    title: 'pH und EC messen: was die Werte bedeuten',
    category: 'pH, EC & Nährstoffe',
    level: 'Einsteiger',
    summary: 'pH beschreibt, wie sauer eine Lösung ist, EC wie viele gelöste Salze sie enthält. Beide beeinflussen, welche Nährstoffe die Wurzel aufnehmen kann – und beide verändern sich im Topf.',
    updated: U,
    sections: [
      {
        heading: 'pH: sauer oder basisch',
        paragraphs: [
          'Der pH-Wert ist ein logarithmisches Maß für die Säure einer Lösung: pH 5 ist zehnmal saurer als pH 6. Der pH-Wert der Nährlösung bestimmt mit, in welcher chemischen Form Nährstoffe vorliegen und ob die Wurzel sie aufnehmen kann.',
          'In der Studie von Bevan et al. (2021) mit Pflanzen in Wasserkultur (Deep Water Culture) wurde die Nährlösung zu Beginn mit Schwefelsäure oder Natronlauge auf pH 5,6 eingestellt. Das ist eine Versuchsbedingung für Hydrokultur, kein allgemeiner Sollwert – in Erde und Kokos gelten je nach Substrat andere Bereiche.',
        ],
      },
      {
        heading: 'EC: gelöste Salze',
        paragraphs: [
          'Die elektrische Leitfähigkeit (EC, meist in mS/cm) zeigt, wie viele Ionen in der Lösung gelöst sind – also grob die Gesamtmenge an Dünger. Sie sagt nicht, welche Nährstoffe enthalten sind.',
          'Bei Bevan et al. reichte die EC der Zulauflösung je nach Behandlung von 1,5 mS/cm aufwärts. In einer Behandlung lag der pH im Ablauf bei 6,5, obwohl er im Zulauf 5,6 betrug: Pflanzen verändern die Lösung, während sie Nährstoffe aufnehmen.',
        ],
      },
      {
        heading: 'Messen statt raten',
        paragraphs: [
          'Weil sich pH und EC im Substrat verschieben, lohnt es sich, Zulauf und – wenn möglich – Ablauf zu messen und die Werte zu notieren. Messgeräte müssen regelmäßig kalibriert werden; pH-Elektroden altern.',
        ],
        note: 'TERPGRID speichert pH- und EC-Messungen je Pflanze und zeigt sie im Verlauf. Grenzwerte, die du selbst festlegst, werden im Diagramm markiert.',
        links: [{ label: 'Messwerte erfassen', to: 'grows' }],
      },
    ],
    related: ['naehrstoffe-npk', 'organisch-mineralisch', 'bewaesserung'],
    review: FULL,
    sources: [SRC.bevan2021],
  },
  {
    id: 'naehrstoffe-npk',
    title: 'Stickstoff, Phosphor, Kalium: was die Blüte braucht',
    category: 'pH, EC & Nährstoffe',
    level: 'Fortgeschritten',
    summary: 'Eine Studie in Wasserkultur fand ein Ertragsoptimum bei rund 194 mg/L Stickstoff und 59 mg/L Phosphor – Kalium hatte im getesteten Bereich keinen Einfluss auf den Ertrag.',
    updated: U,
    sections: [
      {
        heading: 'Die drei Hauptnährstoffe',
        paragraphs: [
          'Stickstoff (N), Phosphor (P) und Kalium (K) werden in größeren Mengen benötigt als andere Nährstoffe und stehen deshalb als „NPK“ auf Düngeretiketten. Wie viel davon Cannabis in der Blüte braucht, war wegen früherer Forschungsbeschränkungen lange kaum untersucht.',
        ],
      },
      {
        heading: 'Der Versuch von Bevan et al. (2021)',
        paragraphs: [
          'Eine THC-reiche Sorte wuchs in Wasserkultur mit Nährlösungen, deren Gehalte systematisch variiert wurden: N 70–290, P 20–100 und K 60–340 mg/L. Ein Versuchsplan (Central Composite Design) erlaubte, alle drei gleichzeitig auszuwerten.',
          'Der Blütenertrag reagierte bogenförmig auf N und P: Das vorhergesagte Optimum lag bei 194 mg/L N und 59 mg/L P. Mehr war hier also nicht besser. Auf Kalium reagierte der Ertrag im getesteten Bereich nicht.',
        ],
        note: 'Diese Werte gelten für Hydrokultur mit einer Sorte. In Erde oder Kokos puffern Substrat und Mikroorganismen die Versorgung anders.',
      },
      {
        heading: 'Weniger kann reichen',
        paragraphs: [
          'Crispim Massuela et al. (2023) verdünnten Dünger in der Blüte gezielt. Mit einem Drittel weniger Dünger sank der Blütenertrag zwar, die CBD-Konzentration stieg aber – unterm Strich blieben 95 % des CBD-Ertrags erhalten.',
        ],
        links: [{ label: 'Organisch oder mineralisch?', to: 'discover/learn/organisch-mineralisch' }],
      },
    ],
    related: ['ph-ec', 'organisch-mineralisch', 'mangel-erkennen'],
    review: FULL,
    sources: [SRC.bevan2021, SRC.massuela2023],
  },
  {
    id: 'organisch-mineralisch',
    title: 'Organisch oder mineralisch düngen?',
    category: 'pH, EC & Nährstoffe',
    level: 'Fortgeschritten',
    summary: 'Organische Dünger setzen Nährstoffe langsamer frei. In einem Vergleich nahmen Pflanzen sie weniger effizient auf – ein Hinweis auf Timing, nicht auf „besser“ oder „schlechter“.',
    updated: U,
    sections: [
      {
        heading: 'Der Unterschied',
        paragraphs: [
          'Mineralische Dünger enthalten Nährstoffe in sofort löslicher Form. In organischen Düngern liegen viele Nährstoffe gebunden vor und müssen erst von Bodenlebewesen umgewandelt werden, bevor die Pflanze sie aufnehmen kann.',
        ],
      },
      {
        heading: 'Was der Vergleich zeigte',
        paragraphs: [
          'Crispim Massuela et al. (2023) düngten eine CBD-reiche Sorte in der Blüte mit organischem oder mineralischem Dünger in drei Konzentrationen (80, 160 und 240 mg N/L). Unterschiede im CBD-Ertrag zwischen den Düngerarten traten erst zur Endernte auf.',
          'Beim organischen Dünger waren Aufnahme und Verwertung der Nährstoffe geringer. Die Autoren schließen daraus, dass Zeitpunkt der Verfügbarkeit oder Bodenhilfsstoffe verbessert werden müssen – nicht, dass organischer Dünger grundsätzlich unterlegen ist.',
        ],
      },
      {
        heading: 'Nährstoffeffizienz',
        paragraphs: [
          'Wurde um ein Drittel verdünnt (160 statt 240 mg N/L), stieg die Effizienz, mit der N und K in CBD-Ertrag umgesetzt wurden, um 34 % (organisch) bzw. 72 % (mineralisch). Weniger Dünger bedeutet auch weniger Nährstoffe im Abwasser.',
        ],
      },
    ],
    related: ['naehrstoffe-npk', 'ph-ec'],
    review: FULL,
    sources: [SRC.massuela2023],
  },
  {
    id: 'bewaesserung',
    title: 'Bewässerung: Wie viel Wasser braucht die Blüte?',
    category: 'Substrat & Bewässerung',
    level: 'Fortgeschritten',
    summary: 'Mäßiger Wassermangel in der Blüte sparte in einer Studie Wasser, ohne Ertrag oder CBD-Gehalt zu senken. Starker Trockenstress brachte keinen Vorteil.',
    updated: U,
    sections: [
      {
        heading: 'Trockenstress als Werkzeug?',
        paragraphs: [
          'Es heißt oft, Stress steigere die Bildung von Inhaltsstoffen. Für Wassermangel waren die Ergebnisse früherer Studien widersprüchlich.',
          'Crispim Massuela et al. (2026) verglichen bei zwei CBD-reichen Sorten eine gut bewässerte Kontrolle (60–80 % der Topfkapazität) mit mäßigem Trockenstress (Abtrocknen auf 20–30 % der Topfkapazität, dann kleine Wassergaben) und starkem Trockenstress (Wasserentzug bis zum Welken) – jeweils früh, mittig oder spät in der Blüte.',
        ],
      },
      {
        heading: 'Ergebnisse',
        paragraphs: [
          'Die Pflanzen reagierten deutlich: Wassergehalt, Transpiration und Photosynthese sanken. Trotzdem hatte Trockenstress nur begrenzte Wirkung auf Blütenbiomasse und Cannabinoidertrag. Starker Trockenstress verschlechterte die Leistung durchweg.',
          'Mäßiger Trockenstress senkte den Wasserverbrauch, ohne Biomasse oder CBD-Ertrag zu mindern. Die Sorte hatte mehr Einfluss auf Ertrag und Cannabinoidgehalt als die Bewässerung.',
        ],
        note: 'Gezieltes Welkenlassen ist nach dieser Studie keine sinnvolle Strategie. Staunässe ist ebenfalls riskant: Punja (2021) nennt übermäßiges Gießen als Risiko für Wurzelfäule (Pythium).',
      },
    ],
    related: ['krankheiten', 'klima-vpd', 'ph-ec'],
    review: FULL,
    sources: [SRC.massuela2026, SRC.punja2021],
  },
  {
    id: 'mangel-erkennen',
    title: 'Blattsymptome deuten – und ihre Grenzen',
    category: 'Pflanzengesundheit',
    level: 'Einsteiger',
    summary: 'Gelbe oder gewölbte Blätter können viele Ursachen haben: Nährstoffe, pH, Wasser, Schädlinge oder Krankheiten. Wer systematisch prüft, findet die Ursache schneller.',
    updated: U,
    sections: [
      {
        heading: 'Ein Symptom, viele Ursachen',
        paragraphs: [
          'Vergilbte, gewölbte oder abfallende Blätter sind unspezifisch. Pulkoski und Burrack (2023/2024) beschreiben zum Beispiel, dass Milben und Blattläuse Blätter einrollen und vergilben lassen – Symptome, die leicht mit einem Nährstoffproblem verwechselt werden.',
          'Auch pH-Wert und Bewässerung beeinflussen, ob Nährstoffe überhaupt aufgenommen werden. Ein „Mangel“ kann deshalb bei ausreichend Dünger entstehen.',
        ],
      },
      {
        heading: 'Systematisch vorgehen',
        paragraphs: [
          'Erstens: Blattunterseiten und junge Triebe mit einer Lupe auf Schädlinge prüfen. Zweitens: pH und EC von Zulauf und Ablauf messen. Drittens: Gießrhythmus und Substratfeuchte prüfen. Viertens: Klima (Temperatur, Luftfeuchte) kontrollieren. Erst dann die Düngung ändern – und immer nur eine Größe auf einmal.',
          'Fotos im Verlauf helfen, Veränderungen zu erkennen. Notiere, was du geändert hast, damit du die Wirkung später zuordnen kannst.',
        ],
        links: [
          { label: 'Schädlinge', to: 'discover/learn/schaedlinge' },
          { label: 'pH & EC', to: 'discover/learn/ph-ec' },
        ],
      },
      {
        heading: 'Grenzen der Ferndiagnose',
        paragraphs: [
          'Ohne Labor lassen sich viele Ursachen nicht sicher unterscheiden. TERPGRID stellt deshalb keine automatischen Diagnosen. Bei Verdacht auf Viroide oder Pilzbefall im Wurzelbereich hilft nur eine Untersuchung im Labor.',
        ],
      },
    ],
    related: ['schaedlinge', 'krankheiten', 'ph-ec'],
    review: FULL,
    sources: [SRC.pulkoski2024, SRC.punja2021],
  },
  {
    id: 'krankheiten',
    title: 'Krankheiten: Mehltau, Blütenfäule, Wurzelfäule, Viroide',
    category: 'Pflanzengesundheit',
    level: 'Fortgeschritten',
    summary: 'Eine Übersichtsarbeit beschreibt die wichtigsten Krankheiten im Innenanbau und was gegen sie hilft: saubere Stecklinge, passendes Klima, Hygiene und biologische Mittel.',
    updated: U,
    sections: [
      {
        heading: 'Die häufigsten Erreger',
        paragraphs: [
          'Punja (2021) fasst die wichtigsten Krankheiten im Innenanbau zusammen: Umfallkrankheit bei Stecklingen (Botrytis cinerea, Fusarium-Arten), Wurzel- und Stängelfäulen (Fusarium, Pythium), Echter Mehltau (Golovinomyces-Arten), Blütenfäule (Botrytis cinerea, Fusarium), Schimmel nach der Ernte (Botrytis, Penicillium) und das Hop Latent Viroid, das Pflanzen verkümmern lässt („Dudding“).',
        ],
      },
      {
        heading: 'Vorbeugen',
        paragraphs: [
          'Die genannten Maßnahmen sind vor allem vorbeugend: Mutterpflanzen auf Erreger testen und nur gesunde Stecklinge verwenden, Luftfeuchte senken und Luft bewegen, Wurzeln nicht verletzen und nicht zu viel gießen, befallene Pflanzenteile entfernen und vernichten.',
          'Gegen Blütenfäule empfiehlt die Übersicht, Feuchte zu reduzieren und Sorten mit sehr großen, dichten Blüten zu meiden, die Feuchtigkeit halten. Gegen Schimmel nach der Ernte: Trockenraum mit passender Feuchte und Temperatur, Blüten bei Ernte und Trimmen nicht verletzen.',
        ],
      },
      {
        heading: 'Pflanzenschutzmittel',
        paragraphs: [
          'Zum Zeitpunkt der Übersicht waren in Kanada und den USA nur sehr wenige chemische Mittel für Cannabis zugelassen, Wirksamkeitsdaten fehlten weitgehend. Die größte Herausforderung sieht der Autor darin, die Keimbelastung der geernteten Blüten gering zu halten.',
        ],
        note: 'Welche Mittel bei dir erlaubt sind, regelt das jeweilige Pflanzenschutzrecht. Rückstände auf Blüten werden konsumiert – im Zweifel lieber vorbeugen als spritzen.',
      },
    ],
    related: ['klima-vpd', 'trocknen-curen', 'mangel-erkennen'],
    review: FULL,
    sources: [SRC.punja2021],
  },
  {
    id: 'schaedlinge',
    title: 'Schädlinge: Spinnmilben, Rostmilben, Blattläuse',
    category: 'Schädlinge',
    level: 'Einsteiger',
    summary: 'Saugende Schädlinge gehören zu den wichtigsten Problemen im Gewächshaus. Starker Spinnmilbenbefall bremste in einer Studie den Anstieg der Cannabinoide.',
    updated: U,
    sections: [
      {
        heading: 'Die wichtigsten Arten',
        paragraphs: [
          'Pulkoski und Burrack (2023/2024) nennen als bedeutendste Schädlinge im Gewächshausanbau die Gemeine Spinnmilbe (Tetranychus urticae), die Hanf-Rostmilbe (Aculops cannabicola), die Weichhautmilbe (Polyphagotarsonemus latus) und die Hanf-Blattlaus (Phorodon cannabis).',
          'Ihr Saugen kann Blätter einrollen und vergilben lassen, bis hin zu Blattfall und geringerer Blüten- und Harzbildung.',
        ],
      },
      {
        heading: 'Wirkung auf die Inhaltsstoffe',
        paragraphs: [
          'In Versuchen mit Hanf stiegen die Cannabinoide bei hohem Spinnmilbenbefall langsamer an als bei unbefallenen Pflanzen (Versuchsjahr 2020). Im Folgejahr unterschied sich die THC-Konzentration nicht zwischen den Behandlungen. Die Wirkung ist also nicht einheitlich, aber Befall ist kein Vorteil.',
        ],
      },
      {
        heading: 'Früh erkennen',
        paragraphs: [
          'Milben sind sehr klein und sitzen meist auf der Blattunterseite. Feine Gespinste, helle Saugpunkte oder bronzefarbene Verfärbungen sind Warnzeichen. Regelmäßige Kontrolle mit einer Lupe, Quarantäne für neue Pflanzen und saubere Werkzeuge verhindern viele Probleme.',
        ],
      },
    ],
    related: ['mangel-erkennen', 'krankheiten'],
    review: FULL,
    sources: [SRC.pulkoski2024],
  },
  {
    id: 'geschlecht-zwitter',
    title: 'Männlich, weiblich, einhäusig: Geschlecht bei Cannabis',
    category: 'Genetik & Züchtung',
    level: 'Fortgeschritten',
    summary: 'Cannabis ist meist getrenntgeschlechtlich: weibliche Pflanzen mit XX-, männliche mit XY-Chromosomen. Einhäusige Pflanzen bilden beide Blütenarten – und kommen nicht nur bei XX vor.',
    updated: U,
    sections: [
      {
        heading: 'Getrennte Geschlechter',
        paragraphs: [
          'Die meisten Cannabispflanzen sind entweder weiblich oder männlich. Wie beim Menschen gibt es Geschlechtschromosomen: Weibliche Pflanzen tragen XX, männliche XY. Für den Blütenanbau sind weibliche Pflanzen gefragt, weil sie die harzreichen Blütenstände bilden; Bestäubung führt zur Samenbildung.',
        ],
      },
      {
        heading: 'Einhäusig („zwittrig“)',
        paragraphs: [
          'Einhäusige (monözische) Pflanzen tragen männliche und weibliche Blüten. In der Hanfzüchtung ist das gewollt, weil es einheitlichere Bestände ergibt. Lange galt Einhäusigkeit als Eigenschaft ausschließlich weiblicher XX-Pflanzen.',
          'Garcia-de Heer et al. (2024) beschreiben erstmals eine einhäusige Pflanze mit XY-Chromosomen, bestätigt über Blütenstruktur, Wuchs, PCR-Analyse und gezielte Kreuzungen. Das hat Folgen für die Züchtung, etwa für F1-Hybridsaatgut.',
        ],
      },
      {
        heading: 'Für den Anbau',
        paragraphs: [
          'Einzelne männliche Blüten an weiblichen Pflanzen können ungewollte Samen erzeugen. Regelmäßige Kontrolle in der Blüte hilft, sie früh zu entdecken. Ob und wie stark eine Sorte dazu neigt, ist genetisch und umweltabhängig – Versprechen wie „100 % feminisiert“ sind Herstellerangaben.',
        ],
      },
    ],
    related: ['genetik', 'botanik'],
    review: FULL,
    sources: [SRC.garcia2024],
  },
  {
    id: 'erntezeitpunkt',
    title: 'Erntezeitpunkt: Was die Farbe der Narben verrät',
    category: 'Ernte',
    level: 'Einsteiger',
    summary: 'Viele Anbauer ernten, wenn die Blütennarben überwiegend bernsteinfarben sind. Eine Studie mit 25 Genotypen zeigt: Die Faustregel passt meistens – aber nicht immer.',
    updated: U,
    sections: [
      {
        heading: 'Die Faustregel',
        paragraphs: [
          'Die Narben (Stigmen) der weiblichen Blüten sind zunächst weiß und verfärben sich mit der Reife bernsteinfarben. Viele Anbauer nutzen diesen Farbwechsel, um den Erntezeitpunkt zu bestimmen.',
        ],
        diagram: 'stigma',
      },
      {
        heading: 'Was die Studie zeigte',
        paragraphs: [
          'Tran et al. (2025) teilten den Farbwechsel in vier Stufen ein: 1 ganz weiß, 2 teilweise bernsteinfarben, 3 überwiegend bernsteinfarben, 4 ganz bernsteinfarben. Gleichzeitig maßen sie die Cannabinoide per LC-MS.',
          'Bei 22 von 25 Genotypen lag das Maximum der Cannabinoidkonzentration zwischen Stufe 3 und Stufe 4. Einige Genotypen erreichten ihr Maximum aber schon in Stufe 1 oder 2.',
        ],
      },
      {
        heading: 'Fazit der Autoren',
        paragraphs: [
          'Die Regel „ernten, wenn überwiegend bernsteinfarben“ ist in den meisten Fällen eine brauchbare Näherung. Wer ein bestimmtes Cannabinoidprofil anstrebt, sollte den besten Zeitpunkt für die eigene Sorte ermitteln.',
        ],
        note: 'Halte den Farbzustand mit Fotos und Datum im Growlog fest. So kannst du bei der nächsten Runde vergleichen.',
        links: [{ label: 'Fotos im Growlog', to: 'grows' }],
      },
    ],
    related: ['trocknen-curen', 'cannabinoide', 'anbau-ueberblick'],
    review: FULL,
    sources: [SRC.tran2025],
  },
  {
    id: 'trocknen-curen',
    title: 'Trocknen und Curen: Qualität nach der Ernte',
    category: 'Trocknung & Lagerung',
    level: 'Einsteiger',
    summary: 'Nach der Ernte entscheidet die Trocknung über Schimmelrisiko, Terpenverlust und Haltbarkeit. Zwei Studien vergleichen Methoden – mit teils überraschenden Ergebnissen.',
    updated: U,
    sections: [
      {
        heading: 'Warum trocknen?',
        paragraphs: [
          'Frisch geerntete Blüten bestehen größtenteils aus Wasser. Baek et al. (2025) maßen bei Hanf einen Ausgangswert von 77 % Feuchte. Für eine sichere Lagerung muss sie deutlich sinken – in der Studie auf 6 %.',
        ],
      },
      {
        heading: 'Methoden im Vergleich',
        paragraphs: [
          'Baek et al. verglichen Heißluft (75 °C), Lufttrocknung bei 25 °C und Gefriertrocknung. Heißluft erreichte 6 % Feuchte in 8 Stunden und senkte die Hefe- und Schimmelbelastung um bis zu zwei Zehnerpotenzen; Lufttrocknung dauerte eine Woche, Gefriertrocknung 24 Stunden. Der Gesamt-Cannabinoidgehalt änderte sich durch Trocknen und Curen nicht wesentlich, es kam aber zu Decarboxylierung (Umwandlung von THCA in THC bzw. CBDA in CBD).',
          'Birenboim et al. (2024) testeten kontrollierte Atmosphären (u. a. reiner Stickstoff) für medizinisches Cannabis. Trocknen und Curen gingen mindestens 60 % schneller, flüchtige Terpene blieben besser erhalten. Traditionell getrocknete Blüten waren dagegen stark mit dem Pilz Alternaria alternata befallen. Die optimalen Bedingungen unterschieden sich je nach Sorte.',
        ],
        note: 'Terpene sind flüchtig: Hohe Temperaturen sparen Zeit, können aber Aroma kosten. Die Heißluft-Studie hat Terpene nicht gemessen.',
      },
      {
        heading: 'Curen',
        paragraphs: [
          'Beim Curen werden getrocknete Blüten luftdicht und dunkel gelagert. In der Studie von Baek et al. stieg die Feuchte dabei um 3,3 bis 13,6 %; ob in Glas oder Mylar-Beutel, machte keinen wesentlichen Unterschied. Die Autoren bevorzugten insgesamt Heißlufttrocknung mit anschließendem Curen im Glas.',
        ],
      },
    ],
    related: ['erntezeitpunkt', 'krankheiten', 'terpene-analytik'],
    review: FULL,
    sources: [SRC.baek2025, SRC.birenboim2024],
  },
  {
    id: 'terpene-analytik',
    title: 'Warum Terpenprofile schwanken',
    category: 'Terpene',
    level: 'Fortgeschritten',
    summary: 'Ein Terpenprofil ist eine Momentaufnahme einer Probe. Pflanze, Anbau, Trocknung und Messmethode verändern es – deshalb zeigt TERPGRID Profile nie als feste Sorteneigenschaft.',
    updated: U,
    sections: [
      {
        heading: 'Pflanzen derselben Sorte unterscheiden sich',
        paragraphs: [
          'Booth et al. (2017) beobachteten bei einzelnen Pflanzen der Sorte ‚Finola‘ deutliche Unterschiede in den Mono- und Sesquiterpenprofilen. Auch innerhalb einer Sorte ist ein Terpenprofil also keine feste Größe.',
        ],
      },
      {
        heading: 'Anbau und Nachernte',
        paragraphs: [
          'Licht wirkte in der Studie von Rodriguez-Morrison et al. (2021) nur gering auf die Terpenkonzentration. Die Trocknung hatte dagegen großen Einfluss: Birenboim et al. (2024) fanden, dass je nach Sorte unterschiedliche Trocknungsbedingungen Mono- und Sesquiterpene am besten erhielten.',
        ],
        links: [{ label: 'Trocknen und Curen', to: 'discover/learn/trocknen-curen' }],
      },
      {
        heading: 'Messmethoden',
        paragraphs: [
          'Janta und Vimolmangkang (2024) identifizierten in 19 getrockneten Blütenproben 75 flüchtige Verbindungen mit Headspace-Festphasen-Mikroextraktion und GC-MS. Sie bezeichnen die Identifizierung als vorläufig und geben relative Anteile an, keine absoluten Gehalte. Andere Labore messen mit anderen Methoden – Ergebnisse sind nur eingeschränkt vergleichbar.',
        ],
      },
      {
        heading: 'Was das für TERPGRID bedeutet',
        paragraphs: [
          'Seedbank- und Datenbanktexte nennen Terpene, aber keine Mengen. TERPGRID zeigt sie als Nennungen mit Herkunft. Eigene Laborberichte werden als Messwert der jeweiligen Probe angezeigt – mit Labor, Datum und Einheit – und nie auf andere Chargen übertragen. Fehlt ein Beleg, steht dort: „Kein belegtes Terpenprofil verfügbar.“',
        ],
        links: [{ label: 'Terpen-Atlas', to: 'discover/terpenes' }],
      },
    ],
    related: ['terpene', 'laborberichte-lesen', 'trocknen-curen'],
    review: FULL,
    sources: [SRC.booth2017, SRC.rodriguez2021, SRC.birenboim2024, SRC.janta2024],
  },
  {
    id: 'laborberichte-lesen',
    title: 'Laborberichte und THC-Angaben kritisch lesen',
    category: 'Labor & Analytik',
    level: 'Einsteiger',
    summary: 'In einer Stichprobe aus Colorado lag der gemessene THC-Gehalt im Schnitt 23 % unter dem niedrigsten Wert auf dem Etikett. Worauf man bei Analysen achten sollte.',
    updated: U,
    sections: [
      {
        heading: 'Etikett und Messung',
        paragraphs: [
          'Schwabe et al. (2023) maßen per HPLC den THC-Gehalt von 23 Proben aus zehn Abgabestellen in Colorado und verglichen ihn mit den Angaben auf der Verpackung. Im Mittel lag der gemessene Gehalt bei 14,98 ± 2,23 % – 23,1 % unter dem niedrigsten und 35,6 % unter dem höchsten angegebenen Wert. Rund 70 % der Proben lagen mehr als 15 % unter der Etikettangabe, drei Proben hatten nur halb so viel THC wie maximal angegeben.',
          'Als mögliche Ursachen nennen die Autoren fehlende einheitliche Prüfverfahren, begrenzte Aufsicht und finanzielle Anreize, hohe Werte auszuweisen.',
        ],
      },
      {
        heading: 'Worauf achten',
        paragraphs: [
          'Ein Laborbericht gilt für eine Probe: Prüfe Labor, Datum, Chargen- oder Probennummer und die Einheit (Prozent oder mg/g). „Gesamt-THC“ wird meist aus THC und THCA berechnet; wie, sollte im Bericht stehen.',
          'Ein einzelner Bericht beschreibt nicht „die Sorte“. Andere Chargen können deutlich abweichen.',
        ],
        note: 'In TERPGRID bleiben deine Laborberichte privat in deinem Konto. Sie werden nie in den öffentlichen Sortenkatalog übertragen.',
        links: [{ label: 'Laborberichte', to: 'lab-reports' }],
      },
    ],
    related: ['thc-cbd', 'terpene-analytik', 'forschung'],
    review: FULL,
    sources: [SRC.schwabe2023],
  },
  {
    id: 'edibles-fahren',
    title: 'Edibles und Autofahren',
    category: 'Konsum & Risiko',
    level: 'Einsteiger',
    summary: 'In einer randomisierten Studie verschlechterten THC-Edibles die Spurhaltung im Fahrsimulator dosisabhängig – bei Blutwerten unter gängigen gesetzlichen Grenzwerten.',
    updated: U,
    sections: [
      {
        heading: 'Die Studie',
        paragraphs: [
          'Le Foll et al. (2026) gaben 40 Erwachsenen, die regelmäßig Cannabis konsumieren, in zufälliger Reihenfolge und doppelt verblindet Placebo sowie handelsübliche THC-Kaubonbons mit 2, 10 und 20 mg THC. Gemessen wurde die Fahrleistung im Simulator zwei und fünf Stunden danach.',
        ],
      },
      {
        heading: 'Ergebnisse',
        paragraphs: [
          'Die Schwankung der Spurposition – ein Maß für die Fahrzeugkontrolle – nahm bei 10 und 20 mg gegenüber Placebo signifikant zu, bei 2 mg nicht. Bei 20 mg stieg auch die Reaktionszeit. Die THC-Konzentration im Vollblut erreichte im Mittel Spitzen von nur 3,4 ng/mL (20 mg) und 1,6 ng/mL (10 mg).',
          'Die Teilnehmenden schätzten ihre Fahrfähigkeit selbst schlechter ein und waren weniger bereit zu fahren. Die Autoren betonen, dass die Beeinträchtigung bei Blutwerten nahe oder unter üblichen Grenzwerten (oft 2 oder 5 ng/mL) auftrat.',
        ],
        note: 'Wer Cannabis konsumiert hat, fährt nicht. Edibles wirken verzögert und lange – eine Blutprobe unter einem Grenzwert heißt nicht, dass du fahrtüchtig bist.',
      },
    ],
    related: ['wirkungsdauer', 'risikominimierung', 'konsumformen'],
    review: FULL,
    sources: [SRC.lefoll2026],
  },
];
