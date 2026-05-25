import type { VehicleState } from '../types/sim'
import { formatSpeedMs } from '../utils/units'

type Props = {
  vehicle: VehicleState | null
  vehicles?: VehicleState[]
  onSwap?: (idA: string, idB: string) => void
}

export function VehicleDetail({ vehicle, vehicles = [], onSwap }: Props) {
  if (!vehicle) {
    return (
      <section className="vehicle-detail">
        <h4>Vehicle Detail</h4>
        <p>Click a vehicle on the simulation canvas to inspect its live telemetry.</p>
      </section>
    )
  }

  // Dynamic platoon letter based on y lane ID (0 = A, 1 = B, 2 = C, etc.)
  const platoon = String.fromCharCode(65 + vehicle.y)
  
  // Dynamic leader check based on highest x in current lane
  const isLeader = vehicles.length > 0
    ? !vehicles.some((v) => v.y === vehicle.y && v.x > vehicle.x)
    : (vehicle.id === 'leader' || vehicle.id === 'b_leader')
    
  const role = isLeader ? 'Leader' : 'Follower'
  const headingDeg = (((vehicle.heading ?? 0) * 180) / Math.PI).toFixed(1)
  const wyVal = vehicle.wy ?? vehicle.y

  // Dynamic V2X Cooperative Transfer Actions
  const activeLanes = Array.from(new Set(vehicles.map((v) => v.y))).sort((a, b) => a - b)
  const otherLanes = activeLanes.filter((l) => l !== vehicle.y)

  return (
    <section className="vehicle-detail">
      <div className="vehicle-detail-head">
        <h4>
          {vehicle.id.replace('b_', '').toUpperCase()}
          {vehicle.crashed && <span style={{ color: 'var(--bad)', marginLeft: '0.4rem', fontSize: '0.8rem' }}>CRASHED</span>}
        </h4>
        <span className={`badge ${vehicle.crashed ? 'bad' : isLeader ? 'ok' : ''}`}>
          Platoon {platoon} – {role}
        </span>
      </div>
      <ul className="vehicle-detail-grid">
        <li>
          <span>Speed (v)</span>
          <strong className={vehicle.crashed ? 'telemetry-bad' : ''}>{formatSpeedMs(vehicle.speed)}</strong>
        </li>
        <li>
          <span>Acceleration (a)</span>
          <strong>{vehicle.accel.toFixed(3)} m/s²</strong>
        </li>
        <li>
          <span>Brake</span>
          <strong className={vehicle.brake ? 'telemetry-bad' : 'telemetry-ok'}>
            {vehicle.brake ? 'Active' : 'Idle'}
          </strong>
        </li>
        <li>
          <span>Position X</span>
          <strong>{vehicle.x.toFixed(2)} m</strong>
        </li>
        <li>
          <span>Lane (Y)</span>
          <strong>{wyVal.toFixed(2)} L{vehicle.y}</strong>
        </li>
        <li>
          <span>Heading</span>
          <strong>{headingDeg}°</strong>
        </li>
        <li>
          <span>Target Lane</span>
          <strong>{vehicle.targetLane ?? vehicle.y}</strong>
        </li>
      </ul>

      {vehicles.length > 0 && onSwap && !vehicle.crashed && otherLanes.length > 0 && (
        <div className="v2x-cooperative-actions" style={{ marginTop: '0.9rem', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '0.8rem' }}>
          <h5 style={{ margin: '0 0 0.45rem 0', fontSize: '0.78rem', color: '#818cf8', fontWeight: 600 }}>
            ⚡ V2X Cooperative Transfer
          </h5>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem' }}>
            {otherLanes.map((lane) => {
              const currentLaneVehicles = vehicles
                .filter((v) => v.y === vehicle.y)
                .sort((a, b) => b.x - a.x)
              const myIndex = currentLaneVehicles.findIndex((v) => v.id === vehicle.id)

              const targetLaneVehicles = vehicles
                .filter((v) => v.y === lane)
                .sort((a, b) => b.x - a.x)
              if (targetLaneVehicles.length === 0) return null

              // Pick candidate at same index rank, or last vehicle
              const targetCandidate = targetLaneVehicles[myIndex] ?? targetLaneVehicles[targetLaneVehicles.length - 1]
              const targetPlatoonLetter = String.fromCharCode(65 + lane)
              const isTransitioning = vehicle.transferPhase !== null

              return (
                <button
                  key={`transfer-to-${lane}`}
                  className="ck-btn ck-btn-ghost ck-btn-sm"
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    borderColor: 'rgba(129, 140, 248, 0.28)',
                    color: '#a5b4fc',
                    backgroundColor: 'rgba(129, 140, 248, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                  disabled={isTransitioning}
                  onClick={() => onSwap(vehicle.id, targetCandidate.id)}
                  type="button"
                >
                  🔄 Transfer to Platoon {targetPlatoonLetter}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
