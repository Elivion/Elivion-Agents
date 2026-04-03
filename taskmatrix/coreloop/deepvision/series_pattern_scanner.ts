/**
 * Detect volume-based patterns in a time series of numeric activity amounts
 *
 * Improvements:
 * - Adds validation and sanitization of input
 * - Computes rolling statistics (min, max, stdev) in addition to average
 * - Supports both fixed-threshold and relative-threshold detection
 * - Provides a richer result type for advanced analysis
 */

export interface PatternMatch {
  index: number
  window: number
  average: number
}

export interface AdvancedPatternMatch extends PatternMatch {
  min: number
  max: number
  stdev: number
  exceedsThreshold: boolean
}

export interface PatternOptions {
  relative?: boolean // if true, threshold is interpreted as multiple of global avg
  includeAdvanced?: boolean
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdev(arr: number[]): number {
  if (arr.length === 0) return 0
  const m = mean(arr)
  const variance = arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function minVal(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((m, x) => (x < m ? x : m), arr[0])
}

function maxVal(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((m, x) => (x > m ? x : m), arr[0])
}

/**
 * Detect volume patterns across a numeric sequence
 */
export function detectVolumePatterns(
  volumes: number[],
  windowSize: number,
  threshold: number,
  opts: PatternOptions = {}
): PatternMatch[] | AdvancedPatternMatch[] {
  if (!Array.isArray(volumes) || volumes.length === 0) return []
  if (windowSize <= 0) throw new Error('windowSize must be > 0')

  const safeVolumes = volumes.filter((v) => Number.isFinite(v))
  if (safeVolumes.length < windowSize) return []

  const matches: (PatternMatch | AdvancedPatternMatch)[] = []
  const globalAvg = mean(safeVolumes)
  const effectiveThreshold = opts.relative ? threshold * globalAvg : threshold

  for (let i = 0; i + windowSize <= safeVolumes.length; i++) {
    const slice = safeVolumes.slice(i, i + windowSize)
    const avg = mean(slice)
    const min = minVal(slice)
    const max = maxVal(slice)
    const std = stdev(slice)
    const exceeds = avg >= effectiveThreshold

    if (exceeds) {
      if (opts.includeAdvanced) {
        matches.push({
          index: i,
          window: windowSize,
          average: avg,
          min,
          max,
          stdev: std,
          exceedsThreshold: exceeds,
        })
      } else {
        matches.push({ index: i, window: windowSize, average: avg })
      }
    }
  }

  return matches
}
