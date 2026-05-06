import { animate } from 'animejs'
import { useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import type { VehicleState } from '../types/sim'

type Props = {
  vehicles: VehicleState[]
  v2vLink: 'Connected' | 'Degraded' | 'Disconnected'
  selectedVehicleId?: string | null
  onVehicleClick?: (id: string) => void
  pendingSwap?: { idA: string; idB: string; triggeredAt: number } | null
  running: boolean
  avgSpeedKmh?: number // Optional since it's newly added, provide a default internally
}

const PX_PER_METER = 4
const VEHICLE_WIDTH = 62
const VEHICLE_HEIGHT = 28
const MIN_LANE_COUNT = 3
const WORLD_OFFSET_X = 160 // Keep it slightly offset to show the leader
const CAMERA_LEAD_METERS = 40

type AnimValue = { value: number }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Convert a continuous lane position (lane units) to canvas Y pixels. */
function laneToScreenY(roadTop: number, roadHeight: number, wy: number, laneCount: number): number {
  return roadTop + (roadHeight / laneCount) * (wy + 0.5)
}

export function SimulationCanvas({
  vehicles,
  v2vLink,
  selectedVehicleId,
  onVehicleClick,
  pendingSwap,
  running,
  avgSpeedKmh = 0,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const vehiclesRef = useRef(vehicles)
  const v2vLinkRef = useRef(v2vLink)
  const selectedIdRef = useRef(selectedVehicleId)
  const runningRef = useRef(running)
  const avgSpeedKmhRef = useRef(avgSpeedKmh)

  useEffect(() => {
    vehiclesRef.current = vehicles
    v2vLinkRef.current = v2vLink
    selectedIdRef.current = selectedVehicleId
    runningRef.current = running
    avgSpeedKmhRef.current = avgSpeedKmh
  }, [vehicles, v2vLink, selectedVehicleId, running, avgSpeedKmh])

  // -- Per-vehicle animated display values ----------------------------------
  // X is interpolated on the frontend for smooth 60 fps motion between 20 Hz ticks.
  const displayedXRef = useRef<Map<string, AnimValue>>(new Map())
  // wy (continuous lane position) is also interpolated for silky-smooth lane changes.
  const displayedWyRef = useRef<Map<string, AnimValue>>(new Map())
  // Tracks which vehicles are in a swap manoeuvre (for the gold glow).
  const overtakeUntilRef = useRef<Map<string, number>>(new Map())
  
  // Camera & Environment
  const cameraXRef = useRef<AnimValue>({ value: 0 })
  const cameraTargetRef = useRef(0)
  const prevSwapKeyRef = useRef<number>(-1)
  const fpsRef = useRef({ lastTs: 0, value: 60 })
  const drawErrorLoggedRef = useRef(false)
  
  // For scrolling road effect
  const roadScrollOffsetRef = useRef(0)
  const lastDrawTimeRef = useRef(0)

  function ensureState(map: Map<string, AnimValue>, id: string, initial: number): AnimValue {
    const existing = map.get(id)
    if (existing) return existing
    const created = { value: initial }
    map.set(id, created)
    return created
  }

  // -- Sync animated positions from physics state ----------------------------
  useEffect(() => {
    const active = new Set(vehicles.map((v) => v.id))

    for (const v of vehicles) {
      // X: lerp toward physics position
      const xState = ensureState(displayedXRef.current, v.id, v.x)
      if (Math.abs(v.x - xState.value) > 0.02) {
        animate(xState, {
          value: v.x,
          duration: runningRef.current ? 360 : 220,
          ease: 'outQuad',
        })
      }

      // wy: short interpolation — physics already eases it, this just bridges 20 Hz gaps
      const wyVal = v.wy ?? v.y   // guard for old-format states
      const wyState = ensureState(displayedWyRef.current, v.id, wyVal)
      if (Math.abs(wyVal - wyState.value) > 0.005) {
        animate(wyState, {
          value: wyVal,
          duration: 200,
          ease: 'linear',
        })
      }
    }

    // Remove stale entries
    for (const id of displayedXRef.current.keys()) {
      if (!active.has(id)) {
        displayedXRef.current.delete(id)
        displayedWyRef.current.delete(id)
        overtakeUntilRef.current.delete(id)
      }
    }
  }, [vehicles])

  // -- Camera follow ---------------------------------------------------------
  useEffect(() => {
    // Relative camera: Keep the leader near the centre of the screen
    const leader = vehicles.find((v) => v.y === 0) ?? vehicles[0]
    const targetCamera = leader ? leader.x - CAMERA_LEAD_METERS : 0
    
    // Animate the camera smoothly towards the leader
    if (Math.abs(targetCamera - cameraTargetRef.current) < 0.12) return
    cameraTargetRef.current = targetCamera
    animate(cameraXRef.current, {
      value: targetCamera,
      duration: running ? 620 : 420,
      ease: running ? 'inOutSine' : 'outQuad',
    })
  }, [running, vehicles])

  useEffect(() => {
    if (running) return
    const leader = vehicles.find((v) => v.y === 0) ?? vehicles[0]
    cameraTargetRef.current = leader ? leader.x - CAMERA_LEAD_METERS : 0
    cameraXRef.current.value = cameraTargetRef.current
  }, [running, vehicles])

  // -- Swap: x-nudge animation (visual cue for the user) --------------------
  useEffect(() => {
    if (!pendingSwap) return
    const { idA, idB } = pendingSwap
    const xAState = displayedXRef.current.get(idA)
    const xBState = displayedXRef.current.get(idB)
    if (!xAState || !xBState) return
    animate(xAState, {
      keyframes: [{ value: xAState.value + 1.2, duration: 520 }, { value: xAState.value, duration: 640 }],
      ease: 'outQuad',
    })
    animate(xBState, {
      keyframes: [{ value: xBState.value - 0.9, duration: 460 }, { value: xBState.value, duration: 620 }],
      ease: 'outQuad',
    })
  }, [pendingSwap])

  // -- Mark swapped vehicles for the gold-glow effect ------------------------
  useEffect(() => {
    if (!pendingSwap) return
    if (pendingSwap.triggeredAt === prevSwapKeyRef.current) return
    prevSwapKeyRef.current = pendingSwap.triggeredAt
    const now = Date.now()
    overtakeUntilRef.current.set(pendingSwap.idA, now + 2600)
    overtakeUntilRef.current.set(pendingSwap.idB, now + 2600)
  }, [pendingSwap])

  // -- Main render loop ------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let rafId: number

    function draw() {
      const ctx = canvas!.getContext('2d')!

      try {
        const vArr = vehiclesRef.current
        const link = v2vLinkRef.current
        const selId = selectedIdRef.current
        const now = Date.now()
        
        // Calculate dt for scrolling
        if (lastDrawTimeRef.current === 0) lastDrawTimeRef.current = now
        const dtStr = (now - lastDrawTimeRef.current) / 1000
        lastDrawTimeRef.current = now
        
        // Update road scroll offset based on average platoon speed
        if (runningRef.current) {
           const speedMs = avgSpeedKmhRef.current / 3.6
           // Scroll backwards
           roadScrollOffsetRef.current -= (speedMs * PX_PER_METER * dtStr)
        }

        const w = canvas!.width
        const h = canvas!.height
        const laneCount = Math.max(MIN_LANE_COUNT, ...vArr.map((v) => Math.floor(v.y) + 1))
        const cameraX = cameraXRef.current.value
        
        // World to screen X. The leader (at max X) stays around WORLD_OFFSET_X.
        const worldToScreenX = (xMeters: number) =>
          (xMeters - cameraX) * PX_PER_METER + WORLD_OFFSET_X

        // -- Clear + sky/ground ------------------------------------------------
        ctx.clearRect(0, 0, w, h)
        const bg = ctx.createLinearGradient(0, 0, 0, h)
        bg.addColorStop(0, '#111113')
        bg.addColorStop(0.48, '#0a0a0a')
        bg.addColorStop(1, '#09090b')
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, w, h)

        const roadTop = h / 2 - 80
        const roadHeight = 160

        // -- Road surface ------------------------------------------------------
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fillRect(0, roadTop + roadHeight + 18, w, 20)
        ctx.fillStyle = 'rgba(255,255,255,0.045)'
        ctx.fillRect(0, roadTop - 18, w, 18)
        ctx.fillRect(0, roadTop + roadHeight, w, 18)

        const asphalt = ctx.createLinearGradient(0, roadTop, 0, roadTop + roadHeight)
        asphalt.addColorStop(0, '#18181b')
        asphalt.addColorStop(0.5, '#111113')
        asphalt.addColorStop(1, '#0f0f10')
        ctx.fillStyle = asphalt
        ctx.fillRect(0, roadTop, w, roadHeight)

        // Edge stripes
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(0, roadTop + 5); ctx.lineTo(w, roadTop + 5)
        ctx.moveTo(0, roadTop + roadHeight - 5); ctx.lineTo(w, roadTop + roadHeight - 5)
        ctx.stroke()

        // Lane dividers (scrolling dashed lines)
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'
        ctx.lineWidth = 1
        ctx.setLineDash([16, 16])
        ctx.lineDashOffset = -roadScrollOffsetRef.current
        for (let l = 1; l < laneCount; l++) {
          const ly = roadTop + (roadHeight / laneCount) * l
          ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(w, ly); ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.lineDashOffset = 0

        // -- Ruler -------------------------------------------------------------
        // Ruler scrolls with the road offset slightly for realism, or we can make it stationary. 
        // We'll keep it stationary to represent absolute world space since vehicles move through world space.
        ctx.fillStyle = 'rgba(161,161,170,0.72)'
        ctx.font = '10px Inter, Segoe UI, sans-serif'
        const rulerStepPx = 120
        // Calculate offset to make ruler scroll with camera
        const cameraPxOffset = (cameraX * PX_PER_METER) % rulerStepPx
        const baseRulerX = WORLD_OFFSET_X - cameraPxOffset

        for (let x = baseRulerX - rulerStepPx; x <= w + rulerStepPx; x += rulerStepPx) {
          if (x < 0) continue;
          ctx.beginPath()
          ctx.strokeStyle = 'rgba(255,255,255,0.12)'
          ctx.lineWidth = 1
          ctx.moveTo(x, roadTop + roadHeight + 2)
          ctx.lineTo(x, roadTop + roadHeight + 10)
          ctx.stroke()
          const meterLabel = Math.round(cameraX + ((x - WORLD_OFFSET_X) / PX_PER_METER))
          ctx.fillText(`${meterLabel}m`, x - 16, roadTop + roadHeight + 22)
        }

        // -- RSU infrastructure (world-space, stationary every 500m) --------------
        const RSU_SPACING_M = 500
        const RSU_RANGE_M   = 300
        const rsuScreenY    = roadTop - 64
        const firstRsuIdx = Math.floor((cameraX - RSU_RANGE_M) / RSU_SPACING_M) - 1
        const lastRsuIdx  = Math.ceil((cameraX + w / PX_PER_METER + RSU_RANGE_M) / RSU_SPACING_M) + 1
        const visibleRsus: Array<{ worldX: number; screenX: number }> = []
        for (let ri = firstRsuIdx; ri <= lastRsuIdx; ri++) {
          const worldX = ri * RSU_SPACING_M
          visibleRsus.push({ worldX, screenX: worldToScreenX(worldX) })
        }
        for (const rsu of visibleRsus) {
          const sx = rsu.screenX
          if (sx < -100 || sx > w + 100) continue
          ctx.strokeStyle = 'rgba(255,255,255,0.16)'
          ctx.lineWidth = 2
          ctx.beginPath(); ctx.moveTo(sx, roadTop - 6); ctx.lineTo(sx, roadTop - 58); ctx.stroke()
          ctx.fillStyle = '#818cf8'
          ctx.beginPath(); ctx.arc(sx, rsuScreenY, 8, 0, Math.PI * 2); ctx.fill()
          ctx.strokeStyle = 'rgba(129,140,248,0.28)'
          ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.arc(sx, rsuScreenY, 24, -0.85, 0.85); ctx.stroke()
          ctx.beginPath(); ctx.arc(sx, rsuScreenY, 38, -0.75, 0.75); ctx.stroke()
          ctx.fillStyle = '#a1a1aa'
          ctx.font = '11px Inter, Segoe UI, sans-serif'
          ctx.fillText('RSU', sx - 11, roadTop - 74)
        }

        // -- Per-vehicle display Y (continuous lane position) ------------------
        const dispWyMap = new Map<string, number>()
        for (const v of vArr) {
          const wyVal = v.wy ?? v.y
          dispWyMap.set(v.id, clamp(displayedWyRef.current.get(v.id)?.value ?? wyVal, 0, laneCount - 1))
        }

        // -- Platoon grouping for links + labels -------------------------------
        const platoonIndices = Array.from(new Set(vArr.map((v) => v.y))).sort((a, b) => a - b)
        const platoonGroups = platoonIndices.map((lane) => ({
          lane,
          vehicles: vArr.filter((v) => v.y === lane),
        }))

        // -- V2V links ---------------------------------------------------------
        function drawLinks(platoon: VehicleState[]) {
          if (platoon.length < 2) return
          const lc = link === 'Connected' ? 'rgba(52,211,153,0.46)'
            : link === 'Degraded' ? 'rgba(251,191,36,0.38)'
            : 'rgba(251,113,133,0.34)'
          ctx.strokeStyle = lc
          ctx.setLineDash([6, 5])
          ctx.lineWidth = 1.5
          for (let i = 0; i < platoon.length - 1; i++) {
            const a = platoon[i]; const b = platoon[i + 1]
            const ax = worldToScreenX(displayedXRef.current.get(a.id)?.value ?? a.x)
            const bx = worldToScreenX(displayedXRef.current.get(b.id)?.value ?? b.x)
            const ay = laneToScreenY(roadTop, roadHeight, dispWyMap.get(a.id) ?? a.y, laneCount)
            const by = laneToScreenY(roadTop, roadHeight, dispWyMap.get(b.id) ?? b.y, laneCount)
            ctx.beginPath()
            ctx.moveTo(ax - VEHICLE_WIDTH / 2, ay - 13)
            ctx.lineTo(bx + VEHICLE_WIDTH / 2, by - 13)
            ctx.stroke()
            const gap = Math.abs(a.x - b.x).toFixed(1)
            ctx.setLineDash([])
            ctx.fillStyle = 'rgba(165,180,252,0.82)'
            ctx.font = '10px Inter, Segoe UI, sans-serif'
            ctx.fillText(`${gap}m`, (ax + bx) / 2 - 10, Math.min(ay, by) - 18)
            ctx.setLineDash([6, 5])
          }
          ctx.setLineDash([])
        }
        for (const pg of platoonGroups) drawLinks(pg.vehicles)

        // -- RSU V2I signal beams: connect cars to nearest in-range RSU --------
        if (link !== 'Disconnected') {
          const signal = (Math.sin(now / 140) + 1) / 2
          for (const [idx, vehicle] of vArr.entries()) {
            const vWorldX = displayedXRef.current.get(vehicle.id)?.value ?? vehicle.x
            let nearestRsu: { worldX: number; screenX: number } | null = null
            let nearestDist = Infinity
            for (const rsu of visibleRsus) {
              const dist = Math.abs(vWorldX - rsu.worldX)
              if (dist < RSU_RANGE_M && dist < nearestDist) { nearestDist = dist; nearestRsu = rsu }
            }
            if (!nearestRsu) continue
            const vx = worldToScreenX(vWorldX)
            const vy = laneToScreenY(roadTop, roadHeight, dispWyMap.get(vehicle.id) ?? vehicle.y, laneCount)
            const alphaBase = link === 'Connected' ? 0.28 : 0.16
            ctx.strokeStyle = 
`rgba(129,140,248,${alphaBase + signal * 0.18})`
            ctx.lineWidth = 1
            ctx.setLineDash([5, 4])
            ctx.beginPath()
            ctx.moveTo(vx + 12, vy - 8)
            ctx.quadraticCurveTo((vx + nearestRsu.screenX) / 2, roadTop - 90 - (idx % 3) * 6, nearestRsu.screenX, rsuScreenY + 4)
            ctx.stroke()
            ctx.setLineDash([])
          }
        }

        // -- Draw individual vehicle (Realistic Canvas API render) -------------
        function drawVehicle(v: VehicleState, isLeader: boolean, baseColor: string, vehicleLabel: string) {
          const dispX = displayedXRef.current.get(v.id)?.value ?? v.x
          const dispWy = dispWyMap.get(v.id) ?? (v.wy ?? v.y)
          const drawX = worldToScreenX(dispX)
          if (drawX < -120 || drawX > w + 120) return

          const carCenterY = laneToScreenY(roadTop, roadHeight, dispWy, laneCount)
          const bx = drawX - VEHICLE_WIDTH / 2
          const by = carCenterY - VEHICLE_HEIGHT / 2

          const heading = v.heading ?? 0
          const crashed = v.crashed ?? false
          const speedKmh = v.speed * 3.6
          const speedCue = Math.min(1, speedKmh / 90)
          
          // Tiny organic sway in radians
          const sway = Math.sin(now / 120 + drawX * 0.06) * speedCue * 0.009

          const isOvertaking = (overtakeUntilRef.current.get(v.id) ?? 0) > now
          
          // Determine realistic colors based on state.
          const bodyColor = crashed ? '#fb7185' : (isLeader ? '#34d399' : baseColor)
          const trimColor = 'rgba(255,255,255,0.16)'
          const tireColor = '#050505'

          // -- Speed trail ---------------------------------------------------
          if (!crashed && (isOvertaking || speedCue > 0.35)) {
            const trailLen = isOvertaking ? 60 : 30 + speedCue * 34
            const trail = ctx.createLinearGradient(bx - trailLen, by, bx, by)
            trail.addColorStop(0, 'rgba(129,140,248,0)')
            trail.addColorStop(0.6, `rgba(129,140,248,${0.04 + speedCue * 0.08})`)
            trail.addColorStop(1, `rgba(129,140,248,${0.14 + speedCue * 0.12})`)
            ctx.fillStyle = trail
            ctx.beginPath()
            ctx.roundRect(bx - trailLen, by - 3, trailLen, VEHICLE_HEIGHT + 6, 4)
            ctx.fill()
          }

          // -- Apply heading rotation around vehicle centre -------------------
          ctx.save()
          ctx.translate(drawX, carCenterY)
          ctx.rotate(heading + sway)   // radians — physics heading + micro-sway
          
          // Draw coordinates are now relative to the center of the car
          const cx = -VEHICLE_WIDTH / 2
          const cy = -VEHICLE_HEIGHT / 2

          // -- Drop Shadow ---------------------------------------------------
          ctx.shadowColor = 'rgba(0,0,0,0.72)'
          ctx.shadowBlur = 12
          ctx.shadowOffsetX = 2
          ctx.shadowOffsetY = 4

          // -- Car Body (Realistic Canvas Styling) ---------------------------
          ctx.fillStyle = bodyColor
          ctx.beginPath()
          ctx.roundRect(cx, cy, VEHICLE_WIDTH, VEHICLE_HEIGHT, 8)
          ctx.fill()
          
          // Clear shadow for subsequent draws
          ctx.shadowColor = 'transparent'

          // Gradient Overlay to give 3D metallic feel
          const bodyGrad = ctx.createLinearGradient(cx, cy, cx, cy + VEHICLE_HEIGHT)
          bodyGrad.addColorStop(0, 'rgba(255,255,255,0.18)')
          bodyGrad.addColorStop(0.5, 'rgba(255,255,255,0.02)')
          bodyGrad.addColorStop(1, 'rgba(0,0,0,0.28)')
          ctx.fillStyle = bodyGrad
          ctx.beginPath()
          ctx.roundRect(cx, cy, VEHICLE_WIDTH, VEHICLE_HEIGHT, 8)
          ctx.fill()
          ctx.strokeStyle = trimColor
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(cx + 0.5, cy + 0.5, VEHICLE_WIDTH - 1, VEHICLE_HEIGHT - 1, 8)
          ctx.stroke()

          // Wheels and lower trim make the top-down vehicle read less like a flat tile.
          ctx.fillStyle = tireColor
          for (const wheelX of [cx + 10, cx + VEHICLE_WIDTH - 20]) {
            ctx.beginPath()
            ctx.roundRect(wheelX, cy - 3, 11, 5, 2)
            ctx.fill()
            ctx.beginPath()
            ctx.roundRect(wheelX, cy + VEHICLE_HEIGHT - 2, 11, 5, 2)
            ctx.fill()
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.12)'
          ctx.beginPath()
          ctx.moveTo(cx + 8, cy + VEHICLE_HEIGHT / 2)
          ctx.lineTo(cx + VEHICLE_WIDTH - 8, cy + VEHICLE_HEIGHT / 2)
          ctx.stroke()

          // -- Roof / Cabin --------------------------------------------------
          const cabinW = VEHICLE_WIDTH * 0.55
          const cabinH = VEHICLE_HEIGHT * 0.8
          const cabinX = cx + VEHICLE_WIDTH * 0.25
          const cabinY = cy + (VEHICLE_HEIGHT - cabinH) / 2
          
          ctx.fillStyle = 'rgba(9,9,11,0.88)'
          ctx.beginPath()
          ctx.roundRect(cabinX, cabinY, cabinW, cabinH, 6)
          ctx.fill()
          
          // Roof top (solid color)
          ctx.fillStyle = bodyColor
          ctx.beginPath()
          ctx.roundRect(cabinX + 6, cabinY + 2, cabinW - 14, cabinH - 4, 3)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.1)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(cabinX + 0.5, cabinY + 0.5, cabinW - 1, cabinH - 1, 6)
          ctx.stroke()

          // Rear window defroster lines
          ctx.strokeStyle = 'rgba(255,255,255,0.1)'
          ctx.lineWidth = 0.5
          ctx.beginPath()
          for (let i = 1; i <= 3; i++) {
            ctx.moveTo(cabinX + 2, cabinY + 2 + i * 4)
            ctx.lineTo(cabinX + 6, cabinY + 2 + i * 4)
          }
          ctx.stroke()

          // -- Lights (Headlights & Taillights) ------------------------------
          if (!crashed) {
            // Headlights (Front right/left)
            ctx.fillStyle = '#f8fafc'
            ctx.fillRect(cx + VEHICLE_WIDTH - 4, cy + 3, 4, 5)
            ctx.fillRect(cx + VEHICLE_WIDTH - 4, cy + VEHICLE_HEIGHT - 8, 4, 5)
            
            // Headlight Glow
            const glowGradTop = ctx.createRadialGradient(
              cx + VEHICLE_WIDTH, cy + 5, 0,
              cx + VEHICLE_WIDTH, cy + 5, 24
            )
            glowGradTop.addColorStop(0, 'rgba(248, 250, 252, 0.32)')
            glowGradTop.addColorStop(1, 'rgba(255, 255, 255, 0)')
            ctx.fillStyle = glowGradTop
            ctx.beginPath()
            ctx.arc(cx + VEHICLE_WIDTH, cy + 5, 30, -Math.PI/2, Math.PI/2)
            ctx.fill()
            
            const glowGradBot = ctx.createRadialGradient(
              cx + VEHICLE_WIDTH, cy + VEHICLE_HEIGHT - 5, 0,
              cx + VEHICLE_WIDTH, cy + VEHICLE_HEIGHT - 5, 24
            )
            glowGradBot.addColorStop(0, 'rgba(248, 250, 252, 0.32)')
            glowGradBot.addColorStop(1, 'rgba(255, 255, 255, 0)')
            ctx.fillStyle = glowGradBot
            ctx.beginPath()
            ctx.arc(cx + VEHICLE_WIDTH, cy + VEHICLE_HEIGHT - 5, 30, -Math.PI/2, Math.PI/2)
            ctx.fill()

            // Taillights (Rear right/left)
            const isBraking = v.brake || v.accel < -0.5
            const tailColor = isBraking ? '#fb7185' : '#881337'
            ctx.fillStyle = tailColor
            ctx.fillRect(cx, cy + 3, 3, 6)
            ctx.fillRect(cx, cy + VEHICLE_HEIGHT - 9, 3, 6)
            
            // Brake Glow
            if (isBraking) {
              ctx.shadowColor = 'rgba(251,113,133,0.9)'
              ctx.shadowBlur = 12
              ctx.fillStyle = 'rgba(251,113,133,0.68)'
              ctx.fillRect(cx - 2, cy + 3, 2, 6)
              ctx.fillRect(cx - 2, cy + VEHICLE_HEIGHT - 9, 2, 6)
              ctx.shadowColor = 'transparent'
            }

            // Speed streaks at high velocity
            if (speedCue > 0.45) {
              ctx.strokeStyle = `rgba(165,180,252,${0.16 + speedCue * 0.22})`
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.moveTo(cx - 8, cy + 7)
              ctx.lineTo(cx - 24 - speedCue * 10, cy + 7)
              ctx.moveTo(cx - 8, cy + VEHICLE_HEIGHT - 7)
              ctx.lineTo(cx - 24 - speedCue * 10, cy + VEHICLE_HEIGHT - 7)
              ctx.stroke()
            }
          }

          // -- Crash Overlay -------------------------------------------------
          if (crashed) {
            ctx.shadowColor = 'rgba(251,113,133,0.55)'
            ctx.shadowBlur = 14
            ctx.strokeStyle = '#fb7185'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.roundRect(cx - 2, cy - 2, VEHICLE_WIDTH + 4, VEHICLE_HEIGHT + 4, 9)
            ctx.stroke()
            ctx.shadowColor = 'transparent'
            
            // "×" mark
            ctx.strokeStyle = '#fff1f2'
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.moveTo(cx + 12, cy + 8)
            ctx.lineTo(cx + VEHICLE_WIDTH - 12, cy + VEHICLE_HEIGHT - 8)
            ctx.moveTo(cx + VEHICLE_WIDTH - 12, cy + 8)
            ctx.lineTo(cx + 12, cy + VEHICLE_HEIGHT - 8)
            ctx.stroke()

            ctx.fillStyle = '#fb7185'
            ctx.font = 'bold 9px Inter, Segoe UI, sans-serif'
            ctx.fillText('CRASH', cx + 2, cy - 4)
          }

          // -- Overtake Gold Glow --------------------------------------------
          if (!crashed && isOvertaking) {
            ctx.shadowColor = 'rgba(129,140,248,0.5)'
            ctx.shadowBlur = 16
            ctx.strokeStyle = '#a5b4fc'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.roundRect(cx, cy, VEHICLE_WIDTH, VEHICLE_HEIGHT, 8)
            ctx.stroke()
            ctx.shadowColor = 'transparent'
          }

          // -- Selection Highlight -------------------------------------------
          if (selId === v.id) {
            ctx.shadowColor = 'rgba(165,180,252,0.45)'
            ctx.shadowBlur = 14
            ctx.strokeStyle = '#a5b4fc'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.roundRect(cx - 4, cy - 4, VEHICLE_WIDTH + 8, VEHICLE_HEIGHT + 8, 10)
            ctx.stroke()
            ctx.shadowColor = 'transparent'
          }

          ctx.restore() // Restore un-rotated context for labels

          // -- FSM Transfer Phase Badge --------------------------------------
          const phase = v.transferPhase
          if (phase && !crashed) {
            const phaseLabel = phase === 'departing' ? 'DEPARTING'
              : phase === 'in-transit' ? 'IN TRANSIT'
              : 'STABILIZING'
            const phaseColor = phase === 'departing' ? 'rgba(251,191,36,0.16)'
              : phase === 'in-transit' ? 'rgba(129,140,248,0.18)'
              : 'rgba(52,211,153,0.16)'
            const phaseTextColor = phase === 'departing' ? '#fbbf24'
              : phase === 'in-transit' ? '#a5b4fc'
              : '#34d399'

            ctx.font = 'bold 8px Inter, Segoe UI, sans-serif'
            const badgeW = ctx.measureText(phaseLabel).width + 10
            const badgeH = 14
            const badgeX = drawX - badgeW / 2
            const badgeY = carCenterY - VEHICLE_HEIGHT / 2 - badgeH - 8

            ctx.fillStyle = phaseColor
            ctx.beginPath()
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4)
            ctx.fill()
            ctx.strokeStyle = 'rgba(255,255,255,0.1)'
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.fillStyle = phaseTextColor
            ctx.fillText(phaseLabel, badgeX + 5, badgeY + badgeH - 3)

            // Animated progress bar below badge during stabilizing
            if (phase === 'stabilizing' && v.stabilizeStartMs) {
              const elapsed = (Date.now() - v.stabilizeStartMs) / 2000 // 2s total
              const progressW = Math.min(1, elapsed) * VEHICLE_WIDTH
              ctx.fillStyle = 'rgba(52,211,153,0.14)'
              ctx.fillRect(drawX - VEHICLE_WIDTH / 2, carCenterY + VEHICLE_HEIGHT / 2 + 2, VEHICLE_WIDTH, 3)
              ctx.fillStyle = 'rgba(52,211,153,0.72)'
              ctx.fillRect(drawX - VEHICLE_WIDTH / 2, carCenterY + VEHICLE_HEIGHT / 2 + 2, progressW, 3)
            }
          }

          // -- Label + speed readout (Un-rotated so they are always readable) 
          ctx.fillStyle = crashed ? '#fb7185' : isOvertaking ? '#a5b4fc' : '#fafafa'
          ctx.font = 'bold 10px Inter, Segoe UI, sans-serif'
          ctx.fillText(vehicleLabel, drawX - VEHICLE_WIDTH/2 + 3, carCenterY - VEHICLE_HEIGHT/2 - 6)
          if (!crashed) {
            ctx.font = '9px Inter, Segoe UI, sans-serif'
            ctx.fillStyle = '#a1a1aa'
            ctx.fillText(`${speedKmh.toFixed(0)} km/h`, drawX - VEHICLE_WIDTH/2 + 3, carCenterY + VEHICLE_HEIGHT/2 + 10)
          }
        }

        // -- Render all vehicles back-to-front ---------------------------------
        const palette = ['#6366f1', '#71717a', '#52525b']
        for (const pg of [...platoonGroups].reverse()) {
          const color = palette[pg.lane % palette.length]
          pg.vehicles.forEach((vehicle, index) => {
            const label = index === 0 ? `L${String.fromCharCode(65 + pg.lane)}` : `F${index}`
            drawVehicle(vehicle, index === 0, color, label)
          })
        }

        // -- Platoon lane labels -----------------------------------------------
        ctx.font = 'bold 11px Inter, Segoe UI, sans-serif'
        for (const lane of platoonIndices) {
          const labelY = laneToScreenY(roadTop, roadHeight, lane, laneCount) - VEHICLE_HEIGHT / 2 - 10
          ctx.fillStyle = lane === 0 ? 'rgba(165,180,252,0.88)' : lane === 1 ? 'rgba(212,212,216,0.76)' : 'rgba(161,161,170,0.7)'
          ctx.fillText(`PLATOON ${String.fromCharCode(65 + lane)}`, 8, labelY)
        }

        // -- FPS counter -------------------------------------------------------
        const tNow = performance.now()
        if (fpsRef.current.lastTs > 0) {
          const dt = tNow - fpsRef.current.lastTs
          fpsRef.current.value = fpsRef.current.value * 0.85 + (1000 / Math.max(1, dt)) * 0.15
        }
        fpsRef.current.lastTs = tNow
        const fpsLabel = Math.round(fpsRef.current.value)
        const badgeW = 84; const badgeH = 24
        const badgeX = w - badgeW - 12; const badgeY = 12
        ctx.fillStyle = 'rgba(255,255,255,0.045)'
        ctx.beginPath()
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8)
        ctx.fill()
        ctx.strokeStyle = fpsLabel >= 30 ? 'rgba(52,211,153,0.22)' : 'rgba(251,113,133,0.22)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = fpsLabel >= 30 ? '#d4d4d8' : '#fb7185'
        ctx.font = 'bold 11px Inter, Segoe UI, sans-serif'
        ctx.fillText(`FPS ${fpsLabel}`, badgeX + 18, badgeY + 16)
      } catch (error) {
        if (!drawErrorLoggedRef.current) {
          drawErrorLoggedRef.current = true
          console.error('[simulation-canvas]', error)
        }
      }
    }

    const loop = () => { draw(); rafId = requestAnimationFrame(loop) }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // -- Click-to-select -------------------------------------------------------
  function handleCanvasClick(event: MouseEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current
    if (!canvas || !onVehicleClick) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clickX = (event.clientX - rect.left) * scaleX
    const clickY = (event.clientY - rect.top) * scaleY

    const roadTop = canvas.height / 2 - 80
    const roadHeight = 160
    const vArr = vehiclesRef.current
    const cameraX = cameraXRef.current.value
    const worldToScreenX = (xMeters: number) =>
      (xMeters - cameraX) * PX_PER_METER + WORLD_OFFSET_X
    const laneCount = Math.max(MIN_LANE_COUNT, ...vArr.map((v) => Math.floor(v.y) + 1))

    for (const v of vArr) {
      const dispWy = displayedWyRef.current.get(v.id)?.value ?? (v.wy ?? v.y)
      const carCenterY = laneToScreenY(roadTop, roadHeight, dispWy, laneCount)
      const dispX = displayedXRef.current.get(v.id)?.value ?? v.x
      const drawX = worldToScreenX(dispX)
      const bx = drawX - VEHICLE_WIDTH / 2
      const by = carCenterY - VEHICLE_HEIGHT / 2

      if (clickX >= bx && clickX <= bx + VEHICLE_WIDTH && clickY >= by && clickY <= by + VEHICLE_HEIGHT) {
        onVehicleClick(v.id)
        return
      }
    }
  }

  return (
    <canvas
      className="sim-canvas"
      ref={canvasRef}
      width={960}
      height={480}
      onClick={handleCanvasClick}
    />
  )
}
