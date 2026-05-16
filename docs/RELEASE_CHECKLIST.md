# Release / push checklist (k-bot2)

Use this **every time** you bump a version, ship to GitHub, or say **“push”** / **“housekeeping release”**.

## 1. Bump version (one source of truth)

Edit **`package.json`** → `"version"` (e.g. `0.0.0.13`).

Then sync these (do not skip):

| File | What to update |
|------|----------------|
| `package-lock.json` | Root `"version"` and `packages[""].version` (both must match) |
| `index.html` | `<title>k-bot2 v{VERSION}</title>` |
| `src/lib/appVersion.ts` | No edit — reads `package.json` automatically |
| `docs/CHANGELOG.md` | New section for this version (what changed) |

Run:

```bash
npm run verify:version
```

## 2. UI check (local — required)

`package.json` changes are **not** picked up by a long-running dev server until restart.

```bash
# Stop old dev server (Ctrl+C), then:
npm run dev
```

In the browser:

1. Hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`)
2. Confirm **top-right of header** shows `v{VERSION}` (e.g. `v0.0.0.12`)
3. Confirm browser tab title matches

## 3. Build check

```bash
npm run lint
npm run build
```

## 4. Git

```bash
git checkout v0.0.0.12   # or your working branch
git status
git add -A
git commit -m "Release vX.Y.Z: short summary."
git push origin v0.0.0.12
```

## 5. Promote to `main` (when stable)

```bash
git checkout main
git merge v0.0.0.12
git push origin main
```

Optional: push a release tag branch `v0.0.0.1` if you keep a release line.

## 6. Agent phrase (copy/paste)

> **Housekeeping release v0.0.0.13:** bump version everywhere in the checklist, update CHANGELOG, run `verify:version`, commit on `v0.0.0.12`, push, remind me to restart `npm run dev` and hard-refresh.

## Common mistake

**Pushed to GitHub but the page still shows the old version** → old `npm run dev` still running. **Restart the dev server** and hard-refresh the browser.
