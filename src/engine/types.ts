export type EnvId = 'live' | 'lab1' | 'lab2' | 'lab3' | 'lab4' | 'lab5'

export const LAB_IDS: EnvId[] = ['lab1', 'lab2', 'lab3', 'lab4', 'lab5']

/** Assets tracked for Kalshi crypto simulation & snapshot. */
export const CRYPTO_SIGNAL_SYMBOLS = [
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'DOGE',
  'BNB',
  'HYPE',
] as const

export type CryptoSignalSymbol = (typeof CRYPTO_SIGNAL_SYMBOLS)[number]

export interface StrategyParameters {
  /** Fractional stop-loss, e.g. 0.02 = 2% adverse move vs entry. */
  stopLossPct: number
  /**
   * How much the hourly YES probability must lead the 15m YES probability
   * for an aligned signal (same directional tilt).
   */
  alignmentSensitivity: number
}

/** Live quote for one frequency bucket (15m or hourly window). */
export interface FrequencyQuote {
  yesMid: number
  noMid: number
  volume: number
  close_time: string
}

export interface AssetMarketSnapshot {
  fifteen: FrequencyQuote | null
  hourly: FrequencyQuote | null
}

export type MarketSnapshot = Record<CryptoSignalSymbol, AssetMarketSnapshot>

export interface Position {
  id: string
  ticker: string
  /** Which asset’s 15m book we mark against for unrealized PnL / stops. */
  underlying: CryptoSignalSymbol
  side: 'yes' | 'no'
  contracts: number
  /** Execution price in 0–1 YES probability units (NO stored as NO price). */
  entryPrice: number
  entryFee: number
  openedAt: number
}

export interface Trade {
  id: string
  timestamp: number
  envId: EnvId
  kind: 'buy' | 'sell' | 'stop_loss'
  ticker: string
  side: 'yes' | 'no'
  contracts: number
  price: number
  fee: number
}

export interface EnvironmentState {
  id: EnvId
  label: string
  mode: 'live' | 'lab'
  balance: number
  positions: Position[]
  tradeHistory: Trade[]
  strategyParams: StrategyParameters
  peakBalance: number
  maxDrawdownPct: number
  totalFeesPaid: number
  wins: number
  losses: number
}

export interface GlobalSettings {
  paperTradingEnabled: boolean
  enableLiveTrading: boolean
  /** When false, labs skip all trade/stop logic on ENGINE_TICK (snapshot still updates). */
  isTradingActive: boolean
  initialBalance: number
  /** Placeholders — wire to secure storage / backend in production. */
  liveApiKeyId: string
  liveApiPrivateKeyPem: string
}

export interface ActivityEntry {
  id: string
  timestamp: number
  message: string
}

export interface TradingEngineState {
  globalSettings: GlobalSettings
  environments: Record<EnvId, EnvironmentState>
  /** Full cross-asset ladder used by labs & UI; cash balance never derived from this. */
  marketSnapshot: MarketSnapshot
  activityLog: ActivityEntry[]
}
