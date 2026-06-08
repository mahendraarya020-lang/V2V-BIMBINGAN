import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type AnalysisSample = {
  t: number
  delayMs: number
  packetLoss: number
  spacingError: number
  stringStabilityIndex: number
  rsuSignalDbm: number
  speedLeader: number
  speedF1: number
  speedF2: number
  speedF3: number
}

export type HistoryRecord = {
  id: string
  name?: string
  createdAt: string
  durationSec: number
  avgDelayMs: number
  avgSpacingError: number
  maxSpacingError: number
  avgStringStability: number
  packetLossPercent: number
  collisionCount: number
  avgUpdateHz: number
  accFallbackPercent: number
  series: AnalysisSample[]
}

const HISTORY_PATH = join(process.cwd(), 'data', 'history.json')
const SERIES_INTERVAL_MS = 200
const HISTORY_LIMIT = 50

export class SessionManager {
  private startedAt = Date.now()
  private simulatedElapsedS = 0
  private lastSampleAt = -SERIES_INTERVAL_MS
  private series: AnalysisSample[] = []
  private collisionCount = 0
  private hzSamples: number[] = []
  private accFallbackTicks = 0
  private totalTicks = 0

  reset(): void {
    this.startedAt = Date.now()
    this.simulatedElapsedS = 0
    this.lastSampleAt = -SERIES_INTERVAL_MS
    this.series = []
    this.collisionCount = 0
    this.hzSamples = []
    this.accFallbackTicks = 0
    this.totalTicks = 0
  }

  advance(dtSec: number): void {
    this.simulatedElapsedS += dtSec
  }

  getSimulatedElapsedS(): number {
    return this.simulatedElapsedS
  }

  recordCollision(): void {
    this.collisionCount += 1
  }

  recordHz(hz: number): void {
    this.hzSamples.push(hz)
    if (this.hzSamples.length > 200) this.hzSamples.shift()
  }

  recordControlMode(isAccFallback: boolean): void {
    this.totalTicks += 1
    if (isAccFallback) this.accFallbackTicks += 1
  }

  getCollisionCount(): number {
    return this.collisionCount
  }

  getCurrentHz(): number {
    if (this.hzSamples.length === 0) return 0
    const sum = this.hzSamples.reduce((a, c) => a + c, 0)
    return Number((sum / this.hzSamples.length).toFixed(1))
  }

  addSample(
    simulatedElapsedS: number,
    delayMs: number,
    spacingError: number,
    packetLoss: number,
    stringStabilityIndex: number,
    rsuSignalDbm: number,
    speeds: { leader: number; f1: number; f2: number; f3: number },
  ): void {
    const simulatedElapsedMs = simulatedElapsedS * 1000
    if (simulatedElapsedMs - this.lastSampleAt < SERIES_INTERVAL_MS) return
    this.lastSampleAt = simulatedElapsedMs

    this.series.push({
      t: Number(simulatedElapsedS.toFixed(2)),
      delayMs,
      packetLoss,
      spacingError: Number(Math.abs(spacingError).toFixed(3)),
      stringStabilityIndex: Number(stringStabilityIndex.toFixed(4)),
      rsuSignalDbm,
      speedLeader: Number(speeds.leader.toFixed(2)),
      speedF1: Number(speeds.f1.toFixed(2)),
      speedF2: Number(speeds.f2.toFixed(2)),
      speedF3: Number(speeds.f3.toFixed(2)),
    })
  }

  getSeries(): AnalysisSample[] {
    return this.series
  }

  save(packetLossPercent: number): HistoryRecord {
    const delays = this.series.map((s) => s.delayMs)
    const spacings = this.series.map((s) => s.spacingError)
    const stabilities = this.series.map((s) => s.stringStabilityIndex)
    const maxSpacing = spacings.length ? Math.max(...spacings) : 0
    const accPct = this.totalTicks > 0
      ? Number(((this.accFallbackTicks / this.totalTicks) * 100).toFixed(1))
      : 0

    const payload: HistoryRecord = {
      id: `SIM-${Date.now()}`,
      createdAt: new Date().toISOString(),
      durationSec: Math.max(1, Math.round(this.simulatedElapsedS)),
      avgDelayMs: average(delays),
      avgSpacingError: average(spacings),
      maxSpacingError: Number(maxSpacing.toFixed(3)),
      avgStringStability: average(stabilities),
      packetLossPercent,
      collisionCount: this.collisionCount,
      avgUpdateHz: this.getCurrentHz(),
      accFallbackPercent: accPct,
      series: this.series,
    }

    const all: HistoryRecord[] = this.readAll().map((r) => ({
      ...r,
      collisionCount: r.collisionCount ?? 0,
      avgUpdateHz: r.avgUpdateHz ?? 0,
      accFallbackPercent: r.accFallbackPercent ?? 0,
      maxSpacingError: r.maxSpacingError ?? 0,
      series: r.series ?? [],
    }))
    all.unshift(payload)
    ensureHistoryDir()
    writeFileSync(HISTORY_PATH, JSON.stringify(all.slice(0, HISTORY_LIMIT), null, 2))
    return payload
  }

  readAll(): HistoryRecord[] {
    if (!existsSync(HISTORY_PATH)) {
      ensureHistoryDir()
      writeFileSync(HISTORY_PATH, '[]')
      return []
    }
    try {
      return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')) as HistoryRecord[]
    } catch {
      return []
    }
  }

  deleteRecord(id: string): boolean {
    const all = this.readAll()
    const filtered = all.filter((r) => r.id !== id)
    if (filtered.length === all.length) return false
    writeFileSync(HISTORY_PATH, JSON.stringify(filtered, null, 2))
    return true
  }

  renameRecord(id: string, newName: string): boolean {
    const all = this.readAll()
    const index = all.findIndex((r) => r.id === id)
    if (index === -1) return false
    all[index].name = newName
    writeFileSync(HISTORY_PATH, JSON.stringify(all, null, 2))
    return true
  }

  deleteAllRecords(): void {
    writeFileSync(HISTORY_PATH, '[]')
  }
}

function ensureHistoryDir(): void {
  mkdirSync(dirname(HISTORY_PATH), { recursive: true })
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return Number((values.reduce((a, c) => a + c, 0) / values.length).toFixed(3))
}
