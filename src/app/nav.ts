import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  Compass,
  Database,
  Dna,
  Droplets,
  GraduationCap,
  FlaskRound,
  FlaskConical,
  History,
  Images,
  LayoutDashboard,
  Leaf,
  type LucideIcon,
  Package,
  Store,
  Settings,
  Sprout,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { t } from '../i18n';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Pfad-Präfixe, für die der Eintrag als aktiv gilt. */
  match: string[];
  /** Nur mit Server-Konto (Zusammenarbeit, Konto) */
  serverOnly?: boolean;
}

export interface NavGroup {
  id: string;
  /** Überschrift der Gruppe; ohne Überschrift steht die Gruppe ganz oben. */
  label?: string;
  items: NavItem[];
}

/**
 * Informationsarchitektur 2.0 (6.0.1): wenige Produktbereiche statt einer langen Liste.
 * Alle bisherigen Adressen bleiben unverändert – nur Gruppierung und Beschriftung ändern sich.
 * Details und Begründung: docs/INFORMATION-ARCHITECTURE.md
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'start',
    items: [
      { id: 'dashboard', get label() { return t('shell.nav.overview'); }, to: '', icon: LayoutDashboard, match: [''] },
      // Entdecken: Sortenlexikon, Breeder, Genetik, Terpen-Atlas und Academy – Unterbereiche als Reiter auf der Seite
      { id: 'discover', get label() { return t('shell.nav.discover'); }, to: 'discover', icon: Compass, match: ['discover'] },
      // Gemeinschaft: Freunde, gemeinsame Bereiche, Einladungen
      { id: 'together', get label() { return t('shell.nav.together'); }, to: 'together', icon: Users, match: ['together'], serverOnly: true },
    ],
  },
  {
    id: 'grow',
    get label() { return t('shell.navGroup.grow'); },
    items: [
      { id: 'grows', get label() { return t('shell.nav.grows'); }, to: 'grows', icon: Sprout, match: ['grows', 'labels'] },
      { id: 'photos', get label() { return t('shell.nav.photos'); }, to: 'photos', icon: Images, match: ['photos'] },
      { id: 'tools', get label() { return t('shell.nav.growTools'); }, to: 'tools', icon: Wrench, match: ['tools'] },
    ],
  },
  {
    id: 'lab',
    get label() { return t('shell.navGroup.lab'); },
    items: [
      { id: 'lab', get label() { return t('shell.nav.thcLab'); }, to: 'lab/edibles', icon: FlaskConical, match: ['lab'] },
      { id: 'labreports', get label() { return t('shell.nav.labReports'); }, to: 'lab-reports', icon: FlaskRound, match: ['lab-reports'] },
    ],
  },
  {
    id: 'mine',
    get label() { return t('shell.navGroup.mine'); },
    items: [
      { id: 'journal', get label() { return t('shell.nav.journal'); }, to: 'journal', icon: BookOpenText, match: ['journal'] },
      { id: 'collection', get label() { return t('shell.nav.collection'); }, to: 'collection', icon: Package, match: ['collection'] },
      { id: 'strains', get label() { return t('shell.nav.strains'); }, to: 'strains', icon: Leaf, match: ['strains'] },
      { id: 'calendar', get label() { return t('shell.nav.calendar'); }, to: 'calendar', icon: CalendarDays, match: ['calendar'] },
      { id: 'analytics', get label() { return t('shell.nav.analytics'); }, to: 'analytics', icon: BarChart3, match: ['analytics'] },
      { id: 'timeline', get label() { return t('shell.nav.timeline'); }, to: 'timeline', icon: History, match: ['timeline'] },
    ],
  },
];

/** Einstellungen & Konto: in der Seitenleiste unten, auf Mobilgeräten am Ende von „Mehr“. */
export const SETTINGS_NAV: NavItem[] = [
  { id: 'settings', get label() { return t('shell.nav.settings'); }, to: 'settings', icon: Settings, match: ['settings'] },
  { id: 'account', get label() { return t('shell.nav.account'); }, to: 'account', icon: UserRound, match: ['account'], serverOnly: true },
  { id: 'data', get label() { return t('shell.nav.data'); }, to: 'data', icon: Database, match: ['data'] },
];

/** Unterbereiche von „Entdecken“ – direkt erreichbar über die Suche (Strg K) und die Reiter in Entdecken. */
export const DISCOVER_SECTIONS: NavItem[] = [
  { id: 'disc-breeders', get label() { return t('shell.nav.breeders'); }, to: 'discover/breeders', icon: Store, match: [] },
  { id: 'disc-genetics', get label() { return t('shell.nav.genetics'); }, to: 'discover/genetics', icon: Dna, match: [] },
  { id: 'disc-terpenes', get label() { return t('shell.nav.terpenes'); }, to: 'discover/terpenes', icon: Droplets, match: [] },
  { id: 'disc-learn', get label() { return t('shell.nav.academy'); }, to: 'discover/learn', icon: GraduationCap, match: [] },
];

export const ALL_NAV: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), ...SETTINGS_NAV];

/** Untere Navigation auf Mobilgeräten: zwei Ziele links, Erfassen in der Mitte, Entdecken und „Mehr“ rechts. */
export const MOBILE_NAV_IDS = ['dashboard', 'grows', 'discover'] as const;
/** Kurzbeschriftungen für die untere Navigation (schmale Spalten). */
export const MOBILE_LABEL: Record<string, string> = {};

export function isActive(item: NavItem, path: string[]): boolean {
  const first = path[0] ?? '';
  return item.match.includes(first);
}

/** Gruppen ohne Einträge, die nur mit Server-Konto verfügbar sind, entfallen im Lokalmodus. */
export function visibleGroups(server: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => !n.serverOnly || server) })).filter((g) => g.items.length > 0);
}
