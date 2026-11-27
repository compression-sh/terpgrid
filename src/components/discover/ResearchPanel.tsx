import { ExternalLink, FlaskConical, Loader2, Microscope } from 'lucide-react';
import { useState } from 'react';
import { catalogErrorText } from '../../app/catalog';
import { useData } from '../../app/DataProvider';
import { normalizeName } from '../../lib/catalog/genetics';
import { catalog } from '../../lib/catalog/service';
import type { ResearchMatch, ResearchProfile } from '../../lib/catalog/types';
import { fmt } from '../../lib/format';
import { Callout } from '../ui/Callout';
import { rangeText } from './Badges';
import { TerpeneChips } from './TerpeneChips';
import { t, intlLocale } from '../../i18n';

type Phase = 'idle' | 'searching' | 'choose' | 'loading' | 'done' | 'error';

export function useResearch() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [matches, setMatches] = useState<ResearchMatch[]>([]);
  const [profile, setProfile] = useState<ResearchProfile>();
  const [error, setError] = useState<string>();
  const load = async (id: string) => {
    setPhase('loading');
    try {
      setProfile(await catalog.researchDetail(id));
      setPhase('done');
    } catch (e) {
      setError(catalogErrorText(e));
      setPhase('error');
    }
  };
  const start = async (name: string) => {
    setPhase('searching');
    setError(undefined);
    try {
      const m = await catalog.researchSearch(name);
      setMatches(m);
      const exact = m.filter((x) => normalizeName(x.name) === normalizeName(name));
      // Nur bei genau EINEM gleichnamigen Treffer automatisch fortfahren – gleichnamige
      // Sorten verschiedener Breeder werden nie stillschweigend zusammengeführt.
      if (exact.length === 1) await load(exact[0]!.id);
      else setPhase('choose');
    } catch (e) {
      setError(catalogErrorText(e));
      setPhase('error');
    }
  };
  return { phase, matches, profile, error, start, load, rate: catalog.cannalibRate };
}

export function ResearchPanel({ name, research }: { name: string; research: ReturnType<typeof useResearch> }) {
  const { settings } = useData();
  const { phase, matches, profile, error, start, load } = research;
  const rate = catalog.cannalibRate;
  if (!settings.cannalibEnabled || !settings.onlineCatalog) {
    return <p className="hint">{t('discover.rs.disabled')}</p>;
  }

  return (
    <div className="space-y-4">
      {phase === 'idle' && (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-ink-300">
            {t('discover.rs.intro')}
          </p>
          <button type="button" className="btn-ghost" onClick={() => start(name)}>
            <Microscope className="size-4" /> {t('discover.rs.load')}
          </button>
          <p className="hint">{t('discover.rs.quota')}</p>
        </div>
      )}
      {(phase === 'searching' || phase === 'loading') && (
        <div className="flex items-center gap-2 text-[13px] text-ink-400" role="status">
          <Loader2 className="size-4 animate-spin text-leaf-400" /> {phase === 'searching' ? t('discover.rs.searching') : t('discover.rs.loading')}
        </div>
      )}
      {phase === 'error' && (
        <Callout tone="warn" title={t('discover.rs.unavailable')}>
          {error}
        </Callout>
      )}
      {phase === 'choose' && (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-300">
            {matches.length === 0 ? t('discover.rs.none') : t('discover.rs.choose')}
          </p>
          <ul className="space-y-1.5">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => load(m.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2 text-left hover:border-white/[0.14]">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink-100">{m.name}</span>
                    <span className="block truncate text-[11px] text-ink-500">{[m.breeder, m.type].filter(Boolean).join(' · ') || t('discover.rs.noInfo')}</span>
                  </span>
                  {m.thc && <span className="shrink-0 font-mono text-[11px] text-ink-400">THC {rangeText(m.thc)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {phase === 'done' && profile && <ResearchProfileView profile={profile} />}
      {rate.remaining !== undefined && (
        <p className="text-[11px] text-ink-600">
          {rate.limit !== undefined ? t('discover.rs.rateOf', { n: rate.remaining, limit: rate.limit }) : t('discover.rs.rate', { n: rate.remaining })}
          {rate.dailyRemaining !== undefined && t('discover.rs.rateDay', { n: rate.dailyRemaining })}.
        </p>
      )}
    </div>
  );
}

function ResearchProfileView({ profile }: { profile: ResearchProfile }) {
  const lp = profile.labPotency;
  return (
    <div className="space-y-4">
      <div className="text-[12px] text-ink-400">
        {t('discover.rs.entry')} <span className="text-ink-200">{profile.name}</span> {t('discover.rs.id', { id: profile.id })}
      </div>
      {lp && (lp.thc || lp.cbd) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(['thc', 'cbd'] as const).map((k) => {
            const v = lp[k];
            return (
              <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-500">
                  <FlaskConical className="size-3" /> {t('discover.rs.fromLab', { k: k.toUpperCase() })}
                </div>
                {v ? (
                  <>
                    <div className="mt-1 font-mono text-[15px] text-ink-50">{rangeText(v)}</div>
                    <div className="text-[11px] text-ink-500">
                      {v.median !== undefined && t('discover.rs.median', { v: fmt(v.median) })}
                      {v.basis}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-[12px] text-ink-500">{t('discover.noData')}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {profile.topTerpenes.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">{t('discover.rs.topTerpenes')}</div>
          <TerpeneChips names={profile.topTerpenes} max={8} />
        </div>
      )}
      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">{t('discover.rs.parents', { n: profile.parents.length })}</div>
        {profile.parents.length === 0 ? (
          <p className="text-[12px] text-ink-500">{t('discover.noData')}</p>
        ) : (
          <>
            {profile.parents.length > 2 && <p className="mb-2 text-[12px] text-amber-300/90">{t('discover.rs.manyParents')}</p>}
            <ul className="flex flex-wrap gap-1.5">
              {profile.parents.map((p) => (
                <li key={p.name} title={p.sources.join(', ')} className={`rounded-full border px-2 py-0.5 text-[11px] ${(p.confidence ?? 1) < 1 ? 'border-dashed border-amber-400/30 text-amber-200/90' : 'border-white/[0.08] text-ink-200'}`}>
                  {p.name}
                  {p.confidence !== undefined && <span className="ml-1 font-mono text-[10px] text-ink-500">{Math.round(p.confidence * 100)} %</span>}
                </li>
              ))}
            </ul>
            <p className="hint mt-1.5">{t('discover.rs.confidence')}</p>
          </>
        )}
        {profile.childrenCount !== undefined && <p className="mt-2 text-[12px] text-ink-400">{t('discover.rs.children', { count: profile.childrenCount })}</p>}
      </div>
      {profile.dnaDatasets.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">{t('discover.rs.dna')}</div>
          <ul className="space-y-1">
            {profile.dnaDatasets.map((d) => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="inline-flex items-center gap-1 text-[12px] text-leaf-300 hover:underline">
                  {d.name} {d.samples !== undefined && t('discover.rs.samples', { count: d.samples })} <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile.aliases.length > 1 && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">{t('discover.rs.aliases')}</div>
          <p className="text-[12px] text-ink-400">{profile.aliases.slice(0, 12).join(' · ')}</p>
        </div>
      )}
      <p className="text-[11px] text-ink-600">
        {t('discover.sourceLabel')}{' '}
        <a href="https://cannalib.org/" target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="hover:text-ink-300">
          CannaLib
        </a>{' '}
        {t('discover.rs.fetched', { date: new Date(profile.fetchedAt).toLocaleString(intlLocale()) })}
      </p>
    </div>
  );
}
