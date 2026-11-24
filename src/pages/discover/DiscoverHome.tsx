import { Loader2 } from 'lucide-react';
import { useLibraryStatus } from '../../app/library';
import { DiscoverPage } from './DiscoverPage';
import { LibraryPage } from './LibraryPage';

/**
 * Startseite von Discover: lokal indexierter Katalog (CI-Strains-Pro), sofern auf dem
 * eigenen Server importiert – sonst der Live-Katalog (StrainAPI) wie bisher.
 */
export function DiscoverHome() {
  const status = useLibraryStatus();
  if (status === undefined)
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-ink-400" role="status">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  return status ? <LibraryPage status={status} /> : <DiscoverPage />;
}
