import React, { useEffect, useState } from "react"

interface AssetOverviewPanelProps {
  assetId: string
}

interface AssetOverview {
  name: string
  priceUsd: number
  supply: number
  holders: number
  marketCap?: number
  lastUpdated?: string
}

export const AssetOverviewPanel: React.FC<AssetOverviewPanelProps> = ({ assetId }) => {
  const [info, setInfo] = useState<AssetOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    let cancelled = false
    async function fetchInfo() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/assets/${assetId}`)
        if (!res.ok) throw new Error(`Failed to load asset ${assetId}: ${res.status}`)
        const json = (await res.json()) as AssetOverview
        if (!cancelled) {
          // compute derived metrics like market cap
          const marketCap = json.priceUsd && json.supply ? json.priceUsd * json.supply : undefined
          setInfo({
            ...json,
            marketCap,
            lastUpdated: new Date().toISOString(),
          })
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? "Unknown error")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchInfo()
    return () => {
      cancelled = true
    }
  }, [assetId])

  if (loading) return <div className="p-4">Loading asset overview...</div>
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>
  if (!info) return <div className="p-4">No data available</div>

  return (
    <div className="p-4 bg-white rounded shadow space-y-1">
      <h2 className="text-xl font-semibold mb-2">Asset Overview</h2>
      <p><strong>ID:</strong> {assetId}</p>
      <p><strong>Name:</strong> {info.name}</p>
      <p><strong>Price (USD):</strong> ${info.priceUsd.toFixed(4)}</p>
      <p><strong>Circulating Supply:</strong> {info.supply.toLocaleString()}</p>
      <p><strong>Holders:</strong> {info.holders.toLocaleString()}</p>
      {info.marketCap !== undefined && (
        <p><strong>Market Cap (USD):</strong> ${info.marketCap.toLocaleString()}</p>
      )}
      {info.lastUpdated && (
        <p className="text-xs text-gray-500">Last updated: {new Date(info.lastUpdated).toLocaleTimeString()}</p>
      )}
    </div>
  )
}

export default AssetOverviewPanel
