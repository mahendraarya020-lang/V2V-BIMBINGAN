import { useState } from 'react'
import type { SimulationParams, SimulationTelemetry, VehicleState } from '../types/sim'
import { formatChannelBandwidthHz, formatSpeedMs, platoonSpeedMs } from '../utils/units'
import { RocketIcon, SignalIcon } from './Icons'

type Props = {
  telemetry: SimulationTelemetry
  vehicles: VehicleState[]
  params: SimulationParams
}

function statusColor(label: string): string {
  switch (label) {
    case 'Stable': case 'Connected': case 'CACC': return 'ck-metric-ok'
    case 'Degraded': case 'ACC': return 'ck-metric-warn'
    case 'Disconnected': case 'Unstable': return 'ck-metric-bad'
    default: return ''
  }
}

function numColor(value: number, warnThreshold: number, badThreshold: number): string {
  if (value >= badThreshold) return 'ck-metric-bad'
  if (value >= warnThreshold) return 'ck-metric-warn'
  return 'ck-metric-ok'
}

function MetricBox({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="ck-metric-box">
      <span className="ck-metric-label">{label}</span>
      <strong className={`ck-metric-value ${cls}`}>{value}</strong>
    </div>
  )
}

export function TelemetryPanel({ telemetry, vehicles, params }: Props) {
  const [activeTab, setActiveTab] = useState<'dynamics' | 'network'>('dynamics')

  const commHealth = telemetry.v2vLink === 'Connected' ? 'Good' : telemetry.v2vLink === 'Degraded' ? 'Moderate' : 'Poor'
  const spacingCls = numColor(telemetry.maxSpacingError, 1, 1.5)
  const delayCls = numColor(telemetry.endToEndDelayMs, 20, 30)
  const hzCls = telemetry.effectiveHz >= 10 ? 'ck-metric-ok' : telemetry.effectiveHz >= 8 ? 'ck-metric-warn' : 'ck-metric-bad'
  const syncDevCls = numColor(telemetry.timestampDeviationMs, 4.0, 5.0)

  const displayedLoss = params.dynamicPathLoss ? telemetry.avgDynamicPacketLoss : params.packetLossPercent
  const lossCls = numColor(displayedLoss, 5, 15)
  const avgSpeedMs = platoonSpeedMs(telemetry)
  const bandwidthHz = params.channelBandwidthHz ?? 1_000_000_000

  return (
    <aside className="ck-panel">
      <div className="ck-panel-header">
        <div className="ck-panel-dot ck-panel-dot-blue" />
        <div>
          <div className="ck-panel-title">Telemetry HUD</div>
          <div className="ck-panel-sub">Real-time monitoring</div>
        </div>
      </div>

      <div className="ck-status-row" style={{ marginBottom: '0.6rem' }}>
        <div className={`ck-status-badge ${statusColor(telemetry.status)}`}>
          {telemetry.status}
        </div>
        <div className={`ck-status-badge ${statusColor(telemetry.v2vLink)}`}>
          {telemetry.v2vLink}
        </div>
        <div className={`ck-status-badge ${statusColor(telemetry.controlMode)}`}>
          {telemetry.controlMode}
        </div>
        <div className="ck-status-badge" title="V2V Communication Topology">
          {telemetry.v2vTopology}
        </div>
      </div>

      {/* Tabs Menu (Recommendation 4) */}
      <div className="ck-tabs" style={{ marginBottom: '0.85rem', width: '100%' }}>
        <button
          className={`ck-tab ${activeTab === 'dynamics' ? 'active' : ''}`}
          onClick={() => setActiveTab('dynamics')}
          style={{ flex: 1, padding: '6px 4px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          type="button"
        >
          <RocketIcon />
          <span>Dynamics</span>
        </button>
        <button
          className={`ck-tab ${activeTab === 'network' ? 'active' : ''}`}
          onClick={() => setActiveTab('network')}
          style={{ flex: 1, padding: '6px 4px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          type="button"
        >
          <SignalIcon />
          <span>5G Network</span>
        </button>
      </div>

      <div className="ck-tab-content">
        {activeTab === 'dynamics' ? (
          <div className="ck-form-group">
            <div className="ck-group-title">System Status</div>
            <div className="ck-metric-grid" style={{ marginBottom: '0.8rem' }}>
              <MetricBox label="OBU Nodes" value={`${vehicles.length}`} cls="ck-metric-ok" />
              <MetricBox
                label="Collisions"
                value={`${telemetry.collisionCount}`}
                cls={telemetry.collisionCount > 0 ? 'ck-metric-bad' : 'ck-metric-ok'}
              />
              <MetricBox
                label="Human Braking"
                value={telemetry.humanBrakingActive ? 'Active' : 'Idle'}
                cls={telemetry.humanBrakingActive ? 'ck-metric-bad' : ''}
              />
            </div>

            <div className="ck-divider" />

            <div className="ck-group-title">Stability Metrics</div>
            <div className="ck-metric-grid">
              <MetricBox label="Avg Speed (v̄)" value={formatSpeedMs(avgSpeedMs)} cls="ck-metric-ok" />
              <MetricBox label="SSI" value={`${telemetry.stringStabilityIndex}`} />
              <MetricBox label="Max Spacing Err" value={`${telemetry.maxSpacingError.toFixed(2)} m`} cls={spacingCls} />
              <MetricBox label="Spacing Error" value={`${telemetry.spacingError.toFixed(2)} m`} />
            </div>
          </div>
        ) : (
          <div className="ck-form-group">
            <div className="ck-group-title">5G Channel & V2X Quality</div>
            <div className="ck-metric-grid">
              <MetricBox label="RSU Link" value={commHealth} cls={statusColor(telemetry.v2vLink)} />
              <MetricBox label="E2E Delay" value={`${telemetry.endToEndDelayMs.toFixed(1)} ms`} cls={delayCls} />
              <MetricBox label="Net Delay" value={`${telemetry.networkDelayMs} ms`} cls={delayCls} />
              <MetricBox label="Update Rate" value={`${telemetry.effectiveHz.toFixed(0)} Hz`} cls={hzCls} />
              <MetricBox label="Time Sync Dev" value={`${telemetry.timestampDeviationMs.toFixed(2)} ms`} cls={syncDevCls} />
              <MetricBox label="RSU Signal" value={`${telemetry.rsuSignalDbm} dBm`} />
              <MetricBox label="Channel Bandwidth (B)" value={formatChannelBandwidthHz(bandwidthHz)} />
              <MetricBox
                label={params.dynamicPathLoss ? 'Avg Path Loss' : 'Packet Loss (PLR)'}
                value={`${displayedLoss.toFixed(1)} %`}
                cls={lossCls}
              />
              <MetricBox label="Bandwidth Util" value={`${telemetry.bandwidthUtilization.toFixed(3)} %`} />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
