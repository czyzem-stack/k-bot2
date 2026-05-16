/**
 * Kalshi-style taker fee (2026): ceil(0.07 × contracts × price × (1 − price)).
 * Call only at trade entry/exit — never on mark-to-market ticks.
 * `price` is execution probability in (0, 1) for the traded side (YES or NO leg).
 */
export function kalshiTakerFee(contracts: number, price: number): number {
  if (contracts <= 0 || price <= 0 || price >= 1) return 0
  return Math.ceil(0.07 * contracts * price * (1 - price))
}
