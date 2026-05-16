import type { CryptoExplorerRow } from './cryptoExplorer'
import { deriveSignalFromExplorer } from './cryptoExplorer'
import {
  formatStrikeHint,
  priceBiasRelativeToStrike,
  type KalshiMarket,
} from './kalshi'
import type {
  AlignmentStatus,
  BotExposureSlice,
  ContractHorizonBlock,
  HorizonMatrixState,
  HorizonTierId,
  PriceVsStrike,
  TickerHorizonRow,
  TickerTrackingConfig,
} from './horizonMatrixTypes'
import { HORIZON_TIER_LABEL, HORIZON_WINDOW_MS } from './horizonMatrixTypes'
import type {
  CryptoSignalSymbol,
  EnvironmentState,
  FrequencyQuote,
  MarketSnapshot,
  StrategyParameters,
} from '../engine/types'

function markYesNo(side: 'yes' | 'no', yesMid: number): number {
  return side === 'yes' ? yesMid : 1 - yesMid
}

function toYesMidPct(yesMid: number | null): number | null {
  if (yesMid === null || !Number.isFinite(yesMid)) return null
  return Math.round(yesMid * 1000) / 10
}

function mapPriceVsStrike(bias: 'up' | 'down' | null, yesMid: number): PriceVsStrike | null {
  if (!bias) return null
  if (Math.abs(yesMid - 0.5) < 0.02) return 'at'
  if (bias === 'up') return 'above'
  return 'below'
}

export function computeAlignmentStatus(
  fifteenYes: number | null,
  hourlyYes: number | null,
  sensitivity: number,
): { status: AlignmentStatus; detail: string } {
  if (fifteenYes === null || hourlyYes === null) {
    return { status: 'unknown', detail: 'Missing quote on one or both horizons' }
  }

  const bullish15 = fifteenYes > 0.5
  const bearish15 = fifteenYes < 0.5
  const bullishH = hourlyYes > 0.5
  const bearishH = hourlyYes < 0.5

  if (Math.abs(fifteenYes - 0.5) < 0.03 && Math.abs(hourlyYes - 0.5) < 0.03) {
    return { status: 'neutral', detail: 'Both horizons near 50¢ — no clear tilt' }
  }

  if ((bullish15 && bullishH) || (bearish15 && bearishH)) {
    const lead = hourlyYes - fifteenYes
    if (bullish15 && lead >= sensitivity) {
      return { status: 'aligned', detail: 'Micro + macro bullish — hourly leads 15m' }
    }
    if (bearish15 && lead <= -sensitivity) {
      return { status: 'aligned', detail: 'Micro + macro bearish — hourly confirms 15m' }
    }
    return { status: 'aligned', detail: 'Same directional tilt on both horizons' }
  }

  return { status: 'divergent', detail: '15m trend opposes hourly macro target' }
}

function collectExposure(
  symbol: string,
  environments: EnvironmentState[],
  snapshot: MarketSnapshot,
): BotExposureSlice[] {
  const sym = symbol as CryptoSignalSymbol
  const q = snapshot[sym]?.fifteen
  const yesMid = q?.yesMid ?? null
  const out: BotExposureSlice[] = []

  for (const env of environments) {
    for (const p of env.positions) {
      if (p.underlying !== sym) continue
      const unrealized =
        yesMid !== null ? p.contracts * (markYesNo(p.side, yesMid) - p.entryPrice) : 0
      out.push({
        envId: env.id,
        envLabel: env.label,
        side: p.side,
        contracts: p.contracts,
        entryPrice: p.entryPrice,
        unrealizedUsd: unrealized,
      })
    }
  }
  return out
}

function blockFromMarket(
  tier: HorizonTierId,
  market: KalshiMarket | null,
  quote: FrequencyQuote | null,
  exposure: BotExposureSlice[],
): ContractHorizonBlock {
  const yesMid = quote?.yesMid ?? null
  const bias = market && yesMid !== null ? priceBiasRelativeToStrike(market, yesMid) : null

  return {
    tier,
    tierLabel: HORIZON_TIER_LABEL[tier],
    ticker: market?.ticker ?? null,
    quote,
    yesMidPct: toYesMidPct(yesMid),
    strikeLabel: market ? formatStrikeHint(market) : null,
    priceVsStrike: yesMid !== null ? mapPriceVsStrike(bias, yesMid) : null,
    closeIso: quote?.close_time ?? market?.close_time ?? null,
    windowMs: HORIZON_WINDOW_MS[tier],
    exposure,
  }
}

function emptyBlock(tier: HorizonTierId, exposure: BotExposureSlice[]): ContractHorizonBlock {
  return {
    tier,
    tierLabel: HORIZON_TIER_LABEL[tier],
    ticker: null,
    quote: null,
    yesMidPct: null,
    strikeLabel: null,
    priceVsStrike: null,
    closeIso: null,
    windowMs: HORIZON_WINDOW_MS[tier],
    exposure,
  }
}

export function buildHorizonMatrix(input: {
  tickerConfigs: TickerTrackingConfig[]
  explorerRows: CryptoExplorerRow[]
  snapshot: MarketSnapshot
  environments: EnvironmentState[]
  refreshedAt: number | null
  strategyParams?: StrategyParameters
}): HorizonMatrixState {
  const sensitivity = input.strategyParams?.alignmentSensitivity ?? 0.05
  const rows: TickerHorizonRow[] = []

  for (const config of input.tickerConfigs) {
    const sym = config.symbol as CryptoSignalSymbol
    const snap = input.snapshot[sym] ?? { fifteen: null, hourly: null }
    const exposure = collectExposure(config.symbol, input.environments, input.snapshot)

    const m15 = input.explorerRows.find((r) => r.assetSymbol === config.symbol && r.bucket === '15m')
    const mh = input.explorerRows.find((r) => r.assetSymbol === config.symbol && r.bucket === 'hourly')

    const derived = deriveSignalFromExplorer(input.explorerRows, sym)
    const fifteenYes = snap.fifteen?.yesMid ?? derived.fifteen?.yesMid ?? null
    const hourlyYes = snap.hourly?.yesMid ?? derived.hourly?.yesMid ?? null

    const { status, detail } = computeAlignmentStatus(fifteenYes, hourlyYes, sensitivity)

    rows.push({
      config,
      short: m15
        ? blockFromMarket('short', m15.market, snap.fifteen ?? derived.fifteen, exposure)
        : emptyBlock('short', exposure),
      long: mh
        ? blockFromMarket('long', mh.market, snap.hourly ?? derived.hourly, exposure)
        : emptyBlock('long', exposure),
      alignment: status,
      alignmentDetail: detail,
    })
  }

  return {
    rows,
    refreshedAt: input.refreshedAt,
    alignmentSensitivity: sensitivity,
  }
}
