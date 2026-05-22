import { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { appConfig } from '../config'
import type {
  AnalysisData,
  SimulationHistory,
  SimulationParams,
  SimulationState,
  SimulationTrigger,
} from '../types/sim'
import { normalizeParams, platoonSpeedMs } from '../utils/units'

function normalizeState(payload: SimulationState): SimulationState {
  const telemetry = payload.telemetry ?? ({} as SimulationState['telemetry'])
  const params = normalizeParams(payload.params as SimulationParams & { bandwidthMbps?: number })
  const avgMs = platoonSpeedMs(telemetry as Parameters<typeof platoonSpeedMs>[0])
  return {
    ...payload,
    params,
    vehicles: (payload.vehicles ?? []).map((vehicle) => ({
      ...vehicle,
      wy: vehicle.wy ?? vehicle.y ?? 0,
      heading: vehicle.heading ?? 0,
      targetLane: vehicle.targetLane ?? vehicle.y ?? 0,
      crashed: vehicle.crashed ?? false,
    })),
    telemetry: {
      ...telemetry,
      endToEndDelayMs: telemetry.endToEndDelayMs ?? telemetry.networkDelayMs ?? 0,
      maxSpacingError: telemetry.maxSpacingError ?? Math.abs(telemetry.spacingError ?? 0),
      averagePlatoonSpeedMs: avgMs,
      networkDelayMs: telemetry.networkDelayMs ?? 0,
      spacingError: telemetry.spacingError ?? 0,
      stringStabilityIndex: telemetry.stringStabilityIndex ?? 0,
      rsuSignalDbm: telemetry.rsuSignalDbm ?? -120,
      bandwidthUtilization: telemetry.bandwidthUtilization ?? 0,
      effectiveHz: telemetry.effectiveHz ?? 0,
      collisionCount: telemetry.collisionCount ?? 0,
      status: telemetry.status ?? 'Unstable',
      v2vLink: telemetry.v2vLink ?? 'Disconnected',
      controlMode: telemetry.controlMode ?? 'ACC',
      humanBrakingActive: telemetry.humanBrakingActive ?? false,
    },
  }
}

export function useSimulationSocket() {
  const [state, setState] = useState<SimulationState | null>(null)
  const [history, setHistory] = useState<SimulationHistory[]>([])
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [savedMeta, setSavedMeta] = useState<SimulationHistory | null>(null)
  const [lastCollision, setLastCollision] = useState<{ between: string[]; gapMeters: number } | null>(null)
  const [lastTransferRefused, setLastTransferRefused] = useState<{ vehicleId: string; reason: string } | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const socket = useMemo<Socket>(() => io(appConfig.backendUrl, {
    autoConnect: false,
    reconnectionAttempts: 8,
    timeout: 5000,
  }), [])

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))
    socket.on('sim:state', (payload: SimulationState) => {
      const normalized = normalizeState(payload)
      // #region agent log
      fetch('http://127.0.0.1:7701/ingest/b7762f81-002a-4b26-9a43-bc49f3186196', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2b9c00' },
        body: JSON.stringify({
          sessionId: '2b9c00',
          runId: 'pre-fix',
          hypothesisId: 'H1',
          location: 'useSimulationSocket.ts:sim:state',
          message: 'Received sim state payload shape',
          data: {
            hasTelemetry: Boolean(payload?.telemetry),
            vehiclesCount: payload?.vehicles?.length ?? -1,
            hasEndToEndDelayMs: typeof payload?.telemetry?.endToEndDelayMs === 'number',
            hasMaxSpacingError: typeof payload?.telemetry?.maxSpacingError === 'number',
            hasAveragePlatoonSpeedMs: typeof payload?.telemetry?.averagePlatoonSpeedMs === 'number',
            firstVehicle: payload?.vehicles?.[0]
              ? {
                id: payload.vehicles[0].id,
                x: payload.vehicles[0].x,
                y: payload.vehicles[0].y,
                wy: payload.vehicles[0].wy,
                heading: payload.vehicles[0].heading,
                crashed: payload.vehicles[0].crashed,
              }
              : null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      // #region agent log
      fetch('http://127.0.0.1:7701/ingest/b7762f81-002a-4b26-9a43-bc49f3186196', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2b9c00' },
        body: JSON.stringify({
          sessionId: '2b9c00',
          runId: 'post-fix',
          hypothesisId: 'H4',
          location: 'useSimulationSocket.ts:normalizeState',
          message: 'Normalized telemetry payload before storing state',
          data: {
            endToEndDelayMs: normalized.telemetry.endToEndDelayMs,
            maxSpacingError: normalized.telemetry.maxSpacingError,
            averagePlatoonSpeedMs: normalized.telemetry.averagePlatoonSpeedMs,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      setState(normalized)
    })
    socket.on('sim:history', (payload: SimulationHistory[]) => setHistory(payload))
    socket.on('sim:analysis', (payload: AnalysisData) => setAnalysis(payload))
    socket.on('sim:saved', (payload: SimulationHistory) => setSavedMeta(payload))
    socket.on('sim:collision', (payload: { between: string[]; gapMeters: number }) => setLastCollision(payload))
    socket.on('sim:transferRefused', (payload: { vehicleId: string; reason: string }) => setLastTransferRefused(payload))
    socket.connect()
    return () => {
      socket.removeAllListeners()
      socket.close()
    }
  }, [socket])

  const actions = useMemo(() => ({
    start: (options?: { platoonCount?: number; followerCount?: number }) => socket.emit('sim:start', options ?? {}),
    stop: () => socket.emit('sim:stop'),
    reset: () => socket.emit('sim:reset'),
    updateParams: (payload: Partial<SimulationParams>) => socket.emit('sim:updateParams', payload),
    setFollowerCount: (followerCount: number) => socket.emit('sim:setFollowerCount', { followerCount }),
    setControl: (throttle: number, brake: number) => socket.emit('sim:control', { throttle, brake }),
    trigger: (kind: SimulationTrigger) => socket.emit('sim:trigger', kind),
    swapVehicles: (idA: string, idB: string) => socket.emit('sim:swapVehicles', { idA, idB }),
    loadHistory: (id: string) => socket.emit('sim:loadHistory', id),
  }), [socket])

  return { state, history, analysis, savedMeta, lastCollision, lastTransferRefused, isConnected, actions }
}
