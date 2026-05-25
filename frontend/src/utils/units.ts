import type { SimulationParams } from '../types/sim'

/** Format speed v in m/s */
export function formatSpeedMs(v: number): string {
  return `${v.toFixed(1)} m/s`
}

/** Format constant time headway h in seconds */
export function formatHeadway(v: number): string {
  return `${v.toFixed(1)} s`
}

/** Format standstill distance s₀ in metres */
export function formatStandstill(v: number): string {
  return `${v.toFixed(1)} m`
}

/** Format one-way latency in milliseconds */
export function formatLatency(v: number): string {
  return `${v} ms`
}

/** Format packet loss rate PLR in percent */
export function formatPlr(v: number): string {
  return `${v.toFixed(1)} %`
}

/** Format 5G NR channel bandwidth B in Hz (with GHz/MHz hint when large) */
export function formatChannelBandwidthHz(hz: number): string {
  if (hz >= 1_000_000_000) {
    const ghz = hz / 1_000_000_000
    return `${ghz.toFixed(1)} GHz (${hz.toLocaleString('en-US')} Hz)`
  }
  if (hz >= 1_000_000) {
    const mhz = hz / 1_000_000
    return `${mhz.toFixed(0)} MHz (${hz.toLocaleString('en-US')} Hz)`
  }
  return `${hz.toLocaleString('en-US')} Hz`
}

/** Slider label: MHz or GHz format (stored as Hz via ×10⁶) */
export function formatChannelBandwidthMHz(mhz: number): string {
  if (mhz >= 1000) {
    const ghz = mhz / 1000
    return `${ghz.toFixed(1)} GHz`
  }
  return `${mhz} MHz`
}

export function mhzToHz(mhz: number): number {
  return mhz * 1_000_000
}

export function hzToMhz(hz: number): number {
  return hz / 1_000_000
}

/** Legacy payload field bandwidthMbps → Hz */
export function legacyMbpsToHz(mbps: number): number {
  return mbps * 100_000
}

export function normalizeParams(params: SimulationParams & { bandwidthMbps?: number }): SimulationParams {
  const channelBandwidthHz = params.channelBandwidthHz
    ?? (params.bandwidthMbps != null ? legacyMbpsToHz(params.bandwidthMbps) : 1_000_000_000)
  const { bandwidthMbps: _legacy, ...rest } = params
  return { ...rest, channelBandwidthHz }
}

/** Telemetry speed: accept new m/s or legacy km/h field */
export function platoonSpeedMs(telemetry: {
  averagePlatoonSpeedMs?: number
  averagePlatoonSpeedKmh?: number
}): number {
  if (typeof telemetry.averagePlatoonSpeedMs === 'number') {
    return telemetry.averagePlatoonSpeedMs
  }
  if (typeof telemetry.averagePlatoonSpeedKmh === 'number') {
    return telemetry.averagePlatoonSpeedKmh / 3.6
  }
  return 0
}

/** Read simulation defaults from Settings (localStorage) in SI units. */
export function readDefaultParamsFromStorage(): Partial<SimulationParams> {
  const bandwidthMhz = Number(localStorage.getItem('sim-default-bandwidth-mhz')) || 1000
  return {
    v2vTopology: (localStorage.getItem('sim-default-topology') as SimulationParams['v2vTopology']) || 'Hybrid',
    targetSpeed: Number(localStorage.getItem('sim-default-speed')) || 22,
    timeHeadway: Number(localStorage.getItem('sim-default-headway')) || 1.2,
    latencyMs: Number(localStorage.getItem('sim-default-latency')) || 10,
    packetLossPercent: Number(localStorage.getItem('sim-default-loss')) || 0.5,
    channelBandwidthHz: mhzToHz(bandwidthMhz),
  }
}
