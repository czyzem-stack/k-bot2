import { memo, useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Customized,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useCryptoCandles } from '../hooks/useCryptoCandles'
import {
  CANDLE_TIMEFRAMES,
  type CandleTimeframeId,
  type OhlcCandle,
} from '../lib/cryptoCandles'
import { CRYPTO_SIGNAL_SYMBOLS } from '../engine/types'

const HDR_BTN =
  'inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/90 bg-slate-900/80 px-3 font-mono text-[11px] font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800'
const HDR_BTN_ON =
  'border-emerald-500/40 bg-emerald-500/10 text-emerald-50 ring-1 ring-emerald-500/25'

function formatPrice(v: number, symbol: string): string {
  if (symbol === 'DOGE' || symbol === 'XRP') return v < 10 ? v.toFixed(4) : v.toFixed(2)
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (v >= 1) return v.toFixed(2)
  return v.toFixed(4)
}

function OhlcTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload?: OhlcCandle }[]
}) {
  if (!active || !payload?.length) return null
  const c = payload[0]?.payload
  if (!c) return null
  const up = c.close >= c.open
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 font-mono text-[10px] shadow-xl ring-1 ring-white/10">
      <p className="text-slate-400">{new Date(c.ts).toLocaleString()}</p>
      <p className="mt-1 text-slate-300">
        O {c.open.toFixed(2)} · H {c.high.toFixed(2)} · L {c.low.toFixed(2)} ·{' '}
        <span className={up ? 'text-emerald-400' : 'text-rose-400'}>C {c.close.toFixed(2)}</span>
      </p>
      <p className="mt-0.5 text-slate-500">Vol {c.volume.toLocaleString()}</p>
    </div>
  )
}

type AxisMapEntry = {
  scale: (v: number) => number
  bandwidth?: () => number
}

type CandleLayerProps = {
  xAxisMap?: Record<string, AxisMapEntry>
  yAxisMap?: Record<string, AxisMapEntry>
  offset?: { left: number; top: number; width: number; height: number }
  data?: OhlcCandle[]
}

function CandlestickLayer({ xAxisMap, yAxisMap, offset, data }: CandleLayerProps) {
  if (!data?.length || !offset || !xAxisMap || !yAxisMap) return null

  const xAxis = xAxisMap[Object.keys(xAxisMap)[0]!]
  const yAxis = yAxisMap[Object.keys(yAxisMap)[0]!]
  if (!xAxis?.scale || !yAxis?.scale) return null

  const step =
    data.length > 1
      ? Math.abs(xAxis.scale(data[data.length - 1]!.ts) - xAxis.scale(data[0]!.ts)) /
        (data.length - 1)
      : 12
  const bodyW = Math.max(2, step * 0.72)

  return (
    <g className="recharts-candlesticks">
      {data.map((c) => {
        const cx = xAxis.scale(c.ts) + offset.left
        const yHigh = yAxis.scale(c.high) + offset.top
        const yLow = yAxis.scale(c.low) + offset.top
        const yOpen = yAxis.scale(c.open) + offset.top
        const yClose = yAxis.scale(c.close) + offset.top
        const up = c.close >= c.open
        const color = up ? '#34d399' : '#fb7185'
        const bodyTop = Math.min(yOpen, yClose)
        const bodyH = Math.max(1, Math.abs(yClose - yOpen))
        return (
          <g key={c.ts}>
            <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
            <rect
              x={cx - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={color}
              stroke={color}
              strokeWidth={0.5}
            />
          </g>
        )
      })}
    </g>
  )
}

const CandleChart = memo(function CandleChart({
  candles,
  symbol,
}: {
  candles: OhlcCandle[]
  symbol: string
}) {
  const domain = useMemo(() => {
    if (!candles.length) return [0, 1] as [number, number]
    let min = Infinity
    let max = -Infinity
    for (const c of candles) {
      min = Math.min(min, c.low)
      max = Math.max(max, c.high)
    }
    const pad = (max - min) * 0.06 || max * 0.01
    return [min - pad, max + pad] as [number, number]
  }, [candles])

  if (!candles.length) {
    return (
      <div className="flex h-[320px] items-center justify-center font-mono text-xs text-slate-500">
        No candle data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={candles} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(ts) => {
            const row = candles.find((c) => c.ts === ts)
            return row?.label ?? ''
          }}
          stroke="#475569"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          minTickGap={40}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={domain}
          stroke="#475569"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickFormatter={(v) => formatPrice(Number(v), symbol)}
          width={72}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<OhlcTooltip />} />
        <Line
          type="monotone"
          dataKey="close"
          stroke="transparent"
          dot={false}
          activeDot={{ r: 3, fill: '#94a3b8' }}
          isAnimationActive={false}
        />
        <Customized component={CandlestickLayer} />
      </ComposedChart>
    </ResponsiveContainer>
  )
})

export const AssetCandleChartPanel = memo(function AssetCandleChartPanel() {
  const assetConfigs = useMemo(
    () => CRYPTO_SIGNAL_SYMBOLS.map((symbol) => ({ symbol })),
    [],
  )
  const [symbol, setSymbol] = useState<string>(CRYPTO_SIGNAL_SYMBOLS[0])
  const [timeframe, setTimeframe] = useState<CandleTimeframeId>('intraday')

  const { candles, loading, fetching, error, config, refresh } = useCryptoCandles(
    symbol,
    timeframe,
  )

  const last = candles[candles.length - 1]
  const changePct =
    last && candles[0]
      ? ((last.close - candles[0].open) / candles[0].open) * 100
      : null

  return (
    <section
      className="mt-10 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 ring-1 ring-white/[0.03] sm:p-5"
      aria-label="Asset candlestick chart"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Spot candles
          </h2>
          <p className="mt-1 font-mono text-[11px] text-slate-500">
            {config?.krakenPair ?? '—'} · Kraken spot reference (not Kalshi contract prices)
          </p>
        </div>
        {last ? (
          <p className="font-mono text-[11px] text-slate-400">
            Last{' '}
            <span className="text-slate-200">{formatPrice(last.close, symbol)}</span>
            {changePct !== null ? (
              <span className={changePct >= 0 ? ' text-emerald-400' : ' text-rose-400'}>
                {' '}
                {changePct >= 0 ? '+' : ''}
                {changePct.toFixed(2)}%
              </span>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Chart asset">
        {assetConfigs.map((a) => (
          <button
            key={a.symbol}
            type="button"
            role="tab"
            aria-selected={symbol === a.symbol}
            onClick={() => setSymbol(a.symbol)}
            className={`${HDR_BTN} ${symbol === a.symbol ? HDR_BTN_ON : ''}`}
          >
            {a.symbol}
          </button>
        ))}
      </div>

      <div
        className="mb-4 flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Chart timeframe"
      >
        {CANDLE_TIMEFRAMES.map((tf) => (
          <button
            key={tf.id}
            type="button"
            role="tab"
            aria-selected={timeframe === tf.id}
            onClick={() => setTimeframe(tf.id)}
            className={`${HDR_BTN} ${timeframe === tf.id ? HDR_BTN_ON : ''}`}
          >
            {tf.label}
          </button>
        ))}
        <button type="button" onClick={refresh} className={`${HDR_BTN} ml-auto`}>
          Refresh
        </button>
      </div>

      <div className="relative rounded-xl border border-slate-800/90 bg-slate-950/60 p-2">
        {loading && candles.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center font-mono text-xs text-slate-500">
            Loading candles…
          </div>
        ) : error && candles.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center px-4 text-center font-mono text-xs text-amber-200/90">
            {error}
          </div>
        ) : (
          <>
            <CandleChart candles={candles} symbol={symbol} />
            {fetching ? (
              <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-slate-700/80 bg-slate-950/90 px-2 py-1 font-mono text-[10px] text-slate-400">
                Updating…
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
})
