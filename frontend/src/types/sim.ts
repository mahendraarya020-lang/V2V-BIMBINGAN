export type VehicleState = {
  id: string
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
  transferPhase?: 'departing' | 'in-transit' | 'stabilizing' | null
  transferTargetLane?: number
  stabilizeStartMs?: number
  headwayOverride?: number
  forceAcc?: boolean
}

export type V2VTopology = 'PF' | 'L2A' | 'Hybrid'

export type SimulationParams = {
  targetSpeed: number
  timeHeadway: number
  standstillDistance: number
  latencyMs: number
  packetLossPercent: number
  bandwidthMbps: number
  v2vTopology: V2VTopology
  dynamicPathLoss: boolean
}


export type SimulationTelemetry = {
  status: 'Stable' | 'Unstable'
  v2vLink: 'Connected' | 'Degraded' | 'Disconnected'
  rsuSignalDbm: number
  networkDelayMs: number
  endToEndDelayMs: number
  stringStabilityIndex: number
  spacingError: number
  maxSpacingError: number
  averagePlatoonSpeedKmh: number
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
  vehicles: VehicleState[]
  params: SimulationParams
  telemetry: SimulationTelemetry
}

export type SimulationHistory = {
  id: string
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
