#!/usr/bin/env bash
# Main branch only — http://localhost:5173
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_WT="$ROOT/worktrees/main"

if [[ ! -d "$MAIN_WT" ]]; then
  git -C "$ROOT" worktree add "$MAIN_WT" main
fi
if [[ ! -d "$MAIN_WT/node_modules" ]]; then
  npm --prefix "$MAIN_WT" install
fi

exec npm --prefix "$MAIN_WT" run dev -- --port 5173 --strictPort
