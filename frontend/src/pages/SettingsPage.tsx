import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appConfig } from '../config'
import { Toast, type ToastItem } from '../components/Toast'

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

  // --- Handlers ---
  function addToast(title: string, message: string, kind: 'info' | 'warn' | 'error') {
    setToasts((prev) => [...prev, { id: Date.now(), title, message, kind }])
  }

  useEffect(() => {
    // Force Dark Mode globally
    document.documentElement.classList.add('dark')
    localStorage.setItem('sim-theme', 'dark')
  }, [])

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
          <span className="brand-mark">V2V</span>
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
        </nav>
      </aside>

      {/* ── Main ── */}
      <section className="dashboard-main pb-16">
        <header className="topbar">
          <div>
            <span className="eyebrow">Preferences</span>
            <h1>Settings</h1>
            <p className="text-zinc-400">Configure global simulation parameters for your workspace.</p>
          </div>
        </header>

        <div className="flex flex-col gap-6 mt-6 w-full max-w-3xl">
          {/* Simulation Defaults Card */}
          <section className="card p-6 border border-zinc-800 bg-zinc-900/40">
            <h2 className="mb-1 text-lg font-bold text-zinc-100">Simulation Defaults</h2>
            <p className="mb-6 text-sm text-zinc-400">
              Set the foundational kinematic and communication parameters loaded on initialization.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-300">Default V2V Topology</span>
                <select 
                  className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                  value={defaultTopology}
                  onChange={(e) => setDefaultTopology(e.target.value)}
                >
                  <option value="Hybrid">Hybrid (Default)</option>
                  <option value="PF">Predecessor Following (PF)</option>
                  <option value="L2A">Leader-to-All (L2A)</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-300">Default Reference Speed (v₀)</span>
                <div className="flex items-center border border-zinc-800 bg-zinc-900 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                  <input 
                    type="number" min="5" max="42" step="1"
                    className="flex-1 bg-transparent p-2.5 text-sm text-white outline-none"
                    value={defaultSpeed}
                    onChange={(e) => setDefaultSpeed(Number(e.target.value))}
                  />
                  <span className="pr-3 text-xs font-semibold text-zinc-500">m/s</span>
                </div>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-300">Default Time Headway</span>
                <div className="flex items-center border border-zinc-800 bg-zinc-900 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                  <input 
                    type="number" min="0.1" max="5.0" step="0.1"
                    className="flex-1 bg-transparent p-2.5 text-sm text-white outline-none"
                    value={defaultTimeHeadway}
                    onChange={(e) => setDefaultTimeHeadway(Number(e.target.value))}
                  />
                  <span className="pr-3 text-xs font-semibold text-zinc-500">s</span>
                </div>
              </label>
            </div>
          </section>

          {/* Network Emulation Defaults Card */}
          <section className="card p-6 border border-zinc-800 bg-zinc-900/40">
            <h2 className="mb-1 text-lg font-bold text-zinc-100">Network Defaults</h2>
            <p className="mb-6 text-sm text-zinc-400">
              Configure baseline 5G environmental factors for thesis experiments.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-300">Default Latency</span>
                <div className="flex items-center border border-zinc-800 bg-zinc-900 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                  <input 
                    type="number" min="0" max="1000" step="1"
                    className="flex-1 bg-transparent p-2.5 text-sm text-white outline-none"
                    value={defaultLatency}
                    onChange={(e) => setDefaultLatency(Number(e.target.value))}
                  />
                  <span className="pr-3 text-xs font-semibold text-zinc-500">ms</span>
                </div>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-300">Default Packet Loss (PLR)</span>
                <div className="flex items-center border border-zinc-800 bg-zinc-900 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                  <input 
                    type="number" min="0" max="100" step="0.1"
                    className="flex-1 bg-transparent p-2.5 text-sm text-white outline-none"
                    value={defaultPacketLoss}
                    onChange={(e) => setDefaultPacketLoss(Number(e.target.value))}
                  />
                  <span className="pr-3 text-xs font-semibold text-zinc-500">%</span>
                </div>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-300">Default Channel Bandwidth (B)</span>
                <div className="flex items-center border border-zinc-800 bg-zinc-900 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                  <input
                    type="number" min="5" max="1000" step="5"
                    className="flex-1 bg-transparent p-2.5 text-sm text-white outline-none"
                    value={defaultBandwidthMhz}
                    onChange={(e) => setDefaultBandwidthMhz(Number(e.target.value))}
                  />
                  <span className="pr-3 text-xs font-semibold text-zinc-500">MHz</span>
                </div>
              </label>
            </div>
          </section>

          {/* Account Card (Minimal) */}
          <section className="card p-6 border border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-zinc-100">Account</h2>
              <p className="text-sm text-zinc-400">Logged in as <strong className="text-white">{user}</strong>.</p>
            </div>
            <button
              className="px-4 py-2 text-sm font-medium bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
              onClick={() => { localStorage.removeItem('sim-user-nim'); navigate('/') }}
              type="button"
            >
              Sign out
            </button>
          </section>

          {/* Danger Zone */}
          <section className="card p-6 border border-red-900/30 bg-red-950/10">
            <h2 className="mb-1 text-lg font-bold text-red-500">Danger Zone</h2>
            <p className="mb-6 text-sm text-zinc-400">
              Irreversible action. This will clear all saved CSV telemetry from the browser/database.
            </p>
            <div className="flex items-start">
              <button
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
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
