import { useEffect, useState } from 'react'
import {
  assetChartConfigs,
  fetchCryptoCandles,
  type AssetChartConfig,
  type CandleTimeframeId,
  type OhlcCandle,
} from '../lib/cryptoCandles'

const CACHE_TTL_MS = 45_000
const cache = new Map<string, { at: number; candles: OhlcCandle[] }>()

function cacheKey(pair: string, tf: CandleTimeframeId): string {
  return `${pair}:${tf}`
}

export function useCryptoCandles(symbol: string, timeframe: CandleTimeframeId) {
  const configs = assetChartConfigs()
  const config: AssetChartConfig | undefined = configs.find((c) => c.symbol === symbol)

  const [candles, setCandles] = useState<OhlcCandle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!config) {
      const t = window.setTimeout(() => {
        setCandles([])
        setError(`No chart config for ${symbol}`)
        setLoading(false)
      }, 0)
      return () => window.clearTimeout(t)
    }

    const ac = new AbortController()
    const key = cacheKey(config.spotPair, timeframe)
    const hit = cache.get(key)

    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      const t = window.setTimeout(() => {
        setCandles(hit.candles)
        setError(null)
        setLoading(false)
      }, 0)
      return () => {
        window.clearTimeout(t)
        ac.abort()
      }
    }

    const t0 = window.setTimeout(() => {
      setLoading(true)
      setError(null)
    }, 0)

    void fetchCryptoCandles(config.spotPair, timeframe, ac.signal)
      .then((data) => {
        if (ac.signal.aborted) return
        cache.set(key, { at: Date.now(), candles: data })
        setCandles(data)
        setLoading(false)
      })
      .catch((e) => {
        if (ac.signal.aborted) return
        setCandles([])
        setError(e instanceof Error ? e.message : 'Failed to load candles')
        setLoading(false)
      })

    return () => {
      window.clearTimeout(t0)
      ac.abort()
    }
  }, [config, symbol, timeframe, refreshKey])

  return {
    candles,
    loading,
    error,
    config,
    assetConfigs: configs,
    refresh: () => {
      if (config) cache.delete(cacheKey(config.spotPair, timeframe))
      setRefreshKey((k) => k + 1)
    },
  }
}
