export interface TokenDataPoint {
  timestamp: number
  priceUsd: number
  volumeUsd: number
  marketCapUsd: number
}

export interface TokenMeta {
  symbol: string
  name?: string
  decimals?: number
}

export class TokenDataFetcher {
  constructor(private apiBase: string, private apiKey?: string) {}

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`
    return headers
  }

  /**
   * Fetches an array of TokenDataPoint for the given token symbol.
   * Expects endpoint: `${apiBase}/tokens/${symbol}/history`
   */
  async fetchHistory(symbol: string, limit?: number): Promise<TokenDataPoint[]> {
    const url = new URL(`${this.apiBase}/tokens/${encodeURIComponent(symbol)}/history`)
    if (limit) url.searchParams.set("limit", String(limit))
    const res = await fetch(url.toString(), { headers: this.getHeaders() })
    if (!res.ok) throw new Error(`Failed to fetch history for ${symbol}: ${res.status}`)
    const raw = (await res.json()) as any[]
    return raw.map(r => ({
      timestamp: (r.time ?? r.timestamp) * 1000,
      priceUsd: Number(r.priceUsd ?? r.price),
      volumeUsd: Number(r.volumeUsd ?? r.volume),
      marketCapUsd: Number(r.marketCapUsd ?? r.marketCap),
    }))
  }

  /**
   * Fetch metadata about a token.
   * Expects endpoint: `${apiBase}/tokens/${symbol}/meta`
   */
  async fetchMeta(symbol: string): Promise<TokenMeta> {
    const res = await fetch(`${this.apiBase}/tokens/${encodeURIComponent(symbol)}/meta`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to fetch meta for ${symbol}: ${res.status}`)
    return (await res.json()) as TokenMeta
  }

  /**
   * Fetch the latest datapoint for a token.
   */
  async fetchLatest(symbol: string): Promise<TokenDataPoint | null> {
    const history = await this.fetchHistory(symbol, 1)
    return history.length ? history[0] : null
  }
}
