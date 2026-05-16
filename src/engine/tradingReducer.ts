import { kalshiTakerFee } from './fees'
import type {
  ActivityEntry,
  EnvironmentState,
  EnvId,
  FrequencyQuote,
  GlobalSettings,
  MarketSnapshot,
  Position,
  StrategyParameters,
  Trade,
  TradingEngineState,
} from './types'
import { CRYPTO_SIGNAL_SYMBOLS, LAB_IDS } from './types'

export type TradingEngineAction =
  | { type: 'ENGINE_TICK'; snapshot: TradingEngineState['marketSnapshot'] }
  | { type: 'UPDATE_GLOBAL_SETTINGS'; patch: Partial<GlobalSettings> }
  | { type: 'RESET_ALL_LABS' }
  | { type: 'HARD_RESET' }

/** One probability-point adverse slip on simulated fills (1¢ on $1 contract scale). */
const LAB_SLIPPAGE_PROB = 0.01

/** Hard reset forces every environment ledger balance to this value. */
export const HARD_RESET_LEDGER_BALANCE = 10_000

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
  return Math.min(0.99, Math.max(0.01, x))
}

function seedFrequencyQuote(yesMid: number): FrequencyQuote {
  const y = clampProb(yesMid)
  return {
    yesMid: y,
    noMid: clampProb(1 - y),
    volume: 0,
    close_time: new Date(Date.now() + 45 * 60_000).toISOString(),
  }
}

/** Deterministic-ish seed per asset for first paint before Kalshi rows arrive. */
const SNAPSHOT_SEEDS: Partial<Record<(typeof CRYPTO_SIGNAL_SYMBOLS)[number], { f: number; h: number }>> =
  {
    BTC: { f: 0.48, h: 0.52 },
    ETH: { f: 0.47, h: 0.51 },
    SOL: { f: 0.46, h: 0.5 },
    XRP: { f: 0.49, h: 0.53 },
    DOGE: { f: 0.45, h: 0.5 },
    BNB: { f: 0.5, h: 0.52 },
    HYPE: { f: 0.44, h: 0.49 },
  }

export function createInitialMarketSnapshot(): MarketSnapshot {
  return Object.fromEntries(
    CRYPTO_SIGNAL_SYMBOLS.map((sym) => {
      const seed = SNAPSHOT_SEEDS[sym] ?? { f: 0.48, h: 0.52 }
      return [
        sym,
        {
          fifteen: seedFrequencyQuote(seed.f),
          hourly: seedFrequencyQuote(seed.h),
        },
      ]
    }),
  ) as MarketSnapshot
}

function evolveFrequencyQuote(prev: FrequencyQuote | null): FrequencyQuote {
  const noise = () => (Math.random() - 0.5) * 0.034
  const baseYes = prev?.yesMid ?? 0.48
  const y = clampProb(baseYes + noise())
  return {
    yesMid: y,
    noMid: clampProb(1 - y),
    volume: prev?.volume ?? 0,
    close_time:
      prev?.close_time && Number.isFinite(Date.parse(prev.close_time))
        ? prev.close_time
        : new Date(Date.now() + 30 * 60_000).toISOString(),
  }
}

/**
 * Synthetic evolution when API rows are missing (offline / gap).
 * Mutates only `MarketSnapshot` quote fields — never balances or environments.
 */
export function evolveMarketSnapshot(prev: MarketSnapshot): MarketSnapshot {
  const out = {} as MarketSnapshot
  for (const sym of CRYPTO_SIGNAL_SYMBOLS) {
    const p = prev[sym]
    out[sym] = {
      fifteen: evolveFrequencyQuote(p?.fifteen ?? null),
      hourly: evolveFrequencyQuote(p?.hourly ?? null),
    }
  }
  return out
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

/**
 * Kalshi 2026 taker fee — only call when entering or exiting a position.
 * fees = ⌈0.07 × contracts × price × (1 − price)⌉
 */
function fillFee(contracts: number, executionPrice: number): number {
  return kalshiTakerFee(contracts, executionPrice)
}

function maxContractsForBudget(budget: number, executionPrice: number): number {
  if (budget <= 0 || executionPrice <= 0 || executionPrice >= 1) return 0
  let c = Math.floor(budget / executionPrice)
  while (c > 0) {
    const gross = c * executionPrice
    const fee = fillFee(c, executionPrice)
    if (gross + fee <= budget) return c
    c -= 1
  }
  return 0
}

/** Child (15m) must settle no later than parent (1h) window for this asset. */
function timingAllowsChildParent(childCloseIso: string, parentCloseIso: string): boolean {
  const c = Date.parse(childCloseIso)
  const p = Date.parse(parentCloseIso)
  if (!Number.isFinite(c) || !Number.isFinite(p)) return false
  return c <= p
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

/** Adverse slippage on simulated entry (pay worse price). */
function entryExecutionPrice(side: 'yes' | 'no', yesMid: number): number {
  if (side === 'yes') return clampProb(yesMid + LAB_SLIPPAGE_PROB)
  return clampProb(1 - yesMid + LAB_SLIPPAGE_PROB)
}

/** Adverse slippage on simulated exit (receive worse price). */
function exitExecutionPrice(side: 'yes' | 'no', yesMid: number): number {
  const raw = markPosition(side, yesMid)
  return clampProb(raw - LAB_SLIPPAGE_PROB)
}

function pushActivity(log: ActivityEntry[], message: string): ActivityEntry[] {
  const entry: ActivityEntry = { id: uid('act'), timestamp: Date.now(), message }
  return [entry, ...log].slice(0, 120)
}

export type EnvRuntimeStatus = 'active' | 'idle'

export function getEnvRuntimeStatus(env: EnvironmentState): EnvRuntimeStatus {
  return env.positions.length > 0 ? 'active' : 'idle'
}

/** Mark-to-market vs cash balance only — never mutates `env.balance`. */
export function openPnL(env: EnvironmentState, snapshot: MarketSnapshot): number {
  return env.positions.reduce((sum, p) => {
    const q = snapshot[p.underlying]?.fifteen
    if (!q) return sum
    const mark = markPosition(p.side, q.yesMid)
    return sum + p.contracts * (mark - p.entryPrice)
  }, 0)
}

export function netWorth(env: EnvironmentState, snapshot: MarketSnapshot): number {
  return env.balance + openPnL(env, snapshot)
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
    isTradingActive: false,
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
    marketSnapshot: createInitialMarketSnapshot(),
    activityLog: [],
  }
}

/**
 * Nuclear reset: ledger balances = HARD_RESET_LEDGER_BALANCE, empty positions/history,
 * trading killswitch OFF. Preserves paper/live API prefs from previous globalSettings.
 */
function hardResetTradingState(prev: TradingEngineState): TradingEngineState {
  const fresh = createInitialTradingEngineState()
  const preservedGs: GlobalSettings = {
    ...fresh.globalSettings,
    paperTradingEnabled: prev.globalSettings.paperTradingEnabled,
    enableLiveTrading: prev.globalSettings.enableLiveTrading,
    liveApiKeyId: prev.globalSettings.liveApiKeyId,
    liveApiPrivateKeyPem: prev.globalSettings.liveApiPrivateKeyPem,
    initialBalance: HARD_RESET_LEDGER_BALANCE,
    isTradingActive: false,
  }

  const environments = { ...fresh.environments }
  for (const id of Object.keys(environments) as EnvId[]) {
    environments[id] = {
      ...fresh.environments[id],
      balance: HARD_RESET_LEDGER_BALANCE,
      peakBalance: HARD_RESET_LEDGER_BALANCE,
      positions: [],
      tradeHistory: [],
      maxDrawdownPct: 0,
      totalFeesPaid: 0,
      wins: 0,
      losses: 0,
    }
  }

  return {
    ...fresh,
    globalSettings: preservedGs,
    environments,
    activityLog: [],
    marketSnapshot: fresh.marketSnapshot,
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

/**
 * Balance changes ONLY when closing a position here: proceeds − exit fee.
 * Fee charged once via fillFee at exit.
 */
function applyStopLoss(
  env: EnvironmentState,
  snapshot: MarketSnapshot,
  messages: string[],
): EnvironmentState {
  if (!env.positions?.length) {
    return cloneEnv(env)
  }

  const next = cloneEnv(env)
  const remaining: Position[] = []

  for (const pos of next.positions) {
    const q = snapshot[pos.underlying]?.fifteen
    if (!q) {
      remaining.push(pos)
      continue
    }

    const ur = unrealizedReturn(pos, q.yesMid)
    if (ur <= -next.strategyParams.stopLossPct) {
      const exitPx = exitExecutionPrice(pos.side, q.yesMid)
      const exitFee = fillFee(pos.contracts, exitPx)
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

/**
 * Opens at most one new position per lab per tick.
 * Balance decreases ONLY here by gross + entry fee when a buy executes.
 */
function tryBuyFirstAligned(
  env: EnvironmentState,
  snapshot: MarketSnapshot,
): { env: EnvironmentState; messages: string[] } {
  const messages: string[] = []
  const next = cloneEnv(env)

  if (next.positions.length > 0) {
    return { env: next, messages }
  }

  for (const sym of CRYPTO_SIGNAL_SYMBOLS) {
    const asset = snapshot[sym]
    const child = asset?.fifteen
    const parent = asset?.hourly
    if (!child || !parent) continue
    if (!timingAllowsChildParent(child.close_time, parent.close_time)) continue

    const fifteenYes = child.yesMid
    const hourlyYes = parent.yesMid
    const sig = alignmentSignal(fifteenYes, hourlyYes, next.strategyParams.alignmentSensitivity)
    if (!sig) continue

    const execPx = entryExecutionPrice(sig.side, fifteenYes)
    const budget = next.balance * 0.03
    const contracts = maxContractsForBudget(budget, execPx)
    if (contracts <= 0) continue

    const fee = fillFee(contracts, execPx)
    const gross = contracts * execPx
    const totalCost = gross + fee
    if (totalCost > next.balance) continue

    const ticker = `${sym}-15m-${sig.side.toUpperCase()}`

    const pos: Position = {
      id: uid('pos'),
      ticker,
      underlying: sym,
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

    next.positions = [pos]
    next.tradeHistory = [...next.tradeHistory, trade]
    next.balance -= totalCost
    next.totalFeesPaid += fee
    next.peakBalance = nextPeak(next.peakBalance, next.balance)
    next.maxDrawdownPct = updateDrawdown(next.peakBalance, next.balance, next.maxDrawdownPct)

    const labShort = next.label.split(' · ')[0]
    messages.push(
      `${labShort} bought ${contracts} contracts of ${ticker} @ ${execPx.toFixed(2)}`,
    )
    return { env: next, messages }
  }

  return { env: next, messages }
}

function processLab(
  env: EnvironmentState,
  snapshot: MarketSnapshot,
  globalSettings: GlobalSettings,
): { env: EnvironmentState; messages: string[] } {
  if (!globalSettings.isTradingActive) {
    return { env, messages: [] }
  }

  const msgs: string[] = []
  let next = applyStopLoss(env, snapshot, msgs)
  const bought = tryBuyFirstAligned(next, snapshot)
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
      return hardResetTradingState(state)
    case 'ENGINE_TICK': {
      /**
       * Tick updates marks only via `marketSnapshot`. Cash balance and fees are touched
       * exclusively inside `applyStopLoss` (close + fee) and `tryBuyFirstAligned` (open + fee).
       */
      const marketSnapshot = action.snapshot

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
        const beforeBal = next.environments[id].balance
        const res = processLab(
          next.environments[id],
          marketSnapshot,
          next.globalSettings,
        )
        next.environments[id] = res.env
        const afterBal = next.environments[id].balance

        if (beforeBal !== afterBal) {
          console.warn(
            `BALANCE LEAK DETECTED: ${beforeBal} -> ${afterBal}. Current Open Positions: ${next.environments[id].positions.length}`,
          )
        }

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
