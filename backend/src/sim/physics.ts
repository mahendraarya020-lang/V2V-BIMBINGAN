import type { VehicleState } from './types'

// â”€â”€â”€ Physical constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MAX_ACCEL = 3.5      // m/sÂ²  (engine limit)
const MAX_BRAKE = 6.0      // m/sÂ²  (braking limit)
const MAX_SPEED = 42.0     // m/s   (~150 km/h)

/** Default longitudinal deceleration limit for CACC followers (m/s²). */
export const FOLLOWER_MAX_DECEL_MS2 = MAX_BRAKE
/** Emergency deceleration cap when spacing is below CACC reference (m/s²). */
export const FOLLOWER_EMERGENCY_DECEL_MS2 = 9.0

// â”€â”€â”€ Steering / kinematics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Real road lane width.  Used to convert lane-unit lateral motion to metres. */
export const LANE_WIDTH_M = 3.5

/** Maximum heading bank angle during a lane change (radians â‰ˆ 6.9Â°).
 *  Positive = turning toward higher lane index (downward on screen). */
const MAX_HEADING_RAD = 0.12

/** Maximum angular velocity the steering can produce (rad/s). */
const MAX_STEER_RATE = 0.9  // rad/s

/** Proportional gain: desired heading = K_STEER Ã— (targetLane âˆ’ wy) */
const K_STEER = 1.5

/** wy error threshold below which we snap to target and zero heading. */
const WY_SNAP = 0.04   // lane units
/** Heading threshold to consider vehicle aligned straight. */
const HEADING_SNAP = 0.015  // radians

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Compute the new heading and continuous Y position (wy) for one physics step.
 *
 * The lateral velocity (in lane units/s) is derived from genuine kinematics:
 *   wy_dot = (speed / LANE_WIDTH_M) Ã— sin(heading)
 *
 * Steering is a proportional controller that adjusts heading toward the
 * direction of the desired lane, with an angular-velocity rate limit so the
 * car curves naturally rather than snapping.
 */
function steer(
  v: VehicleState,
  speed: number,
  dt: number,
): { heading: number; wy: number; maneuverTimer?: number } {
  // â”€â”€ Time-Based Smooth Trajectory Maneuver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (v.maneuverTimer !== undefined && v.maneuverDuration && v.maneuverStartY !== undefined && v.maneuverTargetY !== undefined) {
    const nextTimer = v.maneuverTimer + dt
    const progress = Math.min(nextTimer / v.maneuverDuration, 1.0)
    
    // Smooth sinusoidal curve: y = startY + (targetY - startY) * (0.5 - 0.5 * cos(pi * progress))
    const smoothStep = 0.5 - 0.5 * Math.cos(Math.PI * progress)
    const newWy = v.maneuverStartY + (v.maneuverTargetY - v.maneuverStartY) * smoothStep
    
    // Dynamic Realistic Heading: Math.atan2(delta_Y, current_Velocity_X)
    let newHeading = 0
    if (progress < 1 && speed > 1) {
      const deltaYMeters = (newWy - v.wy) * LANE_WIDTH_M
      const deltaXMeters = speed * dt
      const targetHeading = Math.atan2(deltaYMeters, deltaXMeters)
      // Slight lerp to avoid snapping instantly
      newHeading = v.heading + (targetHeading - v.heading) * clamp(15 * dt, 0, 1)
    }

    return { 
      heading: progress >= 1 ? 0 : newHeading, 
      wy: progress >= 1 ? v.maneuverTargetY : newWy, 
      maneuverTimer: nextTimer 
    }
  }

  // â”€â”€ OLD Proportional Steering Fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const wyError = v.targetLane - v.wy

  // Desired heading proportional to lateral gap, clamped to max bank
  const desiredHeading = clamp(wyError * K_STEER, -MAX_HEADING_RAD, MAX_HEADING_RAD)

  // Rate-limited heading change (models steering inertia)
  const headingError = desiredHeading - v.heading
  const headingDelta = clamp(headingError, -MAX_STEER_RATE * dt, MAX_STEER_RATE * dt)
  const newHeading = v.heading + headingDelta

  // Kinematic lateral displacement: vÂ·sin(Î¸)Â·dt (converted to lane units)
  const lateralDelta = (speed / LANE_WIDTH_M) * Math.sin(newHeading) * dt
  const newWy = v.wy + lateralDelta

  // Snap to target lane once close enough (prevents micro-oscillation)
  const arrived = Math.abs(v.targetLane - newWy) < WY_SNAP
    && Math.abs(newHeading) < HEADING_SNAP

  return {
    heading: arrived ? 0 : newHeading,
    wy: arrived ? v.targetLane : newWy,
  }
}

// â”€â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Update the platoon leader for one timestep.
 * Throttle âˆˆ [0,1], brake âˆˆ [0,1].
 * Crashed vehicles are returned unchanged (frozen).
 */
export function updateLeader(
  leader: VehicleState,
  dtSec: number,
  throttle: number,
  brake: number,
): VehicleState {
  if (leader.crashed) return leader

  const rawAccel = throttle * MAX_ACCEL - brake * MAX_BRAKE
  const speed = clamp(leader.speed + rawAccel * dtSec, 0, MAX_SPEED)

  const { heading, wy, maneuverTimer } = steer(leader, speed, dtSec)

  // Kinematic position update using current heading
  const x = leader.x + speed * Math.cos(heading) * dtSec

  return {
    ...leader,
    x,
    wy,
    heading,
    speed,
    accel: rawAccel,
    brake: brake > 0.2,
    ...(maneuverTimer !== undefined && { maneuverTimer }),
  }
}

export type FollowerUpdateOpts = {
  /** Magnitude of max deceleration (m/s²); defaults to FOLLOWER_MAX_DECEL_MS2. */
  maxDecelMs2?: number
}

/**
 * Update a CACC follower for one timestep.
 * accelCmd is the output of computeCaccAcceleration / computeAccFallbackAcceleration.
 * Crashed vehicles are returned unchanged.
 */
export function updateFollower(
  follower: VehicleState,
  dtSec: number,
  accelCmd: number,
  opts?: FollowerUpdateOpts,
): VehicleState {
  if (follower.crashed) return follower

  const maxDecel = opts?.maxDecelMs2 ?? FOLLOWER_MAX_DECEL_MS2
  const rawAccel = clamp(accelCmd, -maxDecel, MAX_ACCEL)
  const speed = clamp(follower.speed + rawAccel * dtSec, 0, MAX_SPEED)

  const { heading, wy, maneuverTimer } = steer(follower, speed, dtSec)

  const x = follower.x + speed * Math.cos(heading) * dtSec

  return {
    ...follower,
    x,
    wy,
    heading,
    speed,
    accel: rawAccel,
    brake: rawAccel < -0.2,
    ...(maneuverTimer !== undefined && { maneuverTimer }),
  }
}

