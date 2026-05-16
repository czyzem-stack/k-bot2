import {
  Activity,
  FlaskConical,
  Layers,
  LineChart,
  Radio,
  RefreshCw,
  RotateCcw,
  Settings,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useTradingEngine } from '../hooks/useTradingEngine'
import { useKalshiMarketExplorer } from '../hooks/useKalshiMarketExplorer'
import { buildRadarData } from '../engine/radarMetrics'
import type { EnvId, EnvironmentState, MarketSnapshot } from '../engine/types'
import { CRYPTO_SIGNAL_SYMBOLS, LAB_IDS } from '../engine/types'
import {
  getEnvRuntimeStatus,
  LAB_PRESETS,
  netWorth,
  openPnL,
  totalTradeCount,
} from '../engine/tradingReducer'
import {
  categorizeKalshiCryptoMarket,
  type CryptoExplorerBucket,
  type CryptoExplorerRow,
} from '../lib/cryptoExplorer'
import {
  formatBidAskCents,
  parseUsdProbability,
  parseVolume,
  yesMidProbability,
  noMidProbability,
} from '../lib/kalshi'

type TabId = 'live' | 'labs'

const ENV_GRID_ORDER: EnvId[] = ['live', ...LAB_IDS]

const LAB_COLORS = ['#34d399', '#a78bfa', '#fbbf24', '#22d3ee', '#fb7185']

function fmtUsd(n: number): string {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function useClockTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function CloseCountdown({ closeIso }: { closeIso: string }) {
  const now = useClockTick(1000)
  const end = Date.parse(closeIso)
  if (!Number.isFinite(end)) return <span className="text-slate-600">—</span>
  const ms = Math.max(0, end - now)
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  const label = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
  return <span className="tabular-nums text-amber-200">{label}</span>
}

function LiveMarketsPanel({
  bucket,
  setBucket,
}: {
  bucket: CryptoExplorerBucket
  setBucket: (b: CryptoExplorerBucket) => void
}) {
  const { rows, loading, error, refreshedAt, refreshMarkets } = useKalshiMarketExplorer()

  const filtered = useMemo(() => {
    const list = rows.filter((r) => r.bucket === bucket)
    list.sort((a, b) => Date.parse(a.market.close_time) - Date.parse(b.market.close_time))
    return list
  }, [rows, bucket])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-slate-900/90 p-0.5 ring-1 ring-slate-700">
          {(['15m', 'hourly'] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={
                bucket === b
                  ? 'rounded-full bg-sky-500/25 px-4 py-1.5 font-mono text-[11px] font-semibold text-sky-100 ring-1 ring-sky-500/35'
                  : 'rounded-full px-4 py-1.5 font-mono text-[11px] font-medium text-slate-400 hover:text-slate-200'
              }
            >
              {b === '15m' ? '15m' : 'Hourly'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void refreshMarkets()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-[11px] text-slate-200 hover:border-slate-600 disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh markets
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/35 bg-rose-950/35 px-4 py-3 font-mono text-xs text-rose-100"
        >
          {error}
        </div>
      ) : null}

      <p className="font-mono text-[11px] text-slate-500">
        Open contracts only · Last fetch{' '}
        {refreshedAt ? new Date(refreshedAt).toLocaleTimeString() : '—'} · Dev proxy{' '}
        <span className="text-slate-600">/kalshi-api</span>
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 ring-1 ring-white/[0.03]">
        <table className="min-w-[920px] w-full border-collapse font-mono text-left text-[11px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] uppercase tracking-widest text-slate-500">
              <th className="px-3 py-3">Asset</th>
              <th className="px-3 py-3">Ticker</th>
              <th className="px-3 py-3">Bucket</th>
              <th className="px-3 py-3">Yes bid / ask</th>
              <th className="px-3 py-3">Yes mid</th>
              <th className="px-3 py-3">No bid / ask</th>
              <th className="px-3 py-3">No mid</th>
              <th className="px-3 py-3">Volume</th>
              <th className="px-3 py-3">Closes in</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filtered.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  Loading Kalshi markets…
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-600">
                  No open contracts for this bucket.
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => (
              <ExplorerRow
                key={`${row.assetSymbol}-${row.bucket}-${row.market.ticker}`}
                row={row}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExplorerRow({ row }: { row: CryptoExplorerRow }) {
  const m = row.market
  const yesBa = formatBidAskCents(m)
  const noBid = parseUsdProbability(m.no_bid_dollars)
  const noAsk = parseUsdProbability(m.no_ask_dollars)
  const noMid = noMidProbability(m)
  const heuristic = categorizeKalshiCryptoMarket(m)
  const mismatch =
    heuristic !== null && heuristic !== row.bucket ? (
      <span className="text-amber-400/90" title="Heuristic mismatch">
        *
      </span>
    ) : null

  const vol = parseVolume(m)

  return (
    <tr className="border-b border-slate-900/80 hover:bg-slate-900/35">
      <td className="px-3 py-2.5 text-slate-300">{row.assetSymbol}</td>
      <td className="max-w-[220px] truncate px-3 py-2.5 text-cyan-100/95" title={m.ticker}>
        {m.ticker}
      </td>
      <td className="px-3 py-2.5 text-slate-400">
        {row.bucket}
        {mismatch}
      </td>
      <td className="px-3 py-2.5 text-slate-300">
        {yesBa.bid !== null && yesBa.ask !== null
          ? `${yesBa.bid.toFixed(1)}¢ / ${yesBa.ask.toFixed(1)}¢`
          : '—'}
      </td>
      <td className="px-3 py-2.5 text-emerald-300">
        {(yesMidProbability(m) * 100).toFixed(1)}¢
      </td>
      <td className="px-3 py-2.5 text-slate-300">
        {noBid !== null && noAsk !== null
          ? `${(noBid * 100).toFixed(1)}¢ / ${(noAsk * 100).toFixed(1)}¢`
          : '—'}
      </td>
      <td className="px-3 py-2.5 text-rose-300">{(noMid * 100).toFixed(1)}¢</td>
      <td className="px-3 py-2.5 text-slate-400">{vol.toLocaleString()}</td>
      <td className="px-3 py-2.5">
        <CloseCountdown closeIso={m.close_time} />
      </td>
    </tr>
  )
}

function EnvCard({
  env,
  snapshot,
  paperOn,
}: {
  env: EnvironmentState
  snapshot: MarketSnapshot
  paperOn: boolean
}) {
  const status = getEnvRuntimeStatus(env)
  const pnl = openPnL(env, snapshot)
  const nw = netWorth(env, snapshot)
  const trades = totalTradeCount(env)
  const paused = env.mode === 'lab' && !paperOn

  const pnlColor =
    pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-rose-400' : 'text-slate-400'

  return (
    <article className="relative overflow-hidden rounded-xl border border-slate-700/80 bg-gradient-to-b from-slate-900/95 to-slate-950 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.03]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent" />

      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-sm font-semibold tracking-tight text-slate-100">
            {env.label}
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {env.mode === 'live' ? 'Live lane (paper)' : 'Simulation'}
          </p>
        </div>
        <span
          className={
            paused
              ? 'rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/30'
              : status === 'active'
                ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30'
                : 'rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-400 ring-1 ring-slate-700'
          }
        >
          {paused ? 'Paused' : status === 'active' ? 'Active' : 'Idle'}
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-[11px]">
        <div>
          <dt className="text-slate-500">Balance</dt>
          <dd className="mt-0.5 text-slate-100">{fmtUsd(env.balance)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Net worth</dt>
          <dd className="mt-0.5 text-slate-200">{fmtUsd(nw)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Open PnL</dt>
          <dd className={`mt-0.5 font-semibold ${pnlColor}`}>
            {pnl >= 0 ? '+' : ''}
            {fmtUsd(pnl)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Total trades</dt>
          <dd className="mt-0.5 text-slate-200">{trades}</dd>
        </div>
      </dl>

      <footer className="mt-3 border-t border-slate-800/80 pt-3 font-mono text-[10px] leading-relaxed text-slate-500">
        SL {(env.strategyParams.stopLossPct * 100).toFixed(0)}% · Align Δ{' '}
        {(env.strategyParams.alignmentSensitivity * 100).toFixed(1)} pts
      </footer>
    </article>
  )
}

function ActivityTicker() {
  const { state } = useTradingEngine()
  const items = state.activityLog

  const text = useMemo(() => {
    if (!items.length)
      return 'Awaiting fills · Shared Kalshi ladder (7 assets) · 1¢ slip · Fees only on fills ⌈0.07·c·p·(1−p)⌉ · '
    return items.map((a) => `${new Date(a.timestamp).toLocaleTimeString()} · ${a.message}`).join(' · ')
  }, [items])

  return (
    <div className="border-t border-slate-800 bg-slate-950/95">
      <div className="flex items-center gap-2 border-b border-slate-900 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">
        <Radio className="size-3.5 text-emerald-400" aria-hidden />
        Activity
      </div>
      <div className="relative overflow-hidden py-2">
        <div className="animate-kalshi-marquee flex w-max min-w-full whitespace-nowrap font-mono text-[11px] text-slate-300">
          <span className="inline-block pr-20">{text}</span>
          <span className="inline-block pr-20">{text}</span>
        </div>
      </div>
    </div>
  )
}

function TradingLabsPanel() {
  const { state, resetAllLabs } = useTradingEngine()
  const snap = state.marketSnapshot

  const radarData = useMemo(() => buildRadarData(state), [state])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-[10px] text-slate-500">
          <span className="uppercase tracking-widest text-slate-600">Shared mids</span>
          {CRYPTO_SIGNAL_SYMBOLS.map((sym) => {
            const f = snap[sym]?.fifteen
            const h = snap[sym]?.hourly
            return (
              <span key={sym} className="text-slate-400">
                <span className="font-semibold text-slate-300">{sym}</span>{' '}
                <span className="text-emerald-400/90">
                  15m{f ? ` ${(f.yesMid * 100).toFixed(0)}¢` : ' —'}
                </span>
                <span className="text-slate-600"> / </span>
                <span className="text-sky-400/90">
                  1h{h ? ` ${(h.yesMid * 100).toFixed(0)}¢` : ' —'}
                </span>
              </span>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => resetAllLabs()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-[11px] text-slate-200 hover:border-slate-600"
        >
          <RotateCcw className="size-4 text-slate-400" aria-hidden />
          Reset all labs
        </button>
      </div>

      <section>
        <h3 className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
          Environments
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ENV_GRID_ORDER.map((id) => (
            <EnvCard
              key={id}
              env={state.environments[id]}
              snapshot={snap}
              paperOn={state.globalSettings.paperTradingEnabled}
            />
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] leading-relaxed text-slate-600">
          Labs stop-loss ladder:{' '}
          {LAB_PRESETS.map((l) => `${(l.params.stopLossPct * 100).toFixed(0)}%`).join(', ')}.
          Each lab caps orders at 3% of balance with 1¢ simulated slippage; Kalshi taker fees apply only on entry and exit fills.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 ring-1 ring-white/[0.03] sm:p-6">
        <h3 className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
          Strategy radar · labs only
        </h3>
        <div className="mt-6 h-[340px] w-full font-mono">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="52%" outerRadius="72%" data={radarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 9 }}
                stroke="#475569"
              />
              {[1, 2, 3, 4, 5].map((i) => (
                <Radar
                  key={i}
                  name={`Lab ${i}`}
                  dataKey={`lab${i}`}
                  stroke={LAB_COLORS[i - 1]}
                  fill={LAB_COLORS[i - 1]}
                  fillOpacity={0.08}
                  strokeWidth={2}
                />
              ))}
              <Tooltip
                contentStyle={{
                  background: '#020617',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 11,
                }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <ActivityTicker />
    </div>
  )
}

function SettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { state, updateSettings, hardReset } = useTradingEngine()
  const gs = state.globalSettings
  const [draftBalance, setDraftBalance] = useState(String(gs.initialBalance))

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => setDraftBalance(String(gs.initialBalance)), 0)
    return () => window.clearTimeout(t)
  }, [open, gs.initialBalance])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-heading"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-3">
          <h2 id="settings-heading" className="font-mono text-lg font-semibold text-white">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-2 py-1 font-mono text-xs text-slate-300 hover:bg-slate-900"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4 font-mono text-xs">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3">
            <span className="text-slate-200">Enable paper trading</span>
            <input
              type="checkbox"
              checked={gs.paperTradingEnabled}
              onChange={(e) => updateSettings({ paperTradingEnabled: e.target.checked })}
              className="size-4 accent-emerald-500"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3">
            <span className="text-slate-200">Lab trading engine (killswitch)</span>
            <input
              type="checkbox"
              checked={gs.isTradingActive}
              onChange={(e) => updateSettings({ isTradingActive: e.target.checked })}
              className="size-4 accent-emerald-500"
            />
          </label>

          <div>
            <label htmlFor="start-bal" className="text-slate-400">
              Starting balance
            </label>
            <input
              id="start-bal"
              type="number"
              min={100}
              step={100}
              value={draftBalance}
              onChange={(e) => setDraftBalance(e.target.value)}
              onBlur={() => {
                const n = Number(draftBalance)
                if (Number.isFinite(n) && n >= 0) updateSettings({ initialBalance: n })
              }}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Full reset clears persisted labs/live ledgers and restores defaults. Continue?',
                )
              ) {
                hardReset()
                onClose()
              }
            }}
            className="w-full rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-3 text-sm font-semibold text-rose-100 hover:bg-rose-950/70"
          >
            Full reset
          </button>
        </div>
      </div>
    </div>
  )
}

export function KalshiTabbedDashboard() {
  const [tab, setTab] = useState<TabId>('live')
  const [bucket, setBucket] = useState<CryptoExplorerBucket>('15m')
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-[#020617] text-slate-200">
      <header className="sticky top-0 z-50 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
              <LineChart className="size-5 text-emerald-400" aria-hidden />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-emerald-400/90">
                Kalshi crypto
              </p>
              <h1 className="font-mono text-lg font-semibold tracking-tight text-white sm:text-xl">
                Trading dashboard
              </h1>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('live')}
              className={
                tab === 'live'
                  ? 'inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 font-mono text-[11px] font-semibold text-white ring-1 ring-slate-600'
                  : 'inline-flex items-center gap-2 rounded-lg border border-transparent px-4 py-2 font-mono text-[11px] text-slate-400 hover:text-white'
              }
            >
              <Layers className="size-4 text-sky-400" aria-hidden />
              Live markets
            </button>
            <button
              type="button"
              onClick={() => setTab('labs')}
              className={
                tab === 'labs'
                  ? 'inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 font-mono text-[11px] font-semibold text-white ring-1 ring-slate-600'
                  : 'inline-flex items-center gap-2 rounded-lg border border-transparent px-4 py-2 font-mono text-[11px] text-slate-400 hover:text-white'
              }
            >
              <FlaskConical className="size-4 text-violet-400" aria-hidden />
              Trading labs
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="ml-1 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-[11px] text-slate-200 hover:border-slate-600"
              aria-label="Settings"
            >
              <Settings className="size-4" />
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {tab === 'live' ? (
          <LiveMarketsPanel bucket={bucket} setBucket={setBucket} />
        ) : (
          <TradingLabsPanel />
        )}
      </main>

      <footer className="border-t border-slate-900 py-4 text-center font-mono text-[10px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <Activity className="size-3 text-slate-600" aria-hidden />
          Labs consume shared Kalshi snapshots · persisted locally ({`localStorage:${'kalshi-trading-engine-v2'}`})
        </span>
      </footer>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
