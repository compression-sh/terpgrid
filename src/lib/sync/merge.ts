/**
 * Drei-Wege-Merge für Datensätze (Basis = zuletzt vom Server bestätigter Stand).
 *
 * - Feld nur lokal geändert → lokal; nur auf dem Server geändert → Server
 * - beide gleich geändert → kein Konflikt
 * - verschachtelte Objekte werden feldweise zusammengeführt (Arrays gelten als Ganzes)
 * - `updatedAt` wird nie als Konflikt gewertet (späterer Zeitpunkt gewinnt)
 * - Entwurfs-Einträge der Form { v, at } (THC-Lab-Entwürfe): neuerer Zeitpunkt gewinnt
 * - alles andere, was auf beiden Seiten unterschiedlich geändert wurde → Konflikt
 */
type Json = unknown;

const isObj = (v: Json): v is Record<string, Json> => v !== null && typeof v === 'object' && !Array.isArray(v);
const eq = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);
const isDraft = (v: Json): v is { v: Json; at: number } => isObj(v) && typeof v.at === 'number' && 'v' in v && Object.keys(v).length === 2;

export interface MergeResult {
  ok: boolean;
  merged?: Record<string, Json>;
  /** Pfade mit echtem Konflikt (z. B. „notes“, „value.edibles“) */
  conflicts: string[];
}

function mergeValue(base: Json, local: Json, server: Json, path: string, conflicts: string[]): Json {
  if (eq(local, server)) return local;
  if (eq(local, base)) return server;
  if (eq(server, base)) return local;
  const key = path.split('.').pop();
  if (key === 'updatedAt' && typeof local === 'string' && typeof server === 'string') return local > server ? local : server;
  if (isDraft(local) && isDraft(server)) return local.at >= server.at ? local : server;
  if (isObj(local) && isObj(server) && (isObj(base) || base === undefined)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, Json> = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(server)])) {
      const v = mergeValue(b[k], local[k], server[k], path ? `${path}.${k}` : k, conflicts);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  conflicts.push(path || '(gesamt)');
  return local;
}

export function merge3(base: Json, local: Json, server: Json): MergeResult {
  if (!isObj(local) || !isObj(server)) return { ok: false, conflicts: ['(gesamt)'] };
  if (base === undefined) return { ok: false, conflicts: ['(keine Basis)'] };
  const conflicts: string[] = [];
  const merged = mergeValue(base, local, server, '', conflicts) as Record<string, Json>;
  return conflicts.length ? { ok: false, conflicts } : { ok: true, merged, conflicts };
}
