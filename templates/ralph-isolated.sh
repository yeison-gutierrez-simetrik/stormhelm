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
#   ./ralph-isolated.sh <issue-number> --resume [ralph-local.sh args...]
#   RALPH_WORKER_ID=w2 ./ralph-isolated.sh 15 --max-iterations 10
#
# Behavior:
#   - creates .worktrees/ralph-<issue>-<worker>-<ts> detached at HEAD
#     (ralph-local.sh creates its own agent/feature-* branch inside);
#   - copies the untracked runtime surface the engine needs (.env);
#   - runs ./ralph-local.sh inside; the exit code is propagated;
#   - the worktree is KEPT for inspection (session logs, acceptance results)
#     and the cleanup command is printed — never auto-deleted;
#   - --resume (FOLLOW-UP 37a): relaunches in the NEWEST existing worktree
#     for this issue+worker instead of creating a new one — the sanctioned
#     re-entry that used to be a manual cd + re-source + relaunch dance
#     (three times in one live night). .env is re-copied (fresh secrets win).
#
# Graduated from the belong-marketplace consumer prototype (FOLLOW-UP 32).

set -euo pipefail

ISSUE="${1:?usage: ./ralph-isolated.sh <issue-number> [--resume] [ralph-local.sh args...]}"
shift || true
WORKER_ID="${RALPH_WORKER_ID:-w1}"

RESUME=0
BASE_REF=""
PASS_ARGS=()
expect_base=0
for a in "$@"; do
  if [ "$expect_base" = "1" ]; then
    BASE_REF="$a"; PASS_ARGS+=("--base" "$a"); expect_base=0; continue
  fi
  case "$a" in
    --resume) RESUME=1 ;;
    --base)   expect_base=1 ;;             # FOLLOW-UP 38a: slice-group chaining
    --base=*) BASE_REF="${a#*=}"; PASS_ARGS+=("--base" "$BASE_REF") ;;
    *)        PASS_ARGS+=("$a") ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

for f in ralph-local.sh ralph-lib.sh ralph-blocked-comment.md.tmpl; do
  if [ ! -f "$f" ]; then
    echo "❌ $f not found at the repo root — the Night Shift engine is not installed (run /setup)." >&2
    exit 1
  fi
done

if [ "$RESUME" = "1" ]; then
  # `|| true` guards pipefail: zero matches makes ls exit non-zero and would
  # otherwise kill the script (set -e) before the actionable refusal below.
  WT=$(ls -td "${ROOT}/.worktrees/ralph-${ISSUE}-${WORKER_ID}-"* 2>/dev/null | head -1 || true)
  if [ -z "$WT" ]; then
    echo "❌ --resume: no existing worktree for issue #${ISSUE} / worker ${WORKER_ID} under .worktrees/ — run without --resume to create one." >&2
    exit 1
  fi
  for f in ralph-local.sh ralph-lib.sh ralph-blocked-comment.md.tmpl; do
    if [ ! -f "$WT/$f" ]; then
      echo "❌ --resume: $WT exists but is missing $f — remove it (git worktree remove --force '$WT') and relaunch without --resume." >&2
      exit 1
    fi
  done
  echo "🔁 Resuming in existing worktree: $WT"
  echo "   Re-bind any watcher: ./ralph-watch.sh ${ISSUE} '$WT' (a relaunch writes a NEW session log)"
else
  STAMP=$(date -u +"%Y%m%d-%H%M%S")
  WT="${ROOT}/.worktrees/ralph-${ISSUE}-${WORKER_ID}-${STAMP}"
  mkdir -p "${ROOT}/.worktrees"
  # FOLLOW-UP 38a: with --base, the worktree starts at the previous
  # sibling's branch — the engine then branches and PRs against it.
  git worktree add --detach "$WT" "${BASE_REF:-HEAD}" >/dev/null
  echo "🏝  Isolated worktree: $WT (worker ${WORKER_ID}, issue #${ISSUE}${BASE_REF:+, chained on ${BASE_REF}})"
fi

# Untracked runtime surface: tracked files (engine, code) arrive with the
# worktree; the untracked runtime surface does NOT — and the loop the
# worktree exists to run needs ALL of it:
#   .env          → secrets for the env pre-flight + the acceptance stack
#   node_modules  → /tdd runs vitest, /run-acceptance runs cucumber-js, and
#                   §60's pre-push smoke runs `pnpm test:smoke` — every one
#                   resolves its binary from node_modules/.bin. A git
#                   worktree gets a FRESH working dir with no node_modules,
#                   so without this the first command fails 127
#                   (`cucumber-js: command not found`) — FOLLOW-UP 69.
# On --resume .env is REFRESHED (fresh secrets win); node_modules is linked
# only if absent (a prior run's link/install is reused).
if [ -f .env ]; then
  cp .env "$WT/.env"
fi
# Provision deps (FOLLOW-UP 69): symlink the primary checkout's node_modules
# (read-only during a run → safe to share; near-zero cost; works for
# npm/pnpm/yarn since .bin resolves relatively). Fallback to an install only
# if the source tree has none. Guarded so --resume / re-runs don't clobber.
if [ ! -e "$WT/node_modules" ]; then
  SRC_NM="${ROOT}/node_modules"
  if [ -d "$SRC_NM" ]; then
    ln -s "$SRC_NM" "$WT/node_modules"
    echo "🔗 Linked node_modules from the primary checkout"
  elif [ -f "$WT/package.json" ]; then
    echo "📦 No primary node_modules to link; installing in the worktree…"
    ( cd "$WT" && { pnpm install --frozen-lockfile --prefer-offline         || npm ci || npm install; } ) >/dev/null 2>&1       || echo "⚠️  dependency install failed in the worktree — /tdd and acceptance will fail with 127 until deps are present" >&2
  fi
fi
mkdir -p "$WT/.planning/ralph-sessions" "$WT/.planning/acceptance"

rc=0
( cd "$WT" && RALPH_WORKER_ID="$WORKER_ID" ./ralph-local.sh "$ISSUE" ${PASS_ARGS[@]+"${PASS_ARGS[@]}"} ) || rc=$?

echo ""
echo "── Isolated run finished (exit ${rc}) ──"
echo "   Worktree kept for inspection: $WT"
echo "   Session logs:                 $WT/.planning/ralph-sessions/"
echo "   Resume in place:              ./ralph-isolated.sh ${ISSUE} --resume"
echo "   Clean up when done:           git worktree remove --force '$WT'"
exit "$rc"
