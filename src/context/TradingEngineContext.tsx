import { createContext } from 'react'
import type { TradingEngineAction } from '../engine/tradingReducer'
import type { GlobalSettings, TradingEngineState } from '../engine/types'

export type TradingEngineContextValue = {
  state: TradingEngineState
  dispatch: React.Dispatch<TradingEngineAction>
  updateSettings: (patch: Partial<GlobalSettings>) => void
  resetAllLabs: () => void
  hardReset: () => void
}

export const TradingEngineContext = createContext<TradingEngineContextValue | null>(null)
