import type { FrequencyQuote } from '../engine/types'

/** Config entry for one tracked symbol — no hardcoded asset list in UI. */
export interface TickerTrackingConfig {
  symbol: string
  label?: string
}

export type HorizonTierId = 'short' | 'long'

export type AlignmentStatus = 'aligned' | 'divergent' | 'neutral' | 'unknown'

export type PriceVsStrike = 'above' | 'below' | 'at'

export interface BotExposureSlice {
  envId: string
  envLabel: string
  side: 'yes' | 'no'
  contracts: number
  entryPrice: number
  /** Mark-to-market PnL vs 15m YES mid (paper engine convention). */
  unrealizedUsd: number
}

/** One horizon block (15m short-interval or hourly long-interval). */
export interface ContractHorizonBlock {
  tier: HorizonTierId
  tierLabel: string
  ticker: string | null
  quote: FrequencyQuote | null
  /** YES implied probability 0–100 for display. */
  yesMidPct: number | null
  strikeLabel: string | null
  priceVsStrike: PriceVsStrike | null
  closeIso: string | null
  /** Assumed window length for progress bar (ms). */
  windowMs: number
  exposure: BotExposureSlice[]
}

export interface TickerHorizonRow {
  config: TickerTrackingConfig
  short: ContractHorizonBlock
  long: ContractHorizonBlock
  alignment: AlignmentStatus
  alignmentDetail: string
}

export interface HorizonMatrixState {
  rows: TickerHorizonRow[]
  refreshedAt: number | null
  alignmentSensitivity: number
}

/** Default short / long window lengths for progress visualization. */
export const HORIZON_WINDOW_MS: Record<HorizonTierId, number> = {
  short: 15 * 60 * 1000,
  long: 60 * 60 * 1000,
}

export const HORIZON_TIER_LABEL: Record<HorizonTierId, string> = {
  short: '15m',
  long: '1h',
}
