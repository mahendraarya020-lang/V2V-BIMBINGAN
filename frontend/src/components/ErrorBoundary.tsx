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
    console.error('[app-error]', error, info.componentStack)
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
