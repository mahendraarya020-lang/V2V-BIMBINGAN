import cors from 'cors'
import express from 'express'
import { createServer } from 'http'
import { join } from 'node:path'
import { Server } from 'socket.io'
import { canServeFrontend, config } from './config'
import { computeAccFallbackAcceleration, computeCaccAcceleration } from './sim/cacc'
import type { CaccInput } from './sim/cacc'

import { NetworkEmulator } from './sim/networkEmulator'
import { LANE_WIDTH_M, updateFollower, updateLeader } from './sim/physics'
import { SessionManager } from './sim/sessionManager'
import {
  isSimulationTrigger,
  isVehicleSwapPayload,
  sanitizeControl,
  sanitizeParams,
} from './sim/validation'
import type {
  ControlInput,
  SimulationParams,
  SimulationState,
  V2VTopology,
  VehicleState,
} from './sim/types'


const ACC_FALLBACK_LOSS_THRESHOLD = 15
/** Distance (metres) at which two vehicles are considered to have collided. */
const CRASH_DISTANCE_M = 5.0
/** RSU spacing along the road (metres) — mirrors frontend constant. */
const RSU_SPACING_M = 500
/** RSU communication range (metres) — mirrors frontend constant. */
const RSU_RANGE_M = 300


// â”€â”€ Transfer FSM constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Safety margin added to d_ref gap check before accepting a transfer (metres). */
const TRANSFER_GAP_SAFETY_M = 6.0
/** Approximate vehicle body length used in gap calculations (metres). */
const VEHICLE_LENGTH_M = 4.5
/** Cooldown duration after entering the destination platoon (seconds). */
const TRANSFER_COOLDOWN_S = 2.0
/** Headway multiplier during stabilization cooldown phase. */
const STABILIZE_HEADWAY_MULT = 1.5
/** Slight deceleration command applied during departing phase (m/sÂ²). */
const DEPART_SLOW_ACCEL = -0.8
const MIN_PLATOON_COUNT = 1
const MAX_PLATOON_COUNT = 3
const DEFAULT_PLATOON_COUNT = 2
const MIN_FOLLOWER_COUNT = 1
const MAX_FOLLOWER_COUNT = 10

const app = express()
app.disable('x-powered-by')
app.use(cors({ origin: config.clientOrigin === '*' ? true : config.clientOrigin }))
app.use(express.json({ limit: '256kb' }))

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: config.clientOrigin === '*' ? true : config.clientOrigin },
})

const session = new SessionManager()
let emulators: NetworkEmulator[] = []

let running = false
let manualInput: ControlInput = { throttle: 0.4, brake: 0 }
let humanBrakingUntil = 0
let latencySpikeUntil = 0
let packetDropUntil = 0
let lastTickTime = 0
let collisionCooldownUntil = 0
let broadcastAccumulator = 0

const params: SimulationParams = {
  targetSpeed: 22,
  timeHeadway: 1.2,
  standstillDistance: 8,
  latencyMs: 10,
  packetLossPercent: 0.5,
  bandwidthMbps: 200,
  v2vTopology: 'Hybrid',
  dynamicPathLoss: false,
}

let followerCount = 3

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function platoonPrefix(index: number): string {
  if (index === 0) return ''
  return `${String.fromCharCode(97 + index)}_`
}

/** Create a fresh vehicle with all kinematic fields zeroed. */
function makeVehicle(id: string, lane: number, x: number, speed = 0): VehicleState {
  return {
    id,
    x,
    y: lane,
    wy: lane,       // continuous Y starts at lane centre
    heading: 0,     // pointing straight ahead
    targetLane: lane,
    speed,
    accel: 0,
    brake: false,
    crashed: false,
  }
}

function makeInitialPlatoon(index: number, followers: number): VehicleState[] {
  const prefix = platoonPrefix(index)
  const count = followers + 1
  const platoon: VehicleState[] = []
  
  const v0 = params.targetSpeed
  let currentX = -index * 20 // Stagger platoons so leaders do not spawn exactly parallel
  
  for (let i = 0; i < count; i++) {
    const isLeader = i === 0
    const id = isLeader ? `${prefix}leader` : `${prefix}f${i}`
    
    if (!isLeader) {
      currentX = currentX - VEHICLE_LENGTH_M - params.standstillDistance - (params.timeHeadway * v0)
    }
    
    platoon.push(makeVehicle(id, index, currentX, v0))
  }
  
  return platoon
}

function clampFollowerCount(value: number): number {
  return Math.min(MAX_FOLLOWER_COUNT, Math.max(MIN_FOLLOWER_COUNT, Math.round(value)))
}

function clampPlatoonCount(value: number): number {
  return Math.min(MAX_PLATOON_COUNT, Math.max(MIN_PLATOON_COUNT, Math.round(value)))
}

function createPlatoons(count: number): VehicleState[][] {
  return Array.from({ length: clampPlatoonCount(count) }, (_, i) => makeInitialPlatoon(i, followerCount))
}

let platoons: VehicleState[][] = createPlatoons(DEFAULT_PLATOON_COUNT)
emulators = platoons.map(() => new NetworkEmulator())

function effectiveLatency(): number {
  return Date.now() < latencySpikeUntil ? Math.max(params.latencyMs, 50) : params.latencyMs
}

function effectivePacketLoss(): number {
  return Date.now() < packetDropUntil ? Math.max(params.packetLossPercent, 25) : params.packetLossPercent
}

function getAllVehicles(): VehicleState[] {
  return platoons.flat()
}

function isAccFallbackActive(): boolean {
  return effectivePacketLoss() >= ACC_FALLBACK_LOSS_THRESHOLD
}

/**
 * 3GPP-inspired distance-based path loss probability model (simplified).
 * Returns packet loss % for a single vehicle based on its distance to the nearest RSU.
 *
 *  d < 50m          → 0% loss (near-field, excellent SNR)
 *  50m <= d < 300m  → exponential ramp from 0% to 80%
 *  d >= RSU_RANGE_M → 80% loss (edge of coverage)
 */
function dynamicPathLossForVehicle(vehicleX: number): number {
  // Find nearest RSU world position
  const rsuIndex = Math.round(vehicleX / RSU_SPACING_M)
  const nearestRsuX = rsuIndex * RSU_SPACING_M
  const d = Math.abs(vehicleX - nearestRsuX)

  const D_NEAR = 50        // metres — loss-free near zone
  const D_FAR  = RSU_RANGE_M  // 300m

  if (d <= D_NEAR) return 0
  if (d >= D_FAR)  return 80

  // Exponential ramp: loss = 80 * (e^k - 1) / (e^k_max - 1)
  const t = (d - D_NEAR) / (D_FAR - D_NEAR)   // normalise to [0,1]
  const k = 3.5   // steepness constant
  return 80 * (Math.exp(k * t) - 1) / (Math.exp(k) - 1)
}



function resetSimulationState(nextCount = platoons.length || DEFAULT_PLATOON_COUNT): void {
  running = false
  platoons = createPlatoons(nextCount)
  emulators = platoons.map(() => new NetworkEmulator())
  manualInput = { throttle: 0.4, brake: 0 }
  humanBrakingUntil = 0
  latencySpikeUntil = 0
  packetDropUntil = 0
  lastTickTime = 0
  collisionCooldownUntil = 0
  broadcastAccumulator = 0
}

function resizePlatoonFollowers(platoon: VehicleState[], lane: number, desiredFollowers: number): VehicleState[] {
  const targetFollowers = clampFollowerCount(desiredFollowers)
  const prefix = platoonPrefix(lane)
  const leader = platoon.find((vehicle) => vehicle.id === `${prefix}leader`) ?? platoon[0]
  if (!leader) return platoon
  const sorted = [...platoon].sort((a, b) => b.x - a.x)
  const currentFollowers = sorted.slice(1)
  const spacingMeters = VEHICLE_LENGTH_M + params.standstillDistance + (params.timeHeadway * Math.max(leader.speed, params.targetSpeed))

  if (currentFollowers.length > targetFollowers) {
    return [leader, ...currentFollowers.slice(0, targetFollowers)].map((vehicle, index) => ({
      ...vehicle,
      y: lane,
      wy: vehicle.wy ?? lane,
      id: index === 0 ? `${prefix}leader` : `${prefix}f${index}`,
    }))
  }

  const nextFollowers: VehicleState[] = [...currentFollowers]
  while (nextFollowers.length < targetFollowers) {
    const tail = nextFollowers[nextFollowers.length - 1] ?? leader
    nextFollowers.push(makeVehicle(
      `${prefix}f${nextFollowers.length + 1}`,
      lane,
      tail.x - spacingMeters,
      tail.speed,
    ))
  }

  return [leader, ...nextFollowers].map((vehicle, index) => ({
    ...vehicle,
    y: lane,
    wy: vehicle.wy ?? lane,
    id: index === 0 ? `${prefix}leader` : `${prefix}f${index}`,
  }))
}

function applyFollowerCountToAllPlatoons(nextFollowerCount: number): void {
  followerCount = clampFollowerCount(nextFollowerCount)
  platoons = platoons.map((platoon, lane) => resizePlatoonFollowers(platoon, lane, followerCount))
}

// â”€â”€â”€ Telemetry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getState(): SimulationState {
  const vehicles = getAllVehicles()
  const mainPlatoon = platoons[0] ?? []
  const leader = mainPlatoon[0] ?? { x: 0, speed: 0 }
  const tail = mainPlatoon[mainPlatoon.length - 1] ?? leader
  const followerSegments = Math.max(1, mainPlatoon.length - 1)
  const desiredTotalGap = (params.standstillDistance + params.timeHeadway * tail.speed) * followerSegments
  const spacingError = leader.x - tail.x - desiredTotalGap
  const followerSpacingErrors = mainPlatoon.slice(1).map((follower, idx) => {
    const preceding = mainPlatoon[idx]
    const desiredGap = params.standstillDistance + params.timeHeadway * follower.speed
    return Math.abs(preceding.x - follower.x - desiredGap)
  })
  const maxSpacingError = followerSpacingErrors.length > 0 ? Math.max(...followerSpacingErrors) : Math.abs(spacingError)
  const avgPlatoonSpeed = mainPlatoon.length > 0
    ? (mainPlatoon.reduce((sum, vehicle) => sum + vehicle.speed, 0) / mainPlatoon.length) * 3.6
    : 0
  const endToEndDelayMs = effectiveLatency() * Math.max(1, mainPlatoon.length - 1)
  const loss = effectivePacketLoss()
  const link = loss > 20 ? 'Disconnected' : loss > 1 ? 'Degraded' : 'Connected'
  const utilization = Math.min(100, ((vehicles.length * 0.05) / Math.max(1, params.bandwidthMbps)) * 100)

  // Compute average dynamic packet loss across all platoon vehicles
  const allVehicles = mainPlatoon.slice(1) // followers only
  const avgDynamicPacketLoss = params.dynamicPathLoss && allVehicles.length > 0
    ? allVehicles.reduce((sum, v) => sum + dynamicPathLossForVehicle(v.x), 0) / allVehicles.length
    : loss

  return {
    sessionId: 'active-session',
    timestamp: Date.now(),
    running,
    vehicles,
    params,
    telemetry: {
      status: Math.abs(spacingError) < 2 ? 'Stable' : 'Unstable',
      v2vLink: link,
      rsuSignalDbm: Number((-54 - loss * 0.9).toFixed(1)),
      networkDelayMs: effectiveLatency(),
      endToEndDelayMs: Number(endToEndDelayMs.toFixed(1)),
      stringStabilityIndex: Number(Math.max(0, 1 - Math.abs(spacingError) / 20).toFixed(3)),
      spacingError: Number(spacingError.toFixed(2)),
      maxSpacingError: Number(maxSpacingError.toFixed(2)),
      averagePlatoonSpeedKmh: Number(avgPlatoonSpeed.toFixed(1)),
      humanBrakingActive: Date.now() < humanBrakingUntil,
      bandwidthUtilization: Number(utilization.toFixed(3)),
      controlMode: isAccFallbackActive() ? 'ACC' : 'CACC',
      effectiveHz: session.getCurrentHz(),
      collisionCount: session.getCollisionCount(),
      avgDynamicPacketLoss: Number(avgDynamicPacketLoss.toFixed(1)),
      v2vTopology: params.v2vTopology,
    },
  }
}


// â”€â”€â”€ Collision detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Check ALL vehicle pairs with 2-D Euclidean distance.
 * Converts `wy` (lane units) to metres using LANE_WIDTH_M before comparison.
 * When a collision is found, both vehicles are instantly crashed and frozen.
 * Returns the collision event payload (or null if no new collision).
 */
function detectAndApplyCollisions(): { between: [string, string]; gapMeters: number } | null {
  if (Date.now() < collisionCooldownUntil) return null

  const all = getAllVehicles()

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      if (a.crashed || b.crashed) continue

      const dx = a.x - b.x
      const dy = (a.wy - b.wy) * LANE_WIDTH_M   // convert lane units â†’ metres
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < CRASH_DISTANCE_M) {
        // Crash both vehicles: freeze motion, set crashed flag
        platoons = platoons.map((platoon) =>
          platoon.map((v) =>
            v.id === a.id || v.id === b.id
              ? { ...v, crashed: true, speed: 0, accel: 0, brake: true }
              : v,
          ),
        )

        collisionCooldownUntil = Date.now() + 2000
        session.recordCollision()

        return {
          between: [a.id, b.id],
          gapMeters: Number(dist.toFixed(2)),
        }
      }
    }
  }

  return null
}

// â”€â”€â”€ Simulation step â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function stepPlatoon(
  platoon: VehicleState[],
  emulator: NetworkEmulator,
  dtSec: number,
  isPrimaryPlatoon: boolean,
): VehicleState[] {
  if (platoon.length === 0) return platoon
  const leaderVeh = platoon[0]
  const humanBrake = isPrimaryPlatoon && Date.now() < humanBrakingUntil ? 0.9 : 0
  const speedRegBrake = leaderVeh.speed > params.targetSpeed ? 0.3 : 0
  const leaderBrake = Math.max(isPrimaryPlatoon ? manualInput.brake : 0, humanBrake, speedRegBrake)
  const leaderThrottle = humanBrake > 0 ? 0 : isPrimaryPlatoon ? manualInput.throttle : 0.4
  const nextLeader = updateLeader(leaderVeh, dtSec, leaderThrottle, leaderBrake)

  emulator.push(
    { x: nextLeader.x, speed: nextLeader.speed, timestamp: Date.now() },
    effectiveLatency(),
    effectivePacketLoss(),
  )

  const delayedLeader = emulator.receive() ?? {
    x: nextLeader.x,
    speed: nextLeader.speed,
    timestamp: Date.now(),
  }

  const useAccFallback = isAccFallbackActive()
  const nextVehicles: VehicleState[] = [nextLeader]
  const now = Date.now()

  for (let i = 1; i < platoon.length; i++) {
    const preceding = i === 1 ? delayedLeader : nextVehicles[i - 1]
    const current = platoon[i]

    // ── Phase 4: Stabilization cooldown ────────────────────────────────
    // Check if this vehicle has finished its 2.0s cooldown and should exit FSM.
    let updatedCurrent = current
    if (current.transferPhase === 'stabilizing' && current.stabilizeStartMs !== undefined) {
      const elapsedS = (now - current.stabilizeStartMs) / 1000
      if (elapsedS >= TRANSFER_COOLDOWN_S) {
        // Cooldown complete — restore normal CACC mode
        updatedCurrent = {
          ...current,
          transferPhase: null,
          headwayOverride: undefined,
          forceAcc: false,
          stabilizeStartMs: undefined,
        }
      }
    }

    // â”€â”€ Phase 2: Departing â€” apply gentle deceleration (ACC only, no feedforward) â”€â”€
    if (updatedCurrent.transferPhase === 'departing') {
      // Force slow-down to open gap behind in source platoon
      const updated = updateFollower(updatedCurrent, dtSec, DEPART_SLOW_ACCEL)
      nextVehicles.push({ ...updated, forceAcc: true })
      continue
    }

    // ── Phase 3: Longitudinal Sync During Inter-Platoon Transfer ──
    if (updatedCurrent.transferPhase === 'in-transit') {
      const targetPlatoonSpeed = platoon[0]?.speed ?? updatedCurrent.speed
      const alpha = Math.min(1.2 * dtSec, 1)
      updatedCurrent = {
        ...updatedCurrent,
        speed: updatedCurrent.speed + (targetPlatoonSpeed - updatedCurrent.speed) * alpha,
      }
    }

    // ── Normal CACC / ACC step (topology-aware, with per-vehicle dynamic path loss) ──
    const effectiveHeadway = updatedCurrent.headwayOverride ?? params.timeHeadway

    // Dynamic 3GPP Path Loss per vehicle
    const vehicleDynLoss = params.dynamicPathLoss
      ? dynamicPathLossForVehicle(updatedCurrent.x)
      : effectivePacketLoss()
    const thisTickAccFallback = useAccFallback || (updatedCurrent.forceAcc ?? false)
      || (params.dynamicPathLoss && vehicleDynLoss >= ACC_FALLBACK_LOSS_THRESHOLD)

    // Topology-Aware CACC Input
    // Note: `preceding` may be a LeaderPacket (i===1) which lacks `accel` — fallback to 0
    const precedingAccel = 'accel' in preceding ? (preceding as VehicleState).accel : 0
    const caccInput: CaccInput = {
      predecessorX: preceding.x,
      leaderX: nextLeader.x,
      followerX: updatedCurrent.x,
      followerSpeed: updatedCurrent.speed,
      predecessorSpeed: preceding.speed,
      leaderSpeed: nextLeader.speed,
      leaderAccel: nextLeader.accel,
      predecessorAccel: precedingAccel,
      timeHeadway: effectiveHeadway,
      standstillDistance: params.standstillDistance,
      topology: params.v2vTopology,
    }


    const { accelCmd, spacingError } = thisTickAccFallback
      ? computeAccFallbackAcceleration(caccInput)
      : computeCaccAcceleration(caccInput)

    if (isPrimaryPlatoon && i === platoon.length - 1) {
      const ssi = Math.max(0, 1 - Math.abs(spacingError) / 20)
      const followerSpeeds = platoon.slice(1).map((vehicle) => vehicle.speed)
      session.addSample(
        effectiveLatency(),
        spacingError,
        vehicleDynLoss,
        ssi,
        -54 - vehicleDynLoss * 0.9,
        {
          leader: nextLeader.speed,
          f1: followerSpeeds[0] ?? 0,
          f2: followerSpeeds[1] ?? 0,
          f3: followerSpeeds[2] ?? 0,
        },
      )
    }

    nextVehicles.push(updateFollower({ ...updatedCurrent, dynamicPacketLoss: vehicleDynLoss }, dtSec, accelCmd))
  }

  return nextVehicles
}

// â”€â”€â”€ Transfer FSM: Phase 3 â†’ 4 transition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Called every tick. Scans all platoons for 'in-transit' vehicles whose wy has
 * converged to their targetLane (|wy - targetLane| < 0.05). When found, transitions
 * the vehicle to Phase 4 (stabilizing) with a 2-second cooldown, 1.5Ã— headway.
 */
function stepTransferFsm(): void {
  const now = Date.now()
  platoons = platoons.map((platoon) =>
    platoon.map((v) => {
      if (v.transferPhase !== 'in-transit') return v
      const hasArrived = v.maneuverTimer !== undefined && v.maneuverDuration !== undefined
        ? v.maneuverTimer >= v.maneuverDuration
        : Math.abs((v.wy ?? v.y) - (v.transferTargetLane ?? v.y)) < 0.05
      if (hasArrived) {
        // Arrived in new lane â€” transition to Phase 4: Stabilizing
        return {
          ...v,
          transferPhase: 'stabilizing' as const,
          maneuverTimer: undefined,
          maneuverDuration: undefined,
          maneuverStartY: undefined,
          maneuverTargetY: undefined,
          stabilizeStartMs: now,
          headwayOverride: (v.headwayOverride ?? 1.2), // already set at 1.5Ã— from Phase 3
          forceAcc: true,  // remain in ACC during cooldown
        }
      }
      return v
    }),
  )
}


const simulationTimer = setInterval(() => {
  if (!running) return
  const dtSec = config.tickMs / 1000
  const now = Date.now()

  if (lastTickTime > 0) {
    const measuredHz = 1000 / Math.max(1, now - lastTickTime)
    session.recordHz(measuredHz)
  }
  lastTickTime = now

  platoons = platoons.map((platoon, index) =>
    stepPlatoon(platoon, emulators[index] ?? new NetworkEmulator(), dtSec, index === 0),
  )

  // FSM: detect Phase 3 â†’ 4 lane-arrival transitions
  stepTransferFsm()

  // Global 2-D collision check â€” crashes vehicles and emits event if needed
  const collision = detectAndApplyCollisions()
  if (collision) {
    io.emit('sim:collision', collision)
  }

  session.recordControlMode(isAccFallbackActive())

  broadcastAccumulator += config.tickMs
  if (broadcastAccumulator >= config.broadcastMs) {
    broadcastAccumulator = 0
    io.emit('sim:state', getState())
  }
}, config.tickMs)

// â”€â”€â”€ Socket.IO event handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

io.on('connection', (socket) => {
  socket.emit('sim:state', getState())
  socket.emit('sim:history', session.readAll())

  socket.on('sim:start', (payload: unknown) => {
    const source = payload && typeof payload === 'object' ? payload as { platoonCount?: unknown; followerCount?: unknown } : {}
    const requestedCount = typeof source.platoonCount === 'number' ? clampPlatoonCount(source.platoonCount) : platoons.length
    if (typeof source.followerCount === 'number') {
      followerCount = clampFollowerCount(source.followerCount)
    }
    resetSimulationState(requestedCount)
    session.reset()
    lastTickTime = 0
    broadcastAccumulator = 0
    running = true
    io.emit('sim:state', getState())
  })

  socket.on('sim:stop', () => {
    if (!running) return
    running = false
    const history = session.save(params.packetLossPercent)
    io.emit('sim:saved', history)
    io.emit('sim:history', session.readAll())
    io.emit('sim:analysis', { id: history.id, series: session.getSeries() })
    io.emit('sim:state', getState())
  })

  socket.on('sim:reset', () => {
    resetSimulationState(platoons.length)
    io.emit('sim:state', getState())
  })

  socket.on('sim:updateParams', (payload: unknown) => {
    Object.assign(params, sanitizeParams(payload))
    io.emit('sim:state', getState())
  })

  socket.on('sim:setFollowerCount', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const raw = (payload as { followerCount?: unknown }).followerCount
    if (typeof raw !== 'number') return
    applyFollowerCountToAllPlatoons(raw)
    io.emit('sim:state', getState())
  })

  socket.on('sim:control', (payload: unknown) => {
    manualInput = sanitizeControl(payload, manualInput)
  })

  socket.on('sim:trigger', (kind: unknown) => {
    if (!isSimulationTrigger(kind)) return
    const now = Date.now()
    if (kind === 'humanBrake') humanBrakingUntil = now + 2500
    if (kind === 'latencySpike') latencySpikeUntil = now + 3000
    if (kind === 'packetDrop') packetDropUntil = now + 3000
  })

  socket.on('sim:swapVehicles', (payload: unknown) => {
    if (!isVehicleSwapPayload(payload) || payload.idA === payload.idB) return
    const { idA, idB } = payload
    const all = getAllVehicles()
    const vA = all.find((vehicle) => vehicle.id === idA)
    const vB = all.find((vehicle) => vehicle.id === idB)
    if (!vA || !vB) return

    if (vA.y !== vB.y) {
      // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
      // Inter-Platoon Member Transfer â€” 4-Phase FSM
      // We treat vA as the transferring vehicle (Vk) moving to vB's platoon.
      // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      const srcLane = vA.y
      const dstLane = vB.y
      const dstPlatoon = platoons[dstLane]

      // â”€â”€ Phase 1: Negotiation â€” gap check at destination platoon tail â”€â”€â”€â”€â”€â”€
      // Tail of destination platoon is the vehicle with the smallest X.
      const dstSorted = dstPlatoon ? [...dstPlatoon].sort((a, b) => b.x - a.x) : []
      const dstTail = dstSorted[dstSorted.length - 1]
      const dRef = params.standstillDistance + params.timeHeadway * (dstTail?.speed ?? 0)
      const gapAtTail = dstTail ? (dstTail.x - vA.x) : Infinity

      // Gap check: the space between Vk and the destination tail must be safe.
      // (negative gapAtTail means Vk is already behind the tail â€” also safe)
      const gapOk = gapAtTail < 0 || gapAtTail > dRef + VEHICLE_LENGTH_M + TRANSFER_GAP_SAFETY_M

      if (!gapOk) {
        // Negotiation failed â€” emit a negotiation-refused event and abort
        io.emit('sim:transferRefused', {
          vehicleId: idA,
          reason: `Gap at destination tail too small (${gapAtTail.toFixed(1)}m < required ${(dRef + VEHICLE_LENGTH_M + TRANSFER_GAP_SAFETY_M).toFixed(1)}m)`,
        })
        return
      }

      // â”€â”€ Phase 2: Departing â€” Vk switches to ACC, opens gap in source platoon â”€
      // Find the vehicle directly behind Vk in the source platoon.
      const srcSorted = [...(platoons[srcLane] ?? [])].sort((a, b) => b.x - a.x)
      const vkIndexInSrc = srcSorted.findIndex((v) => v.id === vA.id)
      const vkSuccessor = srcSorted[vkIndexInSrc + 1] // vehicle behind Vk
      const vkPredecessor = srcSorted[vkIndexInSrc - 1] // vehicle in front of Vk

      // The successor's new predecessor becomes the vehicle that was in front of Vk.
      // We achieve this by simply removing Vk from the source platoon â€” the
      // stepPlatoon loop will naturally re-link i-1 â†’ i.
      // The successor's integral is reset by zeroing its accel momentarily.
      const srcPlatoonWithoutVk = (platoons[srcLane] ?? []).map((v) => {
        if (v.id === vkSuccessor?.id) {
          // Phase 2 â€” reset successor's spacing reference to prevent windup
          return { ...v, accel: 0 }
        }
        return v
      }).filter((v) => v.id !== vA.id)

      platoons[srcLane] = srcPlatoonWithoutVk

      // â”€â”€ Phase 3: In-Transit â€” set Vk's target lane for lateral movement â”€â”€â”€â”€
      // Physics engine (steer() in physics.ts) will curve Vk via its heading.
      // Vk is placed at the tail of the destination platoon.
      const vkTransferring: VehicleState = {
        ...vA,
        y: dstLane,
        targetLane: dstLane,
        transferPhase: 'in-transit',
        transferTargetLane: dstLane,
        forceAcc: true,
        headwayOverride: params.timeHeadway * STABILIZE_HEADWAY_MULT,
        maneuverTimer: 0,
        maneuverDuration: 2.5,
        maneuverStartY: vA.wy,
        maneuverTargetY: dstLane,
      }

      if (!platoons[dstLane]) platoons[dstLane] = []
      platoons[dstLane] = [...platoons[dstLane], vkTransferring]

      // â”€â”€ Phase 3 â†’ 4 transition will happen once wy â‰ˆ targetLane â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // We detect arrival in the main simulation loop below and flip to 'stabilizing'.
      // (Managed in stepTransferFsm called from the tick loop)

    } else {
      // â”€â”€ Same-lane swap: exchange longitudinal positions (overtake) â”€â”€
      const swappedA: VehicleState = { ...vA, x: vB.x, speed: vB.speed, accel: vB.accel }
      const swappedB: VehicleState = { ...vB, x: vA.x, speed: vA.speed, accel: vA.accel }
      const lane = vA.y
      if (platoons[lane]) {
        platoons[lane] = platoons[lane].map((vehicle) =>
          vehicle.id === idA ? swappedA : vehicle.id === idB ? swappedB : vehicle,
        )
      }
    }

    platoons = platoons.map((platoon) => [...platoon].sort((a, b) => b.x - a.x))
    io.emit('sim:state', getState())
  })

  socket.on('sim:loadHistory', (id: unknown) => {
    if (typeof id !== 'string') return
    const record = session.readAll().find((item) => item.id === id)
    if (!record) return
    socket.emit('sim:analysis', { id: record.id, series: record.series })
    socket.emit('sim:saved', record)
  })
})

// â”€â”€â”€ HTTP routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'v2v-platooning-simulator',
    environment: config.nodeEnv,
    running,
    vehicles: getAllVehicles().length,
    frontend: canServeFrontend() ? 'served' : 'external',
  })
})

app.get('/api/status', (_req, res) => {
  res.json(getState())
})

if (canServeFrontend()) {
  app.use(express.static(config.frontendDistPath))
  app.get(/^\/(?!socket\.io|api|health).*/, (_req, res) => {
    res.sendFile(join(config.frontendDistPath, 'index.html'))
  })
}

// â”€â”€â”€ Server start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

httpServer
  .listen(config.port, () => {
    console.log(`Simulation server running on http://localhost:${config.port}`)
    if (canServeFrontend()) console.log(`Serving frontend from ${config.frontendDistPath}`)
  })
  .on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use.`)
    } else {
      console.error('Backend failed to start:', err)
    }
    process.exit(1)
  })

function shutdown(): void {
  clearInterval(simulationTimer)
  io.close()
  httpServer.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)




