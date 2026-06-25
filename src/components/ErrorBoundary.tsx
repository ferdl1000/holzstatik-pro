import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Globaler Fehler-Fang. Ohne ihn führt JEDER unbehandelte Render-Fehler zu einem
 * komplett weißen Bildschirm (React hängt den ganzen Baum aus). Statt dessen zeigen
 * wir hier eine verständliche Meldung + Neu-Laden-Button und protokollieren den Fehler,
 * damit man sieht WAS schiefging.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In der Konsole sichtbar für Support/Debugging
    console.error('[ErrorBoundary] App-Fehler:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px', fontFamily: 'system-ui, sans-serif', background: '#f8fafc', color: '#1e293b',
          }}
        >
          <div style={{ maxWidth: 560, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Es ist ein Fehler aufgetreten
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
              Die Oberfläche konnte nicht geladen werden. Bitte neu laden. Wenn es erneut
              passiert, hilft die folgende Meldung bei der Fehlersuche:
            </p>
            <pre
              style={{
                textAlign: 'left', fontSize: 12, background: '#fff', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: 12, overflow: 'auto', maxHeight: 200, color: '#b91c1c',
              }}
            >
              {this.state.error?.message || 'Unbekannter Fehler'}
            </pre>
            <button
              onClick={this.handleReload}
              style={{
                marginTop: 16, padding: '8px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8,
              }}
            >
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
