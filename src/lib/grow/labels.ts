import { labels } from '../../i18n';
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

export const ACTIVITY_LABEL = labels('labels.activity', ['observation', 'photo', 'watering', 'feeding', 'repotting', 'environment', 'measurement', 'issue', 'custom'] as ActivityType[]);

export const SETTING_LABEL = labels('labels.setting', ['indoor', 'outdoor', 'greenhouse'] as GrowSetting[]);

export const STATUS_LABEL = labels('labels.growStatus', ['active', 'completed', 'archived'] as GrowStatus[]);

export const PLANT_TYPE_LABEL = labels('labels.plantType', ['photoperiod', 'autoflower', 'unknown'] as PlantType[]);

export const REMINDER_CATEGORY_LABEL = labels('labels.reminderCategory', ['watering', 'feeding', 'check', 'environment', 'harvest', 'maintenance', 'other'] as ReminderCategory[]);

export const CLAIM_SOURCE_LABEL = labels('labels.claimSource', ['personal', 'reported', 'lab'] as ClaimSource[]);

export const METHOD_LABEL = labels('labels.method', ['joint', 'vaporizer', 'pipe', 'bong', 'edible', 'tincture', 'other'] as ConsumptionMethod[]);

export const INVENTORY_CATEGORY_LABEL = labels('labels.inventoryCategory', ['cannabis', 'seeds', 'accessory', 'equipment', 'space', 'nutrients', 'other'] as InventoryCategory[]);

export const EXPENSE_CATEGORY_LABEL = labels('labels.expenseCategory', ['equipment', 'seeds', 'nutrients', 'medium', 'electricity', 'water', 'other'] as ExpenseCategory[]);

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

export const SPACE_KIND_LABEL = labels('labels.spaceKind', ['tent', 'room', 'greenhouse', 'outdoor', 'zone'] as import('../db/types').SpaceKind[]);

export const OBSERVATION_LABEL = labels('labels.observation', ['appearance', 'leafColor', 'change', 'growth', 'symptom', 'environment', 'aroma', 'personal'] as import('../db/types').ObservationKind[]);
