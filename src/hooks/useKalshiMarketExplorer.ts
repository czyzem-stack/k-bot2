import { useContext } from 'react'
import {
  KalshiMarketDataContext,
  type KalshiMarketDataContextValue,
} from '../context/KalshiMarketDataContext'

export function useKalshiMarketExplorer(): KalshiMarketDataContextValue {
  const ctx = useContext(KalshiMarketDataContext)
  if (!ctx) {
    throw new Error('useKalshiMarketExplorer must be used within KalshiTradingRootProvider')
  }
  return ctx
}
