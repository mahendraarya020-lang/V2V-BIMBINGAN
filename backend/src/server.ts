import cors from 'cors'
import express from 'express'
import { createServer } from 'http'
import { join } from 'node:path'
import { Server } from 'socket.io'
import { canServeFrontend, config } from './config'
import { computeAccFallbackAcceleration, computeCaccAcceleration } from './sim/cacc'
import type { CaccInput } from './sim/cacc'

import { NetworkEmulator } from './sim/networkEmulator'
import {
  FOLLOWER_EMERGENCY_DECEL_MS2,
  FOLLOWER_MAX_DECEL_MS2,
  LANE_WIDTH_M,
  updateFollower,
  updateLeader,
} from './sim/physics'
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
  channelBandwidthHz: 1_000_000_000,
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

/** Sort platoon front-to-back by decreasing x; tie-break on id for stable merge order. */
function sortPlatoonByLongitudinal(platoon: VehicleState[]): VehicleState[] {
  return [...platoon].sort((a, b) => {
    if (b.x !== a.x) return b.x - a.x
    return a.id.localeCompare(b.id)
  })
}

/** Set each follower's predecessorId to the vehicle directly ahead (leader gets null). */
function recomputePredecessorIds(platoon: VehicleState[]): VehicleState[] {
  return platoon.map((v, i) => ({
    ...v,
    predecessorId: i === 0 ? null : platoon[i - 1].id,
  }))
}

/** Minimum longitudinal clearance required before accepting a lane merge (m). */
function minMergeGapRequiredM(): number {
  return params.standstillDistance + params.targetSpeed * params.timeHeadway * 1.2
}

/** Neighbors of merge longitude vAx on destination platoon (sorted desc by x). */
function findMergeNeighbors(dstSortedDesc: VehicleState[], vAx: number): {
  pred: VehicleState | null
  succ: VehicleState | null
} {
  const predCandidates = dstSortedDesc.filter((v) => v.x > vAx)
  const pred = predCandidates.length ? predCandidates[predCandidates.length - 1] : null
  const succCandidates = dstSortedDesc.filter((v) => v.x < vAx)
  const succ = succCandidates.length ? succCandidates[0] : null
  return { pred, succ }
}

/** Phase-1 merge slot clearance vs minMergeGapRequiredM (approx. bumper gap subtracts one vehicle length). */
function mergeSlotClearanceM(
  pred: VehicleState | null,
  succ: VehicleState | null,
  vAx: number,
): { ok: boolean; gapM: number; detail: string } {
  const minG = minMergeGapRequiredM()
  if (pred && succ) {
    const gapM = pred.x - succ.x - VEHICLE_LENGTH_M
    return {
      ok: gapM > minG,
      gapM,
      detail: `slot ${gapM.toFixed(1)}m (need >${minG.toFixed(1)}m between ${pred.id} and ${succ.id})`,
    }
  }
  if (pred && !succ) {
    const gapM = pred.x - vAx - VEHICLE_LENGTH_M
    return {
      ok: gapM > minG,
      gapM,
      detail: `clearance to predecessor ${pred.id}: ${gapM.toFixed(1)}m (need >${minG.toFixed(1)}m)`,
    }
  }
  if (!pred && succ) {
    const gapM = vAx - succ.x - VEHICLE_LENGTH_M
    return {
      ok: gapM > minG,
      gapM,
      detail: `clearance to follower ${succ.id}: ${gapM.toFixed(1)}m (need >${minG.toFixed(1)}m)`,
    }
  }
  return { ok: true, gapM: Infinity, detail: 'empty destination platoon' }
}

function createPlatoons(count: number): VehicleState[][] {
  return Array.from({ length: clampPlatoonCount(count) }, (_, i) =>
    recomputePredecessorIds(sortPlatoonByLongitudinal(makeInitialPlatoon(i, followerCount))),
  )
}

let platoons: VehicleState[][] = createPlatoons(DEFAULT_PLATOON_COUNT)
emulators = platoons.map(() => new NetworkEmulator())

type HistorySample = {
  x: number
  speed: number
  accel: number
  timestamp: number
}

const V2vStateHistory = new Map<string, HistorySample[]>()

function saveVehicleStateToHistory(id: string, x: number, speed: number, accel: number): void {
  const history = V2vStateHistory.get(id) ?? []
  history.push({ x, speed, accel, timestamp: Date.now() })
  if (history.length > 200) history.shift()
  V2vStateHistory.set(id, history)
}

function getDelayedVehicleState(id: string, latencyMs: number, fallback: { x: number, speed: number, accel: number }): HistorySample {
  const history = V2vStateHistory.get(id)
  if (!history || history.length === 0) {
    return { x: fallback.x, speed: fallback.speed, accel: fallback.accel, timestamp: Date.now() - latencyMs }
  }
  const targetTime = Date.now() - latencyMs
  let closest = history[0]
  let minDiff = Math.abs(closest.timestamp - targetTime)
  for (const sample of history) {
    const diff = Math.abs(sample.timestamp - targetTime)
    if (diff < minDiff) {
      minDiff = diff
      closest = sample
    }
  }
  return closest
}

let lastPlatoonTimestampDeviationMs = 0
let lastPlatoonMultiHopDelayMs = 0

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

/**
 * Dynamic distance-based RSU signal power (dBm) simulation.
 * Signal fades logarithmically/exponentially as distance to the nearest RSU increases:
 *  - d <= 50m (Near Zone): excellent signal from -50 dBm to -60 dBm
 *  - 50m < d < 300m (Mid Zone): linear path loss transition down to -95 dBm
 *  - d >= 300m (Out of Coverage): falls to a floor of -115 dBm
 */
function calculateRsuSignalDbm(leaderX: number): number {
  const rsuIndex = Math.round(leaderX / RSU_SPACING_M)
  const nearestRsuX = rsuIndex * RSU_SPACING_M
  const d = Math.abs(leaderX - nearestRsuX)

  if (d <= 50) {
    return Number((-50 - (d / 50) * 10).toFixed(1))
  } else if (d < RSU_RANGE_M) {
    const t = (d - 50) / (RSU_RANGE_M - 50)
    return Number((-60 - t * 35).toFixed(1))
  } else {
    const excessDist = d - RSU_RANGE_M
    const fade = Math.min(20, (excessDist / 100) * 10)
    return Number((-95 - fade).toFixed(1))
  }
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
  const sorted = sortPlatoonByLongitudinal(platoon)
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
  platoons = platoons.map((platoon, lane) =>
    recomputePredecessorIds(sortPlatoonByLongitudinal(resizePlatoonFollowers(platoon, lane, followerCount))),
  )
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
  const avgPlatoonSpeedMs = mainPlatoon.length > 0
    ? mainPlatoon.reduce((sum, vehicle) => sum + vehicle.speed, 0) / mainPlatoon.length
    : 0
  const endToEndDelayMs = lastPlatoonMultiHopDelayMs > 0 ? lastPlatoonMultiHopDelayMs : (effectiveLatency() * Math.max(1, mainPlatoon.length - 1))
  const channelMHz = params.channelBandwidthHz / 1e6
  const utilization = Math.min(100, ((vehicles.length * 0.05) / Math.max(1, channelMHz)) * 100)

  // Compute average dynamic packet loss across all platoon vehicles
  const allVehicles = mainPlatoon.slice(1) // followers only
  const avgDynamicPacketLoss = params.dynamicPathLoss && allVehicles.length > 0
    ? allVehicles.reduce((sum, v) => sum + dynamicPathLossForVehicle(v.x), 0) / allVehicles.length
    : effectivePacketLoss()

  const loss = params.dynamicPathLoss ? avgDynamicPacketLoss : effectivePacketLoss()
  const link = loss > 20 ? 'Disconnected' : loss > 1 ? 'Degraded' : 'Connected'

  const rsuSignalDbm = calculateRsuSignalDbm(leader.x)

  return {
    sessionId: 'active-session',
    timestamp: Date.now(),
    running,
    vehicles,
    params,
    telemetry: {
      status: Math.abs(spacingError) < 2 ? 'Stable' : 'Unstable',
      v2vLink: link,
      rsuSignalDbm,
      networkDelayMs: effectiveLatency(),
      endToEndDelayMs: Number(endToEndDelayMs.toFixed(1)),
      timestampDeviationMs: Number(lastPlatoonTimestampDeviationMs.toFixed(3)),
      stringStabilityIndex: Number(Math.max(0, 1 - Math.abs(spacingError) / 20).toFixed(3)),
      spacingError: Number(spacingError.toFixed(2)),
      maxSpacingError: Number(maxSpacingError.toFixed(2)),
      averagePlatoonSpeedMs: Number(avgPlatoonSpeedMs.toFixed(2)),
      humanBrakingActive: Date.now() < humanBrakingUntil,
      bandwidthUtilization: Number(utilization.toFixed(3)),
      controlMode: loss >= ACC_FALLBACK_LOSS_THRESHOLD ? 'ACC' : 'CACC',
      effectiveHz: session.getCurrentHz(),
      collisionCount: session.getCollisionCount(),
      avgDynamicPacketLoss: Number(avgDynamicPacketLoss.toFixed(1)),
      v2vTopology: params.v2vTopology,
    },
  }
}


// ──────────────────────────────── Collision detection ──────────────────────────────────────────────

/**
 * Check ALL vehicle pairs with bounding box overlap check.
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

      const dx = Math.abs(a.x - b.x)
      const dy = Math.abs(a.wy - b.wy) * LANE_WIDTH_M

      // Bounding box collision check: 
      // vehicles are 4.5m long and ~1.8m wide. We consider overlap if:
      // longitudinal gap is less than 4.5m and lateral gap is less than 2.0m.
      if (dx < VEHICLE_LENGTH_M && dy < 2.0) {
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

        const dist = Math.sqrt(dx * dx + dy * dy)
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
  const sorted = recomputePredecessorIds(sortPlatoonByLongitudinal(platoon))
  const leaderVeh = sorted[0]
  const humanBrake = isPrimaryPlatoon && Date.now() < humanBrakingUntil ? 0.9 : 0
  const speedRegBrake = leaderVeh.speed > params.targetSpeed ? 0.3 : 0

  // Dynamic 5G V2X Leader Gap Creation Deceleration
  // ONLY brake the leader when another vehicle is actively in 'waiting-for-gap' targeting THIS lane.
  // The leader's own headwayOverride (from a completed transfer) must NOT trigger cooperative braking.
  const thisLane = sorted[0].y
  const hasActiveGapRequest = platoons.some(p =>
    p.some(v => v.transferPhase === 'waiting-for-gap' && v.transferTargetLane === thisLane)
  )
  const coopBrake = hasActiveGapRequest ? 0.4 : 0
  const coopThrottleMult = hasActiveGapRequest ? 0.2 : 1

  // Active speed regulation for non-primary platoon leaders (adaptive cruise control)
  const speedDeficit = params.targetSpeed - leaderVeh.speed
  const autoThrottle = speedDeficit > 0
    ? Math.min(0.6, speedDeficit * 0.15)  // Proportional throttle gain
    : 0
  const baseThrottle = isPrimaryPlatoon ? manualInput.throttle : Math.max(0.4, autoThrottle)

  const leaderBrake = Math.max(
    isPrimaryPlatoon ? manualInput.brake : 0,
    humanBrake,
    speedRegBrake,
    coopBrake
  )
  const leaderThrottle = humanBrake > 0 ? 0 : baseThrottle * coopThrottleMult
  let nextLeader = updateLeader(leaderVeh, dtSec, leaderThrottle, leaderBrake)
  saveVehicleStateToHistory(nextLeader.id, nextLeader.x, nextLeader.speed, nextLeader.accel)
  const now = Date.now()

  let totalSyncDeviation = 0
  let totalHopDelay = 0

  // ── Leader stabilization exit check ──────────────────────────────────────
  // The stabilization exit at L521 only runs for followers (inside the i>=1 loop).
  // If the transferred vehicle became the leader, we must also clean it up here.
  if (nextLeader.transferPhase === 'stabilizing' && nextLeader.stabilizeStartMs !== undefined) {
    const leaderStabElapsed = (now - nextLeader.stabilizeStartMs) / 1000
    if (leaderStabElapsed >= TRANSFER_COOLDOWN_S) {
      nextLeader = {
        ...nextLeader,
        transferPhase: null,
        headwayOverride: undefined,
        forceAcc: false,
        stabilizeStartMs: undefined,
      }
    }
  }


  const lossToUse = params.dynamicPathLoss
    ? Math.max(dynamicPathLossForVehicle(nextLeader.x), Date.now() < packetDropUntil ? 25 : 0)
    : effectivePacketLoss()

  emulator.push(
    { x: nextLeader.x, speed: nextLeader.speed, timestamp: Date.now() },
    effectiveLatency(),
    lossToUse,
  )

  const delayedLeader = emulator.receive() ?? {
    x: nextLeader.x,
    speed: nextLeader.speed,
    timestamp: Date.now(),
  }

  const useAccFallback = lossToUse >= ACC_FALLBACK_LOSS_THRESHOLD
  const nextVehicles: VehicleState[] = [nextLeader]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const predId = current.predecessorId ?? sorted[i - 1]?.id
    let predIndex = predId ? sorted.findIndex((v) => v.id === predId) : -1
    if (predIndex < 0 || predIndex >= i || (i > 1 && predIndex === 0)) predIndex = i - 1

    const preceding: VehicleState =
      predIndex === 0
        ? {
            ...nextLeader,
            x: delayedLeader.x,
            speed: delayedLeader.speed,
          }
        : (nextVehicles[predIndex] ?? sorted[predIndex])

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
      const targetPlatoonSpeed = sorted[0]?.speed ?? updatedCurrent.speed
      const alpha = Math.min(1.2 * dtSec, 1)
      const syncedSpeed = updatedCurrent.speed + (targetPlatoonSpeed - updatedCurrent.speed) * alpha
      // Enforce minimum speed floor to prevent stalling mid-lane-change
      const minTransitSpeed = params.targetSpeed * 0.5
      updatedCurrent = {
        ...updatedCurrent,
        speed: Math.max(syncedSpeed, minTransitSpeed),
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

    // Topology-Aware CACC Input with emulated Multi-Hop delay & Time Sync Jitter
    const baseLatency = effectiveLatency()
    const precedingLatency = params.v2vTopology === 'PF'
      ? baseLatency + (i - 1) * 5
      : baseLatency
    const leaderLatency = params.v2vTopology === 'PF'
      ? baseLatency + (i - 1) * 5
      : baseLatency

    // Time Synchronization Jitter Injection (< 5ms deviation)
    const syncDev = (Math.random() - 0.5) * 5.0 // Random Jitter between -2.5ms and +2.5ms
    const finalPrecedingLatency = Math.max(0, precedingLatency + syncDev)
    const finalLeaderLatency = Math.max(0, leaderLatency + syncDev)

    if (isPrimaryPlatoon) {
      totalSyncDeviation += Math.abs(syncDev)
      totalHopDelay += leaderLatency
    }

    // Retrieve delayed preceding state from V2vStateHistory
    const precedingState = getDelayedVehicleState(preceding.id, finalPrecedingLatency, preceding)
    // Retrieve delayed leader state from V2vStateHistory
    const leaderState = getDelayedVehicleState(nextLeader.id, finalLeaderLatency, nextLeader)

    const precedingAccel = precedingState.accel
    const caccInput: CaccInput = {
      predecessorX: preceding.x, // Radar measurements (zero V2V communication latency)
      leaderX: leaderState.x,    // V2V communications (with emulated latency)
      followerX: updatedCurrent.x,
      followerSpeed: updatedCurrent.speed,
      predecessorSpeed: preceding.speed, // Radar measurements (zero V2V communication latency)
      leaderSpeed: leaderState.speed,     // V2V communications (with emulated latency)
      leaderAccel: leaderState.accel,     // V2V communications (with emulated latency)
      predecessorAccel: precedingAccel,   // V2V communications (with emulated latency)
      timeHeadway: effectiveHeadway,
      standstillDistance: params.standstillDistance,
      topology: params.v2vTopology,
    }


    const { accelCmd, spacingError } = thisTickAccFallback
      ? computeAccFallbackAcceleration(caccInput)
      : computeCaccAcceleration(caccInput)

    if (isPrimaryPlatoon && i === sorted.length - 1) {
      const ssi = Math.max(0, 1 - Math.abs(spacingError) / 20)
      const followerSpeeds = sorted.slice(1).map((vehicle) => vehicle.speed)
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

    const actualGap = preceding.x - updatedCurrent.x
    const desiredGap = params.standstillDistance + effectiveHeadway * updatedCurrent.speed
    const spacingCritical = actualGap < desiredGap
    const maxDecelMs2 = spacingCritical ? FOLLOWER_EMERGENCY_DECEL_MS2 : FOLLOWER_MAX_DECEL_MS2

    const updatedFollowerState = updateFollower(
      { ...updatedCurrent, dynamicPacketLoss: vehicleDynLoss },
      dtSec,
      accelCmd,
      { maxDecelMs2 },
    )
    saveVehicleStateToHistory(updatedFollowerState.id, updatedFollowerState.x, updatedFollowerState.speed, updatedFollowerState.accel)
    nextVehicles.push(updatedFollowerState)

    if (isPrimaryPlatoon && i === sorted.length - 1) {
      lastPlatoonTimestampDeviationMs = totalSyncDeviation / (sorted.length - 1)
      lastPlatoonMultiHopDelayMs = totalHopDelay / (sorted.length - 1)
    }
  }

  return nextVehicles
}

// ─── Transfer FSM: Cooperative Transitions ──────────────────────────────────
/**
 * Called every tick. Scans all platoons for cooperative transfers.
 * 1. Checks 'waiting-for-gap' vehicles to see if destination platoon gap is ready.
 * 2. Scans 'in-transit' vehicles to transition them to 'stabilizing' phase.
 */
function stepTransferFsm(): void {
  const now = Date.now()

  // Track active target successor IDs and tail-merging vehicles that need to slow down
  const activeSuccessorIds = new Set<string>()
  const activeWaitingVehiclesNeedBrake = new Set<string>()

  // 1. Process vehicles in "waiting-for-gap" state
  let migratedVehicle: VehicleState | null = null
  let srcLaneOfMigrated = -1
  let dstLaneOfMigrated = -1

  platoons.forEach((platoon, lane) => {
    platoon.forEach((v) => {
      if (v.transferPhase === 'waiting-for-gap') {
        const dstLane = v.transferTargetLane ?? 0
        const dstPlatoon = platoons[dstLane] ?? []
        const dstSorted = sortPlatoonByLongitudinal(dstPlatoon)
        const { pred, succ } = findMergeNeighbors(dstSorted, v.x)
        const minG = minMergeGapRequiredM()

        // Dynamically update successor pointer as positions shift
        v.transferSourceSuccessorId = succ?.id ?? undefined

        if (succ) {
          activeSuccessorIds.add(succ.id)
        } else if (pred) {
          // Merging behind the tail of the destination platoon.
          // Since there is no successor to slow down, Vk (the waiting vehicle) must decelerate.
          activeWaitingVehiclesNeedBrake.add(v.id)
        }

        let gapM = Infinity
        if (pred && succ) {
          gapM = pred.x - succ.x - VEHICLE_LENGTH_M
        } else if (pred && !succ) {
          gapM = pred.x - v.x - VEHICLE_LENGTH_M
        } else if (!pred && succ) {
          gapM = v.x - succ.x - VEHICLE_LENGTH_M
        }

        if (gapM >= minG) {
          // Gap is ready! Record for migration.
          migratedVehicle = {
            ...v,
            y: dstLane,
            targetLane: dstLane,
            transferPhase: 'in-transit' as const,
            transferTargetLane: dstLane,
            forceAcc: true,
            headwayOverride: params.timeHeadway * STABILIZE_HEADWAY_MULT,
            maneuverTimer: 0,
            maneuverDuration: 2.5,
            maneuverStartY: v.wy,
            maneuverTargetY: dstLane,
            transferSourceSuccessorId: succ?.id ?? undefined,
          }
          srcLaneOfMigrated = lane
          dstLaneOfMigrated = dstLane
        }
      } else if (v.transferPhase === 'in-transit') {
        if (v.transferSourceSuccessorId) {
          activeSuccessorIds.add(v.transferSourceSuccessorId)
        }
      }
    })
  })

  // Apply dynamic headway overrides for cooperative gap creation
  platoons = platoons.map((platoon) =>
    platoon.map((v) => {
      // 1. Successor vehicles opening the merge slot
      if (activeSuccessorIds.has(v.id)) {
        return { ...v, headwayOverride: params.timeHeadway * 2.5, forceAcc: true }
      }
      // 2. Waiting-for-gap vehicles merging at the tail that must decelerate
      if (activeWaitingVehiclesNeedBrake.has(v.id)) {
        return { ...v, headwayOverride: params.timeHeadway * 2.5, forceAcc: true }
      }
      // 3. Clear headway overrides for any other vehicle not actively stabilizing or in-transit
      if (v.transferPhase !== 'stabilizing' && v.transferPhase !== 'in-transit' && v.transferPhase !== 'waiting-for-gap') {
        if (v.headwayOverride !== undefined) {
          return { ...v, headwayOverride: undefined, forceAcc: false }
        }
      }
      // For waiting-for-gap vehicles that do NOT need to brake, clear headway override
      if (v.transferPhase === 'waiting-for-gap' && !activeWaitingVehiclesNeedBrake.has(v.id)) {
        if (v.headwayOverride !== undefined) {
          return { ...v, headwayOverride: undefined, forceAcc: false }
        }
      }
      return v
    })
  )

  // Perform migration if a vehicle is ready
  if (migratedVehicle !== null) {
    const vk = migratedVehicle as VehicleState
    // Find the vehicle directly behind Vk in the source platoon.
    const srcSorted = sortPlatoonByLongitudinal(platoons[srcLaneOfMigrated] ?? [])
    const vkIndexInSrc = srcSorted.findIndex((v) => v.id === vk.id)
    const vkSuccessor = srcSorted[vkIndexInSrc + 1]

    // Remove from source platoon and reset its successor's spacing reference
    platoons[srcLaneOfMigrated] = platoons[srcLaneOfMigrated]
      .map((v) => (v.id === vkSuccessor?.id ? { ...v, accel: 0 } : v))
      .filter((v) => v.id !== vk.id)

    // Add to destination platoon
    if (!platoons[dstLaneOfMigrated]) platoons[dstLaneOfMigrated] = []
    platoons[dstLaneOfMigrated] = [...platoons[dstLaneOfMigrated], vk]
    
    io.emit('sim:transferCooperativeReady', {
      vehicleId: vk.id,
      targetLane: dstLaneOfMigrated,
      message: `Gap created successfully! Initiating lateral V2V lane change maneuver.`,
    })
  }

  // 2. Process lateral transition (Phase 3 -> Phase 4)
  platoons = platoons.map((platoon) =>
    platoon.map((v) => {
      if (v.transferPhase !== 'in-transit') return v
      const hasArrived = v.maneuverTimer !== undefined && v.maneuverDuration !== undefined
        ? v.maneuverTimer >= v.maneuverDuration
        : Math.abs((v.wy ?? v.y) - (v.transferTargetLane ?? v.y)) < 0.05
      if (hasArrived) {
        // Arrived in new lane — transition to Phase 4: Stabilizing
        
        // If there was a successor that opened the gap, reset its headway override
        const succId = v.transferSourceSuccessorId
        if (succId) {
          const dstLane = v.y
          platoons[dstLane] = platoons[dstLane].map((u) => {
            if (u.id === succId) {
              return { ...u, headwayOverride: undefined, forceAcc: false }
            }
            return u
          })
        }

        return {
          ...v,
          transferPhase: 'stabilizing' as const,
          maneuverTimer: undefined,
          maneuverDuration: undefined,
          maneuverStartY: undefined,
          maneuverTargetY: undefined,
          stabilizeStartMs: now,
          headwayOverride: v.headwayOverride ?? (params.timeHeadway * 1.5),
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
      // ════════════════════════════════════════════════════════════════════════════════════════════
      // Inter-Platoon Member Transfer — 5-Phase FSM (Cooperative Gap Creation)
      // We treat vA as the transferring vehicle (Vk) moving to vB's platoon.
      // ════════════════════════════════════════════════════════════════════════════════════════════

      const srcLane = vA.y
      const dstLane = vB.y
      const dstPlatoon = platoons[dstLane]

      // ── Phase 1: Negotiation — check if slot is already open ──
      const dstSorted = dstPlatoon ? sortPlatoonByLongitudinal(dstPlatoon) : []
      const { pred, succ } = findMergeNeighbors(dstSorted, vA.x)
      const clearance = mergeSlotClearanceM(pred, succ, vA.x)

      if (clearance.ok) {
        // Gap is already large enough! Transition immediately.
        const srcSorted = sortPlatoonByLongitudinal(platoons[srcLane] ?? [])
        const vkIndexInSrc = srcSorted.findIndex((v) => v.id === vA.id)
        const vkSuccessor = srcSorted[vkIndexInSrc + 1]

        const srcPlatoonWithoutVk = (platoons[srcLane] ?? []).map((v) => {
          if (v.id === vkSuccessor?.id) {
            return { ...v, accel: 0 }
          }
          return v
        }).filter((v) => v.id !== vA.id)

        platoons[srcLane] = srcPlatoonWithoutVk

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
          transferSourceSuccessorId: succ?.id ?? undefined,
        }

        if (!platoons[dstLane]) platoons[dstLane] = []
        platoons[dstLane] = [...platoons[dstLane], vkTransferring]
      } else {
        // Gap is too tight! Initiate V2X Cooperative Gap Creation.
        if (succ) {
          platoons[dstLane] = platoons[dstLane].map((v) =>
            v.id === succ.id ? { ...v, headwayOverride: params.timeHeadway * 2.5, forceAcc: true } : v
          )
        }
        
        platoons[srcLane] = platoons[srcLane].map((v) =>
          v.id === vA.id
            ? {
                ...v,
                transferPhase: 'waiting-for-gap' as const,
                transferTargetLane: dstLane,
                transferSourceSuccessorId: succ?.id,
              }
            : v
        )

        io.emit('sim:transferCooperativeInit', {
          vehicleId: idA,
          targetLane: dstLane,
          reason: `Merge slot too tight (${clearance.detail}). 5G V2X Cooperative Gap Creation initiated.`,
        })
      }
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

    platoons = platoons.map((platoon) => recomputePredecessorIds(sortPlatoonByLongitudinal(platoon)))
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

app.delete('/api/sessions', (req, res) => {
  session.deleteAllRecords()
  io.emit('sim:history', session.readAll())
  res.json({ ok: true })
})

app.delete('/api/sessions/:id', (req, res) => {
  const success = session.deleteRecord(req.params.id)
  if (success) {
    io.emit('sim:history', session.readAll())
    res.json({ ok: true })
  } else {
    res.status(404).json({ error: 'Session not found' })
  }
})

app.patch('/api/sessions/:id', (req, res) => {
  const { name } = req.body
  if (typeof name !== 'string') {
    res.status(400).json({ error: 'Invalid name' })
    return
  }
  const success = session.renameRecord(req.params.id, name)
  if (success) {
    io.emit('sim:history', session.readAll())
    res.json({ ok: true })
  } else {
    res.status(404).json({ error: 'Session not found' })
  }
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




