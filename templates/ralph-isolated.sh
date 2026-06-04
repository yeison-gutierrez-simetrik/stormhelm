#!/bin/bash
# ralph-isolated.sh — run the Ralph Night Shift in an ISOLATED git worktree.
#
# Why: the engine checks out branches and commits. Run it in your working
# checkout and it hijacks whatever you were doing; run two workers and they
# fight over HEAD. A worktree per run gives each session its own checkout
# while sharing the repository — pairs with the engine's own --worker-id.
#
# Usage:
#   ./ralph-isolated.sh <issue-number> [ralph-local.sh args...]
#   RALPH_WORKER_ID=w2 ./ralph-isolated.sh 15 --max-iterations 10
#
# Behavior:
#   - creates .worktrees/ralph-<issue>-<worker>-<ts> detached at HEAD
#     (ralph-local.sh creates its own agent/feature-* branch inside);
#   - copies the untracked runtime surface the engine needs (.env);
#   - runs ./ralph-local.sh inside; the exit code is propagated;
#   - the worktree is KEPT for inspection (session logs, acceptance results)
#     and the cleanup command is printed — never auto-deleted.
#
# Graduated from the belong-marketplace consumer prototype (FOLLOW-UP 32).

set -euo pipefail

ISSUE="${1:?usage: ./ralph-isolated.sh <issue-number> [ralph-local.sh args...]}"
shift || true
WORKER_ID="${RALPH_WORKER_ID:-w1}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

for f in ralph-local.sh ralph-lib.sh ralph-blocked-comment.md.tmpl; do
  if [ ! -f "$f" ]; then
    echo "❌ $f not found at the repo root — the Night Shift engine is not installed (run /setup)." >&2
    exit 1
  fi
done

STAMP=$(date -u +"%Y%m%d-%H%M%S")
WT="${ROOT}/.worktrees/ralph-${ISSUE}-${WORKER_ID}-${STAMP}"

mkdir -p "${ROOT}/.worktrees"
git worktree add --detach "$WT" HEAD >/dev/null

# Untracked runtime surface: tracked files (engine, code) arrive with the
# worktree; secrets do not. Copy .env if present so the env pre-flight and
# the acceptance stack see the same environment as the main checkout.
if [ -f .env ]; then
  cp .env "$WT/.env"
fi
mkdir -p "$WT/.planning/ralph-sessions" "$WT/.planning/acceptance"

echo "🏝  Isolated worktree: $WT (worker ${WORKER_ID}, issue #${ISSUE})"

rc=0
( cd "$WT" && RALPH_WORKER_ID="$WORKER_ID" ./ralph-local.sh "$ISSUE" "$@" ) || rc=$?

echo ""
echo "── Isolated run finished (exit ${rc}) ──"
echo "   Worktree kept for inspection: $WT"
echo "   Session logs:                 $WT/.planning/ralph-sessions/"
echo "   Clean up when done:           git worktree remove --force '$WT'"
exit "$rc"
