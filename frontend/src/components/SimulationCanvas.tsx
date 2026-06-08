import { animate } from 'animejs'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent, WheelEvent } from 'react'
import type { VehicleState } from '../types/sim'
import { RefreshIcon } from './Icons'

type Props = {
  vehicles: VehicleState[]
  v2vLink: 'Connected' | 'Degraded' | 'Disconnected'
  selectedVehicleId?: string | null
  onVehicleClick?: (id: string) => void
  pendingSwap?: { idA: string; idB: string; triggeredAt: number } | null
  running: boolean
  avgSpeedMs?: number
  theme?: 'dark' | 'light'
  simSpeed?: 1 | 2 | 4
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

function getRoadOffsetY(worldX: number): number {
  const cycle = 4000
  const localX = ((worldX % cycle) + cycle) % cycle
  const shiftAmount = 250
  const curveLength = 600

  if (localX < 1400) {
    return 0
  } else if (localX < 1400 + curveLength) {
    const t = (localX - 1400) / curveLength
    return ((1 - Math.cos(t * Math.PI)) / 2) * shiftAmount
  } else if (localX < 3400) {
    return shiftAmount
  } else {
    const t = (localX - 3400) / curveLength
    return shiftAmount - ((1 - Math.cos(t * Math.PI)) / 2) * shiftAmount
  }
}

function getRoadAngle(worldX: number): number {
  const cycle = 4000
  const localX = ((worldX % cycle) + cycle) % cycle
  const shiftAmount = 250
  const curveLength = 600

  if (localX < 1400) {
    return 0
  } else if (localX < 1400 + curveLength) {
    const t = (localX - 1400) / curveLength
    const dy_dx = (shiftAmount / 2) * (Math.PI / curveLength) * Math.sin(t * Math.PI)
    return Math.atan(dy_dx)
  } else if (localX < 3400) {
    return 0
  } else {
    const t = (localX - 3400) / curveLength
    const dy_dx = -(shiftAmount / 2) * (Math.PI / curveLength) * Math.sin(t * Math.PI)
    return Math.atan(dy_dx)
  }
}

export function SimulationCanvas({
  vehicles,
  v2vLink,
  selectedVehicleId,
  onVehicleClick,
  pendingSwap,
  running,
  avgSpeedMs = 0,
  theme = 'dark',
  simSpeed = 1,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null)
  const hoveredIdRef = useRef<string | null>(null)

  const vehiclesRef = useRef(vehicles)
  const v2vLinkRef = useRef(v2vLink)
  const selectedIdRef = useRef(selectedVehicleId)
  const runningRef = useRef(running)
  const avgSpeedMsRef = useRef(avgSpeedMs)
  const themeRef = useRef(theme)

  useEffect(() => {
    hoveredIdRef.current = hoveredVehicleId
  }, [hoveredVehicleId])

  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    vehiclesRef.current = vehicles
    v2vLinkRef.current = v2vLink
    selectedIdRef.current = selectedVehicleId
    runningRef.current = running
    avgSpeedMsRef.current = avgSpeedMs
  }, [vehicles, v2vLink, selectedVehicleId, running, avgSpeedMs])

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

  // -- Manual Camera Pan State -----------------------------------------------
  // When cameraLockedRef = false the camera no longer auto-follows the leader.
  const [cameraLocked, setCameraLocked] = useState(true)
  const cameraLockedRef = useRef(true)
  // Drag tracking
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)          // clientX at drag start
  const dragCameraStartRef = useRef(0)     // cameraX.value at drag start

  useEffect(() => {
    cameraLockedRef.current = cameraLocked
  }, [cameraLocked])

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
          duration: runningRef.current ? (360 / simSpeed) : 220,
          ease: 'outQuad',
        })
      }

      // wy: short interpolation — physics already eases it, this just bridges 20 Hz gaps
      const wyVal = v.wy ?? v.y   // guard for old-format states
      const wyState = ensureState(displayedWyRef.current, v.id, wyVal)
      if (Math.abs(wyVal - wyState.value) > 0.005) {
        animate(wyState, {
          value: wyVal,
          duration: 200 / simSpeed,
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
  }, [vehicles, simSpeed])

  // -- Camera follow ---------------------------------------------------------
  useEffect(() => {
    // Only auto-follow when camera is locked to leader
    if (!cameraLockedRef.current) return
    const leader = vehicles.find((v) => v.y === 0) ?? vehicles[0]
    const targetCamera = leader ? leader.x - CAMERA_LEAD_METERS : 0
    if (Math.abs(targetCamera - cameraTargetRef.current) < 0.12) return
    cameraTargetRef.current = targetCamera
    animate(cameraXRef.current, {
      value: targetCamera,
      duration: running ? 620 : 420,
      ease: running ? 'inOutSine' : 'outQuad',
    })
  }, [running, vehicles, cameraLocked])

  useEffect(() => {
    if (running || !cameraLockedRef.current) return
    const leader = vehicles.find((v) => v.y === 0) ?? vehicles[0]
    cameraTargetRef.current = leader ? leader.x - CAMERA_LEAD_METERS : 0
    cameraXRef.current.value = cameraTargetRef.current
  }, [running, vehicles])

  // -- Re-lock camera to leader ----------------------------------------------
  const relockCamera = useCallback(() => {
    setCameraLocked(true)
    cameraLockedRef.current = true
    const leader = vehiclesRef.current.find((v) => v.y === 0) ?? vehiclesRef.current[0]
    const targetCamera = leader ? leader.x - CAMERA_LEAD_METERS : 0
    cameraTargetRef.current = targetCamera
    animate(cameraXRef.current, { value: targetCamera, duration: 500, ease: 'outQuad' })
  }, [])

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
        const rect = canvas!.getBoundingClientRect()
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const targetW = Math.round(rect.width * dpr)
        const targetH = Math.round(rect.height * dpr)

        if (canvas!.width !== targetW || canvas!.height !== targetH) {
          canvas!.width = targetW
          canvas!.height = targetH
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        const vArr = vehiclesRef.current
        const link = v2vLinkRef.current
        const selId = selectedIdRef.current
        const hoveredId = hoveredIdRef.current
        const canvasTheme = themeRef.current
        const now = Date.now()
        
        // Calculate dt for scrolling
        if (lastDrawTimeRef.current === 0) lastDrawTimeRef.current = now
        const dtStr = (now - lastDrawTimeRef.current) / 1000
        lastDrawTimeRef.current = now
        
        // Update road scroll offset based on average platoon speed
        if (runningRef.current) {
           const speedMs = avgSpeedMsRef.current
           // Scroll backwards
           roadScrollOffsetRef.current -= (speedMs * PX_PER_METER * dtStr)
        }

        const w = rect.width
        const h = rect.height
        const laneCount = Math.max(MIN_LANE_COUNT, ...vArr.map((v) => Math.floor(v.y) + 1))
        const cameraX = cameraXRef.current.value
        
        // World to screen X. The leader (at max X) stays around WORLD_OFFSET_X.
        const worldToScreenX = (xMeters: number) =>
          (xMeters - cameraX) * PX_PER_METER + WORLD_OFFSET_X

        const screenToWorldX = (sx: number) =>
          (sx - WORLD_OFFSET_X) / PX_PER_METER + cameraX

        const cameraOffsetY = getRoadOffsetY(screenToWorldX(w / 2))

        // -- The Warp Function -------------------------------------------------
        const applyCurve = (sx: number, sy: number) => {
          const worldX = screenToWorldX(sx)
          const offsetY = getRoadOffsetY(worldX)
          const angle = getRoadAngle(worldX)
          return { x: sx, y: sy + offsetY - cameraOffsetY, angle }
        }

        // -- Clear + sky/ground ------------------------------------------------
        ctx.clearRect(0, 0, w, h)
        const bg = ctx.createLinearGradient(0, 0, 0, h)
        if (canvasTheme === 'light') {
          bg.addColorStop(0, '#cbd5e1')
          bg.addColorStop(0.48, '#e2e8f0')
          bg.addColorStop(1, '#cbd5e1')
        } else {
          bg.addColorStop(0, '#111113')
          bg.addColorStop(0.48, '#0a0a0a')
          bg.addColorStop(1, '#09090b')
        }
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, w, h)

        const roadTop = h / 2 - 80
        const roadHeight = 160

        const startX = -100
        const endX = w + 100

        // -- Road surface (Curved shape) ---------------------------------------
        const asphalt = ctx.createLinearGradient(0, roadTop - 300, 0, roadTop + roadHeight + 300)
        if (canvasTheme === 'light') {
          asphalt.addColorStop(0, '#cbd5e1')
          asphalt.addColorStop(0.5, '#94a3b8')
          asphalt.addColorStop(1, '#cbd5e1')
        } else {
          asphalt.addColorStop(0, '#18181b')
          asphalt.addColorStop(0.5, '#111113')
          asphalt.addColorStop(1, '#0f0f10')
        }
        ctx.fillStyle = asphalt
        ctx.beginPath()
        for (let x = startX; x <= endX; x += 50) {
          const mapped = applyCurve(x, roadTop)
          if (x === startX) ctx.moveTo(mapped.x, mapped.y)
          else ctx.lineTo(mapped.x, mapped.y)
        }
        {
          const mapped = applyCurve(endX, roadTop)
          ctx.lineTo(mapped.x, mapped.y)
        }
        for (let x = endX; x >= startX; x -= 50) {
          const mapped = applyCurve(x, roadTop + roadHeight)
          ctx.lineTo(mapped.x, mapped.y)
        }
        {
          const mapped = applyCurve(startX, roadTop + roadHeight)
          ctx.lineTo(mapped.x, mapped.y)
        }
        ctx.fill()

        // Edge stripes
        ctx.strokeStyle = canvasTheme === 'light' ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1
        ctx.setLineDash([])
        ctx.beginPath()
        for (let x = startX; x <= endX; x += 50) {
          const mapped = applyCurve(x, roadTop + 5)
          if (x === startX) ctx.moveTo(mapped.x, mapped.y)
          else ctx.lineTo(mapped.x, mapped.y)
        }
        {
          const mapped = applyCurve(endX, roadTop + 5)
          ctx.lineTo(mapped.x, mapped.y)
        }
        ctx.stroke()
        ctx.beginPath()
        for (let x = startX; x <= endX; x += 50) {
          const mapped = applyCurve(x, roadTop + roadHeight - 5)
          if (x === startX) ctx.moveTo(mapped.x, mapped.y)
          else ctx.lineTo(mapped.x, mapped.y)
        }
        {
          const mapped = applyCurve(endX, roadTop + roadHeight - 5)
          ctx.lineTo(mapped.x, mapped.y)
        }
        ctx.stroke()

        // Lane dividers (scrolling dashed lines)
        ctx.strokeStyle = canvasTheme === 'light' ? 'rgba(15, 23, 42, 0.22)' : 'rgba(255,255,255,0.18)'
        ctx.lineWidth = 1
        ctx.setLineDash([16, 16])
        ctx.lineDashOffset = -roadScrollOffsetRef.current
        for (let l = 1; l < laneCount; l++) {
          const ly = roadTop + (roadHeight / laneCount) * l
          ctx.beginPath()
          for (let x = startX; x <= endX; x += 50) {
            const mapped = applyCurve(x, ly)
            if (x === startX) ctx.moveTo(mapped.x, mapped.y)
            else ctx.lineTo(mapped.x, mapped.y)
          }
          {
            const mapped = applyCurve(endX, ly)
            ctx.lineTo(mapped.x, mapped.y)
          }
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.lineDashOffset = 0

        // -- Ruler -------------------------------------------------------------
        // Ruler scrolls with the road offset slightly for realism, or we can make it stationary. 
        // We'll keep it stationary to represent absolute world space since vehicles move through world space.
        ctx.fillStyle = canvasTheme === 'light' ? '#475569' : 'rgba(161,161,170,0.72)'
        ctx.font = '10px Inter, Segoe UI, sans-serif'
        const rulerStepPx = 120
        // Calculate offset to make ruler scroll with camera
        const cameraPxOffset = (cameraX * PX_PER_METER) % rulerStepPx
        const baseRulerX = WORLD_OFFSET_X - cameraPxOffset

        for (let x = baseRulerX - rulerStepPx; x <= w + rulerStepPx; x += rulerStepPx) {
          if (x < 0) continue;
          ctx.beginPath()
          ctx.strokeStyle = canvasTheme === 'light' ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.12)'
          ctx.lineWidth = 1
          const map1 = applyCurve(x, roadTop + roadHeight + 2)
          const map2 = applyCurve(x, roadTop + roadHeight + 10)
          ctx.moveTo(map1.x, map1.y)
          ctx.lineTo(map2.x, map2.y)
          ctx.stroke()
          const meterLabel = Math.round(cameraX + ((x - WORLD_OFFSET_X) / PX_PER_METER))
          const labelMap = applyCurve(x - 16, roadTop + roadHeight + 22)
          ctx.fillText(`${meterLabel}m`, labelMap.x, labelMap.y)
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
          const nodeMap = applyCurve(sx, rsuScreenY)
          const textMap = applyCurve(sx - 11, roadTop - 74)

          ctx.save()
          ctx.translate(nodeMap.x, nodeMap.y)
          ctx.rotate(nodeMap.angle)

          // 1. Draw the pole (metallic linear gradient)
          const poleGrad = ctx.createLinearGradient(-3, 0, 3, 0)
          if (canvasTheme === 'light') {
            poleGrad.addColorStop(0, '#64748b')
            poleGrad.addColorStop(0.5, '#cbd5e1')
            poleGrad.addColorStop(1, '#475569')
          } else {
            poleGrad.addColorStop(0, '#3f3f46')
            poleGrad.addColorStop(0.5, '#71717a')
            poleGrad.addColorStop(1, '#27272a')
          }
          ctx.fillStyle = poleGrad
          ctx.beginPath()
          // Tapered pole: wider at bottom (58px), narrower at top (0px)
          ctx.moveTo(-2.5, 58)
          ctx.lineTo(2.5, 58)
          ctx.lineTo(1.2, 0)
          ctx.lineTo(-1.2, 0)
          ctx.closePath()
          ctx.fill()

          // 2. Base cabinet / enclosure (power and processing unit)
          ctx.fillStyle = canvasTheme === 'light' ? '#94a3b8' : '#3f3f46'
          ctx.strokeStyle = canvasTheme === 'light' ? '#475569' : '#18181b'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(-6, 44, 12, 14, 2)
          ctx.fill()
          ctx.stroke()
          // Cabinet door detail
          ctx.strokeStyle = canvasTheme === 'light' ? '#cbd5e1' : '#52525b'
          ctx.beginPath()
          ctx.moveTo(-2, 48)
          ctx.lineTo(-2, 54)
          ctx.stroke()

          // 3. Mini Solar Panel (green energy source for remote RSU)
          // Mounting bracket
          ctx.strokeStyle = canvasTheme === 'light' ? '#475569' : '#71717a'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(0, 26)
          ctx.lineTo(10, 22)
          ctx.stroke()
          // Slanted solar panel
          ctx.fillStyle = '#1e3a8a' // Dark blue cell
          ctx.strokeStyle = '#3b82f6' // Light blue metal frame
          ctx.lineWidth = 1
          ctx.save()
          ctx.translate(10, 22)
          ctx.rotate(-Math.PI / 6) // tilt 30 degrees
          ctx.beginPath()
          ctx.roundRect(-2, -8, 4, 16, 1)
          ctx.fill()
          ctx.stroke()
          // Solar grid lines
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(0, -8)
          ctx.lineTo(0, 8)
          ctx.moveTo(-2, 0)
          ctx.lineTo(2, 0)
          ctx.stroke()
          ctx.restore()

          // 4. Antenna Transceiver Box (5G MIMO Beamforming Panel)
          ctx.fillStyle = canvasTheme === 'light' ? '#e2e8f0' : '#d4d4d8'
          ctx.strokeStyle = canvasTheme === 'light' ? '#475569' : '#52525b'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(-4, -14, 8, 16, 1.5)
          ctx.fill()
          ctx.stroke()

          // 5. Blinking Status LED indicator
          const ledOn = (now % 1000) < 500
          if (link === 'Connected') {
            ctx.fillStyle = ledOn ? '#10b981' : '#047857' // Active green
          } else if (link === 'Degraded') {
            ctx.fillStyle = ledOn ? '#f59e0b' : '#b45309' // Degraded amber
          } else {
            ctx.fillStyle = ledOn ? '#ef4444' : '#b91c1c' // Disconnected red
          }
          ctx.beginPath()
          ctx.arc(0, -6, 1.5, 0, Math.PI * 2)
          ctx.fill()

          // 6. Realistic wave propagation ring micro-animations (expanding outward)
          const waveTime = (now / 1500) % 1.0
          const maxRadius = 45
          ctx.lineWidth = 1.5
          for (let wave = 0; wave < 3; wave++) {
            const offset = wave / 3
            const progress = (waveTime + offset) % 1.0
            const radius = progress * maxRadius
            const opacity = (1.0 - progress) * (link === 'Connected' ? 0.38 : link === 'Degraded' ? 0.22 : 0)
            if (opacity > 0) {
              ctx.strokeStyle = `rgba(129,140,248,${opacity})`
              ctx.beginPath()
              // Wave arc facing left (oncoming vehicles)
              ctx.arc(0, -6, radius, -Math.PI / 2.5, Math.PI / 2.5)
              ctx.stroke()
              // Wave arc facing right (departing vehicles)
              ctx.beginPath()
              ctx.arc(0, -6, radius, Math.PI - Math.PI / 2.5, Math.PI + Math.PI / 2.5)
              ctx.stroke()
            }
          }

          ctx.restore()

          // 7. Text Label
          ctx.fillStyle = canvasTheme === 'light' ? '#475569' : '#a1a1aa'
          ctx.font = '10px Inter, Segoe UI, sans-serif'
          ctx.fillText('RSU', textMap.x, textMap.y)
        }

        // -- Per-vehicle display Y (continuous lane position) ------------------
        const dispWyMap = new Map<string, number>()
        for (const v of vArr) {
          const wyVal = v.wy ?? v.y
          dispWyMap.set(v.id, clamp(displayedWyRef.current.get(v.id)?.value ?? wyVal, 0, laneCount - 1))
        }

        // -- Platoon grouping for labels and colors (visual lane) -------------------------------
        // Use Math.round(wy) for grouping so vehicles stay in their visual lane during lane-change transitions.
        // This prevents the "identity swap" illusion where a transferring vehicle gets regrouped into
        // the destination platoon before it has visually arrived there.
        const getVisualLane = (v: VehicleState) => Math.round(v.wy ?? v.y)
        const platoonIndices = Array.from(new Set(vArr.map(getVisualLane))).sort((a, b) => a - b)
        const platoonGroups = platoonIndices.map((lane) => ({
          lane,
          // Sort front-to-back (descending x) so leader is always index 0 and labels are stable
          vehicles: vArr.filter((v) => getVisualLane(v) === lane).sort((a, b) => b.x - a.x),
        }))

        // -- V2V links grouping (by actual backend lane v.y for correct V2X communication topology) --
        const communicationLanes = Array.from(new Set(vArr.map((v) => v.y))).sort((a, b) => a - b)
        const communicationGroups = communicationLanes.map((lane) => ({
          lane,
          vehicles: vArr.filter((v) => v.y === lane).sort((a, b) => b.x - a.x),
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
            
            const mapA = applyCurve(ax - VEHICLE_WIDTH / 2, ay - 13)
            const mapB = applyCurve(bx + VEHICLE_WIDTH / 2, by - 13)
            const mapText = applyCurve((ax + bx) / 2 - 10, Math.min(ay, by) - 18)

            ctx.beginPath()
            ctx.moveTo(mapA.x, mapA.y)
            ctx.lineTo(mapB.x, mapB.y)
            ctx.stroke()
            const gap = Math.abs(a.x - b.x).toFixed(1)
            ctx.setLineDash([])
            ctx.fillStyle = 'rgba(165,180,252,0.82)'
            ctx.font = '10px Inter, Segoe UI, sans-serif'
            ctx.fillText(`${gap}m`, mapText.x, mapText.y)
            ctx.setLineDash([6, 5])
          }
          ctx.setLineDash([])
        }
        for (const cg of communicationGroups) drawLinks(cg.vehicles)

        // -- RSU V2I signal beams: connect cars to nearest in-range RSU --------
        if (link !== 'Disconnected') {
          const signal = (Math.sin(now / 140) + 1) / 2
          for (const [idx, vehicle] of vArr.entries()) {
            const vWorldX = displayedXRef.current.get(vehicle.id)?.value ?? vehicle.x
            let nearestRsu: { worldX: number; screenX: number } | null = null
            let nearestDist = Infinity
            for (const rsu of visibleRsus) {
              if (rsu.screenX < -20 || rsu.screenX > w + 20) continue
              const dist = Math.abs(vWorldX - rsu.worldX)
              if (dist < RSU_RANGE_M && dist < nearestDist) { nearestDist = dist; nearestRsu = rsu }
            }
            if (!nearestRsu) continue
            const vx = worldToScreenX(vWorldX)
            const vy = laneToScreenY(roadTop, roadHeight, dispWyMap.get(vehicle.id) ?? vehicle.y, laneCount)
            const alphaBase = link === 'Connected' ? 0.28 : 0.16
            ctx.strokeStyle = `rgba(129,140,248,${alphaBase + signal * 0.18})`
            ctx.lineWidth = 1
            ctx.setLineDash([5, 4])
            
            const mapV = applyCurve(vx + 12, vy - 8)
            const mapRsu = applyCurve(nearestRsu.screenX, rsuScreenY + 4)
            const mapCtrl = applyCurve((vx + nearestRsu.screenX) / 2, roadTop - 90 - (idx % 3) * 6)

            ctx.beginPath()
            ctx.moveTo(mapV.x, mapV.y)
            ctx.quadraticCurveTo(mapCtrl.x, mapCtrl.y, mapRsu.x, mapRsu.y)
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

          const heading = v.heading ?? 0
          const crashed = v.crashed ?? false
          const speedMs = v.speed
          const speedCue = Math.min(1, speedMs / 25)
          
          // Tiny organic sway in radians
          const sway = Math.sin(now / 120 + drawX * 0.06) * speedCue * 0.009

          const isOvertaking = (overtakeUntilRef.current.get(v.id) ?? 0) > now
          
          // Determine realistic colors based on state.
          const bodyColor = crashed ? '#fb7185' : (isLeader ? '#34d399' : baseColor)
          const trimColor = 'rgba(255,255,255,0.16)'
          const tireColor = '#050505'

          // -- Speed trail ---------------------------------------------------
          if (!crashed && (isOvertaking || speedCue > 0.35)) {
            // To keep trails simple and performing well, we draw them relative to the un-rotated car pos first
            // Wait, we can draw the trail inside the transformed context!
          }

          // Apply Curve Mapping for the vehicle itself
          const mappedCar = applyCurve(drawX, carCenterY)

          // -- Apply heading rotation around vehicle centre -------------------
          ctx.save()
          ctx.translate(mappedCar.x, mappedCar.y)
          ctx.rotate(heading + sway + mappedCar.angle)   // radians — physics heading + micro-sway + road curve
          
          // Draw coordinates are now relative to the center of the car
          const cx = -VEHICLE_WIDTH / 2
          const cy = -VEHICLE_HEIGHT / 2

          // Render Trail inside translated context so it curves with the road perfectly
          if (!crashed && (isOvertaking || speedCue > 0.35)) {
            const trailLen = isOvertaking ? 60 : 30 + speedCue * 34
            const trail = ctx.createLinearGradient(cx - trailLen, cy + VEHICLE_HEIGHT/2, cx, cy + VEHICLE_HEIGHT/2)
            trail.addColorStop(0, 'rgba(129,140,248,0)')
            trail.addColorStop(0.6, `rgba(129,140,248,${0.04 + speedCue * 0.08})`)
            trail.addColorStop(1, `rgba(129,140,248,${0.14 + speedCue * 0.12})`)
            ctx.fillStyle = trail
            ctx.beginPath()
            ctx.roundRect(cx - trailLen, cy - 3, trailLen, VEHICLE_HEIGHT + 6, 4)
            ctx.fill()
          }

          // -- Drop Shadow (Vector) ------------------------------------------
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
          ctx.beginPath()
          ctx.roundRect(cx + 2, cy + 3, VEHICLE_WIDTH, VEHICLE_HEIGHT, 8)
          ctx.fill()

          // -- Car Body (Realistic Canvas Styling) ---------------------------
          ctx.fillStyle = bodyColor
          ctx.beginPath()
          ctx.roundRect(cx, cy, VEHICLE_WIDTH, VEHICLE_HEIGHT, 8)
          ctx.fill()

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
            
            // Brake Glow (Vector-based)
            if (isBraking) {
              ctx.fillStyle = 'rgba(251, 113, 133, 0.4)'
              ctx.beginPath()
              ctx.arc(cx - 2, cy + 6, 8, 0, Math.PI * 2)
              ctx.arc(cx - 2, cy + VEHICLE_HEIGHT - 6, 8, 0, Math.PI * 2)
              ctx.fill()
              ctx.fillStyle = '#fca5a5'
              ctx.fillRect(cx - 2, cy + 3, 2, 6)
              ctx.fillRect(cx - 2, cy + VEHICLE_HEIGHT - 9, 2, 6)
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

          // -- Crash Overlay (Vector-based Glow) -----------------------------
          if (crashed) {
            ctx.strokeStyle = 'rgba(251, 113, 133, 0.4)'
            ctx.lineWidth = 4
            ctx.beginPath()
            ctx.roundRect(cx - 3, cy - 3, VEHICLE_WIDTH + 6, VEHICLE_HEIGHT + 6, 10)
            ctx.stroke()
            ctx.strokeStyle = '#fb7185'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.roundRect(cx - 1, cy - 1, VEHICLE_WIDTH + 2, VEHICLE_HEIGHT + 2, 9)
            ctx.stroke()
            
            // "X" mark
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

          // -- Overtake Gold Glow (Vector-based) ------------------------------
          if (!crashed && isOvertaking) {
            ctx.strokeStyle = 'rgba(165, 165, 252, 0.4)'
            ctx.lineWidth = 4
            ctx.beginPath()
            ctx.roundRect(cx - 2, cy - 2, VEHICLE_WIDTH + 4, VEHICLE_HEIGHT + 4, 9)
            ctx.stroke()
            ctx.strokeStyle = '#a5b4fc'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.roundRect(cx, cy, VEHICLE_WIDTH, VEHICLE_HEIGHT, 8)
            ctx.stroke()
          }

          // -- Selection Highlight (Vector-based) -----------------------------
          if (selId === v.id) {
            ctx.strokeStyle = 'rgba(165, 180, 252, 0.45)'
            ctx.lineWidth = 4
            ctx.beginPath()
            ctx.roundRect(cx - 5, cy - 5, VEHICLE_WIDTH + 10, VEHICLE_HEIGHT + 10, 11)
            ctx.stroke()
            ctx.strokeStyle = '#a5b4fc'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.roundRect(cx - 3, cy - 3, VEHICLE_WIDTH + 6, VEHICLE_HEIGHT + 6, 10)
            ctx.stroke()
          }

          // -- Hover Highlight Glow (Vector-based) ----------------------------
          if (hoveredId === v.id && selId !== v.id) {
            ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)'
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.roundRect(cx - 4.5, cy - 4.5, VEHICLE_WIDTH + 9, VEHICLE_HEIGHT + 9, 10.5)
            ctx.stroke()
            ctx.strokeStyle = 'rgba(14, 165, 233, 0.70)'
            ctx.lineWidth = 1.2
            ctx.beginPath()
            ctx.roundRect(cx - 3, cy - 3, VEHICLE_WIDTH + 6, VEHICLE_HEIGHT + 6, 10)
            ctx.stroke()
          }

          ctx.restore() // Restore un-rotated context for labels

          // -- FSM Transfer Phase Badge --------------------------------------
          const phase = v.transferPhase
          if (phase && !crashed) {
            const phaseLabel = phase === 'waiting-for-gap' ? 'WAITING FOR GAP'
              : phase === 'departing' ? 'DEPARTING'
              : phase === 'in-transit' ? 'IN TRANSIT'
              : 'STABILIZING'
            const phaseColor = phase === 'waiting-for-gap' ? 'rgba(239,68,68,0.16)'
              : phase === 'departing' ? 'rgba(251,191,36,0.16)'
              : phase === 'in-transit' ? 'rgba(129,140,248,0.18)'
              : 'rgba(52,211,153,0.16)'
            const phaseTextColor = phase === 'waiting-for-gap' ? '#f87171'
              : phase === 'departing' ? '#fbbf24'
              : phase === 'in-transit' ? '#a5b4fc'
              : '#34d399'

            ctx.font = 'bold 8px Inter, Segoe UI, sans-serif'
            const badgeW = ctx.measureText(phaseLabel).width + 10
            const badgeH = 14
            const badgeY = carCenterY - VEHICLE_HEIGHT / 2 - badgeH - 8
            const mapBadge = applyCurve(drawX, badgeY) // Map relative to center

            ctx.save()
            ctx.translate(mapBadge.x, mapBadge.y)
            ctx.rotate(mappedCar.angle)
            
            ctx.fillStyle = phaseColor
            ctx.beginPath()
            ctx.roundRect(-badgeW/2, 0, badgeW, badgeH, 4)
            ctx.fill()
            ctx.strokeStyle = 'rgba(255,255,255,0.1)'
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.fillStyle = phaseTextColor
            ctx.fillText(phaseLabel, -badgeW/2 + 5, badgeH - 3)

            // Animated progress bar below badge during stabilizing
            if (phase === 'stabilizing' && v.stabilizeStartMs) {
              const elapsed = (Date.now() - v.stabilizeStartMs) / 2000 // 2s total
              const progressW = Math.min(1, elapsed) * VEHICLE_WIDTH
              ctx.fillStyle = 'rgba(52,211,153,0.14)'
              ctx.fillRect(-VEHICLE_WIDTH/2, badgeH + VEHICLE_HEIGHT + 8, VEHICLE_WIDTH, 3)
              ctx.fillStyle = 'rgba(52,211,153,0.72)'
              ctx.fillRect(-VEHICLE_WIDTH/2, badgeH + VEHICLE_HEIGHT + 8, progressW, 3)
            }
            ctx.restore()
          }

          // -- Overtake Phase Badge ------------------------------------------
          const overtake = v.overtakePhase
          if (overtake && !crashed) {
            const overtakeLabel = overtake === 'changing-out' ? 'MOVING TO PASS LANE'
              : overtake === 'passing' ? 'PASSING'
              : 'RETURNING'
            const overtakeBgColor = overtake === 'changing-out' ? 'rgba(245,158,11,0.18)'
              : overtake === 'passing' ? 'rgba(251,113,133,0.18)'
              : 'rgba(52,211,153,0.16)'
            const overtakeTextColor = overtake === 'changing-out' ? '#fbbf24'
              : overtake === 'passing' ? '#f87171'
              : '#34d399'

            ctx.font = 'bold 8px Inter, Segoe UI, sans-serif'
            const oBadgeW = ctx.measureText(overtakeLabel).width + 10
            const oBadgeH = 14
            // Position below vehicle so it doesn't clash with the transfer badge (above)
            const oBadgeY = carCenterY + VEHICLE_HEIGHT / 2 + 8
            const mapOBadge = applyCurve(drawX, oBadgeY)

            ctx.save()
            ctx.translate(mapOBadge.x, mapOBadge.y)
            ctx.rotate(mappedCar.angle)

            ctx.fillStyle = overtakeBgColor
            ctx.beginPath()
            ctx.roundRect(-oBadgeW / 2, 0, oBadgeW, oBadgeH, 4)
            ctx.fill()
            ctx.strokeStyle = 'rgba(255,255,255,0.12)'
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.fillStyle = overtakeTextColor
            ctx.fillText(overtakeLabel, -oBadgeW / 2 + 5, oBadgeH - 3)

            ctx.restore()
          }

          // -- Label + speed readout (Un-rotated so they are always readable) 
          ctx.fillStyle = crashed ? '#fb7185' : isOvertaking ? (canvasTheme === 'light' ? '#4f46e5' : '#a5b4fc') : (canvasTheme === 'light' ? '#0f172a' : '#fafafa')
          ctx.font = 'bold 10px Inter, Segoe UI, sans-serif'
          
          const labelMap = applyCurve(drawX - VEHICLE_WIDTH/2 + 3, carCenterY - VEHICLE_HEIGHT/2 - 6)
          ctx.fillText(vehicleLabel, labelMap.x, labelMap.y)
          if (!crashed) {
            ctx.font = '9px Inter, Segoe UI, sans-serif'
            ctx.fillStyle = canvasTheme === 'light' ? '#475569' : '#a1a1aa'
            const speedMap = applyCurve(drawX - VEHICLE_WIDTH/2 + 3, carCenterY + VEHICLE_HEIGHT/2 + 10)
            ctx.fillText(`${speedMs.toFixed(1)} m/s`, speedMap.x, speedMap.y)
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
          const labelMap = applyCurve(8, labelY)
          ctx.fillStyle = canvasTheme === 'light'
            ? (lane === 0 ? '#4f46e5' : lane === 1 ? '#475569' : '#52525b')
            : (lane === 0 ? 'rgba(165,180,252,0.88)' : lane === 1 ? 'rgba(212,212,216,0.76)' : 'rgba(161,161,170,0.7)')
          
          ctx.save()
          ctx.translate(labelMap.x, labelMap.y)
          ctx.rotate(labelMap.angle)
          ctx.fillText(`PLATOON ${String.fromCharCode(65 + lane)}`, 0, 0)
          ctx.restore()
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
        ctx.fillStyle = canvasTheme === 'light' ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.045)'
        ctx.beginPath()
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8)
        ctx.fill()
        ctx.strokeStyle = fpsLabel >= 30
          ? (canvasTheme === 'light' ? 'rgba(5,150,105,0.22)' : 'rgba(52,211,153,0.22)')
          : 'rgba(251,113,133,0.22)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = fpsLabel >= 30 ? (canvasTheme === 'light' ? '#475569' : '#d4d4d8') : '#fb7185'
        ctx.font = 'bold 11px Inter, Segoe UI, sans-serif'
        ctx.fillText(`FPS ${fpsLabel}`, badgeX + 18, badgeY + 16)

        // -- Camera Mode Badge -----------------------------------------------
        const camLocked = cameraLockedRef.current
        const camLabel = camLocked ? 'Follow' : 'Manual'
        const camBadgeW = 74; const camBadgeH = 24
        const camBadgeX = 12; const camBadgeY = 12
        ctx.fillStyle = camLocked
          ? (canvasTheme === 'light' ? 'rgba(79,70,229,0.10)' : 'rgba(165,180,252,0.10)')
          : (canvasTheme === 'light' ? 'rgba(245,158,11,0.13)' : 'rgba(251,191,36,0.12)')
        ctx.beginPath()
        ctx.roundRect(camBadgeX, camBadgeY, camBadgeW, camBadgeH, 8)
        ctx.fill()
        ctx.strokeStyle = camLocked
          ? (canvasTheme === 'light' ? 'rgba(79,70,229,0.28)' : 'rgba(165,180,252,0.25)')
          : 'rgba(251,191,36,0.38)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = camLocked
          ? (canvasTheme === 'light' ? '#4f46e5' : '#a5b4fc')
          : (canvasTheme === 'light' ? '#b45309' : '#fbbf24')
        ctx.font = 'bold 10px Inter, Segoe UI, sans-serif'
        ctx.fillText(camLabel, camBadgeX + 16, camBadgeY + 16)
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

  // -- Drag-to-pan handlers -------------------------------------------------
  function handleMouseDown(event: MouseEvent<HTMLCanvasElement>): void {
    // Only drag with primary button on the canvas (not on a vehicle click area)
    if (event.button !== 0) return
    isDraggingRef.current = false   // reset – we call this on mousedown, actual drag starts on move
    setIsDragging(false)
    dragStartXRef.current = event.clientX
    dragCameraStartRef.current = cameraXRef.current.value
    // Attach window-level listeners to capture drag outside canvas
    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
  }

  function handleWindowMouseMove(event: globalThis.MouseEvent): void {
    const dx = event.clientX - dragStartXRef.current
    // Require at least 4px movement before committing to a drag
    if (!isDraggingRef.current && Math.abs(dx) < 4) return
    isDraggingRef.current = true
    setIsDragging(true)
    // Unlock camera from auto-follow
    if (cameraLockedRef.current) {
      setCameraLocked(false)
      cameraLockedRef.current = false
    }
    // Pan: moving right on screen → camera moves left in world (vehicles move right)
    // 1 screen pixel = 1/PX_PER_METER metres
    const deltaMeter = -dx / PX_PER_METER
    cameraXRef.current.value = dragCameraStartRef.current + deltaMeter
    cameraTargetRef.current = cameraXRef.current.value
  }

  function handleWindowMouseUp(): void {
    window.removeEventListener('mousemove', handleWindowMouseMove)
    window.removeEventListener('mouseup', handleWindowMouseUp)
    setIsDragging(false)
    // isDraggingRef stays true until next mouseDown so click handler can check it
    setTimeout(() => { isDraggingRef.current = false }, 0)
  }

  // -- Scroll-to-pan ---------------------------------------------------------
  function handleWheel(event: WheelEvent<HTMLCanvasElement>): void {
    event.preventDefault()
    if (cameraLockedRef.current) {
      setCameraLocked(false)
      cameraLockedRef.current = false
    }
    // Scroll delta in screen pixels → metres
    const deltaMeter = (event.deltaY * 0.35) / PX_PER_METER
    cameraXRef.current.value += deltaMeter
    cameraTargetRef.current = cameraXRef.current.value
  }

  // -- Double-click to relock ------------------------------------------------
  function handleDoubleClick(): void {
    relockCamera()
  }

  // -- Click-to-select -------------------------------------------------------
  function handleCanvasClick(event: MouseEvent<HTMLCanvasElement>): void {
    // Suppress click if the user just finished dragging
    if (isDraggingRef.current) return
    const canvas = canvasRef.current
    if (!canvas || !onVehicleClick) return

    const rect = canvas.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const clickY = event.clientY - rect.top

    const roadTop = rect.height / 2 - 80
    const roadHeight = 160
    const vArr = vehiclesRef.current
    const cameraX = cameraXRef.current.value
    const worldToScreenX = (xMeters: number) =>
      (xMeters - cameraX) * PX_PER_METER + WORLD_OFFSET_X
    const screenToWorldX = (sx: number) =>
      (sx - WORLD_OFFSET_X) / PX_PER_METER + cameraX
    const laneCount = Math.max(MIN_LANE_COUNT, ...vArr.map((v) => Math.floor(v.y) + 1))
    const cameraOffsetY = getRoadOffsetY(screenToWorldX(rect.width / 2))

    for (const v of vArr) {
      const dispWy = displayedWyRef.current.get(v.id)?.value ?? (v.wy ?? v.y)
      const carCenterY = laneToScreenY(roadTop, roadHeight, dispWy, laneCount)
      const dispX = displayedXRef.current.get(v.id)?.value ?? v.x
      const drawX = worldToScreenX(dispX)
      
      const offsetY = getRoadOffsetY(dispX)
      const warpedY = carCenterY + offsetY - cameraOffsetY
      const bx = drawX - VEHICLE_WIDTH / 2
      const by = warpedY - VEHICLE_HEIGHT / 2

      if (clickX >= bx && clickX <= bx + VEHICLE_WIDTH && clickY >= by && clickY <= by + VEHICLE_HEIGHT) {
        onVehicleClick(v.id)
        return
      }
    }
  }

  // -- Mouse-move: hover detection only (drag handled by window listener) ----
  function handleCanvasMouseMove(event: MouseEvent<HTMLCanvasElement>): void {
    if (isDraggingRef.current) return   // skip hover check while dragging
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    const roadTop = rect.height / 2 - 80
    const roadHeight = 160
    const vArr = vehiclesRef.current
    const cameraX = cameraXRef.current.value
    const worldToScreenX = (xMeters: number) =>
      (xMeters - cameraX) * PX_PER_METER + WORLD_OFFSET_X
    const screenToWorldX = (sx: number) =>
      (sx - WORLD_OFFSET_X) / PX_PER_METER + cameraX
    const laneCount = Math.max(MIN_LANE_COUNT, ...vArr.map((v) => Math.floor(v.y) + 1))
    const cameraOffsetY = getRoadOffsetY(screenToWorldX(rect.width / 2))

    let foundId: string | null = null
    for (const v of vArr) {
      const dispWy = displayedWyRef.current.get(v.id)?.value ?? (v.wy ?? v.y)
      const carCenterY = laneToScreenY(roadTop, roadHeight, dispWy, laneCount)
      const dispX = displayedXRef.current.get(v.id)?.value ?? v.x
      const drawX = worldToScreenX(dispX)
      
      const offsetY = getRoadOffsetY(dispX)
      const warpedY = carCenterY + offsetY - cameraOffsetY
      const bx = drawX - VEHICLE_WIDTH / 2
      const by = warpedY - VEHICLE_HEIGHT / 2

      if (mouseX >= bx && mouseX <= bx + VEHICLE_WIDTH && mouseY >= by && mouseY <= by + VEHICLE_HEIGHT) {
        foundId = v.id
        break
      }
    }

    if (foundId !== hoveredVehicleId) {
      setHoveredVehicleId(foundId)
    }
  }

  function handleCanvasMouseLeave(): void {
    setHoveredVehicleId(null)
  }

  // Determine cursor style
  const cursorStyle = isDragging ? 'grabbing' : hoveredVehicleId ? 'pointer' : 'grab'

  return (
    <div className="sim-canvas-wrapper" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%', lineHeight: 0 }}>
      <canvas
        className="sim-canvas"
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        style={{ cursor: cursorStyle, userSelect: 'none', display: 'block', width: '100%', height: '100%' }}
      />
      {/* Re-lock camera button — only visible when camera is in manual mode */}
      {!cameraLocked && (
        <button
          onClick={relockCamera}
          title="Double-click canvas or click here to re-lock camera to leader"
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'Inter, Segoe UI, sans-serif',
            background: 'rgba(245,158,11,0.88)',
            color: '#1c1a0e',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            zIndex: 10,
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            letterSpacing: '0.02em',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <RefreshIcon style={{ width: '12px', height: '12px' }} />
          <span>Re-lock Camera</span>
        </button>
      )}
    </div>
  )
}
