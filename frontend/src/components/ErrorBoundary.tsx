import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app-error]', error, info)
    // #region agent log
    fetch('http://127.0.0.1:7701/ingest/b7762f81-002a-4b26-9a43-bc49f3186196', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2b9c00' },
      body: JSON.stringify({
        sessionId: '2b9c00',
        runId: 'pre-fix',
        hypothesisId: 'H0',
        location: 'ErrorBoundary.tsx:componentDidCatch',
        message: 'React error boundary captured runtime exception',
        data: {
          name: error?.name,
          message: error?.message,
          stack: error?.stack?.slice(0, 1200),
          componentStack: info?.componentStack?.slice(0, 1200),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="loading">
          <section className="card loading-card">
            <span className="status-pill off">App error</span>
            <h2>Terjadi gangguan pada aplikasi</h2>
            <p>Refresh halaman untuk memuat ulang state aplikasi.</p>
            <button className="btn primary" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
