import type { V2VTopology } from './types'

// ─── CACC Gains ───────────────────────────────────────────────────────────────
const KP = 0.45   // spacing error proportional gain
const KD = 0.35   // relative speed derivative gain

// ─── CACC Input Type ──────────────────────────────────────────────────────────
export type CaccInput = {
  /** Predecessor's X position (used for spacing error in all topologies) */
  predecessorX: number
  /** Leader's X position (used in L2A / Hybrid feedforward) */
  leaderX: number
  followerX: number
  followerSpeed: number
  predecessorSpeed: number
  /** Leader's speed (used for feedforward in L2A / Hybrid) */
  leaderSpeed: number
  /** Leader's last known acceleration (feedforward term) */
  leaderAccel: number
  /** Predecessor's last known acceleration (feedforward term for PF) */
  predecessorAccel: number
  timeHeadway: number
  standstillDistance: number
  /** Topology controls which feedforward source is used */
  topology: V2VTopology
}

/**
 * CACC: full V2V cooperative control.
 *
 * Topology determines the feedforward (FF) acceleration source:
 *  - PF  (Predecessor Following): FF = predecessorAccel, spacing ref = predecessor
 *  - L2A (Leader-to-All):         FF = leaderAccel,      spacing ref = predecessor
 *  - Hybrid:                      FF = leaderAccel,      spacing ref = predecessor
 *
 * The spacing error always uses the immediate predecessor for safety.
 */
export function computeCaccAcceleration(input: CaccInput): {
  accelCmd: number
  spacingError: number
} {
  const desiredGap = input.standstillDistance + input.timeHeadway * input.followerSpeed
  const actualGap = input.predecessorX - input.followerX
  const spacingError = actualGap - desiredGap
  const relativeSpeed = input.predecessorSpeed - input.followerSpeed

  // ── Topology-based feedforward term ──────────────────────────────────────
  let feedforward = 0
  switch (input.topology) {
    case 'PF':
      feedforward = input.predecessorAccel   // follow the one directly ahead
      break
    case 'L2A':
      feedforward = input.leaderAccel        // all follow the leader's accel
      break
    case 'Hybrid':
    default:
      feedforward = input.leaderAccel        // hybrid: predecessor gap + leader FF
      break
  }

  const accelCmd = KP * spacingError + KD * relativeSpeed + feedforward * 0.6

  return { accelCmd, spacingError }
}

/**
 * ACC fallback: radar-only — no V2V comm feedforward.
 * Automatically triggered when V2V link is degraded / packet lost this tick.
 */
export function computeAccFallbackAcceleration(input: Pick<CaccInput,
  'predecessorX' | 'followerX' | 'followerSpeed' | 'predecessorSpeed' |
  'timeHeadway' | 'standstillDistance'>): {
  accelCmd: number
  spacingError: number
} {
  const safetyHeadway = Math.max(2.0, input.timeHeadway * 1.6)
  const desiredGap = input.standstillDistance + safetyHeadway * input.followerSpeed
  const actualGap = input.predecessorX - input.followerX
  const spacingError = actualGap - desiredGap
  const accelCmd = 0.32 * spacingError + 0.18 * (input.predecessorSpeed - input.followerSpeed) * 0.4

  return { accelCmd, spacingError }
}
