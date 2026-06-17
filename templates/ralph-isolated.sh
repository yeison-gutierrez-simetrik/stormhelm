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
# Env knobs (engine knobs — RALPH_MODEL, RALPH_FALLBACK_MODEL, … — pass
# through to ralph-local.sh; see its header):
#   RALPH_WORKTREE_INSTALL_CMD  dependency-install command for a workspace
#                               monorepo worktree (cwd = the worktree);
#                               default: pnpm install → npm ci → npm install
#                               (FU-85)
#   RALPH_NOSLEEP               background no-sleep guard so a host idle sleep
#                               can't wedge a call (FU-98): 'auto' (default —
#                               caffeinate on macOS / systemd-inhibit on Linux),
#                               a custom HOLD-command (held in the background for
#                               the run), or 'off' to disable. The guard is
#                               decoupled — if it fails to start, the run still
#                               proceeds (unguarded), never wedged by the guard.
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
RESUME_FLAG=()   # FOLLOW-UP 77: set to (--resumed) on the resume path
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
  # FOLLOW-UP 76: refresh the worktree's engine scripts from the primary
  # checkout BEFORE resuming. The worktree was created with copies at launch;
  # a mid-campaign engine re-sync (a fix landing in the primary) would
  # otherwise NOT reach an in-flight issue — a FIXED bug re-bit a resume
  # because the worktree still ran the OLD engine. Same posture as FU-69's
  # node_modules link.
  REFRESHED=""
  for f in ralph-local.sh ralph-lib.sh ralph-blocked-comment.md.tmpl; do
    if [ -f "$ROOT/$f" ] && ! cmp -s "$ROOT/$f" "$WT/$f" 2>/dev/null; then
      cp "$ROOT/$f" "$WT/$f"
      REFRESHED="${REFRESHED}${REFRESHED:+ }$f"
    fi
  done
  if [ -n "$REFRESHED" ]; then
    echo "♻️  Refreshed stale engine scripts from the primary checkout: $REFRESHED"
  fi
  # FOLLOW-UP 77: Ralph removed `ralph-ready` when it claimed the issue
  # (correct — prevents double-pickup), so the §63 pre-flight would block
  # every resume without a manual re-label. Tell ralph-local this is a
  # re-entry (the issue was validated on its first launch) so it bypasses the
  # ralph-ready existence check only — scenarios/budget checks still run.
  RESUME_FLAG=(--resumed)
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
#
# FOLLOW-UP 85 — EXCEPT in a workspace monorepo. There the symlink resolves
# every workspace package through the PRIMARY checkout — i.e. to main's code,
# not the branch under test: a slice that adds a CLI command sees the STALE
# @scope/cli, its CLI acceptance scenario fails locally and passes only in CI
# (live: 4-for-4 slices). An overlay re-link can't fix it (writing through the
# root symlink mutates the PRIMARY's node_modules; a per-entry farm breaks
# pnpm's layout), so a workspace gets a REAL per-worktree install — the same
# semantics as CI's clean checkout, and what pnpm's own git-worktrees guidance
# prescribes. Override the command via RALPH_WORKTREE_INSTALL_CMD (runs with
# cwd = the worktree).
wt_install() {
  if [ -n "${RALPH_WORKTREE_INSTALL_CMD:-}" ]; then
    ( cd "$WT" && bash -c "$RALPH_WORKTREE_INSTALL_CMD" ) >/dev/null 2>&1 \
      || echo "⚠️  RALPH_WORKTREE_INSTALL_CMD failed in the worktree — /tdd and acceptance will fail with 127 until deps are present" >&2
  else
    ( cd "$WT" && { pnpm install --frozen-lockfile --prefer-offline         || npm ci || npm install; } ) >/dev/null 2>&1       || echo "⚠️  dependency install failed in the worktree — /tdd and acceptance will fail with 127 until deps are present" >&2
  fi
}
if [ ! -e "$WT/node_modules" ]; then
  SRC_NM="${ROOT}/node_modules"
  if [ -f "$WT/pnpm-workspace.yaml" ] || grep -q '"workspaces"' "$WT/package.json" 2>/dev/null; then
    echo "📦 Workspace monorepo detected — installing in the worktree (a node_modules symlink would resolve workspace packages to the primary checkout's code, not this branch's)…"
    wt_install
  elif [ -d "$SRC_NM" ]; then
    ln -s "$SRC_NM" "$WT/node_modules"
    echo "🔗 Linked node_modules from the primary checkout"
  elif [ -f "$WT/package.json" ]; then
    echo "📦 No primary node_modules to link; installing in the worktree…"
    wt_install
  fi
fi
mkdir -p "$WT/.planning/ralph-sessions" "$WT/.planning/acceptance"

# FOLLOW-UP 98: a host sleep mid-call wedges the run. The per-call gtimeout
# (FU-92) uses a MONOTONIC timer that is SUSPENDED while the machine sleeps, so
# it never kills a call whose connection died during sleep — the run hangs with
# a frozen session log and no terminal marker (recurred ~4× in one campaign).
# The wall-clock-aware kill is impractical (the loop is blocked inside the
# synchronous call, so no in-process watchdog can run); the fix that fully
# stopped recurrence is to PREVENT idle sleep for the run's duration.
#   - macOS:  caffeinate -ims   (no idle/display/system sleep)
#   - Linux:  systemd-inhibit --what=idle:sleep --why=ralph
# Run the guard DECOUPLED: launch it in the BACKGROUND holding the inhibit, then
# run the loop directly and kill the guard after. Critically, the run never
# DEPENDS on the guard succeeding — a guard that fails to start (no D-Bus session
# on a CI container; a missing tool) must not wedge the very run it protects
# (FU-98 consumer review: a broken systemd-inhibit was killing real runs). On
# failure the run simply proceeds unguarded. Override with RALPH_NOSLEEP: a
# hold-command (run in the background until the loop ends), or 'off' to skip.
NOSLEEP_PID=""
nosleep_start() { "$@" >/dev/null 2>&1 & NOSLEEP_PID=$!; }
case "${RALPH_NOSLEEP:-auto}" in
  off|0|'') : ;;
  auto)
    if command -v caffeinate >/dev/null 2>&1; then
      nosleep_start caffeinate -ims
      echo "☕ no-sleep guard: caffeinate (background pid ${NOSLEEP_PID}; FU-98)"
    elif command -v systemd-inhibit >/dev/null 2>&1; then
      nosleep_start systemd-inhibit --what=idle:sleep --why="ralph #${ISSUE}" sleep infinity
      echo "☕ no-sleep guard: systemd-inhibit (background pid ${NOSLEEP_PID}; FU-98)"
    else
      echo "⚠️  no caffeinate/systemd-inhibit found — a host SLEEP during a call may wedge the run (FU-98). Keep the machine awake, or set RALPH_NOSLEEP to a hold-command." >&2
    fi ;;
  *) nosleep_start bash -c "$RALPH_NOSLEEP"
     echo "☕ no-sleep guard: ${RALPH_NOSLEEP} (background pid ${NOSLEEP_PID}; FU-98)" ;;
esac

rc=0
( cd "$WT" && RALPH_WORKER_ID="$WORKER_ID" ./ralph-local.sh "$ISSUE" ${RESUME_FLAG[@]+"${RESUME_FLAG[@]}"} ${PASS_ARGS[@]+"${PASS_ARGS[@]}"} ) || rc=$?

# Stop the background no-sleep guard (harmless if it never started or already died).
[ -n "$NOSLEEP_PID" ] && kill "$NOSLEEP_PID" 2>/dev/null || true

echo ""
echo "── Isolated run finished (exit ${rc}) ──"
echo "   Worktree kept for inspection: $WT"
echo "   Session logs:                 $WT/.planning/ralph-sessions/"
echo "   Resume in place:              ./ralph-isolated.sh ${ISSUE} --resume"
echo "   Clean up when done:           git worktree remove --force '$WT'"
exit "$rc"
