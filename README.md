# k-bot2

Kalshi crypto **paper-trading dashboard**: live market explorer (15m + hourly) and multi-lab trading engine with local persistence.

**Current version:** see `package.json`, the `v*` line under **Kbot2**, and the **DEV** / **LIVE** tag in the header.

## What you get

| Area | Description |
|------|-------------|
| **Live markets** | One Kalshi contract per asset (BTC, ETH, SOL, XRP, DOGE, BNB, HYPE) for **15m** (soonest window) and **Hourly** (headline strike). |
| **Trading labs** | Paper environments with configurable stop-loss presets; shared market snapshots. |
| **Safety** | Trading killswitch (off by default), balance-drain detection, full reset in Settings. |

## Run locally

**From the project folder** (`~/k-bot2`):

```bash
cd ~/k-bot2
npm run dev:all
```

**From anywhere** (after `chmod +x ~/k-bot2/kbot2-dev` once):

```bash
~/k-bot2/kbot2-dev
```

Optional — add to `~/.zshrc` so `kbot2-dev` works in any terminal:

```bash
export PATH="$HOME/k-bot2:$PATH"
```

| URL | Branch | Header tag |
|-----|--------|------------|
| http://localhost:5173 | `main` (worktree at `worktrees/main`) | **LIVE** (green) |
| http://localhost:5174 | `dev` (this checkout) | **DEV** (amber) |

The tag next to **Kbot2** and the browser tab title show which line you are on.

Options (same script):

```bash
./scripts/dev-all.sh           # both (default)
./scripts/dev-all.sh --main    # main only
./scripts/dev-all.sh --dev     # dev only
./scripts/dev-all.sh --setup   # worktree + npm install, no servers
```

Single-branch dev: `npm run dev` → port **5174** only.

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
| `npm run dev:all` | Setup + main **5173** + dev **5174** |
| `npm run dev` | Current branch only on **5174** |
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
