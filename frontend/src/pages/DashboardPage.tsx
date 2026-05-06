import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSimulationSocket } from '../hooks/useSimulationSocket'

function formatDate(value: string): string {
  return new Date(value).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { history, isConnected } = useSimulationSocket()
  const user = localStorage.getItem('sim-user-nim')
  const [query, setQuery] = useState('')
  const [showSimulationConfig, setShowSimulationConfig] = useState(false)
  const [platoonCount, setPlatoonCount] = useState(2)

  const filteredHistory = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return history
    return history.filter((item) => item.id.toLowerCase().includes(term))
  }, [history, query])

  const summary = useMemo(() => {
    const totalDuration = history.reduce((sum, item) => sum + item.durationSec, 0)
    const avgDelay = history.length
      ? history.reduce((sum, item) => sum + item.avgDelayMs, 0) / history.length
      : 0
    const avgSsi = history.length
      ? history.reduce((sum, item) => sum + item.avgStringStability, 0) / history.length
      : 0
    const collisionTotal = history.reduce((sum, item) => sum + item.collisionCount, 0)
    return { totalDuration, avgDelay, avgSsi, collisionTotal }
  }, [history])

  const onLogout = () => {
    localStorage.removeItem('sim-user-nim')
    navigate('/')
  }

  function openSimulationConfig() {
    setShowSimulationConfig(true)
  }

  function startConfiguredSimulation() {
    navigate('/simulation', { state: { platoonCount, autoStart: true } })
  }

  return (
    <main className="dashboard-page">
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">V2V</span>
          <div>
            <h2 className="brand">5G Platoon</h2>
            <small>Simulation Studio</small>
          </div>
        </div>

        <nav>
          <button className="nav-item active">Dashboard</button>
          <button className="nav-item" onClick={openSimulationConfig}>
            Simulation
          </button>
          <button className="nav-item" onClick={() => navigate('/settings')} type="button">
            Settings
          </button>
        </nav>

        <footer className="sidebar-footer">
          <span className={`status-pill ${isConnected ? 'on' : 'off'}`}>
            {isConnected ? 'Backend online' : 'Backend offline'}
          </span>
          <button className="nav-item danger" onClick={onLogout}>
            Logout
          </button>
        </footer>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <section className="dashboard-main">
        {/* Topbar */}
        <header className="topbar">
          <div>
            <span className="eyebrow">Research workspace</span>
            <h1>Welcome back, {user ?? 'Researcher'}</h1>
            <p>Manage sessions, start a new simulation, or review experiment analysis.</p>
          </div>
          <button className="btn primary" onClick={openSimulationConfig}>
            New Simulation
          </button>
        </header>

        {/* KPI grid */}
        <section className="kpi-grid">
          <article className="metric-card">
            <span>Total Sessions</span>
            <strong>{history.length}</strong>
            <small>saved experiments</small>
          </article>
          <article className="metric-card">
            <span>Total Duration</span>
            <strong>{summary.totalDuration}s</strong>
            <small>cumulative runtime</small>
          </article>
          <article className="metric-card">
            <span>Avg Delay</span>
            <strong>{formatNumber(summary.avgDelay)} ms</strong>
            <small>end-to-end network</small>
          </article>
          <article className="metric-card">
            <span>Avg SSI</span>
            <strong>{formatNumber(summary.avgSsi, 3)}</strong>
            <small>
              {summary.collisionTotal === 0 ? 'no collisions' : `${summary.collisionTotal} collisions`}
            </small>
          </article>
        </section>

        {/* History card */}
        <section className="card history-card">
          <header className="section-head">
            <div>
              <h2>Simulation History</h2>
              <p>{history.length} session{history.length !== 1 ? 's' : ''} saved from backend.</p>
            </div>
            <input
              className="search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search session ID"
            />
          </header>

          {filteredHistory.length === 0 ? (
            <div className="empty-state">
              <strong>{history.length === 0 ? 'No simulations saved yet' : 'Session not found'}</strong>
              <p>Start a new simulation, run it for a few seconds, then use Stop &amp; Analyze.</p>
              <button className="btn primary" onClick={openSimulationConfig}>
                Start Simulation
              </button>
            </div>
          ) : (
            <ul className="history-list">
              {filteredHistory.map((item) => (
                <li key={item.id}>
                  <div className="history-main">
                    <div className="history-id">
                      <strong>{item.id}</strong>
                      <small>{formatDate(item.createdAt)}</small>
                    </div>
                    <button
                      className="btn ghost"
                      onClick={() => navigate('/simulation', { state: { historyId: item.id } })}
                    >
                      View Analysis
                    </button>
                  </div>
                  <ul className="history-metrics">
                    <li>
                      <span>Duration</span>
                      <strong>{item.durationSec}s</strong>
                    </li>
                    <li>
                      <span>Avg Delay</span>
                      <strong>{item.avgDelayMs} ms</strong>
                    </li>
                    <li>
                      <span>Spacing Error</span>
                      <strong>{item.avgSpacingError} m</strong>
                    </li>
                    <li>
                      <span>Packet Loss</span>
                      <strong>{item.packetLossPercent}%</strong>
                    </li>
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      {/* ── Simulation config modal ─────────────────────────────────────── */}
      {showSimulationConfig && (
        <div
          className="sim-start-modal-backdrop"
          role="presentation"
          onClick={() => setShowSimulationConfig(false)}
        >
          <section
            className="sim-start-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Configure Simulation</h3>
            <p>Choose the number of platoons to simulate before entering the simulation page.</p>
            <label>
              <span>Number of Platoons</span>
              <select value={platoonCount} onChange={(event) => setPlatoonCount(Number(event.target.value))}>
                <option value={1}>1 Platoon</option>
                <option value={2}>2 Platoons</option>
                <option value={3}>3 Platoons</option>
              </select>
            </label>
            <div className="sim-start-actions">
              <button className="btn ghost" onClick={() => setShowSimulationConfig(false)} type="button">
                Cancel
              </button>
              <button className="btn primary" type="button" onClick={startConfiguredSimulation}>
                Continue →
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
