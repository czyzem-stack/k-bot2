import {
  discoverNearestOpenEventTicker,
  fetchAllMarketsForQuery,
  isOpenKalshiMarket,
  KALSHI_CRYPTO_ASSETS,
  noMidProbability,
  parseVolume,
  yesMidProbability,
  type KalshiMarket,
} from './kalshi'
import type { AssetMarketSnapshot, CryptoSignalSymbol, FrequencyQuote } from '../engine/types'

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

/** Fetch open crypto contracts for all tracked assets (15m series + current hourly event window per asset). */
export async function fetchCryptoExplorerRows(): Promise<CryptoExplorerRow[]> {
  const batches = await Promise.all(
    KALSHI_CRYPTO_ASSETS.map(async (asset) => {
      const rows: CryptoExplorerRow[] = []

      const m15 = await fetchAllMarketsForQuery(
        { series_ticker: asset.series15m, status: 'open' },
        8,
      )
      for (const m of m15) {
        rows.push({ assetSymbol: asset.symbol, bucket: '15m', market: m })
      }

      const ev = await discoverNearestOpenEventTicker(asset.seriesHourly, 3)
      if (ev) {
        const hourly = await fetchAllMarketsForQuery({ event_ticker: ev, status: 'open' }, 10)
        const prefix = `${asset.seriesHourly}-`
        for (const m of hourly) {
          if (m.ticker.startsWith(prefix)) {
            rows.push({ assetSymbol: asset.symbol, bucket: 'hourly', market: m })
          }
        }
      }

      return rows
    }),
  )

  return batches.flat()
}

/**
 * Derive 15m + hourly quotes for one asset from explorer rows.
 * 15m = soonest future close among open 15m contracts; hourly = highest volume strike in current window.
 */
export function deriveSignalFromExplorer(
  rows: CryptoExplorerRow[],
  symbol: CryptoSignalSymbol,
): AssetMarketSnapshot {
  const now = Date.now()

  const m15 = rows.filter(
    (r) =>
      r.assetSymbol === symbol &&
      r.bucket === '15m' &&
      isOpenKalshiMarket(r.market) &&
      Date.parse(r.market.close_time) > now,
  )
  const h = rows.filter(
    (r) =>
      r.assetSymbol === symbol &&
      r.bucket === 'hourly' &&
      isOpenKalshiMarket(r.market) &&
      Date.parse(r.market.close_time) > now,
  )

  m15.sort((a, b) => Date.parse(a.market.close_time) - Date.parse(b.market.close_time))
  h.sort((a, b) => parseVolume(b.market) - parseVolume(a.market))

  return {
    fifteen: m15.length ? quoteFromMarket(m15[0].market) : null,
    hourly: h.length ? quoteFromMarket(h[0].market) : null,
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
