import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ControlPanel } from '../components/ControlPanel'
import { SimulationCanvas } from '../components/SimulationCanvas'
import { TelemetryPanel } from '../components/TelemetryPanel'
import { Toast } from '../components/Toast'
import type { ToastItem } from '../components/Toast'
import { VehicleDetail } from '../components/VehicleDetail'
import { useSimulationSocket } from '../hooks/useSimulationSocket'
import { useDataLogger } from '../hooks/useDataLogger'
import { readDefaultParamsFromStorage } from '../utils/units'
import { AnalysisPage } from './AnalysisPage'

export function SimulationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state, isConnected, analysis, savedMeta, lastCollision, lastTransferRefused, actions } = useSimulationSocket()
  const { isRecording, recordDurationS, startRecording, stopRecordingAndDownload } = useDataLogger(state)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [pendingSwap, setPendingSwap] = useState<{ idA: string; idB: string; triggeredAt: number } | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canvasWrapRef = useRef<HTMLElement | null>(null)
  const lastControlModeRef = useRef<'ACC' | 'CACC' | null>(null)
  const lastRunningRef = useRef(false)
  const nextToastIdRef = useRef(1)
  const defaultsAppliedRef = useRef(false)

  useEffect(() => {
    if (!isConnected || defaultsAppliedRef.current) return
    defaultsAppliedRef.current = true
    actions.updateParams(readDefaultParamsFromStorage())
  }, [isConnected, actions])

  function pushToast(item: Omit<ToastItem, 'id'>) {
    const id = nextToastIdRef.current++
    setToasts((prev) => [...prev.slice(-4), { id, ...item }])
  }

  const defaultPlatoonCount = state ? Array.from(new Set(state.vehicles.map((v) => v.y))).length : 2

  const startSimulation = useCallback((platoonCount?: number, followerCount?: number) => {
    setElapsedSeconds(0)
    actions.start({ platoonCount: platoonCount ?? defaultPlatoonCount, followerCount })
  }, [actions, defaultPlatoonCount])

  const stopAndAnalyze = useCallback(() => {
    actions.stop()
    setTimeout(() => setShowAnalysis(true), 600)
  }, [actions])

  function handleSwap(idA: string, idB: string) {
    actions.swapVehicles(idA, idB)
    if (swapTimerRef.current) clearTimeout(swapTimerRef.current)
    setPendingSwap({ idA, idB, triggeredAt: Date.now() })
    swapTimerRef.current = setTimeout(() => setPendingSwap(null), 1600)
    pushToast({ title: 'Transfer initiated', message: `${idA.toUpperCase()} to ${idB.toUpperCase()} platoon.`, kind: 'info' })
  }

  useEffect(() => {
    if (!lastCollision) return
    const [first, second] = lastCollision.between
    pushToast({ title: 'Collision alert', message: `${first} <-> ${second} (gap ${lastCollision.gapMeters}m)`, kind: 'error' })
  }, [lastCollision])

  useEffect(() => {
    if (!lastTransferRefused) return
    pushToast({ title: 'Transfer Ditolak (Phase 1)', message: lastTransferRefused.reason, kind: 'warn' })
  }, [lastTransferRefused])

  useEffect(() => {
    if (!state) return
    const wasRunning = lastRunningRef.current
    if (state.running && !wasRunning) {
      window.setTimeout(() => { setElapsedSeconds(0); pushToast({ title: 'Simulation started', message: 'Sesi simulasi aktif.', kind: 'info' }) }, 0)
    }
    if (!state.running && wasRunning) {
      window.setTimeout(() => { pushToast({ title: 'Simulation stopped', message: 'Sesi simulasi dihentikan.', kind: 'info' }) }, 0)
    }
    lastRunningRef.current = state.running
    const mode = state.telemetry.controlMode
    if (lastControlModeRef.current && lastControlModeRef.current !== mode) {
      window.setTimeout(() => {
        pushToast({
          title: mode === 'ACC' ? 'ACC fallback aktif' : 'CACC pulih',
          message: mode === 'ACC' ? 'Packet loss tinggi, sistem beralih ke ACC.' : 'Koneksi stabil, kembali ke CACC.',
          kind: mode === 'ACC' ? 'warn' : 'info',
        })
      }, 0)
    }
    lastControlModeRef.current = mode
  }, [state])

  useEffect(() => {
    if (!state?.running) return
    const timer = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(timer)
  }, [state?.running])

  useEffect(() => {
    if (!state) return
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.code === 'Space') { event.preventDefault(); if (state.running) stopAndAnalyze(); else startSimulation() }
      if (event.key === 'r' || event.key === 'R') actions.reset()
      if (event.key === '1') actions.trigger('latencySpike')
      if (event.key === '2') actions.trigger('packetDrop')
      if (event.key === '3') actions.trigger('humanBrake')
      if (event.key === 'Escape') setSelectedVehicleId(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [actions, state, startSimulation, stopAndAnalyze])

  const runningElapsed = useMemo(() => {
    if (!state?.running) return '00:00'
    const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')
    const ss = String(elapsedSeconds % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }, [elapsedSeconds, state?.running])

  function dismissToast(id: number) { setToasts((prev) => prev.filter((t) => t.id !== id)) }

  useEffect(() => {
    const navState = (location.state as { historyId?: string; platoonCount?: number; followerCount?: number; autoStart?: boolean } | null)
    if (!navState?.historyId) return
    actions.loadHistory(navState.historyId)
    window.setTimeout(() => setShowAnalysis(true), 0)
    navigate(location.pathname, { replace: true, state: null })
  }, [actions, location.pathname, location.state, navigate])

  useEffect(() => {
    const navState = (location.state as { historyId?: string; platoonCount?: number; followerCount?: number; autoStart?: boolean } | null)
    if (!state || !navState?.autoStart) return
    const count = typeof navState.platoonCount === 'number' ? navState.platoonCount : defaultPlatoonCount
    const followers = typeof navState.followerCount === 'number' ? navState.followerCount : undefined
    window.setTimeout(() => startSimulation(count, followers), 0)
    navigate(location.pathname, { replace: true, state: null })
  }, [defaultPlatoonCount, location.pathname, location.state, navigate, startSimulation, state])

  useEffect(() => {
    function onFullScreenChange() { setIsFullscreen(document.fullscreenElement === canvasWrapRef.current) }
    document.addEventListener('fullscreenchange', onFullScreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const container = canvasWrapRef.current
    if (!container) return
    try {
      if (document.fullscreenElement === container) await document.exitFullscreen()
      else await container.requestFullscreen()
    } catch {
      pushToast({ title: 'Fullscreen tidak tersedia', message: 'Browser ini tidak mengizinkan mode fullscreen.', kind: 'warn' })
    }
  }, [])

  if (showAnalysis && analysis) {
    return <AnalysisPage analysis={analysis} meta={savedMeta ?? undefined} onClose={() => setShowAnalysis(false)} />
  }

  if (!state) {
    return (
      <main className="ck-loading">
        <div className="ck-loading-card">
          <div className={`ck-conn-pill ${isConnected ? 'on' : 'off'}`}>
            {isConnected ? 'Backend online' : 'Backend offline'}
          </div>
          <h2>Connecting to simulation server</h2>
          <p>{isConnected ? 'Connected. Waiting for first state...' : 'Make sure the backend is running at http://localhost:4000'}</p>
        </div>
      </main>
    )
  }

  const telemetry = state.telemetry
  const activePlatoonCount = Array.from(new Set(state.vehicles.map((v) => v.y))).length
  const followerCount = Math.max(1, state.vehicles.filter((v) => v.y === 0).length - 1)

  return (
    <main className={`ck-cockpit ${isFullscreen ? 'ck-fullscreen' : ''}`}>

      {/* ── Compact top navbar ── */}
      <nav className="ck-navbar">
        <div className="ck-navbar-brand">
          <div className="ck-brand-mark">V2V</div>
          <div>
            <div className="ck-brand-title">Platooning Studio</div>
            <div className="ck-brand-sub">5G CACC Simulation</div>
          </div>
        </div>

        {/* Status pills */}
        <div className="ck-navbar-status">
          <div className={`ck-pill ${telemetry.status === 'Stable' ? 'ok' : 'bad'}`}>
            {telemetry.status}
          </div>
          <div className={`ck-pill ${telemetry.v2vLink === 'Connected' ? 'ok' : telemetry.v2vLink === 'Degraded' ? 'warn' : 'bad'}`}>
            V2V: {telemetry.v2vLink}
          </div>
          <div className={`ck-pill ${telemetry.controlMode === 'CACC' ? 'ok' : 'warn'}`}>
            {telemetry.controlMode}
          </div>
          <div className="ck-pill neutral">
            {state.running ? runningElapsed : 'Idle'}
          </div>
          <div className="ck-pill neutral">
            {activePlatoonCount} Platoon{activePlatoonCount > 1 ? 's' : ''}
          </div>
        </div>

        {/* Action buttons */}
        <div className="ck-navbar-actions">
          <button
            className={`ck-btn ${isRecording ? 'ck-btn-danger' : 'ck-btn-ghost'}`}
            onClick={isRecording ? stopRecordingAndDownload : startRecording}
            type="button"
          >
            {isRecording ? (
              <>
                Recording... ({String(Math.floor(recordDurationS / 60)).padStart(2, '0')}:{String(recordDurationS % 60).padStart(2, '0')})
              </>
            ) : (
              <>
                Start Record
              </>
            )}
          </button>

          <button className="ck-btn ck-btn-primary" onClick={() => startSimulation()} disabled={state.running} type="button">
            Start
          </button>
          <button className="ck-btn ck-btn-danger" onClick={stopAndAnalyze} disabled={!state.running} type="button">
            Stop & Analyze
          </button>
          <button className="ck-btn ck-btn-ghost" onClick={actions.reset} type="button">Reset</button>
          <button className="ck-btn ck-btn-ghost" onClick={() => navigate('/dashboard')} type="button">Dashboard</button>
        </div>
      </nav>

      {/* ── 3-column cockpit body ── */}
      <div className="ck-body">

        {/* Left: Control Center */}
        <ControlPanel
          params={state.params}
          vehicleIds={state.vehicles.map((v) => v.id)}
          followerCount={followerCount}
          onUpdateParams={actions.updateParams}
          onFollowerCountChange={actions.setFollowerCount}
          onThrottleBrake={actions.setControl}
          onTrigger={actions.trigger}
          onSwap={handleSwap}
        />

        {/* Center: Canvas */}
        <section className="ck-canvas-col" ref={canvasWrapRef}>
          <div className="ck-canvas-header">
            <div>
              <span className="ck-canvas-title">Roadway View</span>
              <span className="ck-canvas-sub">Top-down orthographic - 3 lanes - 3.5m/lane</span>
            </div>
            <div className="ck-canvas-hints">
              <span className="ck-key">Space</span>
              <span className="ck-hint-text">Start/Stop</span>
              <span className="ck-key">R</span>
              <span className="ck-hint-text">Reset</span>
              <span className="ck-key">1/2/3</span>
              <span className="ck-hint-text">Disrupt</span>
              <button className="ck-btn ck-btn-ghost ck-btn-sm" onClick={toggleFullscreen} type="button">
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>
            </div>
          </div>
          <SimulationCanvas
            vehicles={state.vehicles}
            v2vLink={telemetry.v2vLink}
            selectedVehicleId={selectedVehicleId}
            onVehicleClick={setSelectedVehicleId}
            pendingSwap={pendingSwap}
            running={state.running}
            avgSpeedMs={telemetry.averagePlatoonSpeedMs}
          />

          {selectedVehicleId && (
            <VehicleDetail
              vehicle={state.vehicles.find((v) => v.id === selectedVehicleId) ?? null}
            />
          )}
        </section>

        {/* Right: Telemetry */}
        <TelemetryPanel
          telemetry={telemetry}
          vehicles={state.vehicles}
          params={state.params}
        />
      </div>

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </main>
  )
}
