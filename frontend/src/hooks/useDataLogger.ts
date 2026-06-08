import { useCallback, useEffect, useRef, useState } from 'react'
import type { SimulationState } from '../types/sim'

type LogEntry = {
  timestampS: number
  e2eDelayMs: number
  timestampDeviationMs: number
  packetLossPercent: number
  leaderSpeedMs: number
  avgPlatoonSpeedMs: number
  maxSpacingErrorM: number
  ssi: number
  controlMode: string
  channelBandwidthHz: number
}

export function useDataLogger(currentState: SimulationState | null) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordDurationS, setRecordDurationS] = useState(0)
  
  const stateRef = useRef<SimulationState | null>(null)
  const logsRef = useRef<LogEntry[]>([])
  const startTimeRef = useRef<number>(0)

  // Always keep a fresh ref to the latest state so the interval reads the right data without re-triggering
  useEffect(() => {
    stateRef.current = currentState
  }, [currentState])

  const startRecording = useCallback(() => {
    logsRef.current = []
    startTimeRef.current = Date.now()
    setIsRecording(true)
    setRecordDurationS(0)
  }, [])

  const stopRecordingAndDownload = useCallback(() => {
    setIsRecording(false)
    const logs = logsRef.current

    if (logs.length === 0) return

    // Build CSV string
    const headers = [
      'Timestamp (s)',
      'End-to-End Delay (ms)',
      'Time Sync Deviation (ms)',
      'Packet Loss (%)',
      'Leader Speed (m/s)',
      'Average Platoon Speed (m/s)',
      'Max Spacing Error (m)',
      'String Stability Index (SSI)',
      'Control Mode',
      'Channel Bandwidth (Hz)',
    ]

    const rows = logs.map((log) => [
      log.timestampS.toFixed(3),
      log.e2eDelayMs.toFixed(1),
      log.timestampDeviationMs.toFixed(3),
      log.packetLossPercent.toFixed(2),
      log.leaderSpeedMs.toFixed(3),
      log.avgPlatoonSpeedMs.toFixed(3),
      log.maxSpacingErrorM.toFixed(3),
      log.ssi.toFixed(4),
      log.controlMode,
      log.channelBandwidthHz.toFixed(0),
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.join(',')),
    ].join('\n')

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    
    // Create filename with date string
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-')
    link.href = url
    link.setAttribute('download', `V2V_5G_Experiment_Log_${dateStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // Clear logs from memory
    logsRef.current = []
  }, [])

  // 10Hz Logging Interval (100ms)
  useEffect(() => {
    if (!isRecording) return

    const intervalMs = 100
    const timer = setInterval(() => {
      const st = stateRef.current
      if (!st) return

      const elapsedS = st.elapsedSeconds ?? 0

      // Only capture leader speed if vehicles exist
      // Platoon index 0 leader is always the first vehicle of that lane. Let's get the absolute leader (usually ID L0 or first in array)
      const leader = st.vehicles.length > 0 ? st.vehicles[0] : null

      logsRef.current.push({
        timestampS: elapsedS,
        e2eDelayMs: st.telemetry.endToEndDelayMs,
        timestampDeviationMs: st.telemetry.timestampDeviationMs,
        packetLossPercent: st.params.packetLossPercent,
        leaderSpeedMs: leader ? leader.speed : 0,
        avgPlatoonSpeedMs: st.telemetry.averagePlatoonSpeedMs,
        maxSpacingErrorM: st.telemetry.maxSpacingError,
        ssi: st.telemetry.stringStabilityIndex,
        controlMode: st.telemetry.controlMode,
        channelBandwidthHz: st.params.channelBandwidthHz,
      })
      
      // Update UI timer strictly every 1s worth of intervals to avoid massive re-renders
      setRecordDurationS(Math.floor(elapsedS))
    }, intervalMs)

    return () => clearInterval(timer)
  }, [isRecording])

  return {
    isRecording,
    recordDurationS,
    startRecording,
    stopRecordingAndDownload,
  }
}
