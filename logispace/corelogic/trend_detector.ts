export interface PricePoint {
  timestamp: number
  priceUsd: number
}

export interface TrendResult {
  startTime: number
  endTime: number
  trend: "upward" | "downward" | "neutral"
  changePct: number
  avgPrice: number
  durationMs: number
}

/**
 * Analyze a series of price points to determine overall trend segments.
 * Adds average price and duration of each segment.
 */
export function analyzePriceTrends(
  points: PricePoint[],
  minSegmentLength: number = 5
): TrendResult[] {
  const results: TrendResult[] = []
  if (points.length < minSegmentLength) return results

  let segStart = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].priceUsd
    const curr = points[i].priceUsd
    const direction = curr > prev ? 1 : curr < prev ? -1 : 0

    const isEndOfSegment =
      i === points.length - 1 ||
      (direction === 1 && points[i + 1].priceUsd < curr) ||
      (direction === -1 && points[i + 1].priceUsd > curr)

    if (i - segStart >= minSegmentLength && isEndOfSegment) {
      const start = points[segStart]
      const end = points[i]
      const slice = points.slice(segStart, i + 1)
      const avgPrice = slice.reduce((acc, p) => acc + p.priceUsd, 0) / slice.length
      const changePct = ((end.priceUsd - start.priceUsd) / start.priceUsd) * 100

      results.push({
        startTime: start.timestamp,
        endTime: end.timestamp,
        trend: changePct > 0 ? "upward" : changePct < 0 ? "downward" : "neutral",
        changePct: Math.round(changePct * 100) / 100,
        avgPrice: Math.round(avgPrice * 100) / 100,
        durationMs: end.timestamp - start.timestamp,
      })

      segStart = i
    }
  }
  return results
}

/**
 * Utility: get the strongest trend segment by absolute % change.
 */
export function getStrongestTrend(trends: TrendResult[]): TrendResult | undefined {
  return trends.reduce<TrendResult | undefined>((max, t) => {
    if (!max || Math.abs(t.changePct) > Math.abs(max.changePct)) return t
    return max
  }, undefined)
}
