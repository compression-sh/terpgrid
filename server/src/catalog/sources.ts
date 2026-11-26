/**
 * Quellenregister des Sortenkatalogs (Stand der Prüfung: 25.11.2026).
 * Einstufung je Quelle mit Begründung – maßgeblich für Import und Anzeige. Eine Quelle wird nur
 * importiert, wenn Lizenz und Weitergabe geklärt sind; öffentliche Sichtbarkeit genügt nicht.
 * Laufzeitstatus (letzter Import, Fehler) wird aus den Import-/Lauftabellen ergänzt.
 */
export type SourcePermission =
  | 'approved' // Import erlaubt
  | 'approved-attribution' // Import mit Namensnennung
  | 'restricted' // eingeschränkt (z. B. nur Zwischenspeicher mit Ablauf)
  | 'permission-required' // nur mit ausdrücklicher Erlaubnis
  | 'reference' // nur als Referenz/Verweis, keine Datenübernahme
  | 'unsuitable'
  | 'license-unclear'
  | 'inaccessible'; // technisch nicht erreichbar (z. B. Netzwerk gesperrt, Cloudflare)

export interface CatalogSource {
  id: string;
  name: string;
  url: string;
  license: string;
  attribution?: string;
  fields: string[];
  permission: SourcePermission;
  /** Wie die Quelle in TERPGRID genutzt wird bzw. warum nicht */
  decision: string;
  /** Zwischenspeicher-Ablauf laut Bedingungen (Tage), falls zutreffend */
  retentionDays?: number;
  /** Bezeichner, unter dem Import-/Laufdaten gespeichert sind */
  runtime?: { kind: 'cisp' | 'enrichment' | 'samples'; key: string };
}

export const SOURCES: CatalogSource[] = [
  {
    id: 'cisp',
    name: 'CI-Strains-Pro (Cannabis Intelligence Database)',
    url: 'https://github.com/Shannon-Goddard/ci-strains-pro',
    license: 'CC BY 4.0',
    attribution: 'Shannon Goddard, Cannabis Intelligence Database (CI-Strains-Pro)',
    fields: ['Sorte', 'Breeder', 'Seedbank', 'Typ', 'Samentyp', 'Autoflower', 'Eltern', 'THC/CBD-Spannen', 'Terpen-Nennungen', 'Aromen', 'Blütezeit', 'Höhe', 'Ertrag'],
    permission: 'approved-attribution',
    decision: 'Kernkatalog. Alle inhaltlichen Spalten werden genutzt; bewusst nicht: abgeleitete lineage_formula (würde Großeltern erraten).',
    runtime: { kind: 'cisp', key: 'cisp' },
  },
  {
    id: 'smith2022',
    name: 'Smith et al. (2022), PLoS ONE – Laborproben aus sechs US-Bundesstaaten',
    url: 'https://github.com/cjsmith015/phytochemical-diversity-cannabis',
    license: 'CC0 1.0',
    attribution: 'Smith CJ, Vergara D, Keegan B, Jikomes N (2022), doi:10.1371/journal.pone.0267498',
    fields: ['Gesamt-THC/CBD/CBG/CBC/CBN/THCV je Probe (berechnet)', '14 Terpene je Probe', 'Region', 'Produktname'],
    permission: 'approved',
    decision: '89.923 Proben importiert. Zuordnung nur über gleichen Produktnamen (ohne Breeder) – als „Nicht eindeutig zugeordnet“ gekennzeichnet; Autoflower ausgenommen.',
    runtime: { kind: 'samples', key: 'smith2022' },
  },
  {
    id: 'strainapi',
    name: 'StrainAPI',
    url: 'https://www.strainapi.com/',
    license: 'StrainAPI API Terms (Okt. 2026): Caching erlaubt, Namensnennung „Data provided by StrainAPI“, kein Nachbau',
    fields: ['Terpen-Nennungen', 'THC/CBD', 'Genetik', 'Aroma', 'Beschreibung'],
    permission: 'restricted',
    decision: 'Gezielte Anreicherung je Sorte mit 30 Tagen Zwischenspeicher, nur exakte Abgleiche; Refresh-Timer nicht aktiviert.',
    retentionDays: 30,
    runtime: { kind: 'enrichment', key: 'strainapi' },
  },
  {
    id: 'cannalib',
    name: 'CannaLib',
    url: 'https://cannalib.org',
    license: 'Nutzungsbedingungen der API',
    fields: ['Forschungsdaten je Sortenname'],
    permission: 'reference',
    decision: 'Nur Abruf auf ausdrücklichen Klick über den Server-Proxy; keine Übernahme in den Katalog.',
  },
  {
    id: 'findmyseeds',
    name: 'Find My Seeds',
    url: 'https://www.findmyseeds.com/',
    license: 'API Policy: persönliche/edukative Nutzung, Namensnennung, kein Massen-Download',
    fields: ['Seedbank-Angebote'],
    permission: 'inaccessible',
    decision: 'Automatisierte Abrufe werden mit HTTP 403 abgewiesen; der Anbieter verlangt Rücksprache. Keine Umgehung – nicht genutzt.',
  },
  {
    id: 'cannlytics',
    name: 'Cannlytics – cannabis_results / cannabis_analytes (Hugging Face)',
    url: 'https://huggingface.co/datasets/cannlytics/cannabis_results',
    license: 'widersprüchlich: Datensatzkarte CC BY 4.0, Ladeskript verweist auf ODC-By',
    fields: ['Laborergebnisse je Probe (u. a. CA, CO, MA, WA)', 'teilweise Terpene'],
    permission: 'license-unclear',
    decision: 'Vielversprechend, aber Lizenzangaben widersprüchlich; Laden erfordert Ausführen fremden Python-Codes; Host in dieser Umgebung gesperrt. Vor Import Lizenz schriftlich klären.',
  },
  {
    id: 'watts2021',
    name: 'Watts et al. (2021), Nature Plants – Dryad-Datensatz',
    url: 'https://datadryad.org/dataset/doi:10.5061/dryad.gqnk98smm',
    license: 'CC0 1.0',
    fields: ['Genotypen (137 niederländische Proben)', 'Terpene/Cannabinoide (GC-FID)'],
    permission: 'inaccessible',
    decision: 'Lizenz geeignet, aber Host in dieser Umgebung gesperrt; Probenbezeichnungen und Zuordnung noch zu prüfen. Kandidat für die nächste Phase.',
  },
  {
    id: 'officialcannabis',
    name: 'Official Cannabis – Strain Index',
    url: 'https://officialcannabis.net/data/',
    license: 'CC BY 4.0 (laut Anbieter)',
    fields: ['Aggregierte Medianwerte je Sortenname'],
    permission: 'reference',
    decision: 'Nur Aggregate (abgeleitet aus Cannlytics) – keine Einzelproben, Herkunft nicht nachprüfbar; Host gesperrt. Nicht importiert.',
  },
  {
    id: 'opencoa',
    name: 'OpenCOA / terphunter / CannabisAnalytic',
    url: 'https://opencoa.org',
    license: 'nicht angegeben bzw. kommerziell',
    fields: ['Laborzertifikate (COA)'],
    permission: 'permission-required',
    decision: 'Keine Weitergabelizenz; nur mit Erlaubnis des Betreibers.',
  },
  {
    id: 'leafly',
    name: 'Leafly (auch Kaggle-Kopien)',
    url: 'https://www.leafly.com',
    license: 'Nutzungsbedingungen untersagen Übernahme',
    fields: ['Sortenbeschreibungen', 'Terpene', 'Bilder'],
    permission: 'unsuitable',
    decision: 'Keine Erlaubnis zur Weitergabe; Kopien auf Kaggle o. Ä. ändern daran nichts.',
  },
  {
    id: 'pubchem',
    name: 'PubChem (NIH)',
    url: 'https://pubchem.ncbi.nlm.nih.gov',
    license: 'gemeinfrei (US-Regierungswerk), Daten einzelner Beiträge mit Herkunftsangabe',
    fields: ['Chemische Identität', 'Summenformel', 'Molmasse', 'Struktur'],
    permission: 'approved',
    decision: 'Grundlage der Terpen-Atlas-Identitäten (PubChem-CID je Verbindung).',
  },
  {
    id: 'images',
    name: 'Sortenbilder (Wikimedia Commons u. a.)',
    url: 'https://commons.wikimedia.org',
    license: 'je Bild verschieden (CC BY-SA, CC0 …)',
    fields: ['Fotos'],
    permission: 'reference',
    decision: 'Keine Bilder übernommen: Zuordnung Bild → Breeder-Linie nicht belegbar. Platzhalter bleibt.',
  },
];

export const PERMISSION_LABEL: Record<SourcePermission, string> = {
  approved: 'Import freigegeben',
  'approved-attribution': 'Freigegeben mit Namensnennung',
  restricted: 'Eingeschränkt (Zwischenspeicher)',
  'permission-required': 'Erlaubnis erforderlich',
  reference: 'Nur Referenz',
  unsuitable: 'Ungeeignet',
  'license-unclear': 'Lizenz unklar',
  inaccessible: 'Technisch nicht zugänglich',
};
