import type { TradingEngineState } from './types'
import { LAB_IDS } from './types'
import { netWorth } from './tradingReducer'

export interface RadarDatum {
  metric: string
  lab1: number
  lab2: number
  lab3: number
  lab4: number
  lab5: number
  fullMark: number
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Tighter configured stop-loss → higher risk-aversion score. */
export function riskAversionScore(stopLossPct: number): number {
  const sl = Math.min(0.2, Math.max(0.01, stopLossPct))
  return clamp(((0.16 - sl) / 0.16) * 100, 0, 100)
}

/** Normalize labs onto comparable 0–100 axes for radar comparison. */
export function buildRadarData(state: TradingEngineState): RadarDatum[] {
  const initial = state.globalSettings.initialBalance || 1
  const fifteen = state.marketSnapshot.BTC.fifteen

  const scores = LAB_IDS.map((id) => {
    const env = state.environments[id]
    const nw = netWorth(env, fifteen)
    const pnl = nw - initial
    const closed = env.wins + env.losses
    const winRate = closed > 0 ? (env.wins / closed) * 100 : 50
    const tradeFreq = Math.min(100, env.tradeHistory.length * 6)
    const feeEffRaw =
      env.totalFeesPaid > 0 ? (pnl / env.totalFeesPaid) * 12 + 50 : 50 + Math.sign(pnl) * 10

    const profitability = clamp((pnl / initial) * 120 + 55, 0, 100)
    const riskAversion = riskAversionScore(env.strategyParams.stopLossPct)
    const feeEfficiency = clamp(feeEffRaw, 0, 100)

    return {
      profitability,
      winRate,
      riskAversion,
      tradeFreq,
      feeEfficiency,
    }
  })

  return [
    {
      metric: 'Profitability',
      lab1: scores[0].profitability,
      lab2: scores[1].profitability,
      lab3: scores[2].profitability,
      lab4: scores[3].profitability,
      lab5: scores[4].profitability,
      fullMark: 100,
    },
    {
      metric: 'Win Rate',
      lab1: scores[0].winRate,
      lab2: scores[1].winRate,
      lab3: scores[2].winRate,
      lab4: scores[3].winRate,
      lab5: scores[4].winRate,
      fullMark: 100,
    },
    {
      metric: 'Risk Aversion',
      lab1: scores[0].riskAversion,
      lab2: scores[1].riskAversion,
      lab3: scores[2].riskAversion,
      lab4: scores[3].riskAversion,
      lab5: scores[4].riskAversion,
      fullMark: 100,
    },
    {
      metric: 'Frequency',
      lab1: scores[0].tradeFreq,
      lab2: scores[1].tradeFreq,
      lab3: scores[2].tradeFreq,
      lab4: scores[3].tradeFreq,
      lab5: scores[4].tradeFreq,
      fullMark: 100,
    },
    {
      metric: 'Fee Eff.',
      lab1: scores[0].feeEfficiency,
      lab2: scores[1].feeEfficiency,
      lab3: scores[2].feeEfficiency,
      lab4: scores[3].feeEfficiency,
      lab5: scores[4].feeEfficiency,
      fullMark: 100,
    },
  ]
}
