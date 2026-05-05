/** Kalshi Trade API — public markets (no auth). */

export type KalshiStrikeType =
  | 'greater'
  | 'greater_or_equal'
  | 'less'
  | 'less_or_equal'
  | string

export interface KalshiMarket {
  ticker: string
  event_ticker: string
  title: string
  subtitle?: string
  status: string
  close_time: string
  strike_type?: KalshiStrikeType
  floor_strike?: number
  cap_strike?: number
  yes_bid_dollars?: string
  yes_ask_dollars?: string
  no_bid_dollars?: string
  no_ask_dollars?: string
  last_price_dollars?: string
  volume_fp?: string
}

interface GetMarketsResponse {
  markets: KalshiMarket[]
  cursor?: string
}

const DEFAULT_BASE = '/kalshi-api'

function apiBase(): string {
  const env = import.meta.env.VITE_KALSHI_API_BASE as string | undefined
  return (env && env.replace(/\/$/, '')) || DEFAULT_BASE
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function fetchKalshiMarketsPage(params: {
  series_ticker?: string
  event_ticker?: string
  cursor?: string
  limit?: number
  status?: string
}): Promise<GetMarketsResponse> {
  const qs = new URLSearchParams()
  qs.set('limit', String(params.limit ?? 200))
  if (params.status) qs.set('status', params.status)
  if (params.series_ticker) qs.set('series_ticker', params.series_ticker)
  if (params.event_ticker) qs.set('event_ticker', params.event_ticker)
  if (params.cursor) qs.set('cursor', params.cursor)

  const url = `${apiBase()}/markets?${qs.toString()}`
  let attempt = 0
  const maxAttempts = 4

  while (attempt < maxAttempts) {
    const res = await fetch(url)
    if (res.status === 429) {
      await sleep(800 * 2 ** attempt + Math.random() * 400)
      attempt++
      continue
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        `Kalshi ${res.status}: ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`,
      )
    }
    return res.json() as Promise<GetMarketsResponse>
  }

  throw new Error('Kalshi rate limited — try again shortly.')
}

export async function fetchAllMarketsForQuery(
  baseParams: { series_ticker?: string; event_ticker?: string; status?: string },
  maxPages = 25,
): Promise<KalshiMarket[]> {
  const out: KalshiMarket[] = []
  let cursor: string | undefined
  let pages = 0

  while (pages < maxPages) {
    const batch = await fetchKalshiMarketsPage({
      ...baseParams,
      cursor,
      limit: 200,
    })
    out.push(...batch.markets)
    const next = batch.cursor?.trim()
    if (!next) break
    cursor = next
    pages++
  }

  return out
}

export function parseUsdProbability(raw?: string): number | null {
  if (raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Midpoint of NO quote in 0–1 probability units. */
export function noMidProbability(m: KalshiMarket): number {
  const bid = parseUsdProbability(m.no_bid_dollars)
  const ask = parseUsdProbability(m.no_ask_dollars)

  if (bid !== null && ask !== null && ask >= bid) {
    return (bid + ask) / 2
  }
  const yes = yesMidProbability(m)
  if (yes !== null && Number.isFinite(yes)) {
    return clamp01(1 - yes)
  }
  return 0.5
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/** Midpoint of YES quote in 0–1 probability units (Kalshi returns dollar-scale strings). */
export function yesMidProbability(m: KalshiMarket): number {
  const bid = parseUsdProbability(m.yes_bid_dollars)
  const ask = parseUsdProbability(m.yes_ask_dollars)
  const last = parseUsdProbability(m.last_price_dollars)

  if (bid !== null && ask !== null && ask >= bid) {
    return (bid + ask) / 2
  }
  if (last !== null) return last
  if (bid !== null) return bid
  if (ask !== null) return ask
  return 0
}

/** Format probability as whole cents (0–100). */
export function probabilityToCentsMid(p: number): number {
  return Math.round(p * 1000) / 10
}

export function formatBidAskCents(m: KalshiMarket): { bid: number | null; ask: number | null } {
  const bid = parseUsdProbability(m.yes_bid_dollars)
  const ask = parseUsdProbability(m.yes_ask_dollars)
  return {
    bid: bid !== null ? Math.round(bid * 1000) / 10 : null,
    ask: ask !== null ? Math.round(ask * 1000) / 10 : null,
  }
}

export function parseVolume(m: KalshiMarket): number {
  const v = Number(m.volume_fp ?? '0')
  return Number.isFinite(v) ? v : 0
}

export function priceBiasRelativeToStrike(
  m: KalshiMarket,
  mid: number,
): 'up' | 'down' | null {
  const st = m.strike_type
  if (st === 'greater' || st === 'greater_or_equal') {
    return mid >= 0.5 ? 'up' : 'down'
  }
  if (st === 'less' || st === 'less_or_equal') {
    return mid >= 0.5 ? 'down' : 'up'
  }
  if (m.floor_strike !== undefined || m.cap_strike !== undefined) {
    return mid >= 0.5 ? 'up' : 'down'
  }
  return null
}

export function formatStrikeHint(m: KalshiMarket): string | null {
  if (m.floor_strike !== undefined) {
    return `Floor $${m.floor_strike.toLocaleString()}`
  }
  if (m.cap_strike !== undefined) {
    return `Cap $${m.cap_strike.toLocaleString()}`
  }
  return null
}

export function isOpenKalshiMarket(m: KalshiMarket): boolean {
  const s = m.status?.toLowerCase()
  return s === 'active' || s === 'open'
}

function pickSoonestOpenMarket(markets: KalshiMarket[]): KalshiMarket | null {
  const now = Date.now()
  const candidates = markets.filter((m) => {
    if (!isOpenKalshiMarket(m)) return false
    const t = Date.parse(m.close_time)
    return Number.isFinite(t) && t > now
  })
  if (!candidates.length) return null
  candidates.sort((a, b) => Date.parse(a.close_time) - Date.parse(b.close_time))
  return candidates[0]
}

/** Discover nearest expiring event for an hourly-style range series. */
export async function discoverNearestOpenEventTicker(
  seriesTicker: string,
  maxScanPages = 4,
): Promise<string | null> {
  let cursor: string | undefined
  let bestClose = Infinity
  let bestEvent: string | null = null
  const now = Date.now()

  for (let page = 0; page < maxScanPages; page++) {
    const batch = await fetchKalshiMarketsPage({
      series_ticker: seriesTicker,
      status: 'open',
      cursor,
      limit: 200,
    })

    for (const m of batch.markets) {
      if (!isOpenKalshiMarket(m)) continue
      const ct = Date.parse(m.close_time)
      if (!Number.isFinite(ct) || ct <= now) continue
      if (ct < bestClose) {
        bestClose = ct
        bestEvent = m.event_ticker
      }
    }

    const next = batch.cursor?.trim()
    if (!next) break
    cursor = next
  }

  return bestEvent
}

/** Highest-volume market within an event (liquid “headline” strike). */
export async function pickPrimaryHourlyMarket(
  seriesTicker: string,
): Promise<KalshiMarket | null> {
  const eventTicker = await discoverNearestOpenEventTicker(seriesTicker)
  if (!eventTicker) return null

  const eventMarkets = await fetchAllMarketsForQuery({
    event_ticker: eventTicker,
    status: 'open',
  })

  const scoped = eventMarkets.filter(
    (m) =>
      isOpenKalshiMarket(m) &&
      m.ticker.startsWith(`${seriesTicker}-`) &&
      Date.parse(m.close_time) > Date.now(),
  )

  if (!scoped.length) return null

  scoped.sort((a, b) => parseVolume(b) - parseVolume(a))
  return scoped[0]
}

export async function pickPrimary15mMarket(
  seriesTicker: string,
): Promise<KalshiMarket | null> {
  const markets = await fetchAllMarketsForQuery({
    series_ticker: seriesTicker,
    status: 'open',
  })
  return pickSoonestOpenMarket(markets)
}

export const KALSHI_CRYPTO_ASSETS = [
  { symbol: 'BTC', label: 'Bitcoin', series15m: 'KXBTC15M', seriesHourly: 'KXBTC' },
  { symbol: 'ETH', label: 'Ethereum', series15m: 'KXETH15M', seriesHourly: 'KXETH' },
  { symbol: 'SOL', label: 'Solana', series15m: 'KXSOL15M', seriesHourly: 'KXSOL' },
  { symbol: 'XRP', label: 'XRP', series15m: 'KXXRP15M', seriesHourly: 'KXXRP' },
  { symbol: 'DOGE', label: 'Dogecoin', series15m: 'KXDOGE15M', seriesHourly: 'KXDOGE' },
  { symbol: 'BNB', label: 'BNB', series15m: 'KXBNB15M', seriesHourly: 'KXBNB' },
  { symbol: 'HYPE', label: 'Hype', series15m: 'KXHYPE15M', seriesHourly: 'KXHYPE' },
] as const

export type CryptoAssetConfig = (typeof KALSHI_CRYPTO_ASSETS)[number]
