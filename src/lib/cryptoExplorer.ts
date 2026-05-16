import {
  KALSHI_CRYPTO_ASSETS,
  noMidProbability,
  pickPrimary15mMarket,
  pickPrimaryHourlyMarket,
  parseVolume,
  yesMidProbability,
  type KalshiMarket,
} from './kalshi'
import type { AssetMarketSnapshot, CryptoSignalSymbol, FrequencyQuote } from '../engine/types'
import { CRYPTO_SIGNAL_SYMBOLS } from '../engine/types'

export type CryptoExplorerBucket = '15m' | 'hourly'

export interface CryptoExplorerRow {
  assetSymbol: string
  bucket: CryptoExplorerBucket
  market: KalshiMarket
}

function quoteFromMarket(m: KalshiMarket): FrequencyQuote {
  return {
    yesMid: yesMidProbability(m),
    noMid: noMidProbability(m),
    volume: parseVolume(m),
    close_time: m.close_time,
  }
}

/**
 * One row per asset per bucket — same 7 symbols on 15m and Hourly tabs.
 * 15m = soonest open window; hourly = headline strike (highest volume).
 */
export async function fetchCryptoExplorerRows(): Promise<CryptoExplorerRow[]> {
  const rows: CryptoExplorerRow[] = []

  for (const asset of KALSHI_CRYPTO_ASSETS) {
    const [m15, hourly] = await Promise.all([
      pickPrimary15mMarket(asset.series15m),
      pickPrimaryHourlyMarket(asset.seriesHourly),
    ])

    if (m15) {
      rows.push({ assetSymbol: asset.symbol, bucket: '15m', market: m15 })
    }
    if (hourly) {
      rows.push({ assetSymbol: asset.symbol, bucket: 'hourly', market: hourly })
    }
  }

  return rows
}

/** Rows for a bucket in canonical asset order (BTC → HYPE). */
export function explorerRowsForBucket(
  rows: CryptoExplorerRow[],
  bucket: CryptoExplorerBucket,
): CryptoExplorerRow[] {
  const byAsset = new Map(
    rows.filter((r) => r.bucket === bucket).map((r) => [r.assetSymbol, r]),
  )
  const out: CryptoExplorerRow[] = []
  for (const sym of CRYPTO_SIGNAL_SYMBOLS) {
    const row = byAsset.get(sym)
    if (row) out.push(row)
  }
  return out
}

/**
 * Derive 15m + hourly quotes for one asset from explorer rows.
 */
export function deriveSignalFromExplorer(
  rows: CryptoExplorerRow[],
  symbol: CryptoSignalSymbol,
): AssetMarketSnapshot {
  const m15 = rows.find((r) => r.assetSymbol === symbol && r.bucket === '15m')
  const hourly = rows.find((r) => r.assetSymbol === symbol && r.bucket === 'hourly')

  return {
    fifteen: m15 ? quoteFromMarket(m15.market) : null,
    hourly: hourly ? quoteFromMarket(hourly.market) : null,
  }
}

/** @deprecated Use deriveSignalFromExplorer(rows, 'BTC') */
export function deriveBtcSignalFromExplorer(
  rows: CryptoExplorerRow[],
): { fifteen: number; hourly: number } | null {
  const s = deriveSignalFromExplorer(rows, 'BTC')
  if (!s.fifteen || !s.hourly) return null
  return { fifteen: s.fifteen.yesMid, hourly: s.hourly.yesMid }
}

/** Regex / title fallback when rows are merged from a flat /markets feed. */
export function categorizeKalshiCryptoMarket(m: KalshiMarket): CryptoExplorerBucket | null {
  const t = `${m.ticker} ${m.title}`.toUpperCase()
  if (/15\s*MIN|15M|15\s*MINUTE|NEXT\s+15/i.test(t)) return '15m'
  if (
    /\bHOURLY\b|\b1\s*H(OUR)?\b|\bHOUR\b/i.test(t) ||
    (/KX(BTC|ETH|SOL|XRP|DOGE|BNB|HYPE)-/i.test(m.ticker) && !/15M/i.test(m.ticker))
  ) {
    if (/15M/i.test(m.ticker)) return '15m'
    return 'hourly'
  }
  return null
}
