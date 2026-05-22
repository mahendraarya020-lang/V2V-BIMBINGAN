import { useNavigate } from 'react-router-dom'

export function LoginPage() {
  const navigate = useNavigate()

  const launch = () => {
    // Store a default identity so RequireAuth passes through
    localStorage.setItem('sim-user-nim', 'guest')
    navigate('/dashboard')
  }

  return (
    <main className="landing-page">
      {/* ── Atmospheric background orbs ────────────────────────────────── */}
      <div className="landing-orb landing-orb--blue" aria-hidden />
      <div className="landing-orb landing-orb--violet" aria-hidden />
      <div className="landing-orb landing-orb--cyan" aria-hidden />

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="brand-mark">V2V</span>
          <span className="landing-brand-title">5G Platoon Lab</span>
        </div>
        <nav className="landing-nav-links">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="landing-badge">Research Preview</span>
        </nav>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-eyebrow">
          <span className="landing-pulse" aria-hidden />
          Vehicular Network Simulation Suite
        </div>

        <h1 className="landing-h1">
          Platform Simulasi{' '}
          <span className="landing-gradient-text">CACC &amp; 5G</span>
          {' '}untuk Platooning Kendaraan Otonom
        </h1>

        <p className="landing-sub">
          Monitor stabilitas formasi platoon, gangguan jaringan, respon kendaraan real-time,
          dan verifikasi eksperimen akademis dalam satu workspace yang terintegrasi.
        </p>

        {/* ── CTA ─────────────────────────────────────────────────────── */}
        <div className="landing-cta-group">
          <button
            type="button"
            className="landing-cta-primary"
            onClick={launch}
            id="launch-simulation-btn"
          >
            Launch Simulation Studio
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="landing-cta-hint">No account required · Open access</span>
        </div>

        {/* ── Feature stats pills ──────────────────────────────────────── */}
        <div className="landing-stats">
          {[
            { value: '10 Hz', label: 'Telemetry rate' },
            { value: 'CACC', label: 'Control mode' },
            { value: '5G URLLC', label: 'Network profile' },
            { value: '< 1 ms', label: 'Simulated delay' },
          ].map((s) => (
            <div key={s.value} className="landing-stat-card">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live stack preview card ─────────────────────────────────────── */}
      <section className="landing-stack-card">
        <div className="landing-stack-head">
          <div>
            <p className="landing-stack-label">Live Simulation Stack</p>
            <p className="landing-stack-sub">RSU · Leader · Followers · V2I Link</p>
          </div>
          <span className="landing-status-pill">
            <span className="landing-pulse" aria-hidden />
            Ready
          </span>
        </div>

        <div className="landing-stack-lane">
          {['RSU', 'Leader', 'F1', 'F2', 'F3'].map((node, i) => (
            <div key={node} className="landing-stack-node-wrap">
              <div className={`landing-lane-node ${i === 0 ? 'landing-lane-node--active' : ''}`}>
                {node}
              </div>
              {i < 4 && <div className="landing-lane-line"><div className="landing-lane-line-pulse" /></div>}
            </div>
          ))}
        </div>

        {/* Mini telemetry mock ────────────────────────────────────────── */}
        <div className="landing-telemetry-row">
          {[
            { label: 'Speed', value: '25 m/s' },
            { label: 'Spacing Error', value: '±0.12 m' },
            { label: 'SSI', value: '0.974' },
            { label: 'Latency', value: '2.1 ms' },
          ].map((t) => (
            <div key={t.label} className="landing-telemetry-item">
              <span className="landing-telemetry-label">{t.label}</span>
              <span className="landing-telemetry-value">{t.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <span>Tugas Akhir · Sistem Simulasi Platooning V2V Berbasis 5G</span>
        <span className="landing-footer-sep" />
        <span>Telkom University</span>
      </footer>
    </main>
  )
}
