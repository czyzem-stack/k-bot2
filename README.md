# k-bot2

Kalshi crypto **paper-trading dashboard**: live market explorer (15m + hourly) and multi-lab trading engine with local persistence.

**Current version:** see `package.json` and the `v*` badge under **Trading dashboard** in the UI.

## What you get

| Area | Description |
|------|-------------|
| **Live markets** | One Kalshi contract per asset (BTC, ETH, SOL, XRP, DOGE, BNB, HYPE) for **15m** (soonest window) and **Hourly** (headline strike). |
| **Trading labs** | Paper environments with configurable stop-loss presets; shared market snapshots. |
| **Safety** | Trading killswitch (off by default), balance-drain detection, full reset in Settings. |

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**).

After a version bump or pull: **stop** the dev server, run `npm run dev` again, then **hard-refresh** the browser (`Cmd+Shift+R` / `Ctrl+Shift+R`) so the version badge and bundle stay in sync.

## UI quick guide

- **15m / Hourly** (top right) — switch buckets; the table layout stays fixed (both views are pre-rendered).
- **Refresh markets** — refetch Kalshi contracts.
- **Trading labs** — open the labs + radar panel.
- **Settings** — starting balance, full reset (clears `localStorage` engine state).

Missing quotes show as `—` in the table; details appear in the amber line **below** the table.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server (Vite) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run verify:version` | Check version strings before release |
| `npm run preview` | Preview production build |

## Release / push

Active development branch: **`dev`**.

Follow **[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)** when bumping version or pushing to GitHub.

```bash
npm run verify:version
npm run lint && npm run build
```

History: **[docs/CHANGELOG.md](docs/CHANGELOG.md)**

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Recharts (labs radar)

Kalshi public market API (no live order placement in this repo).

## Persistence

Engine state is stored in the browser under `localStorage` key `kalshi-trading-engine-v2`.
