import type {
  ActivityType,
  ClaimSource,
  ConsumptionMethod,
  ExpenseCategory,
  GrowSetting,
  GrowStatus,
  InventoryCategory,
  PlantType,
  ReminderCategory,
} from '../db/types';

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  observation: 'Beobachtung',
  photo: 'Foto',
  watering: 'Gießen',
  feeding: 'Düngen',
  repotting: 'Umtopfen',
  environment: 'Umgebung geändert',
  measurement: 'Messung',
  issue: 'Problem',
  custom: 'Eigenes Ereignis',
};

export const SETTING_LABEL: Record<GrowSetting, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  greenhouse: 'Gewächshaus',
};

export const STATUS_LABEL: Record<GrowStatus, string> = {
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  archived: 'Archiviert',
};

export const PLANT_TYPE_LABEL: Record<PlantType, string> = {
  photoperiod: 'Photoperiodisch',
  autoflower: 'Autoflower',
  unknown: 'Unbekannt',
};

export const REMINDER_CATEGORY_LABEL: Record<ReminderCategory, string> = {
  watering: 'Gießen',
  feeding: 'Düngen',
  check: 'Kontrolle',
  environment: 'Umgebung',
  harvest: 'Ernte',
  maintenance: 'Wartung',
  other: 'Sonstiges',
};

export const CLAIM_SOURCE_LABEL: Record<ClaimSource, string> = {
  personal: 'Eigene Angabe',
  reported: 'Herstellerangabe',
  lab: 'Laborwert',
};

export const METHOD_LABEL: Record<ConsumptionMethod, string> = {
  joint: 'Joint',
  vaporizer: 'Vaporizer',
  pipe: 'Pfeife',
  bong: 'Bong',
  edible: 'Edible',
  tincture: 'Tinktur / Öl',
  other: 'Sonstiges',
};

export const INVENTORY_CATEGORY_LABEL: Record<InventoryCategory, string> = {
  cannabis: 'Cannabis',
  seeds: 'Samen',
  accessory: 'Zubehör',
  equipment: 'Grow-Ausrüstung',
  space: 'Grow-Bereich',
  nutrients: 'Dünger & Zusätze',
  other: 'Sonstiges',
};

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  equipment: 'Ausrüstung',
  seeds: 'Samen',
  nutrients: 'Dünger',
  medium: 'Substrat',
  electricity: 'Strom',
  water: 'Wasser',
  other: 'Sonstiges',
};

/** Auswahl für Stimmungs-Deskriptoren im Journal (frei erweiterbar). */
export const MOOD_OPTIONS = [
  'entspannt',
  'ruhig',
  'kreativ',
  'gesellig',
  'fokussiert',
  'euphorisch',
  'müde',
  'hungrig',
  'unruhig',
  'ängstlich',
  'benommen',
  'neutral',
];

export const AROMA_OPTIONS = ['erdig', 'zitrus', 'süß', 'fruchtig', 'kiefer', 'würzig', 'pfeffrig', 'blumig', 'diesel', 'käsig', 'kräuter', 'holzig'];

export const TERPENE_SUGGESTIONS = ['Myrcen', 'Limonen', 'Caryophyllen', 'Pinen', 'Linalool', 'Humulen', 'Terpinolen', 'Ocimen', 'Bisabolol'];

export const SPACE_KIND_LABEL: Record<import('../db/types').SpaceKind, string> = {
  tent: 'Zelt',
  room: 'Raum',
  greenhouse: 'Gewächshaus',
  outdoor: 'Outdoor-Fläche',
  zone: 'Zone',
};

export const OBSERVATION_LABEL: Record<import('../db/types').ObservationKind, string> = {
  appearance: 'Erscheinungsbild',
  leafColor: 'Blattfarbe',
  change: 'Sichtbare Veränderung',
  growth: 'Wachstum',
  symptom: 'Auffälligkeit',
  environment: 'Umgebung',
  aroma: 'Geruch',
  personal: 'Persönliche Notiz',
};
