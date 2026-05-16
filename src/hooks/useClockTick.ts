import { useEffect, useState } from 'react'

/** Shared clock for countdown UIs — enable only on visible/active cells to limit re-renders. */
export function useClockTick(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, enabled])
  return now
}
