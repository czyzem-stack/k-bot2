import { useEffect, useReducer, useRef } from 'react'
import {
  ASSET_CHART_CONFIGS,
  fetchCryptoCandles,
  invalidateCandleCache,
  krakenPairForSymbol,
  prefetchCandlesForSymbol,
  readCandleCache,
  type AssetChartConfig,
  type CandleTimeframeId,
  type OhlcCandle,
  writeCandleCache,
} from '../lib/cryptoCandles'

type CandleState = {
  candles: OhlcCandle[]
  loading: boolean
  fetching: boolean
  error: string | null
}

type Action =
  | { type: 'select'; symbol: string; timeframe: CandleTimeframeId; refreshKey: number }
  | { type: 'fetching' }
  | { type: 'success'; candles: OhlcCandle[] }
  | { type: 'failure'; message: string }
  | { type: 'no_config'; symbol: string }

function initFromCache(symbol: string, timeframe: CandleTimeframeId): CandleState {
  if (!krakenPairForSymbol(symbol)) {
    return { candles: [], loading: false, fetching: false, error: null }
  }
  const cached = readCandleCache(symbol, timeframe)
  return {
    candles: cached ?? [],
    loading: !cached,
    fetching: !cached,
    error: null,
  }
}

function reducer(state: CandleState, action: Action): CandleState {
  switch (action.type) {
    case 'no_config':
      return {
        candles: [],
        loading: false,
        fetching: false,
        error: `No Kraken spot pair for ${action.symbol}`,
      }
    case 'select': {
      const cached = readCandleCache(action.symbol, action.timeframe)
      if (cached) {
        return {
          candles: cached,
          loading: false,
          fetching: action.refreshKey > 0,
          error: null,
        }
      }
      if (state.candles.length > 0 && action.refreshKey > 0) {
        return { ...state, fetching: true, error: null }
      }
      return { candles: [], loading: true, fetching: true, error: null }
    }
    case 'fetching':
      return { ...state, fetching: true }
    case 'success':
      return {
        candles: action.candles,
        loading: false,
        fetching: false,
        error: null,
      }
    case 'failure':
      return {
        ...state,
        loading: false,
        fetching: false,
        error: action.message,
        candles: state.candles.length > 0 ? state.candles : [],
      }
    default:
      return state
  }
}

export function useCryptoCandles(symbol: string, timeframe: CandleTimeframeId) {
  const config: AssetChartConfig | undefined = ASSET_CHART_CONFIGS.find(
    (c) => c.symbol === symbol,
  )

  const [state, dispatch] = useReducer(
    reducer,
    { symbol, timeframe },
    ({ symbol: s, timeframe: tf }) => initFromCache(s, tf),
  )

  const requestIdRef = useRef(0)
  const [refreshKey, bumpRefresh] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    if (!config?.krakenPair) {
      dispatch({ type: 'no_config', symbol })
      return
    }

    dispatch({ type: 'select', symbol, timeframe, refreshKey })

    const cached = readCandleCache(symbol, timeframe)
    if (cached && refreshKey === 0) {
      return
    }

    const requestId = ++requestIdRef.current
    const ac = new AbortController()
    dispatch({ type: 'fetching' })

    void fetchCryptoCandles(symbol, timeframe, ac.signal)
      .then((data) => {
        if (ac.signal.aborted || requestId !== requestIdRef.current) return
        writeCandleCache(symbol, timeframe, data)
        dispatch({ type: 'success', candles: data })
      })
      .catch((e) => {
        if (ac.signal.aborted || requestId !== requestIdRef.current) return
        dispatch({
          type: 'failure',
          message: e instanceof Error ? e.message : 'Failed to load candles',
        })
      })

    return () => ac.abort()
  }, [symbol, timeframe, refreshKey, config?.krakenPair])

  useEffect(() => {
    if (!config?.krakenPair) return
    prefetchCandlesForSymbol(symbol)
  }, [symbol, config?.krakenPair])

  return {
    candles: state.candles,
    loading: state.loading,
    fetching: state.fetching,
    error: state.error,
    config,
    assetConfigs: ASSET_CHART_CONFIGS,
    refresh: () => {
      invalidateCandleCache(symbol, timeframe)
      bumpRefresh()
    },
  }
}
