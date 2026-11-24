import { AlertTriangle, Loader2 } from 'lucide-react';
import { type ReactNode, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './app/auth';
import { ConfirmProvider } from './app/Confirm';
import { LegacyBanner, SecurityNudge } from './app/SyncIndicator';
import { ReauthProvider } from './app/reauth';
import { currentDatabaseName } from './lib/db/database';
import { AuthScreen } from './pages/auth/AuthScreen';
import { DataProvider, useData } from './app/DataProvider';
import { QuickActionsProvider } from './app/QuickActions';
import { Shell } from './app/Shell';
import { ToastProvider } from './app/Toasts';
import { CompareProvider, useCatalogOnlineSync } from './app/catalog';
import { href, useRoute } from './app/router';
import { EmptyState } from './components/ui/EmptyState';
import { Dashboard } from './pages/Dashboard';

const ThcLab = lazy(() => import('./pages/ThcLab').then((m) => ({ default: m.ThcLab })));
const GrowList = lazy(() => import('./pages/grows/GrowList').then((m) => ({ default: m.GrowList })));
const GrowDetail = lazy(() => import('./pages/grows/GrowDetail').then((m) => ({ default: m.GrowDetail })));
const LabelsPage = lazy(() => import('./pages/grows/LabelsPage').then((m) => ({ default: m.LabelsPage })));
const GrowCompare = lazy(() => import('./pages/grows/GrowCompare').then((m) => ({ default: m.GrowCompare })));
const GrowReport = lazy(() => import('./pages/grows/GrowReport').then((m) => ({ default: m.GrowReport })));
const ExperimentsPage = lazy(() => import('./pages/grows/ExperimentsPage').then((m) => ({ default: m.ExperimentsPage })));
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
const DiscoverPage = lazy(() => import('./pages/discover/DiscoverPage').then((m) => ({ default: m.DiscoverPage })));
const DiscoverHome = lazy(() => import('./pages/discover/DiscoverHome').then((m) => ({ default: m.DiscoverHome })));
const CultivarPage = lazy(() => import('./pages/discover/CultivarPage').then((m) => ({ default: m.CultivarPage })));
const BreedersPage = lazy(() => import('./pages/discover/BreedersPage').then((m) => ({ default: m.BreedersPage })));
const BreederProfile = lazy(() => import('./pages/discover/BreedersPage').then((m) => ({ default: m.BreederProfile })));
const StrainProfile = lazy(() => import('./pages/discover/StrainProfile').then((m) => ({ default: m.StrainProfile })));
const GeneticsExplorer = lazy(() => import('./pages/discover/GeneticsExplorer').then((m) => ({ default: m.GeneticsExplorer })));
const CatalogGenetics = lazy(() => import('./pages/discover/GeneticsExplorer').then((m) => ({ default: m.CatalogGenetics })));
const GeneticsHome = lazy(() => import('./pages/discover/GeneticsExplorer').then((m) => ({ default: m.GeneticsHome })));
const TerpeneAtlas = lazy(() => import('./pages/discover/TerpeneAtlas').then((m) => ({ default: m.TerpeneAtlas })));
const CompareStudio = lazy(() => import('./pages/discover/CompareStudio').then((m) => ({ default: m.CompareStudio })));
const VisualExplorer = lazy(() => import('./pages/discover/VisualExplorer').then((m) => ({ default: m.VisualExplorer })));
const KnowledgeHub = lazy(() => import('./pages/discover/KnowledgeHub').then((m) => ({ default: m.KnowledgeHub })));
const TimelinePage = lazy(() => import('./pages/TimelinePage').then((m) => ({ default: m.TimelinePage })));
const LabInsights = lazy(() => import('./pages/LabInsights').then((m) => ({ default: m.LabInsights })));
const AccountPage = lazy(() => import('./pages/account/AccountPage').then((m) => ({ default: m.AccountPage })));
const AdminPage = lazy(() => import('./pages/account/AdminPage').then((m) => ({ default: m.AdminPage })));
const SyncPage = lazy(() => import('./pages/account/SyncPage').then((m) => ({ default: m.SyncPage })));
const ImportPage = lazy(() => import('./pages/account/ImportPage').then((m) => ({ default: m.ImportPage })));
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
  const { path, query } = useRoute();
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
      else if (b === 'compare') page = <GrowCompare />;
      else if (c === 'report') page = <GrowReport growId={b} />;
      else if (c === 'experiments') page = <ExperimentsPage growId={b} />;
      else if (c === 'plants' && d) page = <PlantDetail growId={b} plantId={d} />;
      else page = <GrowDetail growId={b} />;
      break;
    case 'labels':
      page = <LabelsPage />;
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
    case 'discover':
      if (b === 'strain' && c) page = <StrainProfile key={c} slug={c} />;
      else if (b === 'cultivar' && c) page = <CultivarPage key={c} id={c} />;
      else if (b === 'breeders') page = c ? <BreederProfile key={c} id={c} /> : <BreedersPage />;
      else if (b === 'live') page = <DiscoverPage />;
      else if (b === 'genetics' && c === 'c') page = <CatalogGenetics key={d ?? ''} id={d} />;
      else if (b === 'genetics' && c === 'live') page = <GeneticsExplorer />;
      else if (b === 'genetics' && !c) page = <GeneticsHome />;
      else if (b === 'genetics') page = <GeneticsExplorer key={c ?? ''} slug={c} />;
      else if (b === 'terpenes') page = <TerpeneAtlas terpeneId={c} />;
      else if (b === 'compare') page = <CompareStudio />;
      else if (b === 'gallery') page = <VisualExplorer />;
      else if (b === 'learn') page = <KnowledgeHub key={c ?? `list-${query.get('cat') ?? ''}`} articleId={c} />;
      else if (!b) page = <DiscoverHome />;
      else page = <NotFound />;
      break;
    case 'lab-reports':
      page = <LabInsights />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    case 'account':
      if (b === 'import') page = <ImportPage />;
      else if (b === 'sync') page = <SyncPage />;
      else if (!b) page = <AccountGate />;
      else page = <NotFound />;
      break;
    case 'timeline':
      page = <TimelinePage />;
      break;
    case 'admin':
      page = <AdminPage />;
      break;
    case 'register':
      page = <Dashboard />;
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
              {error} TERPGRID benötigt IndexedDB in diesem Browser (im Servermodus als Arbeitskopie für Offline-Nutzung und Synchronisation). Im privaten Modus oder bei blockierter Website-Speicherung ist das nicht
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
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

/**
 * Servermodus: ohne Anmeldung keine persönlichen Daten. Nach dem Login wird die
 * Konto-Datenbank geöffnet; `key` erzwingt bei Kontowechsel einen frischen Datenzustand.
 */
function AuthGate() {
  const auth = useAuth();
  const route = useRoute();
  const { state } = auth;
  if (state.kind === 'checking')
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loading />
      </div>
    );
  if (state.kind === 'anonymous') return <AuthScreen />;
  // Das THC Lab funktioniert auch ohne IndexedDB (Eingaben im localStorage).
  const isLab = route.path[0] === 'lab';
  const dbKey = currentDatabaseName();
  return (
    <DataProvider key={dbKey}>
      <ReauthProvider>
      <CompareProvider>
        <QuickActionsProvider>
          <CatalogSync />
          <Shell>
            {state.kind === 'authenticated' && !isLab && route.path[0] !== 'account' && <LegacyBanner account={auth.lastAccount} />}
            {route.path.length === 0 && <SecurityNudge />}
            {isLab ? (
              <LabGate />
            ) : (
              <Gate>
                <Routes />
              </Gate>
            )}
          </Shell>
        </QuickActionsProvider>
      </CompareProvider>
      </ReauthProvider>
    </DataProvider>
  );
}

/** Konto-Seite nur im Servermodus (im Lokalmodus gibt es kein Konto). */
function AccountGate() {
  const { state } = useAuth();
  if (state.kind !== 'authenticated')
    return <EmptyState title="Lokalmodus" text="Diese Installation läuft ohne Server. Daten liegen nur in diesem Browser – es gibt kein Konto." action={<a href={href('data')} className="btn-primary">Daten & Backup</a>} />;
  return <AccountPage />;
}

function LabGate() {
  const { ready, error } = useData();
  if (!ready && !error) return <Loading />;
  return <Routes />;
}

function CatalogSync() {
  useCatalogOnlineSync();
  return null;
}
