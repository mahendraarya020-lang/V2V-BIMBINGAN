import { useState } from 'react'
import type { SimulationParams, SimulationTrigger, VehicleState } from '../types/sim'
import {
  formatChannelBandwidthMHz,
  formatHeadway,
  formatLatency,
  formatPlr,
  formatSpeedMs,
  formatStandstill,
  hzToMhz,
  mhzToHz,
} from '../utils/units'

type Props = {
  params: SimulationParams
  vehicles: VehicleState[]
  followerCount: number
  onUpdateParams: (next: Partial<SimulationParams>) => void
  onFollowerCountChange: (count: number) => void
  onThrottleBrake: (throttle: number, brake: number) => void
  onTrigger: (kind: SimulationTrigger) => void
  onSwap: (idA: string, idB: string) => void
  onSwitchLane: (vehicleId: string, targetLane: number) => void
  running: boolean
  onStart: () => void
  onStop: () => void
  onReset: () => void
}

type Tab = 'network' | 'scenarios' | 'maneuvers'



function SliderRow({
  label,
  min, max, step = 1, value, format, onChange, disabled, bgGradient,
}: {
  label: string; min: number; max: number; step?: number
  value: number; format: (v: number) => string; onChange: (v: number) => void
  disabled?: boolean; bgGradient?: string
}) {
  return (
    <div className="ck-slider" style={disabled ? { opacity: 0.38, pointerEvents: 'none' } : undefined}>
      <div className="ck-slider-head">
        <span className="ck-slider-label">{label}</span>
        <span className="ck-slider-value">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ck-range"
        disabled={disabled}
        style={bgGradient ? { background: bgGradient } : undefined}
      />
    </div>
  )
}

export function ControlPanel({
  params, vehicles, followerCount,
  onUpdateParams, onFollowerCountChange, onThrottleBrake, onTrigger, onSwap, onSwitchLane,
  running, onStart, onStop, onReset,
}: Props) {
  const [tab, setTab] = useState<Tab>('network')
  const [firstId, setFirstId] = useState('')
  const [secondId, setSecondId] = useState('')
  const [switchVeh, setSwitchVeh] = useState('')
  const [switchLaneVal, setSwitchLaneVal] = useState<number | undefined>(undefined)

  const channelMhz = hzToMhz(params.channelBandwidthHz ?? 1_000_000_000)
  const vehicleIds = vehicles.map(v => v.id)
  // Build a map from vehicle id to its actual platoon lane for correct labeling
  const vehicleLaneMap = new Map(vehicles.map(v => [v.id, v.y]))
  const selA = firstId && vehicleIds.includes(firstId) ? firstId : (vehicleIds[0] ?? '')
  const selB = secondId && vehicleIds.includes(secondId) ? secondId : (vehicleIds[1] ?? '')

  // Compute available lanes dynamically
  const laneSet = new Set<number>()
  vehicles.forEach(v => {
    laneSet.add(v.y)
    if (v.targetLane !== undefined) laneSet.add(v.targetLane)
  })
  const lanes = Array.from(laneSet).sort((a, b) => a - b)
  if (lanes.length === 0) lanes.push(0)

  const selSwitchVeh = switchVeh && vehicleIds.includes(switchVeh) ? switchVeh : (vehicleIds[0] ?? '')
  const currentVehLane = vehicleLaneMap.get(selSwitchVeh) ?? 0
  const otherLanes = lanes.filter(l => l !== currentVehLane)
  const selSwitchLane = switchLaneVal !== undefined && lanes.includes(switchLaneVal) ? switchLaneVal : (otherLanes[0] ?? lanes[0] ?? 0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'network', label: '5G & CACC' },
    { id: 'scenarios', label: 'Scenarios' },
    { id: 'maneuvers', label: 'Maneuvers' },
  ]

  return (
    <aside className="ck-panel">
      <div className="ck-panel-header">
        <div className="ck-panel-dot" />
        <div>
          <div className="ck-panel-title">Control Center</div>
          <div className="ck-panel-sub">Network & vehicle behaviour</div>
        </div>
      </div>

      <div className="ck-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`ck-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ck-tab-content">

        {tab === 'network' && (
          <div className="ck-form-group">

            <div className="ck-group-title">5G Channel Model</div>

            <div className="ck-toggle-row">
              <div>
                <span className="ck-slider-label">Dynamic Path Loss (3GPP)</span>
                <div className="ck-panel-sub" style={{ fontSize: '0.68rem', marginTop: '0.15rem' }}>
                  Per-vehicle RSU distance-based loss
                </div>
              </div>
              <button
                type="button"
                className={`ck-toggle ${params.dynamicPathLoss ? 'active' : ''}`}
                onClick={() => onUpdateParams({ dynamicPathLoss: !params.dynamicPathLoss })}
                aria-pressed={params.dynamicPathLoss}
                id="dynamic-path-loss-toggle"
              >
                <span className="ck-toggle-thumb" />
              </button>
            </div>

            <SliderRow label="One-Way Latency" min={5} max={20} value={params.latencyMs}
              format={formatLatency} onChange={(v) => onUpdateParams({ latencyMs: v })}
              bgGradient="linear-gradient(to right, rgba(52, 211, 153, 0.25) 0%, rgba(52, 211, 153, 0.25) 30%, rgba(251, 191, 36, 0.22) 65%, rgba(251, 113, 133, 0.28) 100%)" />
            <SliderRow
              label="Packet Loss Rate (PLR)" min={0} max={30} step={0.5} value={params.packetLossPercent}
              format={formatPlr} onChange={(v) => onUpdateParams({ packetLossPercent: v })}
              disabled={params.dynamicPathLoss}
              bgGradient="linear-gradient(to right, rgba(52, 211, 153, 0.25) 0%, rgba(251, 191, 36, 0.22) 40%, rgba(251, 113, 133, 0.28) 80%)"
            />
            <SliderRow label="Channel Bandwidth (B)" min={5} max={5000} step={5} value={channelMhz}
              format={formatChannelBandwidthMHz}
              onChange={(v) => onUpdateParams({ channelBandwidthHz: mhzToHz(v) })}
              bgGradient="linear-gradient(to right, rgba(251, 113, 133, 0.28) 0%, rgba(251, 191, 36, 0.22) 20%, rgba(52, 211, 153, 0.25) 60%)" />

            <div className="ck-divider" />

            <div className="ck-group-title">CACC Parameters</div>

            <div className="ck-slider">
              <div className="ck-slider-head">
                <span className="ck-slider-label">V2V Topology</span>
                <span className="ck-slider-value">{params.v2vTopology}</span>
              </div>
              <select
                className="ck-select"
                value={params.v2vTopology}
                onChange={(e) => onUpdateParams({ v2vTopology: e.target.value as 'PF' | 'L2A' | 'Hybrid' })}
                id="v2v-topology-select"
              >
                <option value="Hybrid">Hybrid (Default)</option>
                <option value="PF">Predecessor Following (PF)</option>
                <option value="L2A">Leader-to-All (L2A)</option>
              </select>
            </div>

            <SliderRow label="Reference Speed (v₀)" min={5} max={42} step={1} value={params.targetSpeed}
              format={formatSpeedMs} onChange={(v) => onUpdateParams({ targetSpeed: v })}
              bgGradient="linear-gradient(to right, rgba(52, 211, 153, 0.25) 0%, rgba(251, 191, 36, 0.22) 50%, rgba(251, 113, 133, 0.28) 90%)" />
            <SliderRow label="Time Headway (h)" min={0.5} max={3} step={0.1} value={params.timeHeadway}
              format={formatHeadway} onChange={(v) => onUpdateParams({ timeHeadway: v })}
              bgGradient="linear-gradient(to right, rgba(251, 113, 133, 0.3) 0%, rgba(251, 191, 36, 0.22) 35%, rgba(52, 211, 153, 0.25) 70%)" />
            <SliderRow label="Standstill Distance (s₀)" min={4} max={20} step={0.5} value={params.standstillDistance}
              format={formatStandstill} onChange={(v) => onUpdateParams({ standstillDistance: v })}
              bgGradient="linear-gradient(to right, rgba(251, 113, 133, 0.3) 0%, rgba(251, 191, 36, 0.22) 30%, rgba(52, 211, 153, 0.25) 60%)" />
            <SliderRow label="Platoon Size" min={1} max={10} value={followerCount}
              format={(v) => `${v} follower${v > 1 ? 's' : ''}`} onChange={onFollowerCountChange} />
          </div>
        )}

        {tab === 'scenarios' && (
          <div className="ck-form-group">

            <div className="ck-group-title">Live Disruptions</div>
            <div className="ck-btn-stack">
              <button className="ck-btn ck-btn-ghost" type="button" onClick={() => onTrigger('latencySpike')}>
                Inject Latency Spike
              </button>
              <button className="ck-btn ck-btn-ghost" type="button" onClick={() => onTrigger('packetDrop')}>
                Simulate Packet Drop
              </button>
              <button className="ck-btn ck-btn-danger" type="button" onClick={() => onTrigger('humanBrake')}>
                Trigger Human Braking
              </button>
            </div>
          </div>
        )}

        {tab === 'maneuvers' && (
          <div className="ck-form-group">
            <div className="ck-group-title">Manual Override</div>
            <div className="ck-manual-grid">
              <button className="ck-btn ck-btn-accel"
                onMouseDown={() => onThrottleBrake(0.7, 0)}
                onMouseUp={() => onThrottleBrake(0.4, 0)}
                onMouseLeave={() => onThrottleBrake(0.4, 0)}
                type="button">
                Throttle
              </button>
              <button className="ck-btn ck-btn-brake"
                onMouseDown={() => onThrottleBrake(0.05, 0.7)}
                onMouseUp={() => onThrottleBrake(0.4, 0)}
                onMouseLeave={() => onThrottleBrake(0.4, 0)}
                type="button">
                Brake
              </button>
            </div>

            <div className="ck-divider" />
            <div className="ck-group-title">Inter-Platoon / Overtake Swap</div>
            <div className="ck-form-group">
              <div className="ck-select-row">
                <span className="ck-select-label">Vehicle A</span>
                <select className="ck-select" value={selA} onChange={(e) => setFirstId(e.target.value)}>
                  {vehicleIds.map((id) => {
                    const lane = vehicleLaneMap.get(id) ?? 0
                    const platoon = String.fromCharCode(65 + lane)
                    return <option key={`a-${id}`} value={id}>[{platoon}] {id.replace('b_', '').toUpperCase()}</option>
                  })}
                </select>
              </div>
              <div className="ck-select-row">
                <span className="ck-select-label">Vehicle B</span>
                <select className="ck-select" value={selB} onChange={(e) => setSecondId(e.target.value)}>
                  {vehicleIds.map((id) => {
                    const lane = vehicleLaneMap.get(id) ?? 0
                    const platoon = String.fromCharCode(65 + lane)
                    return <option key={`b-${id}`} value={id}>[{platoon}] {id.replace('b_', '').toUpperCase()}</option>
                  })}
                </select>
              </div>
              <button
                className="ck-btn ck-btn-primary"
                disabled={!selA || !selB || selA === selB}
                onClick={() => onSwap(selA, selB)}
                type="button"
              >
                Initiate Swap / Overtake
              </button>
              <div className="ck-panel-sub" style={{ fontSize: '0.68rem', marginTop: '0.3rem', lineHeight: '1.3' }}>
                * Different lanes: initiates cooperative transfer. Same lane: initiates physical overtake swap.
              </div>
            </div>

            <div className="ck-divider" />
            <div className="ck-group-title">Single Vehicle Switch Lane</div>
            <div className="ck-form-group">
              <div className="ck-select-row">
                <span className="ck-select-label">Vehicle</span>
                <select className="ck-select" value={selSwitchVeh} onChange={(e) => setSwitchVeh(e.target.value)}>
                  {vehicleIds.map((id) => {
                    const lane = vehicleLaneMap.get(id) ?? 0
                    const platoon = String.fromCharCode(65 + lane)
                    return <option key={`switch-${id}`} value={id}>[{platoon}] {id.replace('b_', '').toUpperCase()}</option>
                  })}
                </select>
              </div>
              <div className="ck-select-row">
                <span className="ck-select-label">Target Lane</span>
                <select className="ck-select" value={selSwitchLane} onChange={(e) => setSwitchLaneVal(Number(e.target.value))}>
                  {lanes.map((laneIdx) => (
                    <option key={`lane-${laneIdx}`} value={laneIdx}>
                      Lane {String.fromCharCode(65 + laneIdx)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="ck-btn ck-btn-primary"
                disabled={!selSwitchVeh || vehicleLaneMap.get(selSwitchVeh) === selSwitchLane}
                onClick={() => onSwitchLane(selSwitchVeh, selSwitchLane)}
                type="button"
              >
                Initiate Lane Change
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky Bottom Footer: Always-visible Start/Stop controls ── */}
      <div className="ck-panel-footer">
        {/* START — big glowing button when idle */}
        {!running && (
          <button
            className="ck-start-hero"
            onClick={onStart}
            type="button"
            id="sim-start-btn"
          >
            <span style={{ fontSize: '1.1rem' }}>▶</span>
            Mulai Simulasi
          </button>
        )}

        {/* STOP — prominent red when running */}
        {running && (
          <button
            className="ck-stop-hero"
            onClick={onStop}
            type="button"
            id="sim-stop-btn"
          >
            <span style={{ fontSize: '1.1rem' }}>■</span>
            Stop &amp; Analisis
          </button>
        )}

        {/* Reset always visible as secondary action */}
        <div className="ck-panel-footer-row">
          <button
            className="ck-btn ck-btn-ghost"
            style={{ flex: 1, minHeight: '34px' }}
            onClick={onReset}
            type="button"
            id="sim-reset-btn"
          >
            ↺ Reset
          </button>
          <div style={{
            flex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 0.5rem',
            borderRadius: 'var(--r-xs)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            fontSize: '0.7rem',
            color: 'var(--muted-2)',
            gap: '0.35rem',
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: running ? 'var(--ok)' : 'var(--muted-2)',
              boxShadow: running ? '0 0 8px var(--ok)' : 'none',
              flexShrink: 0,
              animation: running ? 'blink 1.4s ease infinite' : 'none',
            }} />
            {running ? 'Simulasi Berjalan' : 'Simulasi Berhenti'}
          </div>
        </div>
      </div>
    </aside>
  )
}
