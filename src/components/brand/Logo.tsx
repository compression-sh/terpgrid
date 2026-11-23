import { useId } from 'react';

/**
 * TERPGRID-Bildmarke: ein Blatt, das aus einem Datenraster (Achsen + Messpunkte)
 * herauswächst – Wachstum und Dokumentation in einem Zeichen.
 */
export function LogoMark({ className = 'size-9' }: { className?: string }) {
  // Eindeutige Gradient-ID je Instanz – sonst verweist ein sichtbares Logo auf
  // die Definition in einem ausgeblendeten (display:none) SVG.
  const gid = `tg-leaf-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="TERPGRID">
      <defs>
        <linearGradient id={gid} x1="10" y1="24" x2="25" y2="7" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#23a061" />
          <stop offset="1" stopColor="#7deaa9" />
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8.25" fill="#0c110f" stroke="rgb(95 227 154 / 0.22)" strokeWidth="1.5" />
      <g fill="#5fe39a">
        <rect x="6.5" y="6.5" width="2" height="2" rx="0.5" opacity="0.22" />
        <rect x="6.5" y="13" width="2" height="2" rx="0.5" opacity="0.3" />
        <rect x="6.5" y="19.5" width="2" height="2" rx="0.5" opacity="0.4" />
        <rect x="13" y="23.5" width="2" height="2" rx="0.5" opacity="0.4" />
        <rect x="19.5" y="23.5" width="2" height="2" rx="0.5" opacity="0.3" />
        <rect x="23.5" y="23.5" width="2" height="2" rx="0.5" opacity="0.22" />
      </g>
      <path d="M11.2 22.8C10.6 15.6 15.4 9.4 24.6 7.4c.9 8.9-4.6 14.8-13.4 15.4Z" fill={`url(#${gid})`} />
      <path d="M11.6 22.4 20.4 12.2" stroke="#0c110f" strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

export function Wordmark({ withTagline = true }: { withTagline?: boolean }) {
  return (
    <div className="min-w-0 leading-none">
      <div className="text-[15px] font-semibold tracking-[0.14em] text-ink-50">
        TERP<span className="text-leaf-400">GRID</span>
      </div>
      {withTagline && <div className="mt-1.5 text-[10.5px] leading-snug text-ink-400">Your personal cannabis space.</div>}
    </div>
  );
}
