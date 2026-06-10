import type { ControlInput, SimulationParams, SimulationTrigger, V2VTopology } from './types'

const NUMERIC_PARAM_LIMITS = {
  targetSpeed: [2, 42],
  timeHeadway: [0.5, 3],
  standstillDistance: [4, 20],
  latencyMs: [0, 500],
  packetLossPercent: [0, 100],
  channelBandwidthHz: [5_000_000, 5_000_000_000],
} as const

const VALID_TOPOLOGIES: V2VTopology[] = ['PF', 'L2A', 'Hybrid']

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function sanitizeParams(payload: unknown): Partial<SimulationParams> {
  if (!payload || typeof payload !== 'object') return {}
  const source = payload as Record<string, unknown>
  const next: Partial<SimulationParams> = {}

  for (const key of Object.keys(NUMERIC_PARAM_LIMITS) as Array<keyof typeof NUMERIC_PARAM_LIMITS>) {
    const value = finiteNumber(source[key])
    if (value === null) continue
    const [min, max] = NUMERIC_PARAM_LIMITS[key]
    ;(next as Record<string, number>)[key] = clamp(value, min, max)
  }

  // Legacy: bandwidthMbps → channelBandwidthHz (e.g. 200 Mbps → 20 MHz)
  const legacyMbps = finiteNumber(source.bandwidthMbps)
  if (legacyMbps !== null && next.channelBandwidthHz === undefined) {
    const [min, max] = NUMERIC_PARAM_LIMITS.channelBandwidthHz
    next.channelBandwidthHz = clamp(legacyMbps * 100_000, min, max)
  }

  if (typeof source.v2vTopology === 'string' && VALID_TOPOLOGIES.includes(source.v2vTopology as V2VTopology)) {
    next.v2vTopology = source.v2vTopology as V2VTopology
  }

  if (typeof source.dynamicPathLoss === 'boolean') {
    next.dynamicPathLoss = source.dynamicPathLoss
  }

  return next
}

export function sanitizeControl(payload: unknown, current: ControlInput): ControlInput {
  if (!payload || typeof payload !== 'object') return current
  const source = payload as Record<string, unknown>
  const throttle = finiteNumber(source.throttle)
  const brake = finiteNumber(source.brake)

  return {
    throttle: throttle === null ? current.throttle : clamp(throttle, 0, 1),
    brake: brake === null ? current.brake : clamp(brake, 0, 1),
  }
}

export function isSimulationTrigger(value: unknown): value is SimulationTrigger {
  return value === 'humanBrake' || value === 'latencySpike' || value === 'packetDrop'
}

export function isVehicleSwapPayload(payload: unknown): payload is { idA: string; idB: string } {
  if (!payload || typeof payload !== 'object') return false
  const source = payload as Record<string, unknown>
  return typeof source.idA === 'string' && typeof source.idB === 'string'
}
