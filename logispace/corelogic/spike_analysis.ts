export interface VolumePoint {
  timestamp: number
  volumeUsd: number
}

export interface SpikeEvent {
  timestamp: number
  volume: number
  spikeRatio: number
  avgWindow: number
  windowSize: number
}

/**
 * Detects spikes in trading volume compared to a rolling average window.
 * Returns enriched events with context about the window size and average.
 */
export function detectVolumeSpikes(
  points: VolumePoint[],
  windowSize: number = 10,
  spikeThreshold: number = 2.0
): SpikeEvent[] {
  const events: SpikeEvent[] = []
  if (points.length <= windowSize) return events

  const volumes = points.map(p => p.volumeUsd)

  for (let i = windowSize; i < volumes.length; i++) {
    const window = volumes.slice(i - windowSize, i)
    const avg = window.reduce((sum, v) => sum + v, 0) / window.length
    const curr = volumes[i]
    const ratio = avg > 0 ? curr / avg : Infinity

    if (ratio >= spikeThreshold) {
      events.push({
        timestamp: points[i].timestamp,
        volume: curr,
        spikeRatio: Math.round(ratio * 100) / 100,
        avgWindow: Math.round(avg * 100) / 100,
        windowSize,
      })
    }
  }
  return events
}

/**
 * Utility: find the strongest spike event by highest spike ratio.
 */
export function getStrongestVolumeSpike(events: SpikeEvent[]): SpikeEvent | undefined {
  return events.reduce<SpikeEvent | undefined>((max, e) => {
    if (!max || e.spikeRatio > max.spikeRatio) return e
    return max
  }, undefined)
}
