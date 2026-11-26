import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  Compass,
  Database,
  FlaskRound,
  FlaskConical,
  History,
  Images,
  LayoutDashboard,
  Leaf,
  type LucideIcon,
  Package,
  Settings,
  Sprout,
  Users,
  Wrench,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Pfad-Präfixe, für die der Eintrag als aktiv gilt. */
  match: string[];
  /** Nur mit Server-Konto (Zusammenarbeit) */
  serverOnly?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Übersicht', to: '', icon: LayoutDashboard, match: [''] },
  { id: 'grows', label: 'Growlogs', to: 'grows', icon: Sprout, match: ['grows', 'labels'] },
  { id: 'discover', label: 'Discover', to: 'discover', icon: Compass, match: ['discover'] },
  { id: 'lab', label: 'THC Lab', to: 'lab/edibles', icon: FlaskConical, match: ['lab'] },
  { id: 'strains', label: 'Meine Sorten', to: 'strains', icon: Leaf, match: ['strains'] },
  { id: 'journal', label: 'Journal', to: 'journal', icon: BookOpenText, match: ['journal'] },
  { id: 'collection', label: 'Sammlung', to: 'collection', icon: Package, match: ['collection'] },
  { id: 'together', label: 'Gemeinsam', to: 'together', icon: Users, match: ['together'], serverOnly: true },
];

export const SECONDARY_NAV: NavItem[] = [
  { id: 'timeline', label: 'Verlauf', to: 'timeline', icon: History, match: ['timeline'] },
  { id: 'photos', label: 'Fotos', to: 'photos', icon: Images, match: ['photos'] },
  { id: 'calendar', label: 'Kalender', to: 'calendar', icon: CalendarDays, match: ['calendar'] },
  { id: 'labreports', label: 'Laborberichte', to: 'lab-reports', icon: FlaskRound, match: ['lab-reports'] },
  { id: 'analytics', label: 'Insights', to: 'analytics', icon: BarChart3, match: ['analytics'] },
  { id: 'tools', label: 'Werkzeuge', to: 'tools', icon: Wrench, match: ['tools'] },
  { id: 'data', label: 'Daten & Backup', to: 'data', icon: Database, match: ['data'] },
  { id: 'settings', label: 'Einstellungen', to: 'settings', icon: Settings, match: ['settings'] },
];

/** Untere Navigation auf Mobilgeräten (4 feste Ziele + „Mehr“). */
export const MOBILE_NAV_IDS = ['dashboard', 'grows', 'discover', 'lab'];

export function isActive(item: NavItem, path: string[]): boolean {
  const first = path[0] ?? '';
  return item.match.includes(first);
}
