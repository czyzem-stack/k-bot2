import { FlaskConical, Radio, RotateCcw, Settings, Skull, Zap } from 'lucide-react'
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
import { buildRadarData } from '../engine/radarMetrics'
import type { EnvId, EnvironmentState, MarketSnapshot } from '../engine/types'
import { LAB_IDS } from '../engine/types'
import {
  getEnvRuntimeStatus,
  LAB_PRESETS,
  netWorth,
  openPnL,
  totalTradeCount,
} from '../engine/tradingReducer'

const ENV_GRID_ORDER: EnvId[] = ['live', ...LAB_IDS]

const LAB_COLORS = ['#34d399', '#a78bfa', '#fbbf24', '#22d3ee', '#fb7185']

function fmtUsd(n: number): string {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
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
            {env.mode === 'live' ? 'Production lane' : 'Simulation'}
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
        SL {(env.strategyParams.stopLossPct * 100).toFixed(1)}% · Hourly lead Δ{' '}
        {(env.strategyParams.alignmentSensitivity * 100).toFixed(1)} pts
      </footer>
    </article>
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
  const [draftKeyId, setDraftKeyId] = useState(gs.liveApiKeyId)
  const [draftPem, setDraftPem] = useState(gs.liveApiPrivateKeyPem)

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      setDraftBalance(String(gs.initialBalance))
      setDraftKeyId(gs.liveApiKeyId)
      setDraftPem(gs.liveApiPrivateKeyPem)
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, gs.initialBalance, gs.liveApiKeyId, gs.liveApiPrivateKeyPem])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl shadow-black/60 ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="settings-title" className="font-mono text-lg font-semibold text-white">
              Global settings
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500">
              Live credentials are placeholders — never commit real secrets.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-2 py-1 font-mono text-xs text-slate-300 hover:bg-slate-900"
          >
            Esc
          </button>
        </div>

        <div className="mt-6 space-y-5 font-mono text-xs">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3">
            <span className="text-slate-200">Enable live trading</span>
            <input
              type="checkbox"
              checked={gs.enableLiveTrading}
              onChange={(e) => updateSettings({ enableLiveTrading: e.target.checked })}
              className="size-4 accent-emerald-500"
            />
          </label>

          <div>
            <label htmlFor="initial-bal" className="text-slate-400">
              Initial balance (labs reset target)
            </label>
            <input
              id="initial-bal"
              type="number"
              min={100}
              step={100}
              value={draftBalance}
              onChange={(e) => setDraftBalance(e.target.value)}
              onBlur={() => {
                const n = Number(draftBalance)
                if (Number.isFinite(n) && n >= 0) updateSettings({ initialBalance: n })
              }}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-emerald-500/30 focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="api-id" className="text-slate-400">
              Live API key ID (placeholder)
            </label>
            <input
              id="api-id"
              value={draftKeyId}
              onChange={(e) => setDraftKeyId(e.target.value)}
              onBlur={() => updateSettings({ liveApiKeyId: draftKeyId })}
              placeholder="kalshi_key_…"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div>
            <label htmlFor="api-pem" className="text-slate-400">
              Private key PEM (placeholder)
            </label>
            <textarea
              id="api-pem"
              rows={4}
              value={draftPem}
              onChange={(e) => setDraftPem(e.target.value)}
              onBlur={() => updateSettings({ liveApiPrivateKeyPem: draftPem })}
              placeholder={'-----BEGIN PRIVATE KEY-----'}
              className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Hard reset entire trading engine to factory defaults? This clears all labs, live ledger state, and logs.',
                )
              ) {
                hardReset()
                onClose()
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-3 text-sm font-semibold text-rose-100 hover:bg-rose-950/70"
          >
            <Skull className="size-4" aria-hidden />
            Hard reset engine
          </button>
        </div>
      </div>
    </div>
  )
}

function ActivityTicker() {
  const { state } = useTradingEngine()
  const items = state.activityLog

  const text = useMemo(() => {
    if (!items.length)
      return 'Awaiting paper-trading events · Labs idle until alignment + hourly lead · '
    return items.map((a) => `${new Date(a.timestamp).toLocaleTimeString()} · ${a.message}`).join(' · ')
  }, [items])

  return (
    <div className="border-t border-slate-800 bg-slate-950/90">
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

export function MultiAgentTradingDashboard() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { state, updateSettings, resetAllLabs } = useTradingEngine()
  const fifteen = state.marketSnapshot.BTC.fifteen?.yesMid ?? 0.5
  const hourly = state.marketSnapshot.BTC.hourly?.yesMid ?? 0.5

  const radarData = useMemo(() => buildRadarData(state), [state])

  return (
    <div className="flex min-h-screen flex-col bg-[#020617] text-slate-200">
      <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
              <Zap className="size-5 text-emerald-400" aria-hidden />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-emerald-400/90">
                Kalshi · Multi-agent
              </p>
              <h1 className="font-mono text-lg font-semibold tracking-tight text-white sm:text-xl">
                Crypto trading terminal
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 font-mono text-[11px] text-slate-200 hover:border-slate-600">
              <FlaskConical className="size-4 text-sky-400" aria-hidden />
              Paper trading
              <input
                type="checkbox"
                checked={state.globalSettings.paperTradingEnabled}
                onChange={(e) => updateSettings({ paperTradingEnabled: e.target.checked })}
                className="size-4 accent-emerald-500"
              />
            </label>

            <button
              type="button"
              onClick={() => resetAllLabs()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 font-mono text-[11px] text-slate-200 hover:border-slate-600"
            >
              <RotateCcw className="size-4 text-slate-400" aria-hidden />
              Reset labs
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 font-mono text-[11px] text-slate-200 hover:border-slate-600"
              aria-label="Open settings"
            >
              <Settings className="size-4 text-slate-300" />
              Settings
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-wrap gap-4 border-t border-slate-900 px-4 py-3 font-mono text-[11px] text-slate-500 sm:px-6">
          <span>
            BTC 15m mid{' '}
            <span className="text-slate-200">{(fifteen * 100).toFixed(1)}¢</span>
          </span>
          <span className="text-slate-700">|</span>
          <span>
            BTC 1h mid{' '}
            <span className="text-slate-200">{(hourly * 100).toFixed(1)}¢</span>
          </span>
          <span className="text-slate-700">|</span>
          <span>
            Fee model{' '}
            <span className="text-slate-400">
              ceil(0.07 · contracts · p · (1−p))
            </span>
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6">
        <section>
          <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Environments
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ENV_GRID_ORDER.map((id) => (
              <EnvCard
                key={id}
                env={state.environments[id]}
                snapshot={state.marketSnapshot}
                paperOn={state.globalSettings.paperTradingEnabled}
              />
            ))}
          </div>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-slate-600">
            Labs vary stop-loss ({LAB_PRESETS.map((l) => `${(l.params.stopLossPct * 100).toFixed(0)}%`).join(', ')}) and hourly-lead sensitivity. Buys use ≤3% of balance; exits fire on stop-loss vs mid marks.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 ring-1 ring-white/[0.03] sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
                Strategy comparison
              </h2>
              <p className="mt-2 font-mono text-sm text-slate-400">
                Radar axes: profitability, win rate, drawdown risk score, trade frequency, fee efficiency.
              </p>
            </div>
          </div>

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
      </main>

      <ActivityTicker />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
