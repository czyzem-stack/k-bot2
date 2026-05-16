# Changelog

## 0.0.0.15

- **Horizon matrix** (bottom of dashboard): multi-ticker 15m vs 1h grid with alignment badges, isolated countdowns, strike/probability, and bot exposure

## 0.0.0.14

- **Header:** Kbot2 branding, unified toolbar controls (emerald accent), stable layout across Live/Labs
- **DEV / LIVE badge** in header + tab title (`VITE_DEPLOY_CHANNEL`)
- **Dual localhost:** `npm run dev:all` / `kbot2-dev` — main :5173 (LIVE), dev :5174 (DEV)

## 0.0.0.13

- **Live markets:** one row per asset (7 symbols) on both 15m and Hourly tabs
- **Kalshi selection:** soonest open 15m window; hourly headline via highest-volume primary market
- **Quotes:** stricter liquid-book checks (filters empty 0¢/1¢ books)
- **Layout:** stable 15m ↔ Hourly switching (dual-render grid, fixed table columns, status line below table)
- **UX:** missing contracts show `—` in-table; warnings only in footer status line

## 0.0.0.12

- Header version badge (`v*` from `package.json`) in the top-right of the dashboard
- Trading killswitch, balance-drain fixes, 7-asset market snapshot (from prior release line)
- `npm run verify:version` to catch version drift before push

## 0.0.0.1

- Kalshi tabbed dashboard (live markets + trading labs)
- Paper trading engine with persistence and lab stop-loss ladder
