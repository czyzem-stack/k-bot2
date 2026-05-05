import { createContext } from 'react'
import type { CryptoExplorerRow } from '../lib/cryptoExplorer'

export type KalshiMarketDataContextValue = {
  rows: CryptoExplorerRow[]
  loading: boolean
  error: string | null
  refreshedAt: number | null
  refreshMarkets: () => Promise<void>
}

export const KalshiMarketDataContext = createContext<KalshiMarketDataContextValue | null>(null)
