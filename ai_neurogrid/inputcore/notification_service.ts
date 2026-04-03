import nodemailer from "nodemailer"

export interface AlertConfig {
  email?: {
    host: string
    port: number
    user: string
    pass: string
    from: string
    to: string[]
    secure?: boolean
  }
  console?: boolean
  bufferLogs?: boolean
}

export interface AlertSignal {
  title: string
  message: string
  level: "info" | "warning" | "critical"
  timestamp?: number
}

export class AlertService {
  private buffered: AlertSignal[] = []

  constructor(private cfg: AlertConfig) {}

  private async sendEmail(signal: AlertSignal) {
    if (!this.cfg.email) return
    const { host, port, user, pass, from, to, secure } = this.cfg.email
    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } })
    await transporter.sendMail({
      from,
      to,
      subject: `[${signal.level.toUpperCase()}] ${signal.title}`,
      text: signal.message,
    })
  }

  private logConsole(signal: AlertSignal) {
    if (!this.cfg.console) return
    const time = signal.timestamp
      ? new Date(signal.timestamp).toISOString()
      : new Date().toISOString()
    console.log(
      `[Alert][${signal.level.toUpperCase()}] ${signal.title} @ ${time}\n${signal.message}`
    )
  }

  private async handle(signal: AlertSignal) {
    await this.sendEmail(signal)
    this.logConsole(signal)
  }

  /**
   * Dispatch multiple signals.
   */
  async dispatch(signals: AlertSignal[]) {
    for (const sig of signals) {
      sig.timestamp = sig.timestamp ?? Date.now()
      if (this.cfg.bufferLogs) {
        this.buffered.push(sig)
      } else {
        await this.handle(sig)
      }
    }
  }

  /**
   * Flush buffered logs if buffering enabled.
   */
  async flushBuffer() {
    const pending = [...this.buffered]
    this.buffered = []
    for (const sig of pending) {
      await this.handle(sig)
    }
  }
}
