import {
  discoverNearestOpenEventTicker,
  fetchAllMarketsForQuery,
  isOpenKalshiMarket,
  KALSHI_CRYPTO_ASSETS,
  parseVolume,
  yesMidProbability,
  type KalshiMarket,
} from './kalshi'

export type CryptoExplorerBucket = '15m' | 'hourly'

export interface CryptoExplorerRow {
  assetSymbol: string
  bucket: CryptoExplorerBucket
  market: KalshiMarket
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

/** BTC mids for the trading engine: soonest 15m YES vs most liquid hourly YES headline strike. */
export function deriveBtcSignalFromExplorer(rows: CryptoExplorerRow[]): {
  fifteen: number
  hourly: number
} | null {
  const now = Date.now()

  const btc15 = rows.filter(
    (r) =>
      r.assetSymbol === 'BTC' &&
      r.bucket === '15m' &&
      isOpenKalshiMarket(r.market) &&
      Date.parse(r.market.close_time) > now,
  )
  const btcH = rows.filter(
    (r) =>
      r.assetSymbol === 'BTC' &&
      r.bucket === 'hourly' &&
      isOpenKalshiMarket(r.market) &&
      Date.parse(r.market.close_time) > now,
  )

  if (!btc15.length || !btcH.length) return null

  btc15.sort((a, b) => Date.parse(a.market.close_time) - Date.parse(b.market.close_time))
  btcH.sort((a, b) => parseVolume(b.market) - parseVolume(a.market))

  return {
    fifteen: yesMidProbability(btc15[0].market),
    hourly: yesMidProbability(btcH[0].market),
  }
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
