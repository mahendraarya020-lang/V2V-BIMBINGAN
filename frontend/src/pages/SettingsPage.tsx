import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type Theme = 'light' | 'dark' | 'system'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // System: follow OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) root.classList.add('dark')
    else root.classList.remove('dark')
  }
}

export function SettingsPage() {
  const navigate = useNavigate()
  const user = localStorage.getItem('sim-user-nim') ?? 'Researcher'
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('sim-theme') as Theme) ?? 'light'
  )

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('sim-theme', theme)
  }, [theme])

  const themeOptions: { value: Theme; label: string; icon: string; desc: string }[] = [
    { value: 'light', label: 'Light', icon: '☀', desc: 'Clean white interface' },
    { value: 'dark',  label: 'Dark',  icon: '◐', desc: 'Low-light dark theme' },
    { value: 'system',label: 'System',icon: '⊙', desc: 'Follow OS preference' },
  ]

  return (
    <main className="dashboard-page">
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
        <footer className="sidebar-footer">
          <button
            className="nav-item danger"
            type="button"
            onClick={() => { localStorage.removeItem('sim-user-nim'); navigate('/') }}
          >
            Logout
          </button>
        </footer>
      </aside>

      {/* ── Main ── */}
      <section className="dashboard-main">
        <header className="topbar">
          <div>
            <span className="eyebrow">Preferences</span>
            <h1>Settings</h1>
            <p>Configure appearance and account preferences for <strong>{user}</strong>.</p>
          </div>
        </header>

        {/* Theme Card */}
        <section className="card" style={{ maxWidth: 520, padding: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.3rem', fontSize: '0.95rem', fontWeight: 700 }}>
            Appearance
          </h2>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
            Choose how the interface looks. System follows your OS setting.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: `1.5px solid ${theme === opt.value ? 'var(--color-accent, #6366f1)' : 'var(--color-border, rgba(0,0,0,0.08))'}`,
                  background: theme === opt.value ? 'rgba(99,102,241,0.07)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s',
                  width: '100%',
                }}
              >
                <span style={{
                  width: 36, height: 36,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '8px',
                  background: theme === opt.value ? 'rgba(99,102,241,0.15)' : 'rgba(0,0,0,0.04)',
                  fontSize: '1.1rem',
                  flexShrink: 0,
                }}>
                  {opt.icon}
                </span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-heading, #0f172a)' }}>
                    {opt.label}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-muted, #64748b)' }}>
                    {opt.desc}
                  </span>
                </span>
                {/* Selection indicator */}
                <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: `1.5px solid ${theme === opt.value ? '#6366f1' : 'rgba(0,0,0,0.2)'}`,
                  background: theme === opt.value ? '#6366f1' : 'transparent',
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}>
                  {theme === opt.value && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <polyline points="1.5,4 3.5,6 6.5,2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Account Card */}
        <section className="card" style={{ maxWidth: 520, padding: '1.5rem', marginTop: '1rem' }}>
          <h2 style={{ margin: '0 0 0.3rem', fontSize: '0.95rem', fontWeight: 700 }}>Account</h2>
          <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
            Logged in as researcher ID.
          </p>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            border: '1px solid var(--color-border, rgba(0,0,0,0.08))',
            background: 'rgba(0,0,0,0.02)',
          }}>
            <span style={{
              width: 36, height: 36,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', background: '#6366f1', color: '#fff',
              fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
            }}>
              {user.slice(0, 2).toUpperCase()}
            </span>
            <span style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-heading, #0f172a)' }}>{user}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-muted, #64748b)' }}>Researcher NIM</div>
            </span>
            <button
              className="btn ghost"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
              onClick={() => { localStorage.removeItem('sim-user-nim'); navigate('/') }}
              type="button"
            >
              Sign out
            </button>
          </div>
        </section>
      </section>
    </main>
  )
}
