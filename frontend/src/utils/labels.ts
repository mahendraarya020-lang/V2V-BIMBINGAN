import type { VehicleState } from '../types/sim'

/**
 * Get the visual lane of a vehicle (rounded to handle transitions).
 */
export function getVisualLane(v: VehicleState): number {
  return Math.round(v.wy ?? v.y)
}

/**
 * Compute the letter label (A, B, C, ..., Z) for a vehicle based on its position
 * in its platoon (sorted front-to-back descending by x).
 */
export function getVehicleLabel(vehicle: VehicleState, allVehicles: VehicleState[]): string {
  const vLane = getVisualLane(vehicle)
  const laneVehicles = allVehicles
    .filter((v) => getVisualLane(v) === vLane)
    .sort((a, b) => b.x - a.x)
  const index = laneVehicles.findIndex((v) => v.id === vehicle.id)
  return index !== -1 ? String.fromCharCode(65 + (index % 26)) : vehicle.id.replace('b_', '').toUpperCase()
}

/**
 * Get the letter label for a vehicle using its ID.
 */
export function getVehicleLabelById(id: string, allVehicles: VehicleState[]): string {
  const vehicle = allVehicles.find((v) => v.id === id)
  if (!vehicle) return id.toUpperCase()
  return getVehicleLabel(vehicle, allVehicles)
}
