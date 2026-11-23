import { AlertTriangle, Loader2 } from 'lucide-react';
import { type ReactNode, Suspense, lazy } from 'react';
import { ConfirmProvider } from './app/Confirm';
import { DataProvider, useData } from './app/DataProvider';
import { QuickActionsProvider } from './app/QuickActions';
import { Shell } from './app/Shell';
import { ToastProvider } from './app/Toasts';
import { href, useRoute } from './app/router';
import { EmptyState } from './components/ui/EmptyState';
import { Dashboard } from './pages/Dashboard';

const ThcLab = lazy(() => import('./pages/ThcLab').then((m) => ({ default: m.ThcLab })));
const GrowList = lazy(() => import('./pages/grows/GrowList').then((m) => ({ default: m.GrowList })));
const GrowDetail = lazy(() => import('./pages/grows/GrowDetail').then((m) => ({ default: m.GrowDetail })));
const PlantDetail = lazy(() => import('./pages/grows/PlantDetail').then((m) => ({ default: m.PlantDetail })));
const PhotosPage = lazy(() => import('./pages/PhotosPage').then((m) => ({ default: m.PhotosPage })));
const StrainsPage = lazy(() => import('./pages/StrainsPage').then((m) => ({ default: m.StrainsPage })));
const StrainDetail = lazy(() => import('./pages/StrainsPage').then((m) => ({ default: m.StrainDetail })));
const JournalPage = lazy(() => import('./pages/JournalPage').then((m) => ({ default: m.JournalPage })));
const CollectionPage = lazy(() => import('./pages/CollectionPage').then((m) => ({ default: m.CollectionPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const UtilitiesPage = lazy(() => import('./pages/UtilitiesPage').then((m) => ({ default: m.UtilitiesPage })));
const DataPage = lazy(() => import('./pages/DataPage').then((m) => ({ default: m.DataPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function Loading() {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-ink-400">
        <Loader2 className="size-4 animate-spin text-leaf-400" /> Lade …
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <EmptyState
      title="Seite nicht gefunden"
      text="Dieser Bereich existiert nicht (mehr) – evtl. wurde der Eintrag gelöscht."
      action={
        <a href={href('')} className="btn-primary">
          Zur Übersicht
        </a>
      }
    />
  );
}

function Routes() {
  const { path } = useRoute();
  const [a, b, c, d] = path;
  let page: ReactNode;
  switch (a) {
    case undefined:
      page = <Dashboard />;
      break;
    case 'lab':
      page = <ThcLab />;
      break;
    case 'grows':
      if (!b) page = <GrowList />;
      else if (c === 'plants' && d) page = <PlantDetail growId={b} plantId={d} />;
      else page = <GrowDetail growId={b} />;
      break;
    case 'photos':
      page = <PhotosPage />;
      break;
    case 'strains':
      page = b ? <StrainDetail strainId={b} /> : <StrainsPage />;
      break;
    case 'journal':
      page = <JournalPage />;
      break;
    case 'collection':
      page = <CollectionPage />;
      break;
    case 'calendar':
      page = <CalendarPage />;
      break;
    case 'analytics':
      page = <AnalyticsPage />;
      break;
    case 'tools':
      page = <UtilitiesPage />;
      break;
    case 'data':
      page = <DataPage />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    default:
      page = <NotFound />;
  }
  return <Suspense fallback={<Loading />}>{page}</Suspense>;
}

function Gate({ children }: { children: ReactNode }) {
  const { ready, error } = useData();
  if (error) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          icon={<AlertTriangle />}
          title="Lokaler Speicher nicht verfügbar"
          text={
            <>
              {error} TERPGRID speichert Daten ausschließlich in IndexedDB dieses Browsers. Im privaten Modus oder bei blockierter Website-Speicherung ist das nicht
              möglich. Das THC Lab funktioniert trotzdem.
            </>
          }
          action={
            <a href={href('lab/edibles')} className="btn-primary">
              Zum THC Lab
            </a>
          }
        />
      </div>
    );
  }
  if (!ready) return <Loading />;
  return <>{children}</>;
}

export default function App() {
  const route = useRoute();
  // Das THC Lab funktioniert auch ohne IndexedDB (Eingaben im localStorage).
  const isLab = route.path[0] === 'lab';
  return (
    <ToastProvider>
      <ConfirmProvider>
        <DataProvider>
          <QuickActionsProvider>
            <Shell>{isLab ? <LabGate /> : <Gate><Routes /></Gate>}</Shell>
          </QuickActionsProvider>
        </DataProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function LabGate() {
  const { ready, error } = useData();
  if (!ready && !error) return <Loading />;
  return <Routes />;
}
