import type { TokenMetrics } from "./tokenAnalysisCalculator"

export interface IframeConfig {
  containerId: string
  srcUrl: string
  metrics: TokenMetrics
  refreshIntervalMs?: number
  sandbox?: string
  title?: string
}

export class TokenAnalysisIframe {
  private iframeEl: HTMLIFrameElement | null = null
  private refreshTimer?: ReturnType<typeof setInterval>

  constructor(private config: IframeConfig) {}

  init(): void {
    const container = document.getElementById(this.config.containerId)
    if (!container) throw new Error("Container not found: " + this.config.containerId)

    const iframe = document.createElement("iframe")
    iframe.src = this.config.srcUrl
    iframe.width = "100%"
    iframe.height = "100%"
    iframe.title = this.config.title ?? "Token Analysis Frame"
    iframe.sandbox = this.config.sandbox ?? "allow-scripts allow-same-origin"
    iframe.onload = () => this.postMetrics()
    container.appendChild(iframe)
    this.iframeEl = iframe

    if (this.config.refreshIntervalMs) {
      this.refreshTimer = setInterval(() => this.postMetrics(), this.config.refreshIntervalMs)
    }
  }

  private postMetrics(): void {
    if (!this.iframeEl?.contentWindow) return
    const payload = {
      type: "TOKEN_ANALYSIS_METRICS",
      payload: this.config.metrics,
      sentAt: Date.now(),
    }
    this.iframeEl.contentWindow.postMessage(payload, "*")
  }

  updateMetrics(metrics: TokenMetrics): void {
    this.config.metrics = metrics
    this.postMetrics()
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = undefined
    }
    if (this.iframeEl) {
      this.iframeEl.remove()
      this.iframeEl = null
    }
  }
}
