import { ArrowLeft, ArrowRight, BookOpen, Bookmark, CheckCircle2, Clock, ExternalLink, Library, Route, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { href } from '../../app/router';
import { KbDiagramView } from '../../components/academy/Diagrams';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { EmptyState } from '../../components/ui/EmptyState';
import { GLOSSARY, searchGlossary } from '../../lib/academy/glossary';
import { LEARNING_PATHS, pathProgress } from '../../lib/academy/paths';
import { fmtDateLong } from '../../lib/dates';
import { KB_ARTICLES, KB_CATEGORIES, type KbArticle, type KbCategory, type KbReview, kbSearch, readingMinutes } from '../../lib/knowledge';

const REVIEW_LABEL: Record<KbReview['level'], string> = { volltext: 'Quellen im Volltext geprüft', teilweise: 'Quellen teilweise im Volltext geprüft', bibliografisch: 'Quellen nur bibliografisch geprüft' };
const REVIEW_TONE: Record<KbReview['level'], string> = {
  volltext: 'border-leaf-500/25 bg-leaf-500/[0.05] text-leaf-100/90',
  teilweise: 'border-sky-400/25 bg-sky-400/[0.05] text-sky-100/90',
  bibliografisch: 'border-amber-400/25 bg-amber-400/[0.06] text-amber-100/90',
};

function ReviewNotice({ r }: { r: KbReview }) {
  return (
    <aside className={`mt-5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${REVIEW_TONE[r.level]}`} aria-label="Prüfstatus">
      <p className="font-medium">{REVIEW_LABEL[r.level]} · Stand {fmtDateLong(r.checked)}</p>
      {r.note && <p className="mt-0.5 opacity-90">{r.note}</p>}
      <p className="mt-0.5 opacity-90">Eine externe fachliche Begutachtung steht noch aus.</p>
    </aside>
  );
}

const CAT_COLOR: Record<KbCategory, string> = {
  Grundlagen: '#9ef0bd',
  'Pflanze & Botanik': '#8fbf7f',
  'Genetik & Züchtung': '#a3a06a',
  'Anbau-Grundlagen': '#5fe39a',
  'Substrat & Bewässerung': '#7cc7d9',
  'pH, EC & Nährstoffe': '#38bdf8',
  Licht: '#f5d061',
  'Klima & VPD': '#9fd3c7',
  Pflanzengesundheit: '#f59e8b',
  Schädlinge: '#e8a07a',
  Ernte: '#d39a5b',
  'Trocknung & Lagerung': '#b59b78',
  Cannabinoide: '#5fe39a',
  Terpene: '#b39ddb',
  'Labor & Analytik': '#c7a3c9',
  'Konsum & Risiko': '#fbbf24',
  Nachschlagen: '#38bdf8',
};
const byId = (id: string) => KB_ARTICLES.find((a) => a.id === id);
const anchor = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

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
  // Gespeicherter Stand beim Öffnen (für „An der letzten Stelle weiterlesen“)
  const [resumeAt] = useState(settings.kbProgress[a.id] ?? 0);
  const saved = useRef(settings.kbProgress[a.id] ?? 0);
  const fav = settings.kbFavorites.includes(a.id);

  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      // Ende der Seite erreicht = vollständig gelesen (der Artikel ist das letzte große Element)
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
      const p = total <= 0 || atEnd ? 1 : Math.min(1, Math.max(0, -rect.top / total));
      setProgress((prev) => Math.max(prev, p));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [a.id]);

  // Fortschritt gedrosselt in den Kontoeinstellungen speichern (je Konto, wird synchronisiert)
  useEffect(() => {
    if (progress - saved.current < 0.1 && !(progress >= 0.98 && saved.current < 0.98)) return;
    const t = window.setTimeout(() => {
      saved.current = progress;
      updateSettings({ kbProgress: { ...settings.kbProgress, [a.id]: Math.round(progress * 100) / 100 } });
    }, 600);
    return () => window.clearTimeout(t);
  }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  const related = a.related.map(byId).filter((x): x is KbArticle => !!x);
  const paths = LEARNING_PATHS.filter((p) => p.articles.includes(a.id));
  const terms = GLOSSARY.filter((g) => g.article === a.id);
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent lg:left-60" aria-hidden>
        <div className="h-full bg-leaf-400 transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mx-auto grid max-w-[64rem] gap-10 xl:grid-cols-[minmax(0,44rem)_13rem]">
        <article ref={ref} className="min-w-0 animate-fade-up">
          <a href={href('discover/learn')} className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
            <ArrowLeft className="size-3.5" /> Academy
          </a>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: CAT_COLOR[a.category] }}>
            <a href={href(`discover/learn?cat=${encodeURIComponent(a.category)}`)} className="hover:underline">
              {a.category}
            </a>
            {a.level && <span className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[10px] tracking-[0.1em] text-ink-300">{a.level}</span>}
          </div>
          <h1 className="page-title mt-3">{a.title}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-300">{a.summary}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.06] pb-6 text-[12px] text-ink-500">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" /> {readingMinutes(a)} Min. Lesezeit
            </span>
            <span>Aktualisiert am {fmtDateLong(a.updated)}</span>
            <span>{a.sources.length} Quellen</span>
            <button
              type="button"
              aria-pressed={fav}
              onClick={() => updateSettings({ kbFavorites: fav ? settings.kbFavorites.filter((x) => x !== a.id) : [...settings.kbFavorites, a.id] })}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${fav ? 'border-leaf-500/30 text-leaf-200' : 'border-white/[0.08] text-ink-300 hover:text-ink-100'}`}
            >
              <Bookmark className={`size-3.5 ${fav ? 'fill-current' : ''}`} /> {fav ? 'Gemerkt' : 'Merken'}
            </button>
          </div>

          {a.review && <ReviewNotice r={a.review} />}
          {resumeAt > 0.05 && resumeAt < 0.95 && (
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12.5px] text-ink-200 hover:border-white/[0.16]"
              onClick={() => {
                const el = ref.current;
                if (!el) return;
                const top = el.getBoundingClientRect().top + window.scrollY;
                window.scrollTo({ top: top + resumeAt * Math.max(0, el.offsetHeight - window.innerHeight * 0.6) });
              }}
            >
              <ArrowRight className="size-3.5" /> An der letzten Stelle weiterlesen ({Math.round(resumeAt * 100)} %)
            </button>
          )}
          <details className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-2.5 xl:hidden">
            <summary className="cursor-pointer text-[13px] font-medium text-ink-200">Inhalt ({a.sections.length} Abschnitte)</summary>
            <ol className="mt-2 space-y-0.5 pb-1">
              {a.sections.map((s, i) => (
                <li key={s.heading}>
                  <a
                    href={`#${anchor(s.heading)}`}
                    onClick={(e) => (e.preventDefault(), document.getElementById(anchor(s.heading))?.scrollIntoView({ behavior: 'smooth' }))}
                    className="flex min-h-10 items-center gap-2 text-[14px] text-ink-300 hover:text-ink-50"
                  >
                    <span className="w-5 font-mono text-[11px] text-ink-500">{i + 1}</span> {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          {a.sections.map((s) => (
            <section key={s.heading} id={anchor(s.heading)} className="mt-9 scroll-mt-20">
              <h2 className="text-[20px] font-semibold tracking-tight text-ink-50">{s.heading}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mt-3.5 text-[15.5px] leading-[1.75] text-ink-200">
                  {p}
                </p>
              ))}
              {s.diagram && <KbDiagramView id={s.diagram} />}
              {s.note && <aside className="mt-5 rounded-xl border-l-2 border-leaf-400/60 bg-leaf-500/[0.05] px-4 py-3 text-[14px] leading-relaxed text-leaf-100/90">{s.note}</aside>}
              {s.links && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.links.map((l) => (
                    <a key={l.to + l.label} href={href(l.to)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] text-ink-200 hover:border-leaf-500/30 hover:text-leaf-200">
                      {l.label} <ArrowRight className="size-3" />
                    </a>
                  ))}
                </div>
              )}
            </section>
          ))}

          {terms.length > 0 && (
            <section className="mt-10 rounded-2xl border border-white/[0.06] p-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-400">Begriffe</h2>
              <dl className="mt-3 space-y-2">
                {terms.map((g) => (
                  <div key={g.id} className="text-[13.5px] leading-relaxed">
                    <dt className="inline font-semibold text-ink-100">{g.term}: </dt>
                    <dd className="inline text-ink-300">{g.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="mt-10 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-5">
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
            <p className="hint mt-4">Informationsangebot ohne medizinische oder rechtliche Beratung. Zahlen aus Studien beschreiben deren Versuchsbedingungen und sind keine allgemeingültigen Sollwerte.</p>
          </section>

          {paths.map((p) => {
            const i = p.articles.indexOf(a.id);
            const next = byId(p.articles[i + 1] ?? '');
            return (
              <section key={p.id} className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: `${p.color}40`, background: `${p.color}0d` }}>
                <div className="text-[12.5px] text-ink-300">
                  <span className="font-semibold" style={{ color: p.color }}>
                    Lernpfad „{p.title}“
                  </span>{' '}
                  · Schritt {i + 1} von {p.articles.length}
                </div>
                {next ? (
                  <a href={href(`discover/learn/${next.id}`)} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-100 hover:underline">
                    Weiter: {next.title} <ArrowRight className="size-3.5" />
                  </a>
                ) : (
                  <span className="text-[12.5px] text-leaf-200">Letzter Schritt des Pfads</span>
                )}
              </section>
            );
          })}

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
        <nav aria-label="Inhalt" className="hidden xl:block">
          <div className="sticky top-20 space-y-1.5 border-l border-white/[0.06] pl-4 text-[12px]">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">Inhalt</p>
            {a.sections.map((s) => (
              <a key={s.heading} href={`#${anchor(s.heading)}`} onClick={(e) => (e.preventDefault(), document.getElementById(anchor(s.heading))?.scrollIntoView({ behavior: 'smooth' }))} className="block text-ink-400 hover:text-ink-100">
                {s.heading}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </>
  );
}

function Glossary() {
  const [q, setQ] = useState('');
  const list = q.trim().length >= 2 ? searchGlossary(q) : [...GLOSSARY].sort((x, y) => x.term.localeCompare(y.term, 'de'));
  return (
    <section id="glossar" aria-labelledby="glossar-h" className="mt-12 scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="glossar-h" className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-ink-50">
            <Library className="size-5 text-ink-400" /> Glossar
          </h2>
          <p className="mt-1 text-[13px] text-ink-400">{GLOSSARY.length} Begriffe – auch über die Suche (Strg+K) erreichbar.</p>
        </div>
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Glossar durchsuchen</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          <input className="input-base pl-9" placeholder="Begriff suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {list.length === 0 ? (
        <p className="hint mt-4">Kein Begriff gefunden.</p>
      ) : (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {list.map((g) => (
            <div key={g.id} id={`g-${g.id}`} className="rounded-xl border border-white/[0.06] p-3.5">
              <dt className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-semibold text-ink-50">{g.term}</span>
                {g.aka && <span className="truncate text-[11px] text-ink-500">{g.aka.slice(0, 2).join(' · ')}</span>}
              </dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-ink-300">{g.definition}</dd>
              <dd className="mt-1.5">
                <a href={href(`discover/learn/${g.article}`)} className="inline-flex min-h-6 items-center text-[12px] text-leaf-300 hover:underline">
                  {byId(g.article)?.title ?? 'Artikel'} →
                </a>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function initialCat(): string {
  const m = /[?&]cat=([^&]+)/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]!) : '';
}

export function KnowledgeHub({ articleId }: { articleId?: string }) {
  const { settings } = useData();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>(initialCat);
  const [level, setLevel] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const article = articleId ? byId(articleId) : undefined;
  const list = useMemo(
    () => kbSearch(q).filter((a) => (!cat || a.category === cat) && (!level || a.level === level) && (!onlyFav || settings.kbFavorites.includes(a.id))),
    [q, cat, level, onlyFav, settings.kbFavorites],
  );
  const readCount = KB_ARTICLES.filter((a) => (settings.kbProgress[a.id] ?? 0) >= 0.98).length;
  const filtering = !!(q || cat || level || onlyFav);

  if (articleId) {
    return (
      <div>
        <DiscoverNav />
        {article ? (
          <ArticleView key={article.id} a={article} />
        ) : (
          <EmptyState
            title="Artikel nicht gefunden"
            action={
              <a href={href('discover/learn')} className="btn-primary">
                Zur Übersicht
              </a>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <DiscoverNav />
      <div className="mb-6 grid gap-3 animate-fade-up lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h1 className="page-title">Cannabis 101</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-400">
            {KB_ARTICLES.length} belegte Artikel und Leitfäden – vom Licht bis zur Trocknung, von Cannabinoiden bis zu Risiken. Jede Zahl mit Quelle, jede Studie als das gekennzeichnet, was sie ist.
          </p>
        </div>
        <div className="text-[12px] text-ink-500">
          <span className="font-mono text-ink-200">{readCount}</span> von {KB_ARTICLES.length} gelesen
        </div>
      </div>

      {!filtering && (
        <section aria-labelledby="paths-h" className="mb-10">
          <h2 id="paths-h" className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-400">
            <Route className="size-4" /> Lernpfade
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {LEARNING_PATHS.map((p) => {
              const pr = pathProgress(p, settings.kbProgress);
              const next = pr.next ? byId(pr.next) : undefined;
              return (
                <a key={p.id} href={href(`discover/learn/${pr.next ?? p.articles[0]}`)} className="group flex min-w-0 flex-col rounded-2xl border border-white/[0.06] bg-ink-900/70 p-4 transition-colors hover:border-white/[0.14]">
                  <span className="text-[15px] font-semibold text-ink-50">{p.title}</span>
                  <span className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{p.description}</span>
                  <span className="mt-auto pt-4">
                    <span className="block h-1.5 rounded-full bg-ink-700" role="progressbar" aria-valuemin={0} aria-valuemax={pr.total} aria-valuenow={pr.done} aria-label={`${p.title}: ${pr.done} von ${pr.total} gelesen`}>
                      <span className="block h-full rounded-full" style={{ width: `${pr.ratio * 100}%`, background: p.color }} />
                    </span>
                    <span className="mt-1.5 flex min-w-0 justify-between gap-2 text-[11px] text-ink-500">
                      <span className="shrink-0">
                        {pr.done}/{pr.total} gelesen
                      </span>
                      <span className="truncate text-ink-300 group-hover:text-ink-100">{next ? `Weiter: ${next.title}` : 'Abgeschlossen ✓'}</span>
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Artikel durchsuchen</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          <input className="input-base h-11 pl-10" placeholder="Suchen, z. B. VPD, Mehltau, THCA, Erntezeitpunkt …" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Kategorie" className="input-base h-11 w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Alle Kategorien</option>
            {KB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c} ({KB_ARTICLES.filter((a) => a.category === c).length})
              </option>
            ))}
          </select>
          <select aria-label="Niveau" className="input-base h-11 w-auto" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Alle Niveaus</option>
            <option>Einsteiger</option>
            <option>Fortgeschritten</option>
          </select>
          <button type="button" aria-pressed={onlyFav} onClick={() => setOnlyFav((f) => !f)} className={`flex h-11 shrink-0 items-center gap-1 rounded-xl border px-3 text-xs ${onlyFav ? 'border-leaf-500/30 text-leaf-200' : 'border-white/[0.08] text-ink-400'}`}>
            <Bookmark className={`size-3.5 ${onlyFav ? 'fill-current' : ''}`} /> Gemerkt
          </button>
        </div>
      </div>

      {!filtering && (
        <section aria-label="Kategorien" className="mb-8 flex flex-wrap gap-1.5">
          {KB_CATEGORIES.map((c) => {
            const n = KB_ARTICLES.filter((a) => a.category === c).length;
            return (
              <button key={c} type="button" onClick={() => setCat(c)} className="flex items-center gap-1.5 rounded-full border border-white/[0.06] px-3 py-1.5 text-[12px] text-ink-300 hover:border-white/[0.16] hover:text-ink-100">
                <span className="size-2 rounded-full" style={{ background: CAT_COLOR[c] }} />
                {c} <span className="text-ink-500">{n}</span>
              </button>
            );
          })}
        </section>
      )}

      <p className="mb-3 text-[12px] text-ink-500" aria-live="polite">
        {list.length} {list.length === 1 ? 'Artikel' : 'Artikel'}
        {cat && ` in „${cat}“`}
      </p>
      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon={<BookOpen />} title="Keine Artikel gefunden" text={cat ? 'In dieser Kategorie gibt es mit diesen Filtern noch keine Artikel.' : undefined} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <a key={a.id} href={href(`discover/learn/${a.id}`)} className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70 p-5 transition-all hover:-translate-y-0.5 hover:border-white/[0.14]">
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
              <h2 className="mt-3 text-[17px] font-semibold tracking-tight text-ink-50">{a.title}</h2>
              <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink-400">{a.summary}</p>
              <div className="mt-auto flex items-center justify-between pt-5 text-[11px] text-ink-500">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" /> {readingMinutes(a)} Min.{a.level ? ` · ${a.level}` : ''}
                </span>
                <span title={a.review ? REVIEW_LABEL[a.review.level] : undefined}>
                  {a.sources.length} Quellen{a.review ? ` · ${a.review.level === 'volltext' ? 'Volltext' : a.review.level === 'teilweise' ? 'teilw. Volltext' : 'bibliografisch'}` : ''}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}

      {!filtering && <Glossary />}
    </div>
  );
}
