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
      { id: 'dashboard', label: 'Übersicht', to: '', icon: LayoutDashboard, match: [''] },
      // Entdecken: Sortenlexikon, Breeder, Genetik, Terpen-Atlas und Academy – Unterbereiche als Reiter auf der Seite
      { id: 'discover', label: 'Entdecken', to: 'discover', icon: Compass, match: ['discover'] },
      // Gemeinschaft: Freunde, gemeinsame Bereiche, Einladungen
      { id: 'together', label: 'Gemeinsam', to: 'together', icon: Users, match: ['together'], serverOnly: true },
    ],
  },
  {
    id: 'grow',
    label: 'Grow Studio',
    items: [
      { id: 'grows', label: 'Grows', to: 'grows', icon: Sprout, match: ['grows', 'labels'] },
      { id: 'photos', label: 'Fotos', to: 'photos', icon: Images, match: ['photos'] },
      { id: 'tools', label: 'Grow-Rechner', to: 'tools', icon: Wrench, match: ['tools'] },
    ],
  },
  {
    id: 'lab',
    label: 'Labor',
    items: [
      { id: 'lab', label: 'THC Lab', to: 'lab/edibles', icon: FlaskConical, match: ['lab'] },
      { id: 'labreports', label: 'Laborberichte', to: 'lab-reports', icon: FlaskRound, match: ['lab-reports'] },
    ],
  },
  {
    id: 'mine',
    label: 'Mein Bereich',
    items: [
      { id: 'journal', label: 'Journal', to: 'journal', icon: BookOpenText, match: ['journal'] },
      { id: 'collection', label: 'Sammlung', to: 'collection', icon: Package, match: ['collection'] },
      { id: 'strains', label: 'Meine Sorten', to: 'strains', icon: Leaf, match: ['strains'] },
      { id: 'calendar', label: 'Kalender', to: 'calendar', icon: CalendarDays, match: ['calendar'] },
      { id: 'analytics', label: 'Auswertung', to: 'analytics', icon: BarChart3, match: ['analytics'] },
      { id: 'timeline', label: 'Verlauf', to: 'timeline', icon: History, match: ['timeline'] },
    ],
  },
];

/** Einstellungen & Konto: in der Seitenleiste unten, auf Mobilgeräten am Ende von „Mehr“. */
export const SETTINGS_NAV: NavItem[] = [
  { id: 'settings', label: 'Einstellungen', to: 'settings', icon: Settings, match: ['settings'] },
  { id: 'account', label: 'Konto & Datenschutz', to: 'account', icon: UserRound, match: ['account'], serverOnly: true },
  { id: 'data', label: 'Daten & Backup', to: 'data', icon: Database, match: ['data'] },
];

/** Unterbereiche von „Entdecken“ – direkt erreichbar über die Suche (Strg K) und die Reiter in Entdecken. */
export const DISCOVER_SECTIONS: NavItem[] = [
  { id: 'disc-breeders', label: 'Breeder-Verzeichnis', to: 'discover/breeders', icon: Store, match: [] },
  { id: 'disc-genetics', label: 'Genetik-Explorer', to: 'discover/genetics', icon: Dna, match: [] },
  { id: 'disc-terpenes', label: 'Terpen-Atlas', to: 'discover/terpenes', icon: Droplets, match: [] },
  { id: 'disc-learn', label: 'Cannabis 101 (Academy)', to: 'discover/learn', icon: GraduationCap, match: [] },
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
