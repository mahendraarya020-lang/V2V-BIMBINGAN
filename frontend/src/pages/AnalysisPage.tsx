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
  theme?: 'dark' | 'light'
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
  leader: '#34d399', // Bright emerald leader color
  f1: '#6366f1',     // Platoon A Indigo
  f2: '#818cf8',     // Platoon A Follower 2
  f3: '#a5b4fc',     // Platoon A Follower 3
  delay: '#d97706',
  loss: '#dc2626',
  ssi: '#059669',
  rsu: '#0284c7',
  spacing: '#ea580c',
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
  isLight: boolean
  renderLines: (zoom: ZoomState, handlers: ZoomHandlers, axisStyle: { fill: string; fontSize: number }, tooltipStyle: React.CSSProperties) => React.ReactNode
}

type ZoomHandlers = {
  onMouseDown: (e: { activeLabel?: number }) => void
  onMouseMove: (e: { activeLabel?: number }) => void
  onMouseUp: () => void
  zoom: ZoomState
  reset: () => void
}

function ZoomableChartCard({ title, subtitle, data, isLight, renderLines }: ZoomableChartProps) {
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

  const gridColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.28)'
  const axisStyle = { fill: isLight ? '#475569' : '#94a3b8', fontSize: 11 }
  const tooltipStyle = isLight ? {
    backgroundColor: '#ffffff',
    border: '1px solid rgba(15, 23, 42, 0.1)',
    borderRadius: 8,
    color: '#0f172a',
    fontSize: 12,
  } : {
    backgroundColor: '#18181b',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    color: '#f4f4f5',
    fontSize: 12,
  }

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
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              tickFormatter={formatTime}
              tick={axisStyle}
              domain={domainX}
              allowDataOverflow
              type="number"
            />
            {renderLines(zoom, handlers, axisStyle, tooltipStyle)}
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



function exportExcel(analysis: AnalysisData, meta?: SimulationHistory): void {
  // Styles aligned with corporate emerald-green theme
  const greenHeaderStyle = "background-color: #047857; color: #ffffff; font-family: 'Segoe UI', sans-serif; font-size: 11px; font-weight: bold; text-align: left; padding: 8px; border: 1px solid #d1d5db;";
  const greenTitleStyle = "background-color: #065f46; color: #ffffff; font-family: 'Segoe UI', sans-serif; font-size: 16px; font-weight: bold; text-align: center; padding: 12px; border: 1px solid #d1d5db;";
  const cellStyle = "padding: 6px; border: 1px solid #e5e7eb; font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #374151;";
  const headerStyle = "background-color: #f3f4f6; font-family: 'Segoe UI', sans-serif; font-weight: bold; padding: 6px; border: 1px solid #d1d5db; font-size: 11px; color: #1f2937;";
  const passStyle = "background-color: #d1fae5; color: #065f46; font-family: 'Segoe UI', sans-serif; font-weight: bold; text-align: center; border: 1px solid #e5e7eb; font-size: 11px;";
  const failStyle = "background-color: #fee2e2; color: #991b1b; font-family: 'Segoe UI', sans-serif; font-weight: bold; text-align: center; border: 1px solid #e5e7eb; font-size: 11px;";

  const scorecard = buildScorecard(meta, analysis.series);
  const overallPass = scorecard.every((item) => item.pass);

  // 1. Downsample the time series to exactly 15 key points for the QuickChart URLs to keep them safe and short
  const targetSamplesCount = 15;
  const originalSeries = analysis.series;
  const downsampled: typeof originalSeries = [];
  if (originalSeries.length <= targetSamplesCount) {
    downsampled.push(...originalSeries);
  } else {
    for (let i = 0; i < targetSamplesCount; i++) {
      const idx = Math.floor((i * (originalSeries.length - 1)) / (targetSamplesCount - 1));
      downsampled.push(originalSeries[idx]);
    }
  }

  // 2. Generate QuickChart configs
  const speedChartConfig = {
    type: 'line',
    data: {
      labels: downsampled.map((s) => `${s.t.toFixed(1)}s`),
      datasets: [
        {
          label: 'Leader',
          data: downsampled.map((s) => Number(s.speedLeader.toFixed(2))),
          borderColor: '#34d399', // Bright emerald leader color
          fill: false,
          borderWidth: 2.5,
          pointRadius: 2,
        },
        {
          label: 'F1',
          data: downsampled.map((s) => Number(s.speedF1.toFixed(2))),
          borderColor: '#6366f1', // Platoon A Indigo
          fill: false,
          borderWidth: 1.5,
          pointRadius: 2,
        },
        {
          label: 'F2',
          data: downsampled.map((s) => Number(s.speedF2.toFixed(2))),
          borderColor: '#818cf8', // Platoon A Follower 2
          fill: false,
          borderWidth: 1.5,
          pointRadius: 2,
        },
        {
          label: 'F3',
          data: downsampled.map((s) => Number(s.speedF3.toFixed(2))),
          borderColor: '#a5b4fc', // Platoon A Follower 3
          fill: false,
          borderWidth: 1.5,
          pointRadius: 2,
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: 'Vehicle Speed Profile (m/s)',
        fontColor: '#0f172a',
        fontSize: 13,
        fontFamily: 'Segoe UI',
      },
      legend: {
        position: 'bottom',
        labels: { fontSize: 9, boxWidth: 10, fontFamily: 'Segoe UI' },
      },
      scales: {
        xAxes: [{ scaleLabel: { display: true, labelString: 'Time (s)', fontSize: 9, fontFamily: 'Segoe UI' } }],
        yAxes: [{ scaleLabel: { display: true, labelString: 'Speed (m/s)', fontSize: 9, fontFamily: 'Segoe UI' } }],
      },
    },
  };

  const netChartConfig = {
    type: 'line',
    data: {
      labels: downsampled.map((s) => `${s.t.toFixed(1)}s`),
      datasets: [
        {
          label: 'Spacing Error (m)',
          data: downsampled.map((s) => Number(s.spacingError.toFixed(3))),
          borderColor: '#ea580c',
          fill: false,
          borderWidth: 2,
          pointRadius: 2,
        },
        {
          label: 'E2E Delay (ms)',
          data: downsampled.map((s) => Number(s.delayMs.toFixed(1))),
          borderColor: '#d97706',
          fill: false,
          borderWidth: 2,
          pointRadius: 2,
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: 'Spacing Error & E2E Delay',
        fontColor: '#0f172a',
        fontSize: 13,
        fontFamily: 'Segoe UI',
      },
      legend: {
        position: 'bottom',
        labels: { fontSize: 9, boxWidth: 10, fontFamily: 'Segoe UI' },
      },
      scales: {
        xAxes: [{ scaleLabel: { display: true, labelString: 'Time (s)', fontSize: 9, fontFamily: 'Segoe UI' } }],
        yAxes: [{ scaleLabel: { display: true, labelString: 'Measured Metrics', fontSize: 9, fontFamily: 'Segoe UI' } }],
      },
    },
  };

  const speedChartUrl = `https://quickchart.io/chart?w=380&h=240&bkg=white&c=${encodeURIComponent(JSON.stringify(speedChartConfig))}`;
  const netChartUrl = `https://quickchart.io/chart?w=380&h=240&bkg=white&c=${encodeURIComponent(JSON.stringify(netChartConfig))}`;

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Simulation Report</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Segoe UI', sans-serif; }
        .num { mso-number-format:"0\\.000"; }
        .num-2 { mso-number-format:"0\\.00"; }
        .num-1 { mso-number-format:"0\\.0"; }
        .num-int { mso-number-format:"0"; }
      </style>
    </head>
    <body>
      <table style="border-collapse: collapse;">
        <!-- Title Block -->
        <tr>
          <td colspan="10" style="${greenTitleStyle}">5G V2V PLATOONING SIMULATION REPORT</td>
        </tr>
        <tr><td colspan="10" style="height: 15px;"></td></tr>

        <!-- Side-by-side Overview and Scorecard -->
        <tr>
          <td colspan="4" style="${greenHeaderStyle}">OVERVIEW</td>
          <td style="width: 25px;"></td>
          <td colspan="5" style="${greenHeaderStyle}">BUDGET VS. ACTUAL TARGETS (VERIFICATION SCORECARD)</td>
        </tr>
        
        <tr>
          <td style="${headerStyle}">Session ID</td>
          <td colspan="3" style="${cellStyle}">${analysis.id}</td>
          <td></td>
          <td style="${headerStyle}">Experiment Metric</td>
          <td style="${headerStyle}">Safety Target</td>
          <td style="${headerStyle}">Measured Value</td>
          <td style="${headerStyle}">Status</td>
          <td style="${headerStyle}">Reference Standard</td>
        </tr>
        
        <tr>
          <td style="${headerStyle}">Created At</td>
          <td colspan="3" style="${cellStyle}">${meta?.createdAt ?? new Date().toLocaleString()}</td>
          <td></td>
          <td style="${cellStyle}">${scorecard[0].label}</td>
          <td style="${cellStyle}">${scorecard[0].target}</td>
          <td style="${cellStyle}">${scorecard[0].measured}</td>
          <td style="${scorecard[0].pass ? passStyle : failStyle}">${scorecard[0].pass ? 'PASS' : 'FAIL'}</td>
          <td style="${cellStyle}">${scorecard[0].reference}</td>
        </tr>
        
        <tr>
          <td style="${headerStyle}">Duration</td>
          <td colspan="3" style="${cellStyle}">${meta?.durationSec ? meta.durationSec.toFixed(1) + ' s' : 'N/A'}</td>
          <td></td>
          <td style="${cellStyle}">${scorecard[1].label}</td>
          <td style="${cellStyle}">${scorecard[1].target}</td>
          <td style="${cellStyle}">${scorecard[1].measured}</td>
          <td style="${scorecard[1].pass ? passStyle : failStyle}">${scorecard[1].pass ? 'PASS' : 'FAIL'}</td>
          <td style="${cellStyle}">${scorecard[1].reference}</td>
        </tr>

        <tr>
          <td style="${headerStyle}">V2V Topology</td>
          <td colspan="3" style="${cellStyle}">${localStorage.getItem('sim-default-topology') || 'Hybrid'}</td>
          <td></td>
          <td style="${cellStyle}">${scorecard[2].label}</td>
          <td style="${cellStyle}">${scorecard[2].target}</td>
          <td style="${cellStyle}">${scorecard[2].measured}</td>
          <td style="${scorecard[2].pass ? passStyle : failStyle}">${scorecard[2].pass ? 'PASS' : 'FAIL'}</td>
          <td style="${cellStyle}">${scorecard[2].reference}</td>
        </tr>

        <tr>
          <td style="${headerStyle}">OBU Node Count</td>
          <td colspan="3" style="${cellStyle}">${analysis.series.length > 0 ? '4 Nodes (1 Leader, 3 Followers)' : 'N/A'}</td>
          <td></td>
          <td style="${cellStyle}">${scorecard[3].label}</td>
          <td style="${scorecard[3].target}</td>
          <td style="${scorecard[3].measured}</td>
          <td style="${scorecard[3].pass ? passStyle : failStyle}">${scorecard[3].pass ? 'PASS' : 'FAIL'}</td>
          <td style="${cellStyle}">${scorecard[3].reference}</td>
        </tr>

        <tr>
          <td style="${headerStyle}">Result Status</td>
          <td colspan="3" style="${overallPass ? passStyle : failStyle}">${overallPass ? 'ALL TARGETS PASSED' : 'SOME TARGETS FAILED'}</td>
          <td></td>
          <td style="${cellStyle}">${scorecard[4].label}</td>
          <td style="${cellStyle}">${scorecard[4].target}</td>
          <td style="${cellStyle}">${scorecard[4].measured}</td>
          <td style="${scorecard[4].pass ? passStyle : failStyle}">${scorecard[4].pass ? 'PASS' : 'FAIL'}</td>
          <td style="${cellStyle}">${scorecard[4].reference}</td>
        </tr>

        <tr>
          <td colspan="4" style="${cellStyle}"></td>
          <td></td>
          <td style="${cellStyle}">${scorecard[5].label}</td>
          <td style="${scorecard[5].target}</td>
          <td style="${scorecard[5].measured}</td>
          <td style="${scorecard[5].pass ? passStyle : failStyle}">${scorecard[5].pass ? 'PASS' : 'FAIL'}</td>
          <td style="${cellStyle}">${scorecard[5].reference}</td>
        </tr>

        <tr><td colspan="10" style="height: 20px;"></td></tr>

        <!-- Embedded Graphical Charts Section -->
        <tr>
          <td colspan="4" style="${greenHeaderStyle}">VEHICLE SPEED DYNAMICS (GRAPH)</td>
          <td></td>
          <td colspan="5" style="${greenHeaderStyle}">FORMATION ACCURACY & LATENCY (GRAPH)</td>
        </tr>
        <tr>
          <td colspan="4" style="text-align: center; vertical-align: middle; background-color: #ffffff; padding: 12px; border: 1px solid #d1d5db; height: 260px;">
            <img src="${speedChartUrl}" width="380" height="240" alt="Speed Dynamics Chart" />
          </td>
          <td></td>
          <td colspan="5" style="text-align: center; vertical-align: middle; background-color: #ffffff; padding: 12px; border: 1px solid #d1d5db; height: 260px;">
            <img src="${netChartUrl}" width="380" height="240" alt="Network Spacing Error Chart" />
          </td>
        </tr>

        <tr><td colspan="10" style="height: 20px;"></td></tr>

        <!-- Telemetry Log Header -->
        <tr>
          <td colspan="10" style="${greenHeaderStyle}">TELEMETRY TIME SERIES LOG (${analysis.series.length} samples)</td>
        </tr>
        
        <tr>
          <td style="${headerStyle}">Time (s)</td>
          <td style="${headerStyle}">E2E Delay (ms)</td>
          <td style="${headerStyle}">Packet Loss (%)</td>
          <td style="${headerStyle}">Spacing Error (m)</td>
          <td style="${headerStyle}">SSI</td>
          <td style="${headerStyle}">RSU Signal (dBm)</td>
          <td style="${headerStyle}">Leader Speed (m/s)</td>
          <td style="${headerStyle}">F1 Speed (m/s)</td>
          <td style="${headerStyle}">F2 Speed (m/s)</td>
          <td style="${headerStyle}">F3 Speed (m/s)</td>
        </tr>
  `;

  analysis.series.forEach((s, idx) => {
    const rowBg = idx % 2 === 0 ? "background-color: #f9fafb;" : "background-color: #ffffff;";
    const customCellStyle = `${cellStyle} ${rowBg}`;
    html += `
      <tr>
        <td style="${customCellStyle}" class="num-2">${s.t.toFixed(2)}</td>
        <td style="${customCellStyle}" class="num-1">${s.delayMs.toFixed(1)}</td>
        <td style="${customCellStyle}" class="num-2">${s.packetLoss.toFixed(2)}</td>
        <td style="${customCellStyle}" class="num">${s.spacingError.toFixed(3)}</td>
        <td style="${customCellStyle}" class="num">${s.stringStabilityIndex.toFixed(4)}</td>
        <td style="${customCellStyle}" class="num-1">${s.rsuSignalDbm.toFixed(1)}</td>
        <td style="${customCellStyle}" class="num-2">${s.speedLeader.toFixed(2)}</td>
        <td style="${customCellStyle}" class="num-2">${s.speedF1.toFixed(2)}</td>
        <td style="${customCellStyle}" class="num-2">${s.speedF2.toFixed(2)}</td>
        <td style="${customCellStyle}" class="num-2">${s.speedF3.toFixed(2)}</td>
      </tr>
    `;
  });

  html += `
      </table>
    </body>
    </html>
  `;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `V2V_Simulation_Report_${analysis.id}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AnalysisPage({ analysis, meta, theme = 'dark', onClose }: Props) {
  const navigate = useNavigate()
  const { series } = analysis
  const isLight = theme === 'light'

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
            className="btn primary no-print"
            onClick={() => exportExcel(analysis, meta)}
            title="Download beautifully formatted Excel dashboard"
            style={{ backgroundColor: '#059669', borderColor: '#059669', color: '#ffffff' }}
          >
            📊 Export Excel Dashboard
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
          isLight={isLight}
          renderLines={(_zoom, _handlers, axisStyle, tooltipStyle) => (
            <>
              <YAxis tick={axisStyle} label={{ value: 'Delay (ms)', angle: -90, position: 'insideLeft', fill: isLight ? '#475569' : '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} ms`, 'Delay']} />
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
          isLight={isLight}
          renderLines={(_zoom, _handlers, axisStyle, tooltipStyle) => (
            <>
              <YAxis tick={axisStyle} label={{ value: 'Loss (%)', angle: -90, position: 'insideLeft', fill: isLight ? '#475569' : '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Packet Loss']} />
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
          isLight={isLight}
          renderLines={(_zoom, _handlers, axisStyle, tooltipStyle) => (
            <>
              <YAxis tick={axisStyle} label={{ value: 'Speed (m/s)', angle: -90, position: 'insideLeft', fill: isLight ? '#475569' : '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} m/s`]} />
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
          isLight={isLight}
          renderLines={(_zoom, _handlers, axisStyle, tooltipStyle) => (
            <>
              <YAxis tick={axisStyle} label={{ value: 'Error (m)', angle: -90, position: 'insideLeft', fill: isLight ? '#475569' : '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toFixed(3)} m`, 'Spacing Error']} />
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
          isLight={isLight}
          renderLines={(_zoom, _handlers, axisStyle, tooltipStyle) => (
            <>
              <YAxis tick={axisStyle} domain={[0, 1]} label={{ value: 'SSI', angle: -90, position: 'insideLeft', fill: isLight ? '#475569' : '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [Number(value).toFixed(4), 'SSI']} />
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
          isLight={isLight}
          renderLines={(_zoom, _handlers, axisStyle, tooltipStyle) => (
            <>
              <YAxis tick={axisStyle} label={{ value: 'Signal (dBm)', angle: -90, position: 'insideLeft', fill: isLight ? '#475569' : '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toFixed(1)} dBm`, 'RSU Signal']} />
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
