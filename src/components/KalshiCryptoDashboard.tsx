import { Activity, BarChart3, Clock, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  formatBidAskCents,
  formatStrikeHint,
  KALSHI_CRYPTO_ASSETS,
  parseVolume,
  pickPrimary15mMarket,
  pickPrimaryHourlyMarket,
  priceBiasRelativeToStrike,
  probabilityToCentsMid,
  yesMidProbability,
  type CryptoAssetConfig,
  type KalshiMarket,
} from '../lib/kalshi'

type Frequency = '15m' | 'hourly'

type Snapshot = {
  fifteen: KalshiMarket | null
  hourly: KalshiMarket | null
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Closed'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Tick-driven countdown — avoids synchronous setState inside effects for lint compatibility. */
function useLiveCountdown(closeIso: string | undefined): string {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!closeIso) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [closeIso])

  return useMemo(() => {
    if (!closeIso) return '—'
    const end = Date.parse(closeIso)
    if (!Number.isFinite(end)) return '—'
    return formatRemaining(end - now)
  }, [closeIso, now])
}

function fmtVol(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  return n.toFixed(0)
}

function MarketStats({ market }: { market: KalshiMarket }) {
  const mid = useMemo(() => yesMidProbability(market), [market])
  const pct = probabilityToCentsMid(mid)
  const { bid, ask } = formatBidAskCents(market)
  const bias = priceBiasRelativeToStrike(market, mid)
  const strikeHint = formatStrikeHint(market)
  const countdown = useLiveCountdown(market.close_time)
  const volume = parseVolume(market)

  return (
    <div className="mt-4 space-y-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] text-slate-300 ring-1 ring-slate-700/80">
          <Activity className="size-3 text-emerald-400/90" aria-hidden />
          Mid {pct.toFixed(1)}%
        </span>
        <span
          className={
            bias === 'up'
              ? 'inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 ring-1 ring-emerald-500/25'
              : bias === 'down'
                ? 'inline-flex items-center rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-400 ring-1 ring-rose-500/25'
                : 'inline-flex items-center rounded-md bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-400 ring-1 ring-slate-700/80'
          }
        >
          {bias === 'up' ? '↑ Up vs strike' : bias === 'down' ? '↓ Down vs strike' : 'Bias n/a'}
        </span>
      </div>

      <div className="grid gap-2 font-mono text-xs text-slate-400">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-slate-500">
            <BarChart3 className="size-3.5 shrink-0 text-sky-400/90" aria-hidden />
            Bid / Ask
          </span>
          <span className="text-slate-200">
            {bid !== null && ask !== null ? `${bid.toFixed(1)}¢ / ${ask.toFixed(1)}¢` : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-slate-500">
            <BarChart3 className="size-3.5 shrink-0 text-indigo-400/90" aria-hidden />
            Volume
          </span>
          <span className="text-slate-200">{fmtVol(volume)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-slate-500">
            <Clock className="size-3.5 shrink-0 text-amber-400/90" aria-hidden />
            Time left
          </span>
          <span className="tabular-nums text-amber-100">{countdown}</span>
        </div>
      </div>

      {strikeHint ? (
        <p className="font-mono text-[11px] leading-snug text-slate-500">{strikeHint}</p>
      ) : null}

      <p className="font-mono text-[10px] leading-relaxed text-slate-600">{market.title}</p>
    </div>
  )
}

function AssetCard({
  asset,
  snapshot,
  busy,
}: {
  asset: CryptoAssetConfig
  snapshot: Snapshot | undefined
  busy: boolean
}) {
  const [mode, setMode] = useState<Frequency>('15m')
  const market = mode === '15m' ? snapshot?.fifteen : snapshot?.hourly

  return (
    <article className="group relative overflow-hidden rounded-xl border border-slate-700/70 bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.8)] ring-1 ring-white/[0.03] backdrop-blur-sm transition hover:border-slate-600/80 hover:shadow-[0_12px_60px_-24px_rgba(56,189,248,0.35)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent opacity-80" />

      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-50">{asset.symbol}</h3>
          <p className="text-xs text-slate-500">{asset.label}</p>
        </div>

        <div className="flex shrink-0 rounded-full bg-slate-950/80 p-0.5 ring-1 ring-slate-700/80">
          <button
            type="button"
            onClick={() => setMode('15m')}
            className={
              mode === '15m'
                ? 'rounded-full bg-sky-500/20 px-3 py-1 text-[11px] font-semibold text-sky-100 shadow-inner shadow-sky-900/40 ring-1 ring-sky-500/40'
                : 'rounded-full px-3 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-200'
            }
          >
            15 min
          </button>
          <button
            type="button"
            onClick={() => setMode('hourly')}
            className={
              mode === 'hourly'
                ? 'rounded-full bg-violet-500/20 px-3 py-1 text-[11px] font-semibold text-violet-100 shadow-inner shadow-violet-900/40 ring-1 ring-violet-500/40'
                : 'rounded-full px-3 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-200'
            }
          >
            Hourly
          </button>
        </div>
      </header>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Market ticker
        </p>
        <p className="mt-1 truncate font-mono text-sm text-cyan-100/95">
          {busy ? (
            <span className="inline-block h-4 w-48 animate-pulse rounded bg-slate-800" />
          ) : market ? (
            market.ticker
          ) : (
            <span className="text-slate-600">No open contract found</span>
          )}
        </p>
      </div>

      {busy ? (
        <div className="mt-4 space-y-2">
          <div className="h-8 animate-pulse rounded-lg bg-slate-800/80" />
          <div className="h-16 animate-pulse rounded-lg bg-slate-800/60" />
        </div>
      ) : market ? (
        <MarketStats market={market} />
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-slate-600">
          Try again shortly — Kalshi may rotate contracts between windows.
        </p>
      )}
    </article>
  )
}

export function KalshiCryptoDashboard() {
  const [bySymbol, setBySymbol] = useState<Record<string, Snapshot>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadAll = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const entries = await Promise.all(
        KALSHI_CRYPTO_ASSETS.map(async (a) => {
          const [fifteen, hourly] = await Promise.all([
            pickPrimary15mMarket(a.series15m),
            pickPrimaryHourlyMarket(a.seriesHourly),
          ])
          return [a.symbol, { fifteen, hourly }] as const
        }),
      )
      setBySymbol(Object.fromEntries(entries))
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Kalshi markets.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const boot = window.setTimeout(() => void loadAll({ silent: false }), 0)
    const id = window.setInterval(() => void loadAll({ silent: true }), 30_000)
    return () => {
      window.clearTimeout(boot)
      window.clearInterval(id)
    }
  }, [loadAll])

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-black pb-16 pt-10 text-slate-200">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="flex flex-col gap-6 border-b border-slate-800/80 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-sky-400/90">
              Kalshi · Crypto terminals
            </p>
            <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Intraday crypto markets
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              Live odds from Kalshi&apos;s public Trade API — 15-minute directional contracts vs hourly
              range liquidity. Polled every 30 seconds with graceful handling for rate limits.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => void loadAll({ silent: true })}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 ring-1 ring-slate-700 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`size-4 ${refreshing || loading ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Refresh
            </button>
            <p className="font-mono text-[11px] text-slate-500">
              {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : '—'}
            </p>
            <p className="max-w-xs text-right font-mono text-[10px] leading-snug text-slate-600">
              Dev uses Vite proxy at <span className="text-slate-500">/kalshi-api</span>. Override with{' '}
              <span className="text-slate-500">VITE_KALSHI_API_BASE</span> if needed.
            </p>
          </div>
        </header>

        {error ? (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-rose-500/35 bg-rose-950/40 px-4 py-3 text-sm text-rose-100 ring-1 ring-rose-500/20"
          >
            <p className="font-semibold">Could not refresh markets</p>
            <p className="mt-1 text-rose-200/80">{error}</p>
          </div>
        ) : null}

        <section className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {KALSHI_CRYPTO_ASSETS.map((asset) => (
            <AssetCard
              key={asset.symbol}
              asset={asset}
              snapshot={bySymbol[asset.symbol]}
              busy={loading && !bySymbol[asset.symbol]}
            />
          ))}
        </section>
      </div>
    </div>
  )
}
