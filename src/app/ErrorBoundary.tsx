import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Fängt Renderfehler einer einzelnen Ansicht ab, damit Navigation und übrige App bedienbar bleiben.
 * Es wird nichts an Dritte gesendet; Details stehen nur in der Browser-Konsole.
 * `resetKey` (z. B. die Route) setzt den Fehlerzustand beim Seitenwechsel zurück.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ansicht konnte nicht angezeigt werden:', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="card mx-auto mt-6 max-w-xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0">
            <h1 className="page-title">Diese Ansicht konnte nicht angezeigt werden</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-300">
              Wahrscheinlich enthält ein Datensatz ein unerwartetes Format. Deine Daten wurden nicht verändert. Du kannst die Ansicht neu laden oder zu einem anderen Bereich wechseln.
            </p>
            <p className="mt-2 break-words font-mono text-[11.5px] text-ink-500">{this.state.error.message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => this.setState({ error: null })}>
                <RotateCcw className="size-4" /> Erneut versuchen
              </button>
              <a href="#/" className="btn-ghost">
                Zur Übersicht
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
