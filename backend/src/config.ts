import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (!raw) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numberFromEnv('PORT', 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? '*',
  serveStatic: booleanFromEnv('SERVE_STATIC', true),
  frontendDistPath: resolve(process.env.FRONTEND_DIST_PATH ?? '../frontend/dist'),
  tickMs: numberFromEnv('SIM_TICK_MS', 10),
  broadcastMs: numberFromEnv('SIM_BROADCAST_MS', 50),
}

export function canServeFrontend(): boolean {
  return config.serveStatic && existsSync(config.frontendDistPath)
}
