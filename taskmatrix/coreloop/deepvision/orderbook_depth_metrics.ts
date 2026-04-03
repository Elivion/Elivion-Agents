/**
 * Analyze on-chain orderbook depth for a given market
 * 
 * Improvements over the basic version
 * - Adds request timeout + basic retries to the fetcher
 * - Validates and sanitizes orderbook data (filters non-finite values)
 * - Keeps original DepthMetrics shape for compatibility
 * - Adds additional helpers: mid price, VWAP (top N), cumulative depth, imbalance
 * - Exposes an `analyzeAdvanced` method that returns richer metrics without breaking the basic API
 */

export interface Order {
  price: number
  size: number
}

export interface DepthMetrics {
  averageBidDepth: number
  averageAskDepth: number
  spread: number
}

export interface AdvancedDepthMetrics extends DepthMetrics {
  midPrice: number
  spreadBps: number
  bidCumulative10: number
  askCumulative10: number
  depthImbalance: number // (bidSum - askSum) / (bidSum + askSum), in [-1, 1]
  vwapBidTop10: number
  vwapAskTop10: number
}

export interface DepthAnalyzerOptions {
  timeoutMs?: number
  maxRetries?: number
}

export class TokenDepthAnalyzer {
  private timeoutMs: number
  private maxRetries: number

  constructor(
    private rpcEndpoint: string,
    private marketId: string,
    opts: DepthAnalyzerOptions = {}
  ) {
    this.timeoutMs = Math.max(1_000, opts.timeoutMs ?? 8_000)
    this.maxRetries = Math.max(0, opts.maxRetries ?? 2)
  }

  /**
   * Fetch orderbook with timeout + retries
   */
  async fetchOrderbook(depth = 50): Promise<{ bids: Order[]; asks: Order[] }> {
    const safeDepth = Math.max(1, Math.floor(depth))
    const url = `${this.rpcEndpoint}/orderbook/${this.marketId}?depth=${safeDepth}`
    return this.fetchWithRetry(url)
  }

  /**
   * Backward-compatible analysis
   */
  async analyze(depth = 50): Promise<DepthMetrics> {
    const { bids, asks } = await this.fetchOrderbook(depth)
    const sbids = this.sanitizeOrders(bids, 'desc') // bids: high→low
    const sasks = this.sanitizeOrders(asks, 'asc')  // asks: low→high

    const avg = (arr: Order[]) =>
      arr.length === 0 ? 0 : arr.reduce((s, o) => s + o.size, 0) / arr.length

    const bestBid = sbids[0]?.price ?? 0
    const bestAsk = sasks[0]?.price ?? 0

    return {
      averageBidDepth: avg(sbids),
      averageAskDepth: avg(sasks),
      spread: bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0,
    }
  }

  /**
   * Richer analysis while preserving the basic `analyze` method
   */
  async analyzeAdvanced(depth = 50): Promise<AdvancedDepthMetrics> {
    const { bids, asks } = await this.fetchOrderbook(depth)
    const sbids = this.sanitizeOrders(bids, 'desc')
    const sasks = this.sanitizeOrders(asks, 'asc')

    const bestBid = sbids[0]?.price ?? 0
    const bestAsk = sasks[0]?.price ?? 0
    const midPrice = this.computeMidPrice(bestBid, bestAsk)
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0
    const spreadBps = midPrice > 0 ? (spread / midPrice) * 10_000 : 0

    const averageBidDepth = this.averageSize(sbids)
    const averageAskDepth = this.averageSize(sasks)

    const bidCumulative10 = this.cumulativeSize(sbids, 10)
    const askCumulative10 = this.cumulativeSize(sasks, 10)

    const bidSum = this.cumulativeSize(sbids, depth)
    const askSum = this.cumulativeSize(sasks, depth)
    const depthImbalance = this.imbalance(bidSum, askSum)

    const vwapBidTop10 = this.vwap(sbids, 10)
    const vwapAskTop10 = this.vwap(sasks, 10)

    return {
      averageBidDepth,
      averageAskDepth,
      spread,
      midPrice,
      spreadBps,
      bidCumulative10,
      askCumulative10,
      depthImbalance,
      vwapBidTop10,
      vwapAskTop10,
    }
  }

  // ===== Helpers =====

  private async fetchWithRetry(url: string, attempt = 0): Promise<{ bids: Order[]; asks: Order[] }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`Orderbook fetch failed: ${res.status}`)
      const json = (await res.json()) as { bids: Order[]; asks: Order[] }
      if (!json || !Array.isArray(json.bids) || !Array.isArray(json.asks)) {
        throw new Error('Malformed orderbook payload')
      }
      return json
    } catch (err) {
      if (attempt < this.maxRetries) {
        await this.sleep(200 * (attempt + 1))
        return this.fetchWithRetry(url, attempt + 1)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  private sanitizeOrders(orders: Order[], side: 'asc' | 'desc'): Order[] {
    // keep only finite, positive size and price
    const clean = orders.filter(
      (o) => this.isFiniteNumber(o.price) && this.isFiniteNumber(o.size) && o.price > 0 && o.size > 0
    )
    // sort explicitly to ensure expected side semantics
    clean.sort((a, b) => (side === 'asc' ? a.price - b.price : b.price - a.price))
    return clean
  }

  private averageSize(arr: Order[]): number {
    if (arr.length === 0) return 0
    let total = 0
    for (const o of arr) total += o.size
    return total / arr.length
  }

  private cumulativeSize(arr: Order[], n: number): number {
    const upTo = Math.max(0, Math.min(arr.length, Math.floor(n)))
    let total = 0
    for (let i = 0; i < upTo; i++) total += arr[i].size
    return total
  }

  /**
   * VWAP of the top N levels (size-weighted average price)
   */
  private vwap(arr: Order[], n: number): number {
    const upTo = Math.max(0, Math.min(arr.length, Math.floor(n)))
    let notional = 0
    let volume = 0
    for (let i = 0; i < upTo; i++) {
      const { price, size } = arr[i]
      notional += price * size
      volume += size
    }
    return volume > 0 ? notional / volume : 0
  }

  private computeMidPrice(bestBid: number, bestAsk: number): number {
    if (!(bestBid > 0) || !(bestAsk > 0)) return 0
    return (bestBid + bestAsk) / 2
  }

  private imbalance(bidSum: number, askSum: number): number {
    const denom = bidSum + askSum
    return denom > 0 ? (bidSum - askSum) / denom : 0
  }

  private isFiniteNumber(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x)
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
