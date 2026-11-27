/**
 * Datenmodell von TERPGRID. Datensätze liegen in IndexedDB (Lokalmodus) bzw. zusätzlich verschlüsselt auf dem eigenen Server (Servermodus)
 * Datumswerte sind ISO-Strings:
 * - `DateString`:     "YYYY-MM-DD" (Kalendertag, ohne Zeitzone)
 * - `DateTimeString`: lokale Zeit "YYYY-MM-DDTHH:mm" (wie <input type="datetime-local">)
 * - `Timestamp`:      vollständiger ISO-Zeitstempel (createdAt/updatedAt)
 */

export type DateString = string;
export type DateTimeString = string;
export type Timestamp = string;

export interface BaseRecord {
  id: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ───────────────────────── Grow ───────────────────────── */

export const GROW_PHASES = [
  'germination',
  'seedling',
  'vegetative',
  'flowering',
  'harvest',
  'drying',
  'curing',
  'completed',
] as const;
export type GrowPhase = (typeof GROW_PHASES)[number];

/** Vom Benutzer gesetzte Meilenstein-Daten (Beginn der jeweiligen Phase). */
export type PhaseDates = Partial<Record<GrowPhase, DateString>>;

export type GrowSetting = 'indoor' | 'outdoor' | 'greenhouse';
export type GrowStatus = 'active' | 'completed' | 'archived';

export interface GrowProject extends BaseRecord {
  name: string;
  description: string;
  coverPhotoId?: string;
  startDate: DateString;
  setting: GrowSetting;
  medium?: string;
  environment?: string;
  notes: string;
  status: GrowStatus;
  completedDate?: DateString;
  phaseDates: PhaseDates;
  /** Eigene Zielbereiche für Messwerte dieses Grows */
  thresholds?: Thresholds;
  /** Persönliche Experimente/Vergleiche innerhalb dieses Grows (keine Kausalaussagen) */
  experiments?: Experiment[];
}

export interface Experiment {
  id: string;
  name: string;
  purpose: string;
  plantIds: string[];
  startDate: DateString;
  endDate?: DateString;
  /** Messgrößen, die für dieses Experiment verglichen werden (Schlüssel aus METRICS) */
  metrics: string[];
  observations: string;
  outcome: string;
  notes: string;
}

/** Phänotyp-Notizen einer Pflanze – subjektive Beobachtungen, keine Genetik-Bestimmung */
export interface PhenotypeNotes {
  appearance?: string;
  growth?: string;
  leaves?: string;
  variation?: string;
  aroma?: string;
  notes?: string;
  updatedAt?: Timestamp;
}

export type PlantType = 'photoperiod' | 'autoflower' | 'unknown';

export interface PlantOutcome {
  harvestDate?: DateString;
  wetWeightG?: number;
  dryWeightG?: number;
  notes?: string;
}

export interface Plant extends BaseRecord {
  growId: string;
  name: string;
  strainId?: string;
  /** Freitext, falls keine Sorte aus der Bibliothek verknüpft ist. */
  strainName?: string;
  startDate: DateString;
  type: PlantType;
  phaseDates: PhaseDates;
  notes: string;
  outcome?: PlantOutcome;
  coverPhotoId?: string;
  /** Standort: Grow-Bereich (Zelt, Raum, Zone …) */
  spaceId?: string;
  tags?: string[];
  phenotype?: PhenotypeNotes;
}

export const ACTIVITY_TYPES = [
  'observation',
  'photo',
  'watering',
  'feeding',
  'repotting',
  'environment',
  'measurement',
  'issue',
  'custom',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface CustomMeasurement {
  label: string;
  value: number;
  unit: string;
}

/** Messwerte – alle optional, Einheiten fest definiert. */
export interface Measurements {
  /** Pflanzenhöhe in cm */
  heightCm?: number;
  /** Temperatur in °C */
  temperatureC?: number;
  /** Relative Luftfeuchte in % */
  humidityPct?: number;
  ph?: number;
  /** Elektrische Leitfähigkeit in mS/cm (kanonisch; Eingabe in µS/cm oder ppm wird umgerechnet) */
  ecMsCm?: number;
  custom?: CustomMeasurement[];
  /** Messkontext pH bzw. EC (Gießwasser, Nährlösung, Drainage, Substrat …) */
  phContext?: MeasureContext;
  ecContext?: MeasureContext;
  /** Ursprüngliche EC/TDS-Eingabe inkl. gewählter Einheit/Skala (Anzeige, Nachvollziehbarkeit) */
  ecInput?: { value: number; unit: EcUnit };
  /** Wassertemperatur in °C */
  waterTempC?: number;
  /** Substrattemperatur in °C */
  substrateTempC?: number;
  /** Substratfeuchte in % (Messgerät des Nutzers) */
  substrateMoisturePct?: number;
  /** CO₂ in ppm */
  co2Ppm?: number;
  /** Blatttemperatur in °C */
  leafTempC?: number;
  /** true = Blatttemperatur geschätzt, nicht gemessen */
  leafTempEstimated?: boolean;
  /** Photosynthetische Photonenflussdichte in µmol/m²/s */
  ppfd?: number;
  /** Lichtstunden pro Tag */
  photoperiodH?: number;
  /** Optional: Messgerät */
  device?: string;
}

export const MEASURE_CONTEXTS = ['water', 'nutrient', 'runoff', 'substrate', 'other'] as const;
export type MeasureContext = (typeof MEASURE_CONTEXTS)[number];
export type EcUnit = 'mS/cm' | 'µS/cm' | 'ppm500' | 'ppm700';

/** Eigene Zielbereiche je Messgröße (vom Nutzer festgelegt, keine Referenzwerte) */
export type Thresholds = Partial<Record<string, { min?: number; max?: number }>>;

export interface Activity extends BaseRecord {
  growId: string;
  plantId?: string;
  type: ActivityType;
  date: DateTimeString;
  title: string;
  notes: string;
  /** Wassermenge/Nährlösung in ml (Gießen/Düngen) */
  volumeMl?: number;
  measurements?: Measurements;
  photoIds?: string[];
  /** Strukturierte Beobachtung (Kategorien) – subjektiv, keine Diagnose */
  observations?: ObservationKind[];
}

export const OBSERVATION_KINDS = ['appearance', 'leafColor', 'change', 'growth', 'symptom', 'environment', 'aroma', 'personal'] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

/* ───────────────────────── Fotos ───────────────────────── */

export interface Photo extends BaseRecord {
  growId?: string;
  plantId?: string;
  strainId?: string;
  journalId?: string;
  inventoryId?: string;
  /** Aufnahmezeitpunkt (aus EXIF, sonst Dateidatum, editierbar). */
  takenAt: DateTimeString;
  note: string;
  width: number;
  height: number;
  /** Bytes des gespeicherten (komprimierten) Bildes. */
  size: number;
  mime: string;
  originalName?: string;
}

/** Binärdaten getrennt von den Metadaten (schnelle Listenabfragen). */
export interface PhotoData {
  id: string;
  full: ArrayBuffer;
  thumb: ArrayBuffer;
  mime: string;
}

/* ───────────────────────── Kalender ───────────────────────── */

export const REMINDER_CATEGORIES = ['watering', 'feeding', 'check', 'environment', 'harvest', 'maintenance', 'other'] as const;
export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number];

export type RepeatRule =
  | { kind: 'none' }
  | { kind: 'daily'; interval: number; until?: DateString }
  | { kind: 'weekly'; interval: number; until?: DateString };

export interface Reminder extends BaseRecord {
  title: string;
  date: DateString;
  time?: string;
  category: ReminderCategory;
  growId?: string;
  plantId?: string;
  repeat: RepeatRule;
  /** Erledigte Termine (Datum des jeweiligen Vorkommens). */
  completedDates: DateString[];
  notes: string;
}

/* ───────────────────────── Sorten ───────────────────────── */

/** Herkunft einer Angabe – persönliche Notiz, Hersteller/Shop, oder Laborwert. */
export type ClaimSource = 'personal' | 'reported' | 'lab';

export interface SourcedValue {
  value: number;
  source: ClaimSource;
}

export interface Terpene {
  name: string;
  percent?: number;
  source: ClaimSource;
}

/** Verknüpfung einer persönlichen Sorte mit einem externen Katalogeintrag. */
export interface ExternalStrainRef {
  provider: 'strainapi' | 'cannalib' | 'cisp';
  id: string;
  name: string;
  breeder?: string;
  url?: string;
  linkedAt: Timestamp;
}

export interface Strain extends BaseRecord {
  name: string;
  /** Externe Quelle (verhindert Duplikate: höchstens ein Eintrag je provider:id) */
  external?: ExternalStrainRef;
  /** "provider:id" – indiziert */
  externalKey?: string;
  breeder?: string;
  genetics?: string;
  /** Angegebener Typ laut Quelle (z. B. Hersteller) – keine Wirkungsaussage. */
  reportedType?: 'indica' | 'sativa' | 'hybrid' | 'unknown';
  thc?: SourcedValue;
  cbd?: SourcedValue;
  terpenes: Terpene[];
  aromas: string[];
  flavorNotes: string;
  rating?: number;
  observations: string;
  favorite: boolean;
  coverPhotoId?: string;
}

/* ───────────────────────── Journal ───────────────────────── */

export const CONSUMPTION_METHODS = ['joint', 'vaporizer', 'pipe', 'bong', 'edible', 'tincture', 'other'] as const;
export type ConsumptionMethod = (typeof CONSUMPTION_METHODS)[number];

export interface JournalEntry extends BaseRecord {
  date: DateTimeString;
  strainId?: string;
  strainName?: string;
  method: ConsumptionMethod;
  amount?: { value: number; unit: 'g' | 'mg' | 'ml' | 'Stück' | 'Züge' };
  thcPercent?: number;
  notes: string;
  moods: string[];
  durationNote: string;
  rating?: number;
  /** Eigene Schlagwörter (klein, ohne #) zum Ordnen und Filtern */
  tags?: string[];
}

/* ───────────────────────── Sammlung ───────────────────────── */

export const INVENTORY_CATEGORIES = ['cannabis', 'seeds', 'accessory', 'equipment', 'space', 'nutrients', 'other'] as const;
export const SPACE_KINDS = ['tent', 'room', 'greenhouse', 'outdoor', 'zone'] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export interface QuantityChange {
  at: Timestamp;
  from: number;
  to: number;
}

export interface InventoryItem extends BaseRecord {
  name: string;
  category: InventoryCategory;
  quantity?: number;
  unit: string;
  purchaseDate?: DateString;
  cost?: number;
  notes: string;
  strainId?: string;
  /** Optionale Verknüpfung, z. B. Ernte aus einem abgeschlossenen Grow. */
  growId?: string;
  coverPhotoId?: string;
  /** Grow-Bereich (Kategorie „space“): Art und Maße */
  spaceKind?: SpaceKind;
  dimensions?: string;
  /** Ausrüstung: Hersteller, Modell, Leistung, Laufzeit, Garantie, Standort */
  manufacturer?: string;
  model?: string;
  powerW?: number;
  /** Eigene Angabe: durchschnittliche Betriebsstunden pro Tag (für die Stromschätzung) */
  hoursPerDay?: number;
  warrantyUntil?: DateString;
  /** Standort: ID eines Grow-Bereichs (Inventar-Eintrag der Kategorie „space“) */
  spaceId?: string;
  maintenanceLog?: { date: DateString; note: string }[];
  /** Historie der Mengenänderungen (neueste zuletzt, höchstens 50 Einträge) */
  quantityLog?: QuantityChange[];
  tags?: string[];
  archived?: boolean;
}

export const EXPENSE_CATEGORIES = ['equipment', 'seeds', 'nutrients', 'medium', 'electricity', 'water', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense extends BaseRecord {
  growId?: string;
  date: DateString;
  category: ExpenseCategory;
  amount: number;
  description: string;
}

/* ───────────────────────── Rechner & Einstellungen ───────────────────────── */

export interface CalculationRecord extends BaseRecord {
  kind: 'edibles' | 'smoking' | 'compare';
  name: string;
  input: unknown;
  summary: Record<string, string>;
}

export const DASHBOARD_WIDGETS = [
  'stats',
  'grows',
  'reminders',
  'photos',
  'activity',
  'measurements',
  'journal',
  'calculations',
  'strains',
  'favorites',
] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

export interface AppSettings {
  dashboardOrder: DashboardWidget[];
  dashboardHidden: DashboardWidget[];
  currency: string;
  showHarmReduction: boolean;
  lastBackupAt?: Timestamp;
  /** Online-Sortendaten (StrainAPI) abrufen */
  onlineCatalog: boolean;
  /** Optionale CannaLib-Anreicherung (nur auf Klick) */
  cannalibEnabled: boolean;
  discoverNoticeSeen: boolean;
  /** Cannabis 101: gemerkte Artikel und Lesefortschritt (0–1) */
  kbFavorites: string[];
  kbProgress: Record<string, number>;
  /** Gemerkte Breeder des lokalen Katalogs (IDs) */
  favoriteBreeders: string[];
  /** Zuletzt angesehene Katalogsorten (neueste zuerst, max. 12) */
  recentCultivars: { id: string; name: string; breeder: string }[];
}

/* ───────────── Laborberichte ───────────── */

export type ConcentrationUnit = '%' | 'mg/g';

/**
 * Herkunft der Werte:
 * - document: aus beigefügtem Originaldokument übertragen (vom Nutzer)
 * - manual:   manuell eingetragen, ohne Dokument
 * - unverified: ungeprüfte Angabe (z. B. Verpackung)
 */
export type LabValueOrigin = 'document' | 'manual' | 'unverified';

export interface LabReport extends BaseRecord {
  title: string;
  strainId?: string;
  labName?: string;
  batchId?: string;
  testDate?: DateString;
  sampleType?: string;
  unit: ConcentrationUnit;
  origin: LabValueOrigin;
  /** Cannabinoide in `unit`; fehlend = nicht berichtet */
  thc?: number;
  thca?: number;
  cbd?: number;
  cbda?: number;
  cbg?: number;
  cbn?: number;
  /** Im Bericht ausgewiesene Gesamtwerte (falls angegeben) */
  declaredTotalThc?: number;
  declaredTotalCbd?: number;
  terpenes: { name: string; value: number }[];
  documentId?: string;
  documentName?: string;
  documentMime?: string;
  notes: string;
}

export interface LabDocument {
  id: string;
  data: ArrayBuffer;
  mime: string;
  name: string;
  size: number;
}

export interface ApiCacheEntry {
  key: string;
  fetchedAt: Timestamp;
  data: unknown;
}

export interface SettingRow {
  key: string;
  value: unknown;
}
