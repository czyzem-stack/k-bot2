import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  createInitialTradingEngineState,
  evolveMarketSnapshot,
  tradingReducer,
} from '../engine/tradingReducer'
import {
  clearPersistedEngine,
  loadPersistedEngine,
  mergePersistedIntoBase,
  persistEngineSnapshot,
} from '../engine/persistence'
import type { GlobalSettings, TradingEngineState } from '../engine/types'
import { TradingEngineContext } from './TradingEngineContext'
import { KalshiMarketDataContext } from './KalshiMarketDataContext'
import { deriveBtcSignalFromExplorer, fetchCryptoExplorerRows } from '../lib/cryptoExplorer'
import type { CryptoExplorerRow } from '../lib/cryptoExplorer'
import { isOpenKalshiMarket } from '../lib/kalshi'

function initEngineState(): TradingEngineState {
  const base = createInitialTradingEngineState()
  const saved = loadPersistedEngine()
  return saved ? mergePersistedIntoBase(base, saved) : base
}

function nextSnapshot(
  prev: TradingEngineState['marketSnapshot'],
  rows: CryptoExplorerRow[],
): TradingEngineState['marketSnapshot'] {
  const live = deriveBtcSignalFromExplorer(rows)
  if (live) return { ...prev, BTC: live }
  return evolveMarketSnapshot(prev)
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
