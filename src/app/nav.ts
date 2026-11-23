import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  Database,
  FlaskConical,
  Images,
  LayoutDashboard,
  Leaf,
  type LucideIcon,
  Package,
  Settings,
  Sprout,
  Wrench,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Pfad-Präfixe, für die der Eintrag als aktiv gilt. */
  match: string[];
}

export const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Übersicht', to: '', icon: LayoutDashboard, match: [''] },
  { id: 'grows', label: 'Growlogs', to: 'grows', icon: Sprout, match: ['grows'] },
  { id: 'lab', label: 'THC Lab', to: 'lab/edibles', icon: FlaskConical, match: ['lab'] },
  { id: 'strains', label: 'Sorten', to: 'strains', icon: Leaf, match: ['strains'] },
  { id: 'journal', label: 'Journal', to: 'journal', icon: BookOpenText, match: ['journal'] },
  { id: 'collection', label: 'Sammlung', to: 'collection', icon: Package, match: ['collection'] },
];

export const SECONDARY_NAV: NavItem[] = [
  { id: 'photos', label: 'Fotos', to: 'photos', icon: Images, match: ['photos'] },
  { id: 'calendar', label: 'Kalender', to: 'calendar', icon: CalendarDays, match: ['calendar'] },
  { id: 'analytics', label: 'Analysen', to: 'analytics', icon: BarChart3, match: ['analytics'] },
  { id: 'tools', label: 'Werkzeuge', to: 'tools', icon: Wrench, match: ['tools'] },
  { id: 'data', label: 'Daten & Backup', to: 'data', icon: Database, match: ['data'] },
  { id: 'settings', label: 'Einstellungen', to: 'settings', icon: Settings, match: ['settings'] },
];

/** Untere Navigation auf Mobilgeräten (4 feste Ziele + „Mehr“). */
export const MOBILE_NAV_IDS = ['dashboard', 'grows', 'lab', 'journal'];

export function isActive(item: NavItem, path: string[]): boolean {
  const first = path[0] ?? '';
  return item.match.includes(first);
}
