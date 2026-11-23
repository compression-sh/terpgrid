import { ArrowLeft, ArrowRight, BookOpen, Bookmark, CheckCircle2, Clock, ExternalLink, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { href } from '../../app/router';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { EmptyState } from '../../components/ui/EmptyState';
import { fmtDateLong } from '../../lib/dates';
import { KB_ARTICLES, KB_CATEGORIES, type KbArticle, kbSearch, readingMinutes } from '../../lib/knowledge';

const CAT_COLOR: Record<string, string> = {
  Grundlagen: '#9ef0bd',
  Wirkstoffe: '#5fe39a',
  'Pflanze & Genetik': '#a3a06a',
  'Konsum & Risiko': '#fbbf24',
  Nachschlagen: '#38bdf8',
};

function ProgressRing({ value }: { value: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  if (value >= 0.98) return <CheckCircle2 className="size-5 text-leaf-400" aria-label="gelesen" />;
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-label={`${Math.round(value * 100)} % gelesen`}>
      <circle cx="11" cy="11" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="2" />
      <circle cx="11" cy="11" r={r} fill="none" stroke="#5fe39a" strokeWidth="2" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 11 11)" strokeLinecap="round" />
    </svg>
  );
}

function ArticleView({ a }: { a: KbArticle }) {
  const { settings, updateSettings } = useData();
  const ref = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(settings.kbProgress[a.id] ?? 0);
  const saved = useRef(settings.kbProgress[a.id] ?? 0);
  const fav = settings.kbFavorites.includes(a.id);

  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      const p = total <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / total));
      setProgress((prev) => Math.max(prev, p));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [a.id]);

  // Fortschritt gedrosselt lokal speichern
  useEffect(() => {
    if (progress - saved.current < 0.1 && !(progress >= 0.98 && saved.current < 0.98)) return;
    const t = window.setTimeout(() => {
      saved.current = progress;
      updateSettings({ kbProgress: { ...settings.kbProgress, [a.id]: Math.round(progress * 100) / 100 } });
    }, 600);
    return () => window.clearTimeout(t);
  }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  const related = a.related.map((id) => KB_ARTICLES.find((x) => x.id === id)).filter((x): x is KbArticle => !!x);
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent lg:left-60" aria-hidden>
        <div className="h-full bg-leaf-400 transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
      </div>
      <article ref={ref} className="mx-auto max-w-[44rem] animate-fade-up">
        <a href={href('discover/learn')} className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
          <ArrowLeft className="size-3.5" /> Cannabis 101
        </a>
        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: CAT_COLOR[a.category] }}>
          {a.category}
        </div>
        <h1 className="mt-3 text-[32px] font-semibold leading-[1.12] tracking-tight text-ink-50 sm:text-[42px]">{a.title}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-300">{a.summary}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.06] pb-6 text-[12px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" /> {readingMinutes(a)} Min. Lesezeit
          </span>
          <span>Aktualisiert am {fmtDateLong(a.updated)}</span>
          <button
            type="button"
            aria-pressed={fav}
            onClick={() => updateSettings({ kbFavorites: fav ? settings.kbFavorites.filter((x) => x !== a.id) : [...settings.kbFavorites, a.id] })}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${fav ? 'border-leaf-500/30 text-leaf-200' : 'border-white/[0.08] text-ink-300 hover:text-ink-100'}`}
          >
            <Bookmark className={`size-3.5 ${fav ? 'fill-current' : ''}`} /> {fav ? 'Gemerkt' : 'Merken'}
          </button>
        </div>

        {a.sections.map((s) => (
          <section key={s.heading} className="mt-9">
            <h2 className="text-[20px] font-semibold tracking-tight text-ink-50">{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-3.5 text-[15.5px] leading-[1.75] text-ink-200">
                {p}
              </p>
            ))}
            {s.note && <aside className="mt-5 rounded-xl border-l-2 border-leaf-400/60 bg-leaf-500/[0.05] px-4 py-3 text-[14px] leading-relaxed text-leaf-100/90">{s.note}</aside>}
            {s.links && (
              <div className="mt-4 flex flex-wrap gap-2">
                {s.links.map((l) => (
                  <a key={l.to} href={href(l.to)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] text-ink-200 hover:border-leaf-500/30 hover:text-leaf-200">
                    {l.label} <ArrowRight className="size-3" />
                  </a>
                ))}
              </div>
            )}
          </section>
        ))}

        <section className="mt-12 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-400">Quellen</h2>
          <ol className="mt-3 space-y-2.5">
            {a.sources.map((s, i) => (
              <li key={s.url} className="grid grid-cols-[1.5rem_1fr] gap-1 text-[13px] leading-relaxed">
                <span className="font-mono text-ink-600">{i + 1}.</span>
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="group text-ink-300 hover:text-ink-100">
                  {s.label} <ExternalLink className="inline size-3 text-ink-500 group-hover:text-ink-300" />
                </a>
              </li>
            ))}
          </ol>
          <p className="hint mt-4">Informationsangebot ohne medizinische Beratung. Externe Links öffnen sich in einem neuen Tab.</p>
        </section>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-400">Weiterlesen</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {related.map((r) => (
                <a key={r.id} href={href(`discover/learn/${r.id}`)} className="rounded-xl border border-white/[0.06] p-4 transition-colors hover:border-white/[0.14]">
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: CAT_COLOR[r.category] }}>
                    {r.category}
                  </div>
                  <div className="mt-1 text-[14px] font-medium text-ink-100">{r.title}</div>
                </a>
              ))}
            </div>
          </section>
        )}
      </article>
    </>
  );
}

export function KnowledgeHub({ articleId }: { articleId?: string }) {
  const { settings } = useData();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [onlyFav, setOnlyFav] = useState(false);
  const article = articleId ? KB_ARTICLES.find((a) => a.id === articleId) : undefined;
  const list = useMemo(
    () => kbSearch(q).filter((a) => (!cat || a.category === cat) && (!onlyFav || settings.kbFavorites.includes(a.id))),
    [q, cat, onlyFav, settings.kbFavorites],
  );
  const cats = KB_CATEGORIES.filter((c) => KB_ARTICLES.some((a) => a.category === c));
  const readCount = KB_ARTICLES.filter((a) => (settings.kbProgress[a.id] ?? 0) >= 0.98).length;

  if (articleId) {
    return (
      <div>
        <DiscoverNav />
        {article ? <ArticleView key={article.id} a={article} /> : <EmptyState title="Artikel nicht gefunden" action={<a href={href('discover/learn')} className="btn-primary">Zur Übersicht</a>} />}
      </div>
    );
  }

  return (
    <div>
      <DiscoverNav />
      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end animate-fade-up">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-leaf-400/90">Cannabis 101</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-[40px] sm:leading-[1.1]">Das Nachschlagewerk.</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-400">Kompakte, belegte Erklärungen zu Wirkstoffen, Pflanze, Konsum und Risiken – mit Quellen und Querverweisen in die App.</p>
        </div>
        <div className="text-[12px] text-ink-500">
          <span className="font-mono text-ink-200">{readCount}</span> von {KB_ARTICLES.length} gelesen · Stand {fmtDateLong(KB_ARTICLES[0]!.updated)}
        </div>
      </div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Artikel durchsuchen</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          <input className="input-base h-11 pl-10" placeholder="Suchen, z. B. Toleranz, THCA, Kreuzung …" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {['', ...cats].map((c) => (
            <button key={c || 'all'} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${cat === c ? 'border-white/25 bg-white/[0.06] text-ink-50' : 'border-white/[0.06] text-ink-400 hover:text-ink-200'}`}>
              {c || 'Alle'}
            </button>
          ))}
          <button type="button" aria-pressed={onlyFav} onClick={() => setOnlyFav((f) => !f)} className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs ${onlyFav ? 'border-leaf-500/30 text-leaf-200' : 'border-white/[0.06] text-ink-400'}`}>
            <Bookmark className={`size-3 ${onlyFav ? 'fill-current' : ''}`} /> Gemerkt
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon={<BookOpen />} title="Keine Artikel gefunden" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a, i) => (
            <a
              key={a.id}
              href={href(`discover/learn/${a.id}`)}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70 p-5 transition-all hover:-translate-y-0.5 hover:border-white/[0.14] ${i === 0 && !q && !cat ? 'sm:col-span-2' : ''}`}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-[0.12] blur-3xl transition-opacity group-hover:opacity-25" style={{ background: CAT_COLOR[a.category] }} />
              <div className="flex items-start justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: CAT_COLOR[a.category] }}>
                  {a.category}
                </span>
                <span className="flex items-center gap-2">
                  {settings.kbFavorites.includes(a.id) && <Bookmark className="size-3.5 fill-current text-leaf-300" aria-label="gemerkt" />}
                  <ProgressRing value={settings.kbProgress[a.id] ?? 0} />
                </span>
              </div>
              <h2 className={`mt-3 font-semibold tracking-tight text-ink-50 ${i === 0 && !q && !cat ? 'text-[22px]' : 'text-[17px]'}`}>{a.title}</h2>
              <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink-400">{a.summary}</p>
              <div className="mt-auto flex items-center justify-between pt-5 text-[11px] text-ink-500">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" /> {readingMinutes(a)} Min.
                </span>
                <span>{a.sources.length} Quellen</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
