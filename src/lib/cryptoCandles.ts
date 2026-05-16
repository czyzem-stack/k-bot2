import { KALSHI_CRYPTO_ASSETS } from './kalshi'

export type CandleTimeframeId = 'intraday' | 'dd' | 'ww' | 'mm' | 'yy'

export interface CandleTimeframeConfig {
  id: CandleTimeframeId
  label: string
  interval: string
  limit: number
}

export const CANDLE_TIMEFRAMES: CandleTimeframeConfig[] = [
  { id: 'intraday', label: 'Intraday', interval: '5m', limit: 288 },
  { id: 'dd', label: 'D/D', interval: '1d', limit: 90 },
  { id: 'ww', label: 'W/W', interval: '1w', limit: 52 },
  { id: 'mm', label: 'M/M', interval: '1M', limit: 24 },
  { id: 'yy', label: 'Y/Y', interval: '1M', limit: 60 },
]

export interface OhlcCandle {
  ts: number
  label: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface AssetChartConfig {
  symbol: string
  label: string
  spotPair: string
}

const DEFAULT_BINANCE_BASE = '/binance-api'

function binanceBase(): string {
  const env = import.meta.env.VITE_BINANCE_API_BASE as string | undefined
  return (env && env.replace(/\/$/, '')) || DEFAULT_BINANCE_BASE
}

/** Spot USDT pair for charting — generic mapping, not hardcoded per UI row. */
export function spotPairForSymbol(symbol: string): string {
  return `${symbol.toUpperCase()}USDT`
}

export function assetChartConfigs(): AssetChartConfig[] {
  return KALSHI_CRYPTO_ASSETS.map((a) => ({
    symbol: a.symbol,
    label: a.label,
    spotPair: spotPairForSymbol(a.symbol),
  }))
}

function formatCandleLabel(ts: number, timeframe: CandleTimeframeId): string {
  const d = new Date(ts)
  if (timeframe === 'intraday') {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  if (timeframe === 'yy' || timeframe === 'mm') {
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
]

export async function fetchCryptoCandles(
  spotPair: string,
  timeframeId: CandleTimeframeId,
  signal?: AbortSignal,
): Promise<OhlcCandle[]> {
  const tf = CANDLE_TIMEFRAMES.find((t) => t.id === timeframeId)
  if (!tf) throw new Error(`Unknown timeframe: ${timeframeId}`)

  const qs = new URLSearchParams({
    symbol: spotPair,
    interval: tf.interval,
    limit: String(tf.limit),
  })
  const url = `${binanceBase()}/klines?${qs.toString()}`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Candles ${res.status}${body ? ` — ${body.slice(0, 120)}` : ''}`,
    )
  }

  const raw = (await res.json()) as BinanceKline[]
  return raw.map((k) => {
    const ts = k[0]
    const open = Number(k[1])
    const high = Number(k[2])
    const low = Number(k[3])
    const close = Number(k[4])
    const volume = Number(k[5])
    return {
      ts,
      label: formatCandleLabel(ts, timeframeId),
      open,
      high,
      low,
      close,
      volume,
    }
  })
}
