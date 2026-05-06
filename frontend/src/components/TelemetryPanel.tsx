import type { SimulationParams, SimulationTelemetry, VehicleState } from '../types/sim'

type Props = {
  telemetry: SimulationTelemetry
  vehicles: VehicleState[]
  bandwidthMbps: number
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

export function TelemetryPanel({ telemetry, vehicles, bandwidthMbps, params }: Props) {
  const commHealth = telemetry.v2vLink === 'Connected' ? 'Good' : telemetry.v2vLink === 'Degraded' ? 'Moderate' : 'Poor'
  const spacingCls = numColor(telemetry.maxSpacingError, 1, 1.5)
  const delayCls = numColor(telemetry.endToEndDelayMs, 20, 30)
  const hzCls = telemetry.effectiveHz >= 10 ? 'ck-metric-ok' : telemetry.effectiveHz >= 8 ? 'ck-metric-warn' : 'ck-metric-bad'

  // Displayed packet loss: use avgDynamicPacketLoss when dynamic mode ON
  const displayedLoss = params.dynamicPathLoss ? telemetry.avgDynamicPacketLoss : params.packetLossPercent
  const lossCls = numColor(displayedLoss, 5, 15)

  return (
    <aside className="ck-panel">
      <div className="ck-panel-header">
        <div className="ck-panel-dot ck-panel-dot-blue" />
        <div>
          <div className="ck-panel-title">Telemetry HUD</div>
          <div className="ck-panel-sub">Real-time monitoring</div>
        </div>
      </div>

      {/* Status badges row */}
      <div className="ck-status-row">
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

      {/* System metrics 2-col grid */}
      <div className="ck-section-title">System Status</div>
      <div className="ck-metric-grid">
        <MetricBox label="OBU Nodes" value={`${vehicles.length}`} cls="ck-metric-ok" />
        <MetricBox label="Collisions"
          value={`${telemetry.collisionCount}`}
          cls={telemetry.collisionCount > 0 ? 'ck-metric-bad' : 'ck-metric-ok'} />
        <MetricBox label="Human Braking"
          value={telemetry.humanBrakingActive ? 'Active' : 'Idle'}
          cls={telemetry.humanBrakingActive ? 'ck-metric-bad' : ''} />
        <MetricBox label="RSU Link" value={commHealth} cls={statusColor(telemetry.v2vLink)} />
      </div>

      <div className="ck-divider" />
      <div className="ck-section-title">Network Quality</div>
      <div className="ck-metric-grid">
        <MetricBox label="E2E Delay" value={`${telemetry.endToEndDelayMs.toFixed(1)} ms`} cls={delayCls} />
        <MetricBox label="Net Delay" value={`${telemetry.networkDelayMs} ms`} cls={delayCls} />
        <MetricBox label="Update Rate" value={`${telemetry.effectiveHz.toFixed(0)} Hz`} cls={hzCls} />
        <MetricBox label="RSU Signal" value={`${telemetry.rsuSignalDbm} dBm`} />
        <MetricBox label="Bandwidth" value={`${bandwidthMbps} Mbps`} />
        <MetricBox
          label={params.dynamicPathLoss ? 'Avg Path Loss' : 'Packet Loss'}
          value={`${displayedLoss.toFixed(1)}%`}
          cls={lossCls}
        />
      </div>

      <div className="ck-divider" />
      <div className="ck-section-title">Stability Metrics</div>
      <div className="ck-metric-grid">
        <MetricBox label="Avg Speed" value={`${telemetry.averagePlatoonSpeedKmh.toFixed(1)} km/h`} cls="ck-metric-ok" />
        <MetricBox label="SSI" value={`${telemetry.stringStabilityIndex}`} />
        <MetricBox label="Max Spacing Err" value={`${telemetry.maxSpacingError.toFixed(2)} m`} cls={spacingCls} />
        <MetricBox label="Spacing Error" value={`${telemetry.spacingError.toFixed(2)} m`} />
      </div>
    </aside>
  )
}

