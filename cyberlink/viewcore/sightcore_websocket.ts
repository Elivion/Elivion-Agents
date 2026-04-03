export interface SightCoreConfig {
  url: string
  protocols?: string[]
  reconnectIntervalMs?: number
  heartbeatIntervalMs?: number
}

export type SightCoreMessage = {
  topic: string
  payload: any
  timestamp: number
}

export class SightCoreWebSocket {
  private socket?: WebSocket
  private url: string
  private protocols?: string[]
  private reconnectInterval: number
  private heartbeatInterval: number
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private lastMessageAt: number = Date.now()

  constructor(config: SightCoreConfig) {
    this.url = config.url
    this.protocols = config.protocols
    this.reconnectInterval = config.reconnectIntervalMs ?? 5000
    this.heartbeatInterval = config.heartbeatIntervalMs ?? 15000
  }

  connect(
    onMessage: (msg: SightCoreMessage) => void,
    onOpen?: () => void,
    onClose?: () => void
  ): void {
    this.socket = this.protocols
      ? new WebSocket(this.url, this.protocols)
      : new WebSocket(this.url)

    this.socket.onopen = () => {
      onOpen?.()
      this.startHeartbeat()
    }

    this.socket.onmessage = event => {
      try {
        const msg = JSON.parse(event.data) as SightCoreMessage
        this.lastMessageAt = Date.now()
        onMessage(msg)
      } catch {
        // ignore invalid messages
      }
    }

    this.socket.onclose = () => {
      onClose?.()
      this.stopHeartbeat()
      setTimeout(() => this.connect(onMessage, onOpen, onClose), this.reconnectInterval)
    }

    this.socket.onerror = () => {
      this.socket?.close()
    }
  }

  send(topic: string, payload: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ topic, payload, timestamp: Date.now() })
      this.socket.send(msg)
    }
  }

  disconnect(): void {
    this.stopHeartbeat()
    this.socket?.close()
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ topic: "__heartbeat__", timestamp: now }))
      }
      // auto-close if no messages received for >2x heartbeat interval
      if (now - this.lastMessageAt > this.heartbeatInterval * 2) {
        this.socket?.close()
      }
    }, this.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }
}
