import type { TerpeneChem } from '../../lib/catalog/terpenes';
import { t } from '../../i18n';

/**
 * 2D-Strukturformel (Skelettformel) aus den PubChem-2D-Koordinaten.
 * Kohlenstoffatome sind Ecken ohne Beschriftung, Heteroatome werden beschriftet.
 * Wasserstoffe sind weggelassen (außer an Heteroatomen, z. B. „OH“). Keine Stereodarstellung (Keile).
 */
export function MoleculeView({ chem, color = '#8fd3a8', size = 'md', label }: { chem: TerpeneChem; color?: string; size?: 'sm' | 'md' | 'lg'; label: string }) {
  const { a: atoms, b: bonds } = chem.structure;
  const unit = size === 'sm' ? 16 : size === 'lg' ? 40 : 28;
  const pad = size === 'sm' ? 8 : 20;
  const xs = atoms.map((p) => Number(p[0]));
  const ys = atoms.map((p) => Number(p[1]));
  const w = (Math.max(...xs) - Math.min(...xs)) * unit + pad * 2;
  const h = (Math.max(...ys) - Math.min(...ys)) * unit + pad * 2;
  const P = (i: number) => ({ x: (Number(atoms[i]![0]) - Math.min(...xs)) * unit + pad, y: (Number(atoms[i]![1]) - Math.min(...ys)) * unit + pad });
  const isHetero = (i: number) => atoms[i]![2] !== 'C';
  const neighbors = (i: number) => bonds.filter(([x, y]) => x === i || y === i).map(([x, y]) => (x === i ? y! : x!));
  const sw = size === 'sm' ? 1.3 : 1.8;
  const off = size === 'sm' ? 2.6 : 4.5;

  const lines = bonds.map(([ia, ib, order], k) => {
    let a = P(ia!);
    let b = P(ib!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Bindungen an beschrifteten Atomen kürzen, damit die Beschriftung frei steht
    const cut = unit * 0.32;
    if (isHetero(ia!)) a = { x: a.x + ux * cut, y: a.y + uy * cut };
    if (isHetero(ib!)) b = { x: b.x - ux * cut, y: b.y - uy * cut };
    const main = <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={sw} strokeLinecap="round" />;
    if (order !== 2 && order !== 3) return main;
    // Seite der zweiten Linie: dorthin, wo die übrigen Nachbaratome liegen (Ringinneres)
    const nx = -uy;
    const ny = ux;
    let side = 0;
    for (const n of [...neighbors(ia!), ...neighbors(ib!)]) {
      if (n === ia || n === ib) continue;
      const q = P(n);
      side += (q.x - a.x) * nx + (q.y - a.y) * ny;
    }
    const s = side >= 0 ? 1 : -1;
    const shrink = 0.16 * len;
    const second = (sgn: number) => (
      <line
        key={`${k}-${sgn}`}
        x1={a.x + ux * shrink + nx * off * sgn}
        y1={a.y + uy * shrink + ny * off * sgn}
        x2={b.x - ux * shrink + nx * off * sgn}
        y2={b.y - uy * shrink + ny * off * sgn}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    );
    return (
      <g key={k}>
        {main}
        {second(s)}
        {order === 3 && second(-s)}
      </g>
    );
  });

  const labels = atoms.map((p, i) => {
    if (!isHetero(i)) return null;
    const { x, y } = P(i);
    const hs = Number(p[3] ?? 0);
    const text = `${p[2]}${hs ? 'H' : ''}${hs > 1 ? hs : ''}`;
    return (
      <text key={`l${i}`} x={x} y={y} fill="#f1c7a3" fontSize={size === 'sm' ? 9 : size === 'lg' ? 17 : 13} fontWeight={600} textAnchor="middle" dominantBaseline="central" fontFamily="Inter Variable, sans-serif">
        {text}
      </text>
    );
  });

  return (
    <svg viewBox={`0 0 ${w.toFixed(1)} ${h.toFixed(1)}`} className="h-full w-full" role="img" aria-label={t('discover.molecule', { label })}>
      {lines}
      {labels}
    </svg>
  );
}
