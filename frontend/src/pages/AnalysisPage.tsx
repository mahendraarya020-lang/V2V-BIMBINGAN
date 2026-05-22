import type React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalysisData, SimulationHistory } from '../types/sim'

type Props = {
  analysis: AnalysisData
  meta?: SimulationHistory
  onClose: () => void
}

type ScoreItem = {
  label: string
  target: string
  measured: string
  pass: boolean
  reference: string
}

const COLORS = {
  leader: '#16a34a',
  f1: '#2563eb',
  f2: '#7c3aed',
  f3: '#ea580c',
  delay: '#d97706',
  loss: '#dc2626',
  ssi: '#059669',
  rsu: '#0284c7',
  spacing: '#ea580c',
}

const GRID_COLOR = 'rgba(148,163,184,0.28)'
const AXIS_STYLE = { fill: '#64748b', fontSize: 11 }
const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  color: '#0f172a',
  fontSize: 12,
}

function formatTime(t: number) {
  return `${t.toFixed(1)}s`
}

function calcAvg(values: number[]): string {
  if (values.length === 0) return '-'
  const avg = values.reduce((sum, current) => sum + current, 0) / values.length
  return avg.toFixed(3)
}

// ── Zoom state per-chart ──────────────────────────────────────────────────────
type ZoomState = {
  left: number | 'dataMin'
  right: number | 'dataMax'
  refLeft: number | null
  refRight: number | null
  selecting: boolean
}

function makeZoom(): ZoomState {
  return { left: 'dataMin', right: 'dataMax', refLeft: null, refRight: null, selecting: false }
}

// ── ZoomableChart wrapper ─────────────────────────────────────────────────────
type ZoomableChartProps = {
  title: string
  subtitle: string
  data: AnalysisData['series']
  renderLines: (zoom: ZoomState, handlers: ZoomHandlers) => React.ReactNode
}

type ZoomHandlers = {
  onMouseDown: (e: { activeLabel?: number }) => void
  onMouseMove: (e: { activeLabel?: number }) => void
  onMouseUp: () => void
  zoom: ZoomState
  reset: () => void
}

function ZoomableChartCard({ title, subtitle, data, renderLines }: ZoomableChartProps) {
  const [zoom, setZoom] = useState<ZoomState>(makeZoom())

  const handlers: ZoomHandlers = {
    zoom,
    reset: () => setZoom(makeZoom()),

    onMouseDown: (e) => {
      if (e?.activeLabel === undefined) return
      setZoom((prev) => ({ ...prev, refLeft: e.activeLabel as number, refRight: null, selecting: true }))
    },

    onMouseMove: (e) => {
      if (!zoom.selecting || e?.activeLabel === undefined) return
      setZoom((prev) => ({ ...prev, refRight: e.activeLabel as number }))
    },

    onMouseUp: () => {
      setZoom((prev) => {
        if (!prev.selecting || prev.refLeft === null || prev.refRight === null) {
          return { ...prev, selecting: false }
        }
        const [lo, hi] = prev.refLeft < prev.refRight
          ? [prev.refLeft, prev.refRight]
          : [prev.refRight, prev.refLeft]

        // Need at least a 0.5s selection to trigger zoom
        if (hi - lo < 0.5) return { ...prev, selecting: false, refLeft: null, refRight: null }
        return { left: lo, right: hi, refLeft: null, refRight: null, selecting: false }
      })
    },
  }

  const isZoomed = zoom.left !== 'dataMin' || zoom.right !== 'dataMax'
  const domainX: [number | 'dataMin', number | 'dataMax'] = [zoom.left, zoom.right]

  // Filter data to zoomed window for performance
  const visibleData = isZoomed
    ? data.filter((s) => s.t >= (zoom.left as number) && s.t <= (zoom.right as number))
    : data

  return (
    <div className="analysis-chart-card">
      <div className="chart-title">
        <div>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
        <div className="chart-zoom-controls">
          {isZoomed && (
            <button
              type="button"
              className="chart-zoom-reset"
              onClick={handlers.reset}
              title="Reset zoom"
            >
              ↺ Reset
            </button>
          )}
          <span className="chart-zoom-hint">
            {isZoomed ? `${(zoom.left as number).toFixed(1)}s – ${(zoom.right as number).toFixed(1)}s` : 'Drag to zoom'}
          </span>
        </div>
      </div>
      <div className="chart-body" style={{ userSelect: 'none' }}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={visibleData}
            margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            onMouseDown={(e) => handlers.onMouseDown(e as { activeLabel?: number })}
            onMouseMove={(e) => handlers.onMouseMove(e as { activeLabel?: number })}
            onMouseUp={handlers.onMouseUp}
          >
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              tickFormatter={formatTime}
              tick={AXIS_STYLE}
              domain={domainX}
              allowDataOverflow
              type="number"
            />
            {renderLines(zoom, handlers)}
            {/* Selection brush overlay */}
            {zoom.selecting && zoom.refLeft !== null && zoom.refRight !== null && (
              <ReferenceArea
                x1={zoom.refLeft}
                x2={zoom.refRight}
                strokeOpacity={0.4}
                stroke="#67e8f9"
                fill="rgba(103, 232, 249, 0.08)"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function MetricBadge({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="metric-badge">
      <small>{label}</small>
      <strong>
        {value}
        {unit && <span className="unit"> {unit}</span>}
      </strong>
    </div>
  )
}

function buildScorecard(meta: SimulationHistory | undefined, series: AnalysisData['series']): ScoreItem[] {
  const avgDelay = meta?.avgDelayMs ?? (series.length ? series.reduce((sum, sample) => sum + sample.delayMs, 0) / series.length : 0)
  const maxSpacing = meta?.maxSpacingError ?? (series.length ? Math.max(...series.map((sample) => sample.spacingError)) : 0)
  const avgSSI = meta?.avgStringStability ?? (series.length ? series.reduce((sum, sample) => sum + sample.stringStabilityIndex, 0) / series.length : 0)
  const pktLoss = meta?.packetLossPercent ?? 0
  const collisions = meta?.collisionCount ?? 0
  const hz = meta?.avgUpdateHz ?? 0

  return [
    {
      label: 'E2E Delay',
      target: '<= 200 ms',
      measured: `${avgDelay.toFixed(1)} ms`,
      pass: avgDelay <= 200,
      reference: 'CD-2 / ITU-R M.2150',
    },
    {
      label: 'Packet Loss',
      target: '<= 1%',
      measured: `${pktLoss.toFixed(2)}%`,
      pass: pktLoss <= 1,
      reference: 'CD-2',
    },
    {
      label: 'Spacing Error',
      target: '<= 1.5 m',
      measured: `${maxSpacing.toFixed(3)} m`,
      pass: maxSpacing <= 1.5,
      reference: 'CD-2 / ISO 15622',
    },
    {
      label: 'Update Rate',
      target: '>= 10 Hz',
      measured: `${hz.toFixed(0)} Hz`,
      pass: hz >= 10,
      reference: 'CD-2',
    },
    {
      label: 'No Collision',
      target: '0',
      measured: `${collisions}`,
      pass: collisions === 0,
      reference: 'Safety continuity',
    },
    {
      label: 'SSI',
      target: '>= 0.8',
      measured: avgSSI.toFixed(3),
      pass: avgSSI >= 0.8,
      reference: 'String stability',
    },
  ]
}

function exportCsv(analysis: AnalysisData, meta?: SimulationHistory): void {
  const headers = ['t_sec', 'delay_ms', 'packet_loss_pct', 'spacing_error_m', 'ssi', 'rsu_dbm',
    'speed_leader_ms', 'speed_f1_ms', 'speed_f2_ms', 'speed_f3_ms']
  const rows = analysis.series.map((sample) => [
    sample.t.toFixed(3),
    sample.delayMs.toFixed(3),
    sample.packetLoss.toFixed(3),
    sample.spacingError.toFixed(3),
    sample.stringStabilityIndex.toFixed(3),
    sample.rsuSignalDbm.toFixed(3),
    sample.speedLeader.toFixed(3),
    sample.speedF1.toFixed(3),
    sample.speedF2.toFixed(3),
    sample.speedF3.toFixed(3),
  ].join(';'))

  const metaRows = meta ? [
    `# session_id;${analysis.id}`,
    `# created_at;${meta.createdAt}`,
    `# duration_sec;${meta.durationSec.toFixed(3)}`,
    `# avg_delay_ms;${meta.avgDelayMs.toFixed(3)}`,
    `# avg_spacing_error_m;${meta.avgSpacingError.toFixed(3)}`,
    `# max_spacing_error_m;${meta.maxSpacingError.toFixed(3)}`,
    `# avg_ssi;${meta.avgStringStability.toFixed(3)}`,
    `# packet_loss_pct;${meta.packetLossPercent.toFixed(3)}`,
    `# collision_count;${meta.collisionCount}`,
    `# avg_update_hz;${meta.avgUpdateHz.toFixed(3)}`,
    `# acc_fallback_pct;${meta.accFallbackPercent.toFixed(3)}`,
    '',
  ] : [`# session_id;${analysis.id}`, '']

  const csv = [...metaRows, headers.join(';'), ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${analysis.id}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AnalysisPage({ analysis, meta, onClose }: Props) {
  const navigate = useNavigate()
  const { series } = analysis

  if (!series || series.length < 2) {
    return (
      <div className="analysis-empty">
        <div className="card">
          <span className="eyebrow">Analysis unavailable</span>
          <h2>Data analisis belum cukup</h2>
          <p>Jalankan simulasi minimal beberapa detik sebelum Stop agar data terkumpul.</p>
          <button className="btn primary" onClick={onClose}>
            Kembali ke Simulasi
          </button>
        </div>
      </div>
    )
  }

  const scorecard = buildScorecard(meta, series)
  const overallPass = scorecard.every((item) => item.pass)

  return (
    <main className="analysis-page">
      <header className="analysis-header card">
        <div>
          <span className="eyebrow">Experiment report</span>
          <h2>Analysis Dashboard</h2>
          <p className="analysis-id">Session: {analysis.id}</p>
        </div>
        <div className="analysis-header-actions">
          <button
            className="btn ghost no-print"
            onClick={() => exportCsv(analysis, meta)}
            title="Download as semicolon-delimited CSV (Excel-compatible)"
          >
            ⬇ Export CSV
          </button>
          <button
            className="btn ghost no-print"
            onClick={() => window.print()}
            title="Print or save as PDF"
          >
            🖨 Print to PDF
          </button>
          <button className="btn ghost no-print" onClick={onClose}>
            ← Kembali
          </button>
          <button className="btn ghost no-print" onClick={() => navigate('/dashboard')}>
            Dashboard
          </button>
        </div>
      </header>

      <section className="metrics-row">
        <MetricBadge label="Durasi" value={meta?.durationSec ?? `~${series[series.length - 1].t.toFixed(0)}`} unit="s" />
        <MetricBadge label="Avg E2E Delay" value={meta?.avgDelayMs?.toFixed(1) ?? calcAvg(series.map((sample) => sample.delayMs))} unit="ms" />
        <MetricBadge label="Avg Spacing Error" value={meta?.avgSpacingError?.toFixed(3) ?? calcAvg(series.map((sample) => sample.spacingError))} unit="m" />
        <MetricBadge label="Avg SSI" value={meta?.avgStringStability?.toFixed(4) ?? calcAvg(series.map((sample) => sample.stringStabilityIndex))} />
        <MetricBadge label="Packet Loss" value={meta?.packetLossPercent?.toFixed(2) ?? calcAvg(series.map((sample) => sample.packetLoss))} unit="%" />
      </section>

      <section className="scorecard card">
        <div className="scorecard-header">
          <div>
            <strong>Verification Scorecard</strong>
            <p>Ringkasan pemenuhan target eksperimen.</p>
          </div>
          <span className={overallPass ? 'badge ok' : 'badge bad'}>
            {overallPass ? 'All targets passed' : `${scorecard.filter((item) => item.pass).length}/${scorecard.length} passed`}
          </span>
        </div>
        <div className="scorecard-grid">
          {scorecard.map((item) => (
            <div key={item.label} className={`score-item ${item.pass ? 'pass' : 'fail'}`}>
              <div className="score-header">
                <span className="score-label">{item.label}</span>
                <span className="score-status">{item.pass ? 'PASS' : 'FAIL'}</span>
              </div>
              <div className="score-body">
                <span>Target: <strong>{item.target}</strong></span>
                <span>Measured: <strong>{item.measured}</strong></span>
              </div>
              <small className="score-ref">{item.reference}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="analysis-grid">

        {/* ── End-to-End Delay ── */}
        <ZoomableChartCard
          title="End-to-End Delay"
          subtitle="Network delay over time"
          data={series}
          renderLines={() => (
            <>
              <YAxis tick={AXIS_STYLE} label={{ value: 'Delay (ms)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value} ms`, 'Delay']} />
              <ReferenceLine y={20} stroke="#dc2626" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="delayMs" stroke={COLORS.delay} dot={false} strokeWidth={2} name="Delay" isAnimationActive={false} />
            </>
          )}
        />

        {/* ── Packet Loss ── */}
        <ZoomableChartCard
          title="Packet Loss Ratio"
          subtitle="Packet loss trend during disruption"
          data={series}
          renderLines={() => (
            <>
              <YAxis tick={AXIS_STYLE} label={{ value: 'Loss (%)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Packet Loss']} />
              <ReferenceLine y={1} stroke="#dc2626" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="packetLoss" stroke={COLORS.loss} dot={false} strokeWidth={2} name="Packet Loss" isAnimationActive={false} />
            </>
          )}
        />

        {/* ── Vehicle Speed Profile ── */}
        <ZoomableChartCard
          title="Vehicle Speed Profile"
          subtitle="Leader and follower response"
          data={series}
          renderLines={() => (
            <>
              <YAxis tick={AXIS_STYLE} label={{ value: 'Speed (m/s)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value} m/s`]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="speedLeader" stroke={COLORS.leader} dot={false} strokeWidth={2} name="Leader" isAnimationActive={false} />
              <Line type="monotone" dataKey="speedF1" stroke={COLORS.f1} dot={false} strokeWidth={1.5} name="Follower 1" isAnimationActive={false} />
              <Line type="monotone" dataKey="speedF2" stroke={COLORS.f2} dot={false} strokeWidth={1.5} name="Follower 2" isAnimationActive={false} />
              <Line type="monotone" dataKey="speedF3" stroke={COLORS.f3} dot={false} strokeWidth={1.5} name="Follower 3" isAnimationActive={false} />
            </>
          )}
        />

        {/* ── Spacing Error ── */}
        <ZoomableChartCard
          title="Spacing Error"
          subtitle="Longitudinal formation accuracy"
          data={series}
          renderLines={() => (
            <>
              <YAxis tick={AXIS_STYLE} label={{ value: 'Error (m)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${Number(value).toFixed(3)} m`, 'Spacing Error']} />
              <ReferenceLine y={1.5} stroke="#dc2626" strokeDasharray="5 5" />
              <ReferenceLine y={0} stroke="#16a34a" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="spacingError" stroke={COLORS.spacing} dot={false} strokeWidth={2} name="Spacing Error" isAnimationActive={false} />
            </>
          )}
        />

        {/* ── String Stability Index ── */}
        <ZoomableChartCard
          title="String Stability Index"
          subtitle="Formation stability quality"
          data={series}
          renderLines={() => (
            <>
              <YAxis tick={AXIS_STYLE} domain={[0, 1]} label={{ value: 'SSI', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [Number(value).toFixed(4), 'SSI']} />
              <ReferenceLine y={0.8} stroke="#16a34a" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="stringStabilityIndex" stroke={COLORS.ssi} dot={false} strokeWidth={2} name="SSI" isAnimationActive={false} />
            </>
          )}
        />

        {/* ── RSU Signal Strength ── */}
        <ZoomableChartCard
          title="RSU Signal Strength"
          subtitle="Vehicle-to-infrastructure signal quality"
          data={series}
          renderLines={() => (
            <>
              <YAxis tick={AXIS_STYLE} label={{ value: 'Signal (dBm)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${Number(value).toFixed(1)} dBm`, 'RSU Signal']} />
              <ReferenceLine y={-80} stroke="#dc2626" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="rsuSignalDbm" stroke={COLORS.rsu} dot={false} strokeWidth={2} name="RSU Signal" isAnimationActive={false} />
            </>
          )}
        />
      </div>

      {/* ── Telemetry Data Table ────────────────────────────────────────── */}
      <section className="analysis-table-section card" id="telemetry-table">
        <div className="analysis-table-header">
          <div>
            <strong>Telemetry Log</strong>
            <p>Recorded data at every simulation tick — {series.length} samples</p>
          </div>
          <span className="analysis-table-badge">{series.length} rows</span>
        </div>
        <div className="analysis-table-scroll">
          <table className="analysis-table">
            <thead>
              <tr>
                <th>Time (s)</th>
                <th>Delay (ms)</th>
                <th>Pkt Loss (%)</th>
                <th>Spacing Err (m)</th>
                <th>SSI</th>
                <th>RSU (dBm)</th>
                <th>Leader (m/s)</th>
                <th>F1 (m/s)</th>
                <th>F2 (m/s)</th>
                <th>F3 (m/s)</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s, i) => (
                <tr key={s.t} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                  <td className="td-time">{s.t.toFixed(2)}</td>
                  <td className={s.delayMs > 20 ? 'td-warn' : ''}>{s.delayMs.toFixed(1)}</td>
                  <td className={s.packetLoss > 1 ? 'td-warn' : ''}>{s.packetLoss.toFixed(2)}</td>
                  <td className={Math.abs(s.spacingError) > 1.5 ? 'td-warn' : ''}>{s.spacingError.toFixed(3)}</td>
                  <td className={s.stringStabilityIndex < 0.8 ? 'td-warn' : 'td-ok'}>{s.stringStabilityIndex.toFixed(4)}</td>
                  <td>{s.rsuSignalDbm.toFixed(1)}</td>
                  <td>{s.speedLeader.toFixed(2)}</td>
                  <td>{s.speedF1.toFixed(2)}</td>
                  <td>{s.speedF2.toFixed(2)}</td>
                  <td>{s.speedF3.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
