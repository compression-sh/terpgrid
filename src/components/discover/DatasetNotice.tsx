import { Scale } from 'lucide-react';
import type { LibStatus } from '../../lib/catalog/library';
import { fmtDate } from '../../lib/dates';

/** Namensnennung und Grenzen des lokal importierten Datensatzes (CC BY 4.0 verlangt Quelle, Lizenz und Änderungshinweis). */
export function DatasetNotice({ status, compact }: { status: Pick<LibStatus, 'attribution' | 'version' | 'importedAt'>; compact?: boolean }) {
  const a = status.attribution;
  return (
    <aside className="card p-4 text-[12px] leading-relaxed text-ink-400" aria-label="Datenquelle und Lizenz">
      <p className="flex items-center gap-2 font-medium text-ink-200">
        <Scale className="size-4 text-ink-500" /> Datenquelle
      </p>
      <p className="mt-1">
        <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="text-leaf-300 hover:underline">
          {a.name}
        </a>{' '}
        von {a.author}, lizenziert unter{' '}
        <a href={a.licenseUrl} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="text-leaf-300 hover:underline">
          {a.license}
        </a>
        . {a.changes}
      </p>
      {!compact && (
        <p className="mt-1.5">
          Die Werte sind Angaben von Seedbanks und Breedern (Shop-Texte), keine Labormessungen. Unplausible Werte wurden beim Import verworfen, nicht korrigiert. Fehlende Angaben bleiben leer.
          {status.version && (
            <>
              {' '}
              Version {status.version.slice(0, 12)}
              {status.importedAt && <>, importiert am {fmtDate(status.importedAt.slice(0, 10))}</>}.
            </>
          )}
        </p>
      )}
    </aside>
  );
}
