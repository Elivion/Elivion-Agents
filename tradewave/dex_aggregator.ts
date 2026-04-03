export interface PairInfo {
  exchange: string
  pairAddress: string
  baseSymbol: string
  quoteSymbol: string
  liquidityUsd: number
  volume24hUsd: number
  priceUsd: number
}

export interface DexSuiteConfig {
  apis: Array<{ name: string; baseUrl: string; apiKey?: string }>
  timeoutMs?: number
  maxRetries?: number
  maxConcurrency?: number
}

type AnyJson = Record<string, any>

export class DexSuite {
  private timeoutMs: number
  private maxRetries: number
  private maxConcurrency: number
  private inFlight = 0
  private queue: Array<() => void> = []

  constructor(private config: DexSuiteConfig) {
    this.timeoutMs = Math.max(1_000, config.timeoutMs ?? 10_000)
    this.maxRetries = Math.max(0, config.maxRetries ?? 2)
    this.maxConcurrency = Math.max(1, config.maxConcurrency ?? 6)
  }

  /**
   * Simple semaphore to bound concurrent requests
   */
  private async acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrency) {
      this.inFlight++
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.inFlight++
  }

  private release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1)
    const next = this.queue.shift()
    if (next) next()
  }

  private sanitizeNumber(x: unknown): number {
    const n = typeof x === 'string' ? Number(x) : (x as number)
    return Number.isFinite(n) ? n : 0
  }

  private normalizePairPayload(apiName: string, pairAddress: string, data: AnyJson): PairInfo | null {
    // Try common shapes from various DEX APIs
    const token0 = data.token0 ?? data.base ?? data.baseToken ?? {}
    const token1 = data.token1 ?? data.quote ?? data.quoteToken ?? {}

    const baseSymbol = String(token0.symbol ?? token0.ticker ?? token0.code ?? 'UNK')
    const quoteSymbol = String(token1.symbol ?? token1.ticker ?? token1.code ?? 'UNK')

    const liquidityUsd =
      this.sanitizeNumber(data.liquidityUsd ?? data.liquidityUSD ?? data.liquidity_usd ?? data.liquidity)
    const volume24hUsd =
      this.sanitizeNumber(data.volume24hUsd ?? data.volume24hUSD ?? data.volume_24h_usd ?? data.volume24h)
    const priceUsd = this.sanitizeNumber(data.priceUsd ?? data.priceUSD ?? data.price_usd ?? data.price)

    if (!baseSymbol || !quoteSymbol) return null

    return {
      exchange: apiName,
      pairAddress,
      baseSymbol,
      quoteSymbol,
      liquidityUsd,
      volume24hUsd,
      priceUsd,
    }
  }

  private async fetchWithTimeout(url: string, headers: Record<string, string>, signal: AbortSignal) {
    const res = await fetch(url, { headers, signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  }

  private async fetchFromApi<T>(
    api: { name: string; baseUrl: string; apiKey?: string },
    path: string,
    attempt = 0
  ): Promise<T> {
    await this.acquire()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const headers: Record<string, string> = {}
      if (api.apiKey) headers.Authorization = `Bearer ${api.apiKey}`

      const res = await this.fetchWithTimeout(`${api.baseUrl}${path}`, headers, controller.signal)
      return (await res.json()) as T
    } catch (err) {
      if (attempt < this.maxRetries) {
        await this.sleep(200 * (attempt + 1))
        return this.fetchFromApi<T>(api, path, attempt + 1)
      }
      throw err
    } finally {
      clearTimeout(timer)
      this.release()
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Retrieve aggregated pair info across all configured DEX APIs
   */
  async getPairInfo(pairAddress: string): Promise<PairInfo[]> {
    const tasks = this.config.apis.map(async (api) => {
      try {
        const raw = await this.fetchFromApi<AnyJson>(api, `/pair/${pairAddress}`)
        const normalized = this.normalizePairPayload(api.name, pairAddress, raw)
        return normalized
      } catch {
        return null
      }
    })

    const settled = await Promise.all(tasks)
    return settled.filter((x): x is PairInfo => x !== null)
  }

  /**
   * Compare a list of pairs across exchanges, returning the best volume and liquidity.
   * If no data is available for a pair, it is omitted from the result.
   */
  async comparePairs(
    pairs: string[]
  ): Promise<Record<string, { bestVolume: PairInfo; bestLiquidity: PairInfo }>> {
    const entries: Array<[string, { bestVolume: PairInfo; bestLiquidity: PairInfo }]> = []

    for (const addr of pairs) {
      const infos = await this.getPairInfo(addr)
      if (infos.length === 0) continue

      const bestVolume = infos.reduce((a, b) => (b.volume24hUsd > a.volume24hUsd ? b : a))
      const bestLiquidity = infos.reduce((a, b) => (b.liquidityUsd > a.liquidityUsd ? b : a))
      entries.push([addr, { bestVolume, bestLiquidity }])
    }

    return Object.fromEntries(entries)
  }

  /**
   * Aggregate multiple APIs for a single pair into a consolidated snapshot:
   * - median price
   * - summed liquidity and volume
   * - source exchanges used
   */
  async consolidatePair(pairAddress: string): Promise<{
    pairAddress: string
    baseSymbol: string
    quoteSymbol: string
    medianPriceUsd: number
    totalLiquidityUsd: number
    totalVolume24hUsd: number
    sources: string[]
  } | null> {
    const infos = await this.getPairInfo(pairAddress)
    if (infos.length === 0) return null

    const prices = infos.map((i) => i.priceUsd).filter((n) => Number.isFinite(n))
    prices.sort((a, b) => a - b)
    const mid = Math.floor(prices.length / 2)
    const medianPriceUsd =
      prices.length === 0 ? 0 : prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2

    const totalLiquidityUsd = infos.reduce((s, i) => s + i.liquidityUsd, 0)
    const totalVolume24hUsd = infos.reduce((s, i) => s + i.volume24hUsd, 0)
    const baseSymbol = infos[0].baseSymbol
    const quoteSymbol = infos[0].quoteSymbol

    return {
      pairAddress,
      baseSymbol,
      quoteSymbol,
      medianPriceUsd,
      totalLiquidityUsd,
      totalVolume24hUsd,
      sources: infos.map((i) => i.exchange),
    }
  }
}
