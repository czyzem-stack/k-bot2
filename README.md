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
npm run dev          # dev branch → http://localhost:5174
```

### Compare **main** and **dev** side by side

Uses a [git worktree](https://git-scm.com/docs/git-worktree) at `worktrees/main` (created automatically):

| Command | URL | Branch |
|---------|-----|--------|
| `npm run dev:both` | **5173** = main, **5174** = dev | both at once |
| `npm run dev:main` | http://localhost:5173 | `main` |
| `npm run dev:dev` | http://localhost:5174 | current checkout (usually `dev`) |

First run of `dev:both` / `dev:main` runs `npm install` in the worktree if needed.

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
| `npm run dev` | Dev server on port **5174** (current branch) |
| `npm run dev:both` | Main on **5173** + dev on **5174** |
| `npm run dev:main` | Main only on **5173** |
| `npm run dev:dev` | Dev only on **5174** |
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
