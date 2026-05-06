type LeaderPacket = {
  x: number
  speed: number
  timestamp: number
}

type QueueItem = {
  deliverAt: number
  packet: LeaderPacket
}

export class NetworkEmulator {
  private queue: QueueItem[] = []
  private lastGoodPacket: LeaderPacket | null = null

  push(packet: LeaderPacket, latencyMs: number, packetLossPercent: number): void {
    const isLost = Math.random() * 100 < packetLossPercent
    if (isLost) {
      return
    }

    this.queue.push({
      deliverAt: Date.now() + latencyMs,
      packet,
    })
  }

  receive(): LeaderPacket | null {
    const now = Date.now()
    const idx = this.queue.findIndex((item) => item.deliverAt <= now)
    if (idx < 0) {
      return this.lastGoodPacket
    }

    const [item] = this.queue.splice(idx, 1)
    this.lastGoodPacket = item.packet
    return item.packet
  }
}
