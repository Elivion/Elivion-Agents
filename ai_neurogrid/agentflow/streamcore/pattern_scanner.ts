import fetch from "node-fetch"

/*------------------------------------------------------
 * Types
 *----------------------------------------------------*/

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export type CandlestickPattern =
  | "Hammer"
  | "ShootingStar"
  | "BullishEngulfing"
  | "BearishEngulfing"
  | "Doji"

export interface PatternSignal {
  timestamp: number
  pattern: CandlestickPattern
  confidence: number
}

export interface DetectorOptions {
  /** HTTP request timeout (ms) */
  requestTimeoutMs?: number
  /** Default number of candles to pull when scanning */
  defaultLimit?: number
  /** Minimum confidence required to emit a signal */
  minConfidence?: number
  /** Optional moving-average smoothing window for body calculations */
  smoothWindow?: number
}

/*------------------------------------------------------
 * Detector
 *----------------------------------------------------*/

export class CandlestickPatternDetector {
  private readonly timeoutMs: number
  private readonly defaultLimit: number
  private readonly minConfidence: number
  private readonly smoothWindow: number

  constructor(private readonly apiUrl: string, opts: DetectorOptions = {}) {
    this.timeoutMs = opts.requestTimeoutMs ?? 10_000
    this.defaultLimit = opts.defaultLimit ?? 100
    this.minConfidence = opts.minConfidence ?? 0.6
    this.smoothWindow = Math.max(1, Math.floor(opts.smoothWindow ?? 1))
  }

  /* ------------------------- Fetching ----------------------------- */

  /** Fetch recent OHLC candles with timeout and basic shape validation */
  async fetchCandles(symbol: string, limit = this.defaultLimit): Promise<Candle[]> {
    const url = `${this.apiUrl}/markets/${encodeURIComponent(symbol)}/candles?limit=${limit}`
    const res = await fetch(url, { timeout: this.timeoutMs })
    if (!res.ok) {
      throw new Error(`Failed to fetch candles ${res.status}: ${res.statusText}`)
    }
    const raw = (await res.json()) as unknown
    if (!Array.isArray(raw)) throw new Error("Invalid response: expected array")
    const parsed: Candle[] = []
    for (const r of raw) {
      if (this.isCandleLike(r)) parsed.push(this.normalizeCandle(r))
    }
    return parsed
  }

  /** One-shot scan: fetch + detect */
  async scan(symbol: string, limit = this.defaultLimit): Promise<PatternSignal[]> {
    const candles = await this.fetchCandles(symbol, limit)
    return this.detectPatterns(candles)
  }

  /* ------------------------- Type guards -------------------------- */

  private isCandleLike(v: any): v is Candle {
    return (
      v &&
      Number.isFinite(+v.timestamp ?? +v.time) &&
      ["open", "high", "low", "close"].every((k) => Number.isFinite(+v[k]))
    )
  }

  private normalizeCandle(c: any): Candle {
    const timestamp = Number.isFinite(+c.timestamp) ? +c.timestamp : +c.time
    const open = +c.open
    const close = +c.close
    const high = Math.max(+c.high, open, close)
    const low = Math.min(+c.low, open, close)
    return { timestamp, open, high, low, close }
  }

  /* ------------------------- Math helpers ------------------------- */

  /** Optionally smooth close price using a simple moving average */
  private smoothSeries(candles: Candle[]): Candle[] {
    const w = this.smoothWindow
    if (w <= 1 || candles.length <= w) return candles
    const out: Candle[] = []
    let sum = 0
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].close
      if (i >= w) sum -= candles[i - w].close
      if (i >= w - 1) {
        const avg = sum / w
        const c = candles[i]
        out.push({ ...c, close: avg })
      }
    }
    // Keep alignment: if smoothing reduced length, pad front with originals
    if (out.length < candles.length) {
      const pad = candles.slice(0, candles.length - out.length)
      return [...pad, ...out]
    }
    return out
  }

  /* ------------------------- Pattern helpers ---------------------- */

  private isHammer(c: Candle): number {
    const body = Math.abs(c.close - c.open)
    const range = c.high - c.low || 1
    const lowerWick = Math.min(c.open, c.close) - c.low
    const ratio = body > 0 ? lowerWick / body : 0
    const bodyFrac = body / range
    return ratio > 2 && bodyFrac < 0.3 ? Math.min(ratio / 3, 1) : 0
  }

  private isShootingStar(c: Candle): number {
    const body = Math.abs(c.close - c.open)
    const range = c.high - c.low || 1
    const upperWick = c.high - Math.max(c.open, c.close)
    const ratio = body > 0 ? upperWick / body : 0
    const bodyFrac = body / range
    return ratio > 2 && bodyFrac < 0.3 ? Math.min(ratio / 3, 1) : 0
  }

  private isBullishEngulfing(prev: Candle, curr: Candle): number {
    const cond =
      curr.close > curr.open &&
      prev.close < prev.open &&
      curr.close > prev.open &&
      curr.open < prev.close
    if (!cond) return 0
    const bodyPrev = Math.abs(prev.close - prev.open)
    const bodyCurr = Math.abs(curr.close - curr.open)
    return bodyPrev > 0 ? Math.min(bodyCurr / bodyPrev, 1) : 0.8
  }

  private isBearishEngulfing(prev: Candle, curr: Candle): number {
    const cond =
      curr.close < curr.open &&
      prev.close > prev.open &&
      curr.open > prev.close &&
      curr.close < prev.open
    if (!cond) return 0
    const bodyPrev = Math.abs(prev.close - prev.open)
    const bodyCurr = Math.abs(curr.close - curr.open)
    return bodyPrev > 0 ? Math.min(bodyCurr / bodyPrev, 1) : 0.8
  }

  private isDoji(c: Candle): number {
    const range = c.high - c.low
    const body = Math.abs(c.close - c.open)
    const ratio = range > 0 ? body / range : 1
    return ratio < 0.1 ? 1 - ratio * 10 : 0
  }

  /* ------------------------- Detection API ------------------------ */

  /** Detect patterns over a series of candles (returns signals above threshold) */
  detectPatterns(candles: Candle[]): PatternSignal[] {
    const out: PatternSignal[] = []
    if (!candles.length) return out

    const series = this.smoothSeries(candles)

    for (let i = 0; i < series.length; i++) {
      const c = series[i]
      const prev = i > 0 ? series[i - 1] : undefined

      this.pushIf(out, c.timestamp, "Hammer", this.isHammer(c))
      this.pushIf(out, c.timestamp, "ShootingStar", this.isShootingStar(c))
      if (prev) {
        this.pushIf(out, c.timestamp, "BullishEngulfing", this.isBullishEngulfing(prev, c))
        this.pushIf(out, c.timestamp, "BearishEngulfing", this.isBearishEngulfing(prev, c))
      }
      this.pushIf(out, c.timestamp, "Doji", this.isDoji(c))
    }
    return out
  }

  /** Keep only highest-confidence signal per timestamp */
  dedupeByTimestamp(signals: PatternSignal[]): PatternSignal[] {
    const best = new Map<number, PatternSignal>()
    for (const s of signals) {
      const prev = best.get(s.timestamp)
      if (!prev || s.confidence > prev.confidence) best.set(s.timestamp, s)
    }
    return Array.from(best.values()).sort((a, b) => a.timestamp - b.timestamp)
  }

  /** Filter signals by pattern name and/or minimum confidence */
  filterSignals(
    signals: PatternSignal[],
    filter?: { pattern?: CandlestickPattern; minConfidence?: number }
  ): PatternSignal[] {
    const min = filter?.minConfidence ?? this.minConfidence
    return signals.filter(
      (s) => s.confidence >= min && (!filter?.pattern || s.pattern === filter.pattern)
    )
  }

  private pushIf(
    bag: PatternSignal[],
    ts: number,
    pattern: CandlestickPattern,
    confidence: number
  ) {
    if (confidence >= this.minConfidence) {
      bag.push({ timestamp: ts, pattern, confidence: +confidence.toFixed(3) })
    }
  }
}
