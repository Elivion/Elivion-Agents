import React from "react"
import SentimentGauge from "./SentimentGauge"
import AssetOverviewPanel from "./AssetOverviewPanel"

interface WhaleTrackerCardProps {
  title?: string
  whales?: Array<{ address: string; balance: number }>
}

const WhaleTrackerCard: React.FC<WhaleTrackerCardProps> = ({
  title = "Whale Tracker",
  whales = [],
}) => {
  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {whales.length === 0 ? (
        <p className="text-gray-500">No whale activity detected</p>
      ) : (
        <ul className="space-y-1">
          {whales.map((w) => (
            <li key={w.address} className="text-sm">
              <strong>{w.address}:</strong> {w.balance.toLocaleString()} tokens
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const AnalyticsDashboard: React.FC = () => (
  <div className="p-8 bg-gray-100 min-h-screen">
    <h1 className="text-4xl font-bold mb-6">Analytics Dashboard</h1>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <SentimentGauge symbol="SOL" />
      <AssetOverviewPanel assetId="SOL-01" />
      <WhaleTrackerCard />
    </div>
  </div>
)

export default AnalyticsDashboard
