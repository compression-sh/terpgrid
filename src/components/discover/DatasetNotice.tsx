import { Scale } from 'lucide-react';
import type { LibStatus } from '../../lib/catalog/library';
import { fmtDate } from '../../lib/dates';
import { t } from '../../i18n';

/** Namensnennung und Grenzen des lokal importierten Datensatzes (CC BY 4.0 verlangt Quelle, Lizenz und Änderungshinweis). */
export function DatasetNotice({ status, compact }: { status: Pick<LibStatus, 'attribution' | 'version' | 'importedAt'>; compact?: boolean }) {
  const a = status.attribution;
  return (
    <aside className="card p-4 text-[12px] leading-relaxed text-ink-400" aria-label={t('discover.ds.aria')}>
      <p className="flex items-center gap-2 font-medium text-ink-200">
        <Scale className="size-4 text-ink-500" /> {t('discover.ds.title')}
      </p>
      <p className="mt-1">
        <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="text-leaf-300 hover:underline">
          {a.name}
        </a>{' '}
        {t('discover.ds.byLicensed', { author: a.author })}{' '}
        <a href={a.licenseUrl} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="text-leaf-300 hover:underline">
          {a.license}
        </a>
        . {a.changes}
      </p>
      {!compact && (
        <p className="mt-1.5">
          {t('discover.ds.limits')}
          {status.version && (
            <>
              {' '}
              {t('discover.ds.version', { v: status.version.slice(0, 12) })}
              {status.importedAt && <>{t('discover.ds.imported', { date: fmtDate(status.importedAt.slice(0, 10)) })}</>}.
            </>
          )}
        </p>
      )}
    </aside>
  );
}
