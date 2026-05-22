import type { VehicleState } from '../types/sim'
import { formatSpeedMs } from '../utils/units'

type Props = {
  vehicle: VehicleState | null
}

export function VehicleDetail({ vehicle }: Props) {
  if (!vehicle) {
    return (
      <section className="vehicle-detail">
        <h4>Vehicle Detail</h4>
        <p>Click a vehicle on the simulation canvas to inspect its live telemetry.</p>
      </section>
    )
  }

  const platoon = vehicle.id.startsWith('b_') ? 'B' : 'A'
  const isLeader = vehicle.id === 'leader' || vehicle.id === 'b_leader'
  const role = isLeader ? 'Leader' : 'Follower'
  const headingDeg = ((vehicle.heading ?? 0) * 180 / Math.PI).toFixed(1)
  const wyVal = vehicle.wy ?? vehicle.y

  return (
    <section className="vehicle-detail">
      <div className="vehicle-detail-head">
        <h4>
          {vehicle.id.replace('b_', '').toUpperCase()}
          {vehicle.crashed && <span style={{ color: 'var(--bad)', marginLeft: '0.4rem', fontSize: '0.8rem' }}>CRASHED</span>}
        </h4>
        <span className={`badge ${vehicle.crashed ? 'bad' : isLeader ? 'ok' : ''}`}>
          Platoon {platoon} - {role}
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
    </section>
  )
}
