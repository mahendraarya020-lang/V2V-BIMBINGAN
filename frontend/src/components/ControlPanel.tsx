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
}

type Tab = 'network' | 'scenarios' | 'maneuvers'

const presets: { label: string; desc: string; params: Partial<SimulationParams> }[] = [
  {
    label: 'Nominal',
    desc: 'Stable baseline',
    params: { latencyMs: 10, packetLossPercent: 0.2, channelBandwidthHz: 1_000_000_000, timeHeadway: 1 },
  },
  {
    label: 'Congested',
    desc: 'High-density network',
    params: { latencyMs: 16, packetLossPercent: 3, channelBandwidthHz: 400_000_000, timeHeadway: 1.3 },
  },
  {
    label: 'Stress Test',
    desc: 'ACC fallback mode',
    params: { latencyMs: 20, packetLossPercent: 12, channelBandwidthHz: 100_000_000, timeHeadway: 1.6 },
  },
]

function SliderRow({
  label,
  min, max, step = 1, value, format, onChange, disabled,
}: {
  label: string; min: number; max: number; step?: number
  value: number; format: (v: number) => string; onChange: (v: number) => void
  disabled?: boolean
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
      />
    </div>
  )
}

export function ControlPanel({
  params, vehicles, followerCount,
  onUpdateParams, onFollowerCountChange, onThrottleBrake, onTrigger, onSwap,
}: Props) {
  const [tab, setTab] = useState<Tab>('network')
  const [firstId, setFirstId] = useState('')
  const [secondId, setSecondId] = useState('')
  const channelMhz = hzToMhz(params.channelBandwidthHz ?? 1_000_000_000)
  const vehicleIds = vehicles.map(v => v.id)
  // Build a map from vehicle id to its actual platoon lane for correct labeling
  const vehicleLaneMap = new Map(vehicles.map(v => [v.id, v.y]))
  const selA = firstId && vehicleIds.includes(firstId) ? firstId : (vehicleIds[0] ?? '')
  const selB = secondId && vehicleIds.includes(secondId) ? secondId : (vehicleIds[1] ?? '')

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
              format={formatLatency} onChange={(v) => onUpdateParams({ latencyMs: v })} />
            <SliderRow
              label="Packet Loss Rate (PLR)" min={0} max={30} step={0.5} value={params.packetLossPercent}
              format={formatPlr} onChange={(v) => onUpdateParams({ packetLossPercent: v })}
              disabled={params.dynamicPathLoss}
            />
            <SliderRow label="Channel Bandwidth (B)" min={5} max={1000} step={5} value={channelMhz}
              format={formatChannelBandwidthMHz}
              onChange={(v) => onUpdateParams({ channelBandwidthHz: mhzToHz(v) })} />

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
              format={formatSpeedMs} onChange={(v) => onUpdateParams({ targetSpeed: v })} />
            <SliderRow label="Time Headway (h)" min={0.5} max={3} step={0.1} value={params.timeHeadway}
              format={formatHeadway} onChange={(v) => onUpdateParams({ timeHeadway: v })} />
            <SliderRow label="Standstill Distance (s₀)" min={4} max={20} step={0.5} value={params.standstillDistance}
              format={formatStandstill} onChange={(v) => onUpdateParams({ standstillDistance: v })} />
            <SliderRow label="Platoon Size" min={1} max={10} value={followerCount}
              format={(v) => `${v} follower${v > 1 ? 's' : ''}`} onChange={onFollowerCountChange} />
          </div>
        )}

        {tab === 'scenarios' && (
          <div className="ck-form-group">
            <div className="ck-group-title">Network Presets</div>
            <div className="ck-preset-grid">
              {presets.map((p) => (
                <button key={p.label} className="ck-preset-btn" type="button"
                  onClick={() => onUpdateParams(p.params)}>
                  <span className="ck-preset-label">{p.label}</span>
                  <span className="ck-preset-desc">{p.desc}</span>
                </button>
              ))}
            </div>

            <div className="ck-divider" />
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
            <div className="ck-group-title">Vehicle Transfer</div>
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
                Initiate Transfer
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
