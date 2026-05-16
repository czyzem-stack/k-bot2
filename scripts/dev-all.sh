#!/usr/bin/env bash
#
# k-bot2 — one script: worktree + npm install + dev servers
#
#   ./scripts/dev-all.sh           → main :5173 + dev :5174 (default)
#   ./scripts/dev-all.sh --main    → main only
#   ./scripts/dev-all.sh --dev     → dev only
#   ./scripts/dev-all.sh --setup   → install only, no servers
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$ROOT/package.json" ]]; then
  echo "error: k-bot2 not found at $ROOT" >&2
  echo "Run from the project folder:  cd ~/k-bot2 && npm run dev:all" >&2
  echo "Or from anywhere:            ~/k-bot2/kbot2-dev" >&2
  exit 1
fi
MAIN_WT="$ROOT/worktrees/main"
MAIN_PORT=5173
DEV_PORT=5174

MODE=both
SETUP_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --main) MODE=main ;;
    --dev) MODE=dev ;;
    --setup) SETUP_ONLY=1 ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

current_branch() {
  git -C "$1" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?"
}

pkg_version() {
  node -e "console.log(require('$1/package.json').version)" 2>/dev/null || echo "?"
}

ensure_worktree() {
  if [[ ! -e "$MAIN_WT/.git" ]]; then
    echo "→ git worktree add worktrees/main @ main"
    git -C "$ROOT" fetch origin main 2>/dev/null || true
    git -C "$ROOT" worktree add -B main "$MAIN_WT" origin/main 2>/dev/null \
      || git -C "$ROOT" worktree add "$MAIN_WT" main
  fi
  local wt_branch
  wt_branch="$(git -C "$MAIN_WT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  if [[ "$wt_branch" != "main" ]]; then
    echo "→ worktrees/main: pinning to main (was $wt_branch)"
    git -C "$MAIN_WT" checkout main 2>/dev/null || true
  fi
}

main_has_file() {
  git -C "$MAIN_WT" cat-file -e "HEAD:$1" 2>/dev/null
}

ensure_deps() {
  local dir=$1 label=$2
  if [[ ! -d "$dir/node_modules" ]]; then
    echo "→ npm install ($label)"
    npm --prefix "$dir" install
  fi
}

run_vite() {
  local dir=$1 port=$2 channel=$3
  env VITE_DEPLOY_CHANNEL="$channel" npm --prefix "$dir" exec vite -- --port "$port" --strictPort --host
}

cleanup() {
  [[ -n "${PID_MAIN:-}" ]] && kill "$PID_MAIN" 2>/dev/null || true
  [[ -n "${PID_DEV:-}" ]] && kill "$PID_DEV" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "  k-bot2 dev-all"
echo "  ─────────────────────────────────────────"

ensure_worktree
ensure_deps "$ROOT" "dev @ $ROOT"
if [[ "$MODE" != "dev" ]]; then
  ensure_deps "$MAIN_WT" "main @ worktrees/main"
fi

MAIN_BRANCH="$(current_branch "$MAIN_WT")"
DEV_BRANCH="$(current_branch "$ROOT")"
MAIN_VER="$(pkg_version "$MAIN_WT")"
DEV_VER="$(pkg_version "$ROOT")"

if [[ "$SETUP_ONLY" -eq 1 ]]; then
  echo "  Setup complete."
  echo "  main  v$MAIN_VER  ($MAIN_BRANCH)  →  http://localhost:$MAIN_PORT"
  echo "  dev   v$DEV_VER  ($DEV_BRANCH)  →  http://localhost:$DEV_PORT"
  echo ""
  exit 0
fi

case "$MODE" in
  main)
    echo "  main  http://localhost:$MAIN_PORT   LIVE · v$MAIN_VER · $MAIN_BRANCH"
    echo "  Ctrl+C to stop"
    echo ""
    run_vite "$MAIN_WT" "$MAIN_PORT" live
    ;;
  dev)
    echo "  dev   http://localhost:$DEV_PORT   v$DEV_VER · $DEV_BRANCH"
    echo "  Ctrl+C to stop"
    echo ""
    run_vite "$ROOT" "$DEV_PORT" dev
    ;;
  both)
    echo "  main  http://localhost:$MAIN_PORT   LIVE · v$MAIN_VER · $MAIN_BRANCH"
    if main_has_file src/components/AssetCandleChartPanel.tsx; then
      echo "        (main includes dev chart — run: git -C worktrees/main checkout origin/main)"
    else
      echo "        (stable main — no dev-only candle chart / matrix)"
    fi
    echo "  dev   http://localhost:$DEV_PORT   DEV · v$DEV_VER · $DEV_BRANCH"
    echo "        (latest features — candle chart, horizon matrix, etc.)"
    echo "  Ctrl+C stops both"
    echo ""
    run_vite "$MAIN_WT" "$MAIN_PORT" live &
    PID_MAIN=$!
    run_vite "$ROOT" "$DEV_PORT" dev &
    PID_DEV=$!
    wait
    ;;
esac
