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

  // ── Inter-Platoon Transfer FSM (4-phase) ───────────────────────────────────────
  /** Current FSM phase for inter-platoon transfer. null = normal operation. */
  transferPhase?: 'departing' | 'in-transit' | 'stabilizing' | null
  /** Destination platoon lane index for the transfer. */
  transferTargetLane?: number

  // ── Time-Based Smooth Trajectory Maneuver ──────────────────────────────────────
  maneuverTimer?: number
  maneuverDuration?: number
  maneuverStartY?: number
  maneuverTargetY?: number
  maneuverIsPulse?: boolean
  /** ID of vehicle that will be the new predecessor in the source platoon. */
  transferSourceSuccessorId?: string
  /** Timestamp (ms) when the stabilizing cooldown started. */
  stabilizeStartMs?: number
  /** Per-vehicle override for timeHeadway during stabilization. */
  headwayOverride?: number
  /** True if this vehicle is running in local ACC mode (no leader feedforward). */
  forceAcc?: boolean

  // ── Dynamic Path Loss (3GPP per-vehicle) ───────────────────────────────────────
  /** Dynamic packet loss % calculated for this vehicle this tick (when dynamicPathLoss ON). */
  dynamicPacketLoss?: number
}

export type V2VTopology = 'PF' | 'L2A' | 'Hybrid'

export type SimulationParams = {
  targetSpeed: number
  timeHeadway: number
  standstillDistance: number
  latencyMs: number
  packetLossPercent: number
  bandwidthMbps: number
  /** V2V communication topology for CACC feedforward term. Default: 'Hybrid' */
  v2vTopology: V2VTopology
  /** When true, packet loss is calculated per-vehicle using 3GPP distance-based path loss model. */
  dynamicPathLoss: boolean
}

export type Telemetry = {
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
  /** Average dynamic packet loss across platoon vehicles (when dynamicPathLoss is ON) */
  avgDynamicPacketLoss: number
  /** Currently active V2V topology */
  v2vTopology: V2VTopology
}

export type SimulationTrigger = 'humanBrake' | 'latencySpike' | 'packetDrop'

export type SimulationState = {
  sessionId: string
  timestamp: number
  running: boolean
  vehicles: VehicleState[]
  params: SimulationParams
  telemetry: Telemetry
}

export type ControlInput = {
  throttle: number
  brake: number
}
