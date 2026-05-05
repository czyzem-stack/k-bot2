import { kalshiTakerFee } from './fees'
import type {
  ActivityEntry,
  EnvironmentState,
  EnvId,
  GlobalSettings,
  Position,
  StrategyParameters,
  Trade,
  TradingEngineState,
} from './types'
import { LAB_IDS } from './types'

export type TradingEngineAction =
  | { type: 'ENGINE_TICK'; snapshot: TradingEngineState['marketSnapshot'] }
  | { type: 'UPDATE_GLOBAL_SETTINGS'; patch: Partial<GlobalSettings> }
  | { type: 'RESET_ALL_LABS' }
  | { type: 'HARD_RESET' }

const DISPLAY_TICKER_BASE = 'BTC-15m'

export const LAB_PRESETS: { id: EnvId; label: string; params: StrategyParameters }[] = [
  { id: 'lab1', label: 'Lab 1 · SL 2%', params: { stopLossPct: 0.02, alignmentSensitivity: 0.02 } },
  { id: 'lab2', label: 'Lab 2 · SL 5%', params: { stopLossPct: 0.05, alignmentSensitivity: 0.042 } },
  { id: 'lab3', label: 'Lab 3 · SL 8%', params: { stopLossPct: 0.08, alignmentSensitivity: 0.055 } },
  { id: 'lab4', label: 'Lab 4 · SL 10%', params: { stopLossPct: 0.1, alignmentSensitivity: 0.07 } },
  { id: 'lab5', label: 'Lab 5 · SL 15%', params: { stopLossPct: 0.15, alignmentSensitivity: 0.09 } },
]

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clampProb(x: number): number {
  return Math.min(0.95, Math.max(0.05, x))
}

/** Synthetic BTC mid evolution when Kalshi rows are unavailable (offline / parsing gaps). */
export function evolveMarketSnapshot(
  prev: TradingEngineState['marketSnapshot'],
): TradingEngineState['marketSnapshot'] {
  const { fifteen: f0, hourly: h0 } = prev.BTC
  const noise = () => (Math.random() - 0.5) * 0.04
  const pull = (h0 - f0) * 0.12
  const f = clampProb(f0 + pull + noise())
  const h = clampProb(h0 + noise() * 0.85 + (Math.random() - 0.5) * 0.015)
  return { BTC: { fifteen: f, hourly: h } }
}

function nextPeak(prevPeak: number, balance: number): number {
  return Math.max(prevPeak, balance)
}

function updateDrawdown(peak: number, balance: number, prevMax: number): number {
  if (peak <= 0) return prevMax
  const dd = (peak - balance) / peak
  return Math.max(prevMax, dd)
}

function markPosition(side: 'yes' | 'no', yesMid: number): number {
  return side === 'yes' ? yesMid : 1 - yesMid
}

function unrealizedReturn(pos: Position, yesMid: number): number {
  const mark = markPosition(pos.side, yesMid)
  return (mark - pos.entryPrice) / Math.max(pos.entryPrice, 1e-9)
}

function maxContractsForBudget(budget: number, executionPrice: number): number {
  if (budget <= 0 || executionPrice <= 0 || executionPrice >= 1) return 0
  let c = Math.floor(budget / executionPrice)
  while (c > 0) {
    const gross = c * executionPrice
    const fee = kalshiTakerFee(c, executionPrice)
    if (gross + fee <= budget) return c
    c -= 1
  }
  return 0
}

function alignmentSignal(
  fifteen: number,
  hourly: number,
  sensitivity: number,
): { side: 'yes' | 'no'; executionPrice: number } | null {
  const bullish15 = fifteen > 0.5
  const bearish15 = fifteen < 0.5
  const bullishH = hourly > 0.5
  const bearishH = hourly < 0.5

  if (bullish15 && bullishH && hourly >= fifteen + sensitivity) {
    return { side: 'yes', executionPrice: fifteen }
  }
  if (bearish15 && bearishH && hourly <= fifteen - sensitivity) {
    const noPx = 1 - fifteen
    return { side: 'no', executionPrice: noPx }
  }
  return null
}

function pushActivity(log: ActivityEntry[], message: string): ActivityEntry[] {
  const entry: ActivityEntry = { id: uid('act'), timestamp: Date.now(), message }
  return [entry, ...log].slice(0, 120)
}

export type EnvRuntimeStatus = 'active' | 'idle'

export function getEnvRuntimeStatus(env: EnvironmentState): EnvRuntimeStatus {
  return env.positions.length > 0 ? 'active' : 'idle'
}

export function openPnL(env: EnvironmentState, fifteenYes: number): number {
  return env.positions.reduce((sum, p) => {
    const mark = markPosition(p.side, fifteenYes)
    return sum + p.contracts * (mark - p.entryPrice)
  }, 0)
}

export function netWorth(env: EnvironmentState, fifteenYes: number): number {
  return env.balance + openPnL(env, fifteenYes)
}

export function totalTradeCount(env: EnvironmentState): number {
  return env.tradeHistory.length
}

function cloneEnv(e: EnvironmentState): EnvironmentState {
  return {
    ...e,
    positions: e.positions.map((p) => ({ ...p })),
    tradeHistory: e.tradeHistory.map((t) => ({ ...t })),
    strategyParams: { ...e.strategyParams },
  }
}

export function createInitialTradingEngineState(): TradingEngineState {
  const settings: GlobalSettings = {
    paperTradingEnabled: true,
    enableLiveTrading: false,
    initialBalance: 10_000,
    liveApiKeyId: '',
    liveApiPrivateKeyPem: '',
  }

  const environments = {} as Record<EnvId, EnvironmentState>

  const mk = (
    id: EnvId,
    label: string,
    mode: 'live' | 'lab',
    params: StrategyParameters,
  ): EnvironmentState => ({
    id,
    label,
    mode,
    balance: settings.initialBalance,
    positions: [],
    tradeHistory: [],
    strategyParams: { ...params },
    peakBalance: settings.initialBalance,
    maxDrawdownPct: 0,
    totalFeesPaid: 0,
    wins: 0,
    losses: 0,
  })

  environments.live = mk('live', 'Live', 'live', {
    stopLossPct: 0.05,
    alignmentSensitivity: 0.05,
  })

  for (const row of LAB_PRESETS) {
    environments[row.id] = mk(row.id, row.label, 'lab', row.params)
  }

  return {
    globalSettings: settings,
    environments,
    marketSnapshot: { BTC: { fifteen: 0.48, hourly: 0.52 } },
    activityLog: [],
  }
}

function resetLabs(state: TradingEngineState): TradingEngineState {
  const next: TradingEngineState = {
    ...state,
    environments: { ...state.environments },
    activityLog: state.activityLog,
  }
  const initBal = state.globalSettings.initialBalance
  for (const id of LAB_IDS) {
    const prev = next.environments[id]
    next.environments[id] = {
      ...prev,
      balance: initBal,
      positions: [],
      tradeHistory: [],
      peakBalance: initBal,
      maxDrawdownPct: 0,
      totalFeesPaid: 0,
      wins: 0,
      losses: 0,
    }
  }
  next.activityLog = pushActivity(
    next.activityLog,
    `System · Reset all labs · balance $${initBal.toLocaleString()} each`,
  )
  return next
}

function envShortName(env: EnvironmentState): string {
  if (env.id === 'live') return 'Live'
  const first = env.label.split(' · ')[0]
  return first || env.label
}

function applyStopLoss(
  env: EnvironmentState,
  fifteenYes: number,
  messages: string[],
): EnvironmentState {
  const next = cloneEnv(env)
  const remaining: Position[] = []

  for (const pos of next.positions) {
    const ur = unrealizedReturn(pos, fifteenYes)
    if (ur <= -next.strategyParams.stopLossPct) {
      const exitPx = markPosition(pos.side, fifteenYes)
      const exitFee = kalshiTakerFee(pos.contracts, clampProb(exitPx))
      const proceeds = pos.contracts * exitPx - exitFee

      const trade: Trade = {
        id: uid('tr'),
        timestamp: Date.now(),
        envId: next.id,
        kind: 'stop_loss',
        ticker: pos.ticker,
        side: pos.side,
        contracts: pos.contracts,
        price: exitPx,
        fee: exitFee,
      }

      const ret = (exitPx - pos.entryPrice) / Math.max(pos.entryPrice, 1e-9)
      const win = ret > 0

      next.balance += proceeds
      next.tradeHistory = [...next.tradeHistory, trade]
      next.totalFeesPaid += exitFee
      next.wins += win ? 1 : 0
      next.losses += win ? 0 : 1

      messages.push(
        `${envShortName(next)} stop-loss sold ${pos.contracts} contracts of ${pos.ticker} @ ${exitPx.toFixed(2)}`,
      )
    } else {
      remaining.push(pos)
    }
  }

  next.positions = remaining
  next.peakBalance = nextPeak(next.peakBalance, next.balance)
  next.maxDrawdownPct = updateDrawdown(next.peakBalance, next.balance, next.maxDrawdownPct)
  return next
}

function tryBuy(
  env: EnvironmentState,
  fifteenYes: number,
  hourlyYes: number,
): { env: EnvironmentState; messages: string[] } {
  const messages: string[] = []
  const next = cloneEnv(env)

  if (next.positions.length > 0) {
    return { env: next, messages }
  }

  const sig = alignmentSignal(fifteenYes, hourlyYes, next.strategyParams.alignmentSensitivity)
  if (!sig) return { env: next, messages }

  const execPx = clampProb(sig.side === 'yes' ? fifteenYes : 1 - fifteenYes)
  const budget = next.balance * 0.03
  const contracts = maxContractsForBudget(budget, execPx)
  if (contracts <= 0) return { env: next, messages }

  const fee = kalshiTakerFee(contracts, execPx)
  const gross = contracts * execPx
  const totalCost = gross + fee
  if (totalCost > next.balance) return { env: next, messages }

  const ticker = `${DISPLAY_TICKER_BASE}-${sig.side.toUpperCase()}`

  const pos: Position = {
    id: uid('pos'),
    ticker,
    side: sig.side,
    contracts,
    entryPrice: execPx,
    entryFee: fee,
    openedAt: Date.now(),
  }

  const trade: Trade = {
    id: uid('tr'),
    timestamp: Date.now(),
    envId: next.id,
    kind: 'buy',
    ticker,
    side: sig.side,
    contracts,
    price: execPx,
    fee,
  }

  next.balance -= totalCost
  next.positions = [pos]
  next.tradeHistory = [...next.tradeHistory, trade]
  next.totalFeesPaid += fee
  next.peakBalance = nextPeak(next.peakBalance, next.balance)
  next.maxDrawdownPct = updateDrawdown(next.peakBalance, next.balance, next.maxDrawdownPct)

  const labShort = next.label.split(' · ')[0]
  messages.push(
    `${labShort} bought ${contracts} contracts of ${ticker} @ ${execPx.toFixed(2)}`,
  )

  return { env: next, messages }
}

function processLab(
  env: EnvironmentState,
  fifteenYes: number,
  hourlyYes: number,
): { env: EnvironmentState; messages: string[] } {
  const msgs: string[] = []
  let next = applyStopLoss(env, fifteenYes, msgs)
  const bought = tryBuy(next, fifteenYes, hourlyYes)
  next = bought.env
  msgs.push(...bought.messages)
  return { env: next, messages: msgs }
}

export function tradingReducer(
  state: TradingEngineState,
  action: TradingEngineAction,
): TradingEngineState {
  switch (action.type) {
    case 'UPDATE_GLOBAL_SETTINGS': {
      const gs = { ...state.globalSettings, ...action.patch }
      return { ...state, globalSettings: gs }
    }
    case 'RESET_ALL_LABS':
      return resetLabs(state)
    case 'HARD_RESET':
      return createInitialTradingEngineState()
    case 'ENGINE_TICK': {
      const marketSnapshot = action.snapshot
      const fifteenYes = marketSnapshot.BTC.fifteen
      const hourlyYes = marketSnapshot.BTC.hourly

      const next: TradingEngineState = {
        ...state,
        marketSnapshot,
        environments: { ...state.environments },
        activityLog: state.activityLog,
      }

      if (!next.globalSettings.paperTradingEnabled) {
        return next
      }

      let activityLog = next.activityLog

      for (const id of LAB_IDS) {
        const res = processLab(next.environments[id], fifteenYes, hourlyYes)
        next.environments[id] = res.env
        for (const m of res.messages) {
          activityLog = pushActivity(activityLog, m)
        }
      }

      return { ...next, activityLog }
    }
    default:
      return state
  }
}