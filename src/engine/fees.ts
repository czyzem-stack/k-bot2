/**
 * Kalshi-style taker fee (2026 formula).
 * `price` is YES probability in [0, 1].
 */
export function kalshiTakerFee(contracts: number, price: number): number {
  if (contracts <= 0 || price <= 0 || price >= 1) return 0
  return Math.ceil(0.07 * contracts * price * (1 - price))
}
