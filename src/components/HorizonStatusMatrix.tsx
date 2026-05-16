import { memo, useMemo } from 'react'
import { useClockTick } from '../hooks/useClockTick'
import { useKalshiMarketExplorer } from '../hooks/useKalshiMarketExplorer'
import { useTradingEngine } from '../hooks/useTradingEngine'
import { buildHorizonMatrix } from '../lib/buildHorizonMatrix'
import type {
  AlignmentStatus,
  ContractHorizonBlock,
  HorizonTierId,
  TickerHorizonRow,
} from '../lib/horizonMatrixTypes'
import { CRYPTO_SIGNAL_SYMBOLS } from '../engine/types'

const TICKER_CONFIGS = CRYPTO_SIGNAL_SYMBOLS.map((symbol) => ({ symbol }))

function fmtCountdown(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function resolveProgress(closeIso: string | null, windowMs: number, now: number): number {
  const end = closeIso ? Date.parse(closeIso) : NaN
  if (!Number.isFinite(end)) return 0
  const start = end - windowMs
  const span = end - start
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (end - now) / span))
}

const AlignmentBadge = memo(function AlignmentBadge({
  status,
  detail,
}: {
  status: AlignmentStatus
  detail: string
}) {
  const styles: Record<AlignmentStatus, string> = {
    aligned:
      'border-emerald-500/40 bg-emerald-500/12 text-emerald-200 ring-emerald-500/25',
    divergent: 'border-rose-500/40 bg-rose-500/12 text-rose-200 ring-rose-500/25',
    neutral: 'border-slate-600/50 bg-slate-800/60 text-slate-300 ring-slate-600/30',
    unknown: 'border-amber-500/35 bg-amber-950/30 text-amber-200/90 ring-amber-500/20',
  }
  const label =
    status === 'aligned'
      ? 'Aligned'
      : status === 'divergent'
        ? 'Divergent'
        : status === 'neutral'
          ? 'Neutral'
          : '—'

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ring-1 ${styles[status]}`}
      title={detail}
    >
      {label}
    </span>
  )
})

const ExposureStrip = memo(function ExposureStrip({
  exposure,
}: {
  exposure: ContractHorizonBlock['exposure']
}) {
  if (!exposure.length) {
    return <span className="font-mono text-[10px] text-slate-600">Flat</span>
  }
  return (
    <div className="flex flex-col gap-0.5">
      {exposure.map((e) => (
        <span
          key={`${e.envId}-${e.side}`}
          className="truncate font-mono text-[10px] text-slate-400"
          title={`${e.envLabel} · entry ${(e.entryPrice * 100).toFixed(1)}¢`}
        >
          <span className={e.side === 'yes' ? 'text-emerald-400' : 'text-rose-400'}>
            {e.contracts} {e.side.toUpperCase()}
          </span>
          <span className="text-slate-600"> · </span>
          <span className={e.unrealizedUsd >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'}>
            {e.unrealizedUsd >= 0 ? '+' : ''}
            {e.unrealizedUsd.toFixed(0)}
          </span>
        </span>
      ))}
    </div>
  )
})

const HorizonCountdownBar = memo(
  function HorizonCountdownBar({
    closeIso,
    windowMs,
    tier,
  }: {
    closeIso: string | null
    windowMs: number
    tier: HorizonTierId
  }) {
    const now = useClockTick(1000)
    const remaining = closeIso ? Math.max(0, Date.parse(closeIso) - now) : 0
    const progress = resolveProgress(closeIso, windowMs, now)

    return (
      <div className="mt-2 space-y-1" data-horizon-tier={tier}>
        <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-slate-500">
          <span>Closes</span>
          <span className="tabular-nums text-amber-200/90">
            {closeIso ? fmtCountdown(remaining) : '—'}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600/80 to-emerald-400/70 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.closeIso === next.closeIso &&
    prev.windowMs === next.windowMs &&
    prev.tier === next.tier,
)

const ContractCell = memo(
  function ContractCell({ block }: { block: ContractHorizonBlock }) {
    const vs =
      block.priceVsStrike === 'above'
        ? 'text-emerald-400'
        : block.priceVsStrike === 'below'
          ? 'text-rose-400'
          : 'text-slate-500'

    return (
      <div className="min-h-[7.5rem] rounded-lg border border-slate-800/90 bg-slate-950/50 p-2.5 ring-1 ring-white/[0.02]">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {block.tierLabel}
          </span>
          {block.yesMidPct !== null ? (
            <span className="font-mono text-sm font-semibold tabular-nums text-emerald-300">
              {block.yesMidPct.toFixed(1)}%
            </span>
          ) : (
            <span className="font-mono text-sm text-slate-600">—</span>
          )}
        </div>

        {block.strikeLabel ? (
          <p className="mt-1 truncate font-mono text-[10px] text-slate-500" title={block.strikeLabel}>
            {block.strikeLabel}
          </p>
        ) : null}

        <p className={`mt-0.5 font-mono text-[10px] ${vs}`}>
          {block.priceVsStrike
            ? `vs strike · ${block.priceVsStrike}`
            : block.ticker
              ? 'strike n/a'
              : 'no contract'}
        </p>

        <HorizonCountdownBar
          closeIso={block.closeIso}
          windowMs={block.windowMs}
          tier={block.tier}
        />

        <div className="mt-2 border-t border-slate-800/80 pt-2">
          <p className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-600">
            Exposure
          </p>
          <ExposureStrip exposure={block.exposure} />
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.block.ticker === next.block.ticker &&
    prev.block.yesMidPct === next.block.yesMidPct &&
    prev.block.closeIso === next.block.closeIso &&
    prev.block.strikeLabel === next.block.strikeLabel &&
    prev.block.priceVsStrike === next.block.priceVsStrike &&
    prev.block.exposure.length === next.block.exposure.length &&
    prev.block.exposure.every(
      (e, i) =>
        e.contracts === next.block.exposure[i]?.contracts &&
        e.unrealizedUsd === next.block.exposure[i]?.unrealizedUsd,
    ),
)

const MatrixRow = memo(
  function MatrixRow({ row }: { row: TickerHorizonRow }) {
    const label = row.config.label ?? row.config.symbol
    return (
      <tr className="border-b border-slate-900/80 hover:bg-slate-900/25">
        <th
          scope="row"
          className="sticky left-0 z-[1] bg-slate-950/95 px-3 py-3 text-left font-mono text-xs font-semibold text-slate-200 backdrop-blur-sm"
        >
          {label}
        </th>
        <td className="px-2 py-2 align-top">
          <ContractCell block={row.short} />
        </td>
        <td className="px-2 py-2 align-top">
          <ContractCell block={row.long} />
        </td>
        <td className="px-3 py-2 align-top">
          <AlignmentBadge status={row.alignment} detail={row.alignmentDetail} />
          <p className="mt-2 max-w-[11rem] font-mono text-[9px] leading-snug text-slate-600">
            {row.alignmentDetail}
          </p>
        </td>
      </tr>
    )
  },
  (prev, next) =>
    prev.row.config.symbol === next.row.config.symbol &&
    prev.row.alignment === next.row.alignment &&
    prev.row.short.closeIso === next.row.short.closeIso &&
    prev.row.long.closeIso === next.row.long.closeIso &&
    prev.row.short.yesMidPct === next.row.short.yesMidPct &&
    prev.row.long.yesMidPct === next.row.long.yesMidPct,
)

export const HorizonStatusMatrix = memo(function HorizonStatusMatrix() {
  const { rows, refreshedAt, loading } = useKalshiMarketExplorer()
  const { state } = useTradingEngine()

  const matrix = useMemo(
    () =>
      buildHorizonMatrix({
        tickerConfigs: TICKER_CONFIGS,
        explorerRows: rows,
        snapshot: state.marketSnapshot,
        environments: Object.values(state.environments),
        refreshedAt,
        strategyParams: state.environments.live?.strategyParams,
      }),
    [rows, refreshedAt, state.marketSnapshot, state.environments],
  )

  return (
    <section
      className="mt-10 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 ring-1 ring-white/[0.03] sm:p-5"
      aria-label="Multi-horizon contract status matrix"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Horizon matrix
          </h2>
          <p className="mt-1 font-mono text-[11px] text-slate-500">
            Short 15m vs long 1h · alignment · countdown · live exposure
          </p>
        </div>
        <p className="font-mono text-[10px] text-slate-600">
          {loading ? 'Updating…' : refreshedAt ? `Snap ${new Date(refreshedAt).toLocaleTimeString()}` : '—'}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse font-mono text-left">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
              <th className="sticky left-0 z-[2] bg-slate-900/95 px-3 py-2 backdrop-blur-sm">
                Ticker
              </th>
              <th className="px-2 py-2">Short interval</th>
              <th className="px-2 py-2">Long interval</th>
              <th className="px-3 py-2">Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <MatrixRow key={row.config.symbol} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
})
