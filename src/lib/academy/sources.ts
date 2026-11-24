/**
 * Quellen der Academy-Leitfäden (Stand 24.11.2026).
 * Alle hier gelisteten Arbeiten sind Open Access; ihr Volltext wurde über Europe PMC abgerufen und für die
 * jeweiligen Aussagen gelesen. Zahlen in den Artikeln stammen aus diesen Texten (Studienbedingungen, keine Rezepte).
 */
import type { KbSource } from '../knowledge';

const doi = (d: string) => `https://doi.org/${d}`;

export const SRC = {
  rodriguez2021: {
    label: 'Rodriguez-Morrison V, Llewellyn D, Zheng Y (2021). Cannabis yield, potency, and leaf photosynthesis respond differently to increasing light levels in an indoor environment. Front Plant Sci 12:646020.',
    url: doi('10.3389/fpls.2021.646020'),
  },
  llewellyn2022: {
    label: 'Llewellyn D et al. (2022). Indoor grown cannabis yield increased proportionally with light intensity, but ultraviolet radiation did not affect yield or cannabinoid content. Front Plant Sci 13:974018.',
    url: doi('10.3389/fpls.2022.974018'),
  },
  ahrens2023: {
    label: 'Ahrens A, Llewellyn D, Zheng Y (2023). Is twelve hours really the optimum photoperiod for promoting flowering in indoor-grown cultivars of Cannabis sativa? Plants 12(14):2605.',
    url: doi('10.3390/plants12142605'),
  },
  peterswald2025: { label: 'Peterswald TJ et al. (2025). The effects of far-red light on medicinal Cannabis. Sci Rep 15:17435.', url: doi('10.1038/s41598-025-99771-6') },
  corredor2025: {
    label: 'Corredor-Perilla IC, Kwon TH, Park SH (2025). Elevated relative humidity significantly decreases cannabinoid concentrations while delaying flowering development in Cannabis sativa L. Front Plant Sci 16:1678142.',
    url: doi('10.3389/fpls.2025.1678142'),
  },
  bevan2021: {
    label: 'Bevan L, Jones M, Zheng Y (2021). Optimisation of nitrogen, phosphorus, and potassium for soilless production of Cannabis sativa in the flowering stage using response surface analysis. Front Plant Sci 12:764103.',
    url: doi('10.3389/fpls.2021.764103'),
  },
  massuela2023: {
    label: 'Crispim Massuela D et al. (2023). Cannabis Hunger Games: nutrient stress induction in flowering stage – impact of organic and mineral fertilizer levels on biomass, cannabidiol (CBD) yield and nutrient use efficiency. Front Plant Sci 14:1233232.',
    url: doi('10.3389/fpls.2023.1233232'),
  },
  massuela2026: { label: 'Crispim Massuela D et al. (2026). Less water, same buds: moderate drought as a water-saving strategy for indoor cannabis. Front Plant Sci 17:1930650.', url: doi('10.3389/fpls.2026.1930650') },
  punja2021: { label: 'Punja ZK (2021). Emerging diseases of Cannabis sativa and sustainable management. Pest Manag Sci 77(9):3857–3870.', url: doi('10.1002/ps.6307') },
  pulkoski2024: {
    label: 'Pulkoski M, Burrack H (2023/2024). Assessing the impact of piercing-sucking pests on greenhouse-grown industrial hemp (Cannabis sativa L.). Environ Entomol 53(1).',
    url: doi('10.1093/ee/nvad044'),
  },
  garcia2024: {
    label: 'Garcia-de Heer L et al. (2024). Why not XY? Male monoecious sexual phenotypes challenge the female monoecious paradigm in Cannabis sativa L. Front Plant Sci 15:1412079.',
    url: doi('10.3389/fpls.2024.1412079'),
  },
  tran2025: { label: 'Tran J et al. (2025). Determination of optimal harvest time in Cannabis sativa L. based upon stigma color transition. Plants 14(10):1532.', url: doi('10.3390/plants14101532') },
  baek2025: { label: 'Baek Y, Grab H, Chen C (2025). Postharvest drying and curing affect cannabinoid contents and microbial levels in industrial hemp (Cannabis sativa L.). Plants 14(3):414.', url: doi('10.3390/plants14030414') },
  birenboim2024: {
    label: 'Birenboim M et al. (2024). In pursuit of optimal quality: cultivar-specific drying approaches for medicinal cannabis. Plants 13(7):1049.',
    url: doi('10.3390/plants13071049'),
  },
  lefoll2026: {
    label: 'Le Foll B et al. (2026). Dose-dependent effects of cannabis edibles on simulated driving performance: a randomized clinical trial. JAMA Netw Open 9(8):e2631306.',
    url: doi('10.1001/jamanetworkopen.2026.31306'),
  },
  schwabe2023: {
    label: 'Schwabe AL, Johnson V, Harrelson J, McGlaughlin ME (2023). Uncomfortably high: Testing reveals inflated THC potency on retail Cannabis labels. PLOS ONE 18(4):e0282396.',
    url: doi('10.1371/journal.pone.0282396'),
  },
  booth2017: { label: 'Booth JK, Page JE, Bohlmann J (2017). Terpene synthases from Cannabis sativa. PLoS One 12(3):e0173911.', url: doi('10.1371/journal.pone.0173911') },
  janta2024: {
    label: 'Janta P, Vimolmangkang S (2024). Chemical profiling and clustering of various dried cannabis flowers revealed by volatilomics and chemometric processing. J Cannabis Res 6:44.',
    url: doi('10.1186/s42238-024-00252-w'),
  },
} satisfies Record<string, KbSource>;
