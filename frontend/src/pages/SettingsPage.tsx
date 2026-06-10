import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appConfig } from '../config'
import { Toast, type ToastItem } from '../components/Toast'
import { SunIcon, MoonIcon } from '../components/Icons'
import logoImg from '../assets/logo.png'

export function SettingsPage() {
  const navigate = useNavigate()
  const user = localStorage.getItem('sim-user-nim') ?? 'Researcher'

  // --- States ---
  const [defaultTopology, setDefaultTopology] = useState(
    () => localStorage.getItem('sim-default-topology') ?? 'Hybrid'
  )
  const [defaultSpeed, setDefaultSpeed] = useState(
    () => Number(localStorage.getItem('sim-default-speed')) || 22
  )
  const [defaultTimeHeadway, setDefaultTimeHeadway] = useState(
    () => Number(localStorage.getItem('sim-default-headway')) || 1.2
  )
  const [defaultLatency, setDefaultLatency] = useState(
    () => Number(localStorage.getItem('sim-default-latency')) || 10
  )
  const [defaultPacketLoss, setDefaultPacketLoss] = useState(
    () => Number(localStorage.getItem('sim-default-loss')) || 0.5
  )
  const [defaultBandwidthMhz, setDefaultBandwidthMhz] = useState(
    () => Number(localStorage.getItem('sim-default-bandwidth-mhz')) || 1000
  )

  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark'
  })

  // --- Handlers ---
  function addToast(title: string, message: string, kind: 'info' | 'warn' | 'error') {
    setToasts((prev) => [...prev, { id: Date.now(), title, message, kind }])
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  // Persist to localStorage
  useEffect(() => localStorage.setItem('sim-default-topology', defaultTopology), [defaultTopology])
  useEffect(() => localStorage.setItem('sim-default-speed', defaultSpeed.toString()), [defaultSpeed])
  useEffect(() => localStorage.setItem('sim-default-headway', defaultTimeHeadway.toString()), [defaultTimeHeadway])
  useEffect(() => localStorage.setItem('sim-default-latency', defaultLatency.toString()), [defaultLatency])
  useEffect(() => localStorage.setItem('sim-default-loss', defaultPacketLoss.toString()), [defaultPacketLoss])
  useEffect(() => localStorage.setItem('sim-default-bandwidth-mhz', defaultBandwidthMhz.toString()), [defaultBandwidthMhz])

  async function handleDeleteAll() {
    if (!window.confirm('Are you sure you want to delete ALL simulation history? This action is irreversible.')) {
      return
    }
    try {
      const res = await fetch(`${appConfig.backendUrl}/api/sessions`, {
        method: 'DELETE',
      })
      if (res.ok) {
        addToast('History Cleared', 'All simulation sessions have been deleted.', 'info')
      } else {
        addToast('Error', 'Failed to delete simulation history.', 'error')
      }
    } catch (e) {
      console.error(e)
      addToast('Error', 'Network error while deleting history.', 'error')
    }
  }

  return (
    <main className="dashboard-page relative">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logoImg} alt="V2V Logo" style={{ height: '32px', width: 'auto', borderRadius: '4px' }} />
          <div>
            <h2 className="brand">5G Platoon</h2>
            <small>Simulation Studio</small>
          </div>
        </div>
        <nav>
          <button className="nav-item" onClick={() => navigate('/dashboard')} type="button">
            Dashboard
          </button>
          <button className="nav-item" onClick={() => navigate('/simulation')} type="button">
            Simulation
          </button>
          <button className="nav-item active" type="button">
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
          <button className="nav-item danger" onClick={() => { localStorage.removeItem('sim-user-nim'); navigate('/') }}>
            Logout
          </button>
        </footer>
      </aside>

      {/* ── Main ── */}
      <section className="dashboard-main pb-16">
        <header className="topbar">
          <div>
            <span className="eyebrow">Preferences</span>
            <h1>Settings</h1>
            <p>Configure global simulation parameters for your workspace.</p>
          </div>
        </header>

        <div className="settings-content">
          {/* Simulation Defaults Card */}
          <section className="card settings-card">
            <div>
              <h2 className="settings-section-title">Simulation Defaults</h2>
              <p className="settings-section-desc">
                Set the foundational kinematic and communication parameters loaded on initialization.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              <label className="settings-label">
                <span>Default V2V Topology</span>
                <select 
                  className="settings-input"
                  value={defaultTopology}
                  onChange={(e) => setDefaultTopology(e.target.value)}
                >
                  <option value="Hybrid">Hybrid (Default)</option>
                  <option value="PF">Predecessor Following (PF)</option>
                  <option value="L2A">Leader-to-All (L2A)</option>
                </select>
              </label>

              <label className="settings-label">
                <span>Default Reference Speed (v₀)</span>
                <div className="settings-input-group">
                  <input 
                    type="number" min="5" max="42" step="1"
                    className="settings-input-inner"
                    value={defaultSpeed}
                    onChange={(e) => setDefaultSpeed(Number(e.target.value))}
                  />
                  <span className="settings-input-unit">m/s</span>
                </div>
              </label>

              <label className="settings-label">
                <span>Default Time Headway</span>
                <div className="settings-input-group">
                  <input 
                    type="number" min="0.1" max="5.0" step="0.1"
                    className="settings-input-inner"
                    value={defaultTimeHeadway}
                    onChange={(e) => setDefaultTimeHeadway(Number(e.target.value))}
                  />
                  <span className="settings-input-unit">s</span>
                </div>
              </label>
            </div>
          </section>

          {/* Network Emulation Defaults Card */}
          <section className="card settings-card">
            <div>
              <h2 className="settings-section-title">Network Defaults</h2>
              <p className="settings-section-desc">
                Configure baseline 5G environmental factors for thesis experiments.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              <label className="settings-label">
                <span>Default Latency</span>
                <div className="settings-input-group">
                  <input 
                    type="number" min="0" max="1000" step="1"
                    className="settings-input-inner"
                    value={defaultLatency}
                    onChange={(e) => setDefaultLatency(Number(e.target.value))}
                  />
                  <span className="settings-input-unit">ms</span>
                </div>
              </label>

              <label className="settings-label">
                <span>Default Packet Loss (PLR)</span>
                <div className="settings-input-group">
                  <input 
                    type="number" min="0" max="100" step="0.1"
                    className="settings-input-inner"
                    value={defaultPacketLoss}
                    onChange={(e) => setDefaultPacketLoss(Number(e.target.value))}
                  />
                  <span className="settings-input-unit">%</span>
                </div>
              </label>

              <label className="settings-label">
                <span>Default Channel Bandwidth (B)</span>
                <div className="settings-input-group">
                  <input
                    type="number" min="5" max="5000" step="5"
                    className="settings-input-inner"
                    value={defaultBandwidthMhz}
                    onChange={(e) => setDefaultBandwidthMhz(Number(e.target.value))}
                  />
                  <span className="settings-input-unit">MHz</span>
                </div>
              </label>
            </div>
          </section>

          {/* Account Card (Minimal) */}
          <section className="card settings-card settings-row">
            <div>
              <h2 className="settings-section-title" style={{ fontSize: '1rem', margin: 0 }}>Account</h2>
              <p className="settings-section-desc" style={{ margin: 0 }}>Logged in as <strong>{user}</strong>.</p>
            </div>
            <button
              className="btn"
              onClick={() => { localStorage.removeItem('sim-user-nim'); navigate('/') }}
              type="button"
            >
              Sign out
            </button>
          </section>

          {/* Danger Zone */}
          <section className="card settings-card" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
            <div>
              <h2 className="settings-section-title" style={{ color: 'var(--bad)' }}>Danger Zone</h2>
              <p className="settings-section-desc">
                Irreversible action. This will clear all saved CSV telemetry from the browser/database.
              </p>
            </div>
            <div style={{ display: 'flex' }}>
              <button
                className="btn danger"
                onClick={handleDeleteAll}
                type="button"
              >
                Delete All Simulation History
              </button>
            </div>
          </section>
        </div>
      </section>

      <Toast toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </main>
  )
}
