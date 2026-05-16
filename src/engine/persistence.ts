import type {
  ActivityEntry,
  CryptoSignalSymbol,
  EnvironmentState,
  EnvId,
  GlobalSettings,
  Position,
  TradingEngineState,
} from './types'
import { LAB_IDS } from './types'

export const ENGINE_STORAGE_KEY = 'kalshi-trading-engine-v2'

type PersistedShape = {
  v: 2
  globalSettings: GlobalSettings
  environments: Record<EnvId, EnvironmentState>
  activityLog: ActivityEntry[]
}

const ENV_KEYS: EnvId[] = ['live', ...LAB_IDS]

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function loadPersistedEngine(): Partial<PersistedShape> | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(ENGINE_STORAGE_KEY)
  if (!raw) return null
  const data = safeParse(raw)
  if (!data || typeof data !== 'object') return null
  const o = data as Partial<PersistedShape>
  if (o.v !== 2 || !o.environments || !o.globalSettings) return null
  return o
}

export function persistEngineSnapshot(state: TradingEngineState): void {
  if (typeof window === 'undefined') return
  const payload: PersistedShape = {
    v: 2,
    globalSettings: state.globalSettings,
    environments: ENV_KEYS.reduce(
      (acc, id) => {
        acc[id] = state.environments[id]
        return acc
      },
      {} as Record<EnvId, EnvironmentState>,
    ),
    activityLog: state.activityLog.slice(0, 150),
  }
  window.localStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(payload))
}

export function clearPersistedEngine(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ENGINE_STORAGE_KEY)
}

export function mergePersistedIntoBase(
  base: TradingEngineState,
  saved: Partial<PersistedShape>,
): TradingEngineState {
  const gs: GlobalSettings = saved.globalSettings
    ? {
        ...base.globalSettings,
        ...saved.globalSettings,
        isTradingActive: saved.globalSettings.isTradingActive === true,
      }
    : base.globalSettings

  const environments = { ...base.environments }
  if (saved.environments) {
    for (const id of ENV_KEYS) {
      const incoming = saved.environments[id]
      const seed = base.environments[id]
      if (!incoming || !seed) continue
      environments[id] = {
        ...seed,
        balance: typeof incoming.balance === 'number' ? incoming.balance : seed.balance,
        peakBalance:
          typeof incoming.peakBalance === 'number' ? incoming.peakBalance : seed.peakBalance,
        maxDrawdownPct:
          typeof incoming.maxDrawdownPct === 'number'
            ? incoming.maxDrawdownPct
            : seed.maxDrawdownPct,
        totalFeesPaid:
          typeof incoming.totalFeesPaid === 'number'
            ? incoming.totalFeesPaid
            : seed.totalFeesPaid,
        wins: typeof incoming.wins === 'number' ? incoming.wins : seed.wins,
        losses: typeof incoming.losses === 'number' ? incoming.losses : seed.losses,
        positions: Array.isArray(incoming.positions)
          ? (incoming.positions as Position[]).map((p) => ({
              ...p,
              underlying: (p.underlying ?? 'BTC') as CryptoSignalSymbol,
            }))
          : [],
        tradeHistory: Array.isArray(incoming.tradeHistory) ? incoming.tradeHistory : [],
        strategyParams: seed.strategyParams,
      }
    }
  }

  const activityLog =
    saved.activityLog && Array.isArray(saved.activityLog)
      ? saved.activityLog
      : base.activityLog

  return {
    ...base,
    globalSettings: gs,
    environments,
    activityLog,
    marketSnapshot: base.marketSnapshot,
  }
}
