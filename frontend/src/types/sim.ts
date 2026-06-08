export type VehicleState = {
  id: string
  /** Immediate predecessor in longitudinal order (platoon leader has none). */
  predecessorId?: string | null
  /** Longitudinal position along the road (meters) */
  x: number
  /** Lane index — integer that determines platoon grouping */
  y: number
  /** Continuous world Y in lane-units (0.0 = lane 0 centre).
   *  Used for kinematic positioning and lane-change interpolation. */
  wy: number
  /** Heading angle in radians. 0 = straight ahead (+X).
   *  Positive = turning toward higher lane index (downward on screen). */
  heading: number
  /** Target lane index. equals y when not changing lanes. */
  targetLane: number
  speed: number   // m/s
  accel: number   // m/s²
  brake: boolean
  crashed: boolean

  // ── Inter-Platoon Transfer FSM ────────────────────────────────────────────
  transferPhase?: 'waiting-for-gap' | 'departing' | 'in-transit' | 'stabilizing' | null
  transferTargetLane?: number
  stabilizeStartMs?: number
  headwayOverride?: number
  forceAcc?: boolean

  // ── Same-Lane Overtake (Swap) FSM ──────────────────────────────────────────────
  overtakePhase?: 'changing-out' | 'passing' | 'changing-back' | null
  overtakeTargetVehicleId?: string | null
  overtakeOriginalLane?: number
}

export type V2VTopology = 'PF' | 'L2A' | 'Hybrid'

export type SimulationParams = {
  /** Reference speed v₀ (m/s) */
  targetSpeed: number
  /** Constant time headway h (s) */
  timeHeadway: number
  /** Standstill distance s₀ (m) */
  standstillDistance: number
  /** One-way network latency (ms) */
  latencyMs: number
  /** Packet loss rate PLR (%) */
  packetLossPercent: number
  /** 5G NR channel bandwidth B (Hz) */
  channelBandwidthHz: number
  v2vTopology: V2VTopology
  dynamicPathLoss: boolean
}


export type SimulationTelemetry = {
  status: 'Stable' | 'Unstable'
  v2vLink: 'Connected' | 'Degraded' | 'Disconnected'
  rsuSignalDbm: number
  networkDelayMs: number
  endToEndDelayMs: number
  timestampDeviationMs: number
  stringStabilityIndex: number
  spacingError: number
  maxSpacingError: number
  averagePlatoonSpeedMs: number
  humanBrakingActive: boolean
  bandwidthUtilization: number
  controlMode: 'CACC' | 'ACC'
  effectiveHz: number
  collisionCount: number
  avgDynamicPacketLoss: number
  v2vTopology: V2VTopology
}


export type SimulationTrigger = 'humanBrake' | 'latencySpike' | 'packetDrop'

export type SimulationState = {
  sessionId: string
  timestamp: number
  running: boolean
  /** Simulation time-scale multiplier: 1 = normal, 2 = 2x, 4 = 4x */
  simSpeed?: 1 | 2 | 4
  vehicles: VehicleState[]
  params: SimulationParams
  telemetry: SimulationTelemetry
  elapsedSeconds?: number
}

export type SimulationHistory = {
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
}

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

export type AnalysisData = {
  id: string
  series: AnalysisSample[]
}
