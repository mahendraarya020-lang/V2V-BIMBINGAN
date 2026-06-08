import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSimulationSocket } from '../hooks/useSimulationSocket'
import { appConfig } from '../config'
import { SunIcon, MoonIcon } from '../components/Icons'
import logoImg from '../assets/logo.png'

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  async function saveRename(id: string) {
    if (!editingName.trim()) {
      setEditingId(null)
      return
    }
    try {
      await fetch(`${appConfig.backendUrl}/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() })
      })
    } catch (e) {
      console.error('Failed to rename session', e)
    } finally {
      setEditingId(null)
    }
  }

  async function deleteSession(id: string) {
    if (!window.confirm('Are you sure you want to delete this experiment data? This cannot be undone.')) return
    try {
      await fetch(`${appConfig.backendUrl}/api/sessions/${id}`, {
        method: 'DELETE'
      })
    } catch (e) {
      console.error('Failed to delete session', e)
    }
  }

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
    navigate('/simulation', { state: { platoonCount, configure: true } })
  }

  return (
    <main className="dashboard-page">
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logoImg} alt="V2V Logo" style={{ height: '32px', width: 'auto', borderRadius: '4px' }} />
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
          <button className="nav-item" onClick={toggleTheme} type="button" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {theme === 'dark' ? (
              <>
                <SunIcon style={{ width: '15px', height: '15px' }} />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <MoonIcon style={{ width: '15px', height: '15px' }} />
                <span>Dark Mode</span>
              </>
            )}
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
                      {editingId === item.id ? (
                        <input
                          autoFocus
                          className="search-input"
                          style={{ padding: '4px 8px', width: '200px', marginBottom: '4px' }}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(item.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          onBlur={() => saveRename(item.id)}
                        />
                      ) : (
                        <strong
                          title="Double click to rename"
                          onDoubleClick={() => {
                            setEditingId(item.id)
                            setEditingName(item.name || item.id)
                          }}
                        >
                          {item.name || item.id}
                        </strong>
                      )}
                      <small>{formatDate(item.createdAt)}</small>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        className="btn ghost"
                        style={{ padding: '6px', minWidth: 'unset' }}
                        title="Edit Name"
                        onClick={() => {
                          setEditingId(item.id)
                          setEditingName(item.name || item.id)
                        }}
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-zinc-400 hover:text-blue-400" style={{ transition: 'color 0.2s' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        className="btn ghost"
                        style={{ padding: '6px', minWidth: 'unset' }}
                        title="Delete Session"
                        onClick={() => deleteSession(item.id)}
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-zinc-400 hover:text-red-500" style={{ transition: 'color 0.2s' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => navigate('/simulation', { state: { historyId: item.id } })}
                      >
                        View Analysis
                      </button>
                    </div>
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
