#!/usr/bin/env bash
# Run main (worktree) on :5173 and dev (this repo) on :5174.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_WT="$ROOT/worktrees/main"
MAIN_PORT=5173
DEV_PORT=5174

ensure_worktree() {
  if [[ ! -d "$MAIN_WT" ]]; then
    echo "→ Adding worktree: worktrees/main @ main"
    git -C "$ROOT" worktree add "$MAIN_WT" main
  fi
  if [[ ! -d "$MAIN_WT/node_modules" ]]; then
    echo "→ npm install in worktrees/main (first time)"
    npm --prefix "$MAIN_WT" install
  fi
  if [[ ! -d "$ROOT/node_modules" ]]; then
    echo "→ npm install in repo root (dev)"
    npm --prefix "$ROOT" install
  fi
}

current_branch() {
  git -C "$1" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?"
}

cleanup() {
  [[ -n "${PID_MAIN:-}" ]] && kill "$PID_MAIN" 2>/dev/null || true
  [[ -n "${PID_DEV:-}" ]] && kill "$PID_DEV" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ensure_worktree

MAIN_BRANCH="$(current_branch "$MAIN_WT")"
DEV_BRANCH="$(current_branch "$ROOT")"

echo ""
echo "  k-bot2 dual dev"
echo "  ─────────────────────────────────────────"
echo "  main  http://localhost:$MAIN_PORT   ($MAIN_WT · $MAIN_BRANCH)"
echo "  dev   http://localhost:$DEV_PORT   ($ROOT · $DEV_BRANCH)"
echo "  Ctrl+C stops both"
echo ""

npm --prefix "$MAIN_WT" run dev -- --port "$MAIN_PORT" --strictPort &
PID_MAIN=$!

npm --prefix "$ROOT" run dev -- --port "$DEV_PORT" --strictPort &
PID_DEV=$!

wait
