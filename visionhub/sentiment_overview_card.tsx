import React from "react"

interface MarketSentimentWidgetProps {
  sentimentScore: number // value from 0 to 100
  trend: "Bullish" | "Bearish" | "Neutral"
  dominantToken: string
  totalVolume24h: number
  updatedAt?: string
}

const getSentimentColor = (score: number) => {
  if (score >= 70) return "#4caf50"
  if (score >= 40) return "#ff9800"
  return "#f44336"
}

const getTrendEmoji = (trend: "Bullish" | "Bearish" | "Neutral") => {
  switch (trend) {
    case "Bullish":
      return "📈"
    case "Bearish":
      return "📉"
    default:
      return "⚖️"
  }
}

export const MarketSentimentWidget: React.FC<MarketSentimentWidgetProps> = ({
  sentimentScore,
  trend,
  dominantToken,
  totalVolume24h,
  updatedAt,
}) => {
  const normalizedScore = Math.max(0, Math.min(100, sentimentScore))

  return (
    <div className="p-4 bg-white rounded shadow market-sentiment-widget">
      <h3 className="text-lg font-semibold mb-3">Market Sentiment</h3>
      <div className="flex items-center gap-4 sentiment-info">
        <div
          className="flex items-center justify-center rounded-full w-20 h-20 text-white font-bold text-lg score-circle"
          style={{
            backgroundColor: getSentimentColor(normalizedScore),
          }}
        >
          {normalizedScore}%
        </div>
        <ul className="text-sm sentiment-details space-y-1">
          <li>
            <strong>Trend:</strong> {getTrendEmoji(trend)} {trend}
          </li>
          <li>
            <strong>Dominant Token:</strong> {dominantToken}
          </li>
          <li>
            <strong>24h Volume:</strong> ${totalVolume24h.toLocaleString()}
          </li>
          {updatedAt && (
            <li className="text-gray-500 text-xs">
              Last updated: {new Date(updatedAt).toLocaleTimeString()}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
