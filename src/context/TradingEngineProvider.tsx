import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  createInitialTradingEngineState,
  evolveMarketSnapshot,
  tradingReducer,
} from '../engine/tradingReducer'
import type { MarketSnapshot } from '../engine/types'
import { CRYPTO_SIGNAL_SYMBOLS } from '../engine/types'
import {
  clearPersistedEngine,
  ENGINE_STORAGE_KEY,
  loadPersistedEngine,
  mergePersistedIntoBase,
  persistEngineSnapshot,
} from '../engine/persistence'
import type { GlobalSettings, TradingEngineState } from '../engine/types'
import { TradingEngineContext } from './TradingEngineContext'
import { KalshiMarketDataContext } from './KalshiMarketDataContext'
import { deriveSignalFromExplorer, fetchCryptoExplorerRows } from '../lib/cryptoExplorer'
import type { CryptoExplorerRow } from '../lib/cryptoExplorer'
import { isOpenKalshiMarket } from '../lib/kalshi'

function initEngineState(): TradingEngineState {
  const base = createInitialTradingEngineState()
  const saved = loadPersistedEngine()
  return saved ? mergePersistedIntoBase(base, saved) : base
}

function nextSnapshot(prev: MarketSnapshot, rows: CryptoExplorerRow[]): MarketSnapshot {
  const evolvedFallback = evolveMarketSnapshot(prev)
  const out = {} as MarketSnapshot

  for (const sym of CRYPTO_SIGNAL_SYMBOLS) {
    const live = deriveSignalFromExplorer(rows, sym)
    const fb = evolvedFallback[sym]
    out[sym] = {
      fifteen: live.fifteen ?? fb.fifteen,
      hourly: live.hourly ?? fb.hourly,
    }
  }

  return out
}

export function KalshiTradingRootProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(tradingReducer, undefined, initEngineState)

  const [rows, setRows] = useState<CryptoExplorerRow[]>([])
  const [marketLoading, setMarketLoading] = useState(true)
  const [marketError, setMarketError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)

  const rowsRef = useRef(rows)
  const engineRef = useRef(state)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    engineRef.current = state
  }, [state])

  const refreshMarkets = useCallback(async () => {
    try {
      setMarketLoading(true)
      setMarketError(null)
      const raw = await fetchCryptoExplorerRows()
      const openOnly = raw.filter((r) => isOpenKalshiMarket(r.market))
      setRows(openOnly)
      setRefreshedAt(Date.now())
    } catch (e) {
      setMarketError(e instanceof Error ? e.message : 'Failed to load Kalshi markets.')
    } finally {
      setMarketLoading(false)
    }
  }, [])

  useEffect(() => {
    const boot = window.setTimeout(() => void refreshMarkets(), 0)
    const poll = window.setInterval(() => void refreshMarkets(), 30_000)
    return () => {
      window.clearTimeout(boot)
      window.clearInterval(poll)
    }
  }, [refreshMarkets])

  useEffect(() => {
    const boot = window.setTimeout(() => {
      dispatch({
        type: 'ENGINE_TICK',
        snapshot: nextSnapshot(engineRef.current.marketSnapshot, rowsRef.current),
      })
    }, 0)
    const id = window.setInterval(() => {
      dispatch({
        type: 'ENGINE_TICK',
        snapshot: nextSnapshot(engineRef.current.marketSnapshot, rowsRef.current),
      })
    }, 2600)
    return () => {
      window.clearTimeout(boot)
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => persistEngineSnapshot(state), 400)
    return () => window.clearTimeout(t)
  }, [state])

  const updateSettings = useCallback((patch: Partial<GlobalSettings>) => {
    dispatch({ type: 'UPDATE_GLOBAL_SETTINGS', patch })
  }, [])

  const resetAllLabs = useCallback(() => {
    dispatch({ type: 'RESET_ALL_LABS' })
  }, [])

  const hardReset = useCallback(() => {
    clearPersistedEngine()
    if (typeof window !== 'undefined') {
      let leftover = window.localStorage.getItem(ENGINE_STORAGE_KEY)
      if (leftover !== null) {
        console.warn(
          '[KalshiTradingRootProvider] Persistence key still present after clear — forcing removal.',
        )
        window.localStorage.removeItem(ENGINE_STORAGE_KEY)
        leftover = window.localStorage.getItem(ENGINE_STORAGE_KEY)
      }
      if (leftover !== null) {
        console.error('[KalshiTradingRootProvider] Failed to clear persistence key.')
      }
    }
    dispatch({ type: 'HARD_RESET' })
  }, [])

  const marketValue = useMemo(
    () => ({
      rows,
      loading: marketLoading,
      error: marketError,
      refreshedAt,
      refreshMarkets,
    }),
    [rows, marketLoading, marketError, refreshedAt, refreshMarkets],
  )

  const engineValue = useMemo(
    () => ({ state, dispatch, updateSettings, resetAllLabs, hardReset }),
    [state, updateSettings, resetAllLabs, hardReset],
  )

  return (
    <KalshiMarketDataContext.Provider value={marketValue}>
      <TradingEngineContext.Provider value={engineValue}>{children}</TradingEngineContext.Provider>
    </KalshiMarketDataContext.Provider>
  )
}
