import { useContext } from 'react'
import {
  TradingEngineContext,
  type TradingEngineContextValue,
} from '../context/TradingEngineContext'

export function useTradingEngine(): TradingEngineContextValue {
  const ctx = useContext(TradingEngineContext)
  if (!ctx) throw new Error('useTradingEngine must be used within TradingEngineProvider')
  return ctx
}
