import { KALSHI_CRYPTO_ASSETS } from './kalshi'

export type CandleTimeframeId = 'intraday' | 'dd' | 'ww' | 'mm' | 'yy'

export interface CandleTimeframeConfig {
  id: CandleTimeframeId
  label: string
  /** Kraken OHLC interval (minutes). */
  krakenInterval: number
  limit: number
}

export const CANDLE_TIMEFRAMES: CandleTimeframeConfig[] = [
  { id: 'intraday', label: 'Intraday', krakenInterval: 5, limit: 288 },
  { id: 'dd', label: 'D/D', krakenInterval: 1440, limit: 90 },
  { id: 'ww', label: 'W/W', krakenInterval: 10080, limit: 52 },
  { id: 'mm', label: 'M/M', krakenInterval: 1440, limit: 30 },
  { id: 'yy', label: 'Y/Y', krakenInterval: 1440, limit: 365 },
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
  krakenPair: string
}

const DEFAULT_KRAKEN_BASE = '/kraken-api'

function krakenBase(): string {
  const env = import.meta.env.VITE_KRAKEN_API_BASE as string | undefined
  return (env && env.replace(/\/$/, '')) || DEFAULT_KRAKEN_BASE
}

const KRAKEN_PAIR_BY_SYMBOL: Record<string, string> = {
  BTC: 'XBTUSD',
  ETH: 'ETHUSD',
  SOL: 'SOLUSD',
  XRP: 'XRPUSD',
  DOGE: 'DOGEUSD',
  BNB: 'BNBUSD',
  HYPE: 'HYPEUSD',
}

export function krakenPairForSymbol(symbol: string): string | null {
  return KRAKEN_PAIR_BY_SYMBOL[symbol.toUpperCase()] ?? null
}

export const ASSET_CHART_CONFIGS: AssetChartConfig[] = KALSHI_CRYPTO_ASSETS.map((a) => ({
  symbol: a.symbol,
  label: a.label,
  krakenPair: krakenPairForSymbol(a.symbol) ?? '',
}))

export function assetChartConfigs(): AssetChartConfig[] {
  return ASSET_CHART_CONFIGS
}

const CACHE_TTL_MS = 120_000
const candleCache = new Map<string, { at: number; candles: OhlcCandle[] }>()

export function cacheKey(symbol: string, tf: CandleTimeframeId): string {
  return `${symbol}:${tf}`
}

export function readCandleCache(symbol: string, tf: CandleTimeframeId): OhlcCandle[] | null {
  const hit = candleCache.get(cacheKey(symbol, tf))
  if (!hit || Date.now() - hit.at >= CACHE_TTL_MS) return null
  return hit.candles
}

export function writeCandleCache(symbol: string, tf: CandleTimeframeId, candles: OhlcCandle[]): void {
  if (!candles.length) {
    candleCache.delete(cacheKey(symbol, tf))
    return
  }
  candleCache.set(cacheKey(symbol, tf), { at: Date.now(), candles })
}

export function invalidateCandleCache(symbol: string, tf: CandleTimeframeId): void {
  candleCache.delete(cacheKey(symbol, tf))
}

export function prefetchCandlesForSymbol(symbol: string): void {
  for (const tf of CANDLE_TIMEFRAMES) {
    if (readCandleCache(symbol, tf.id)) continue
    void fetchCryptoCandles(symbol, tf.id)
      .then((data) => writeCandleCache(symbol, tf.id, data))
      .catch(() => {})
  }
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

type KrakenOhlcResponse = {
  error?: string[]
  result?: Record<string, number[][] | number>
}

export async function fetchCryptoCandles(
  symbol: string,
  timeframeId: CandleTimeframeId,
  signal?: AbortSignal,
): Promise<OhlcCandle[]> {
  const tf = CANDLE_TIMEFRAMES.find((t) => t.id === timeframeId)
  if (!tf) throw new Error(`Unknown timeframe: ${timeframeId}`)

  const pair = krakenPairForSymbol(symbol)
  if (!pair) throw new Error(`No Kraken pair for ${symbol}`)

  const qs = new URLSearchParams({
    pair,
    interval: String(tf.krakenInterval),
  })
  const url = `${krakenBase()}/OHLC?${qs.toString()}`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Candles ${res.status}${body ? ` — ${body.slice(0, 120)}` : ''}`)
  }

  const json = (await res.json()) as KrakenOhlcResponse
  if (json.error?.length) {
    throw new Error(json.error.join('; '))
  }

  const resultKey = Object.keys(json.result ?? {}).find((k) => k !== 'last')
  const rows = resultKey ? (json.result![resultKey] as number[][]) : []
  if (!rows.length) throw new Error(`No OHLC rows for ${pair}`)

  const slice = rows.slice(-tf.limit)
  return slice.map((k) => {
    const ts = k[0] * 1000
    return {
      ts,
      label: formatCandleLabel(ts, timeframeId),
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[6],
    }
  })
}
