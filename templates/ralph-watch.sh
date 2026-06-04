#!/bin/bash
# ralph-watch.sh — observability for a running Night Shift session.
#
# Tails the issue's NDJSON session log (§69) and emits one notification per
# iteration outcome plus terminal alerts (completed/blocked/budget), a
# commit-delta per iteration, a silence alert with an ADAPTIVE threshold,
# and an environmental-blocker heuristic. Notifier-agnostic: every message
# goes to stdout, and — if RALPH_NOTIFY_CMD is set — is ALSO piped (stdin)
# to that command. Slack example (webhook URL from .env, never hardcoded):
#
#   export SLACK_WEBHOOK_URL=...   # e.g. via .env
#   export RALPH_NOTIFY_CMD='jq -Rs "{text: .}" | curl -s -X POST -H "Content-type: application/json" --data @- "$SLACK_WEBHOOK_URL"'
#   ./ralph-watch.sh 15
#
# Usage:
#   ./ralph-watch.sh <issue-number> [root-dir]      # live tail (poll loop)
#   RALPH_WATCH_REPLAY=<log> ./ralph-watch.sh <issue-number> [root-dir]
#                                                   # parse one log fully and
#                                                   # exit (tests / post-mortem)
# Tuning (env):
#   RALPH_WATCH_INTERVAL            poll seconds (default 15)
#   RALPH_WATCH_SILENCE_MIN_FIRST   silence threshold before the first
#                                   completed iteration (default 45 — first
#                                   iterations are structurally the heaviest;
#                                   a fixed 25 false-alerted live on a healthy
#                                   36-minute first iteration, FOLLOW-UP 37b)
#   RALPH_WATCH_SILENCE_MIN         floor afterwards (default 25); effective
#                                   threshold = max(floor, 1.5 × longest
#                                   completed iteration)
#
# Lessons pinned from the consumer prototype (FOLLOW-UPs 32 + 37 — all hit live):
#   1. Rebind to the NEWEST session log on every tick: a relaunch creates a
#      new log, and the OLD log's session.ended would fire a false terminal
#      alert for the new run.
#   2. Blocked detection is NDJSON session.ended-FIRST — labels can be
#      missing entirely (FOLLOW-UP 30a), the log is the truth.
#   3. Never index `gh pr list` output with .[0]: on an empty list it
#      renders "null null" → a false PR-opened alert. Emit per-row and
#      head -1 instead.
#   4. The webhook/notifier config lives in the consumer's .env, surfaced
#      via RALPH_NOTIFY_CMD — the watcher itself is integration-agnostic.
#   5. Commit-delta: compute against the head captured at the PREVIOUS poll
#      and update it only AFTER computing (the prototype reported "0 new
#      commits" for an iteration that produced one — head captured at
#      watcher start / wrong update ordering, FOLLOW-UP 37c).
#
# Graduated from the belong-marketplace consumer prototype (FOLLOW-UP 32).

set -euo pipefail

ISSUE="${1:?usage: ./ralph-watch.sh <issue-number> [root-dir]}"
ROOT="${2:-.}"
INTERVAL="${RALPH_WATCH_INTERVAL:-15}"
REPLAY="${RALPH_WATCH_REPLAY:-}"

notify() {
  local msg="$1"
  echo "[watch #${ISSUE}] $msg"
  if [ -n "${RALPH_NOTIFY_CMD:-}" ]; then
    printf '%s' "$msg" | eval "$RALPH_NOTIFY_CMD" >/dev/null 2>&1 \
      || echo "[watch #${ISSUE}] (notify command failed)" >&2
  fi
}

newest_log() {
  ls -t "${ROOT}/.planning/ralph-sessions/${ISSUE}-"*.log 2>/dev/null | head -1
}

# Heuristic state: ≥2 consecutive acceptance-failing iterations with the same
# reason prefix usually means the ENVIRONMENT is broken (Docker down, missing
# secret) — no code edit will fix it; wake a human instead of burning budget.
CONSEC_FAILS=0
LAST_REASON=""
ENV_WARNED=0

# Silence/duration state (FOLLOW-UP 37b). Durations come from the EVENT
# timestamps (works in replay too); the silence clock from the log's mtime.
ITER_STARTED_EPOCH=""
LONGEST_ITER_S=0
SILENCE_WARNED=0

# Commit-delta state (FOLLOW-UP 37c).
WATCH_LAST_HEAD=""

evt_epoch() {  # ISO timestamp of an NDJSON line → epoch (jq, portable)
  printf '%s' "$1" | jq -r '.timestamp | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601' 2>/dev/null || echo ""
}

silence_threshold_min() {
  if [ "$LONGEST_ITER_S" -eq 0 ]; then
    echo "${RALPH_WATCH_SILENCE_MIN_FIRST:-45}"
  else
    local floor="${RALPH_WATCH_SILENCE_MIN:-25}"
    local adaptive=$(( LONGEST_ITER_S * 3 / 2 / 60 + 1 ))
    if [ "$adaptive" -gt "$floor" ]; then echo "$adaptive"; else echo "$floor"; fi
  fi
}

ralph_watch_branch() {
  git -C "$ROOT" for-each-ref 'refs/heads/agent/*' --format='%(refname:short)' 2>/dev/null \
    | grep -E -- "-${ISSUE}\$" | head -1
}

# commit_delta <branch> <prev_head> → "<new_head> <count_since_prev>"
# Lesson 5: PREV..NEW orientation, prev updated by the CALLER after reading.
ralph_watch_commit_delta() {
  local branch="$1" prev="${2:-}"
  local head
  head=$(git -C "$ROOT" rev-parse "$branch" 2>/dev/null) || { echo " 0"; return 0; }
  local count=0
  if [ -n "$prev" ] && [ "$prev" != "$head" ]; then
    count=$(git -C "$ROOT" rev-list --count "${prev}..${head}" 2>/dev/null || echo 0)
  fi
  echo "$head $count"
}

# Test hook: RALPH_WATCH_CALL='<fn> <args…>' runs one helper and exits —
# lets node:test pin the delta orientation and threshold math directly.
if [ -n "${RALPH_WATCH_CALL:-}" ]; then
  eval "$RALPH_WATCH_CALL"
  exit $?
fi

pr_line_for_issue() {
  # Lesson 3: per-row emit + head -1; an empty list yields an empty string,
  # never "null null".
  gh pr list --search "#${ISSUE} in:title" --json title,url \
    --jq '.[] | "\(.title) → \(.url)"' 2>/dev/null | head -1
}

process_line() {
  local line="$1"
  local event outcome reason status iter cumulative
  event=$(printf '%s' "$line" | jq -r '.event // empty' 2>/dev/null) || return 0
  case "$event" in
    ralph.session.started)
      notify "session started ($(printf '%s' "$line" | jq -r '.sessionId'))"
      CONSEC_FAILS=0; LAST_REASON=""; ENV_WARNED=0
      ITER_STARTED_EPOCH=""; LONGEST_ITER_S=0
      ;;
    ralph.iteration.started)
      ITER_STARTED_EPOCH=$(evt_epoch "$line")
      ;;
    ralph.call.completed)
      # Per-call breakdown (FOLLOW-UP 38c) — surfaced, not just logged.
      notify "  call $(printf '%s' "$line" | jq -r '"\(.details.call): \(.details.tokens) tokens, \(.details.duration_s)s"')"
      ;;
    ralph.iteration.completed)
      iter=$(printf '%s' "$line" | jq -r '.iteration')
      outcome=$(printf '%s' "$line" | jq -r '.details.outcome // "?"')
      reason=$(printf '%s' "$line" | jq -r '.details.reason // empty')
      cumulative=$(printf '%s' "$line" | jq -r '.tokensConsumedCumulative // 0')
      # Iteration duration → adaptive silence threshold (FOLLOW-UP 37b).
      local now_e; now_e=$(evt_epoch "$line")
      if [ -n "$ITER_STARTED_EPOCH" ] && [ -n "$now_e" ]; then
        local dur=$(( now_e - ITER_STARTED_EPOCH ))
        [ "$dur" -gt "$LONGEST_ITER_S" ] && LONGEST_ITER_S=$dur
      fi
      # Commit delta (FOLLOW-UP 37c) — live mode only (replay has no repo).
      local commits_info=""
      if [ -z "$REPLAY" ]; then
        local branch; branch=$(ralph_watch_branch || true)
        if [ -n "$branch" ]; then
          local res; res=$(ralph_watch_commit_delta "$branch" "$WATCH_LAST_HEAD")
          WATCH_LAST_HEAD="${res%% *}"        # update AFTER computing (lesson 5)
          commits_info=" — commits +${res##* }"
        fi
      fi
      notify "iteration ${iter}: ${outcome}${reason:+ (${reason})} — tokens ${cumulative}${commits_info}"
      if [ "$outcome" = "acceptance-failing" ]; then
        local prefix="${reason%% *}"
        if [ -n "$prefix" ] && [ "$prefix" = "$LAST_REASON" ]; then
          CONSEC_FAILS=$((CONSEC_FAILS + 1))
        else
          CONSEC_FAILS=1
        fi
        LAST_REASON="$prefix"
        if [ "$CONSEC_FAILS" -ge 2 ] && [ "$ENV_WARNED" -eq 0 ]; then
          ENV_WARNED=1
          notify "⚠️ possible ENVIRONMENTAL blocker: ${CONSEC_FAILS} consecutive failures with the same reason (${prefix}) — check Docker/secrets; code edits won't fix this"
        fi
      else
        CONSEC_FAILS=0; LAST_REASON=""
      fi
      ;;
    ralph.preflight.failed)
      notify "❌ environment pre-flight failed: $(printf '%s' "$line" | jq -r '.details.reason // "?"')"
      ;;
    ralph.budget.exceeded)
      notify "💸 budget exceeded: $(printf '%s' "$line" | jq -r '"\(.details.cumulative)/\(.details.budget)"')"
      ;;
    ralph.session.ended)
      # Lesson 2: this event is the terminal truth — not the labels.
      status=$(printf '%s' "$line" | jq -r '.details.status // "?"')
      reason=$(printf '%s' "$line" | jq -r '.details.reason // empty')
      if [ "$status" = "completed" ]; then
        local pr
        pr=$(pr_line_for_issue || true)
        if [ -n "$pr" ]; then
          notify "✅ session COMPLETED — PR: ${pr}"
        else
          notify "✅ session COMPLETED — no PR found yet (check the repo)"
        fi
      else
        notify "🛑 session ended: ${status}${reason:+ (${reason})}"
      fi
      return 10   # terminal
      ;;
  esac
  return 0
}

process_log_from() {
  # Reads $1 starting at line-offset $2 (1-based); echoes the new offset on
  # FD 3 semantics via global; returns 10 when a terminal event was seen.
  local log="$1"
  local from="$2"
  local rc=0 line
  local n=0
  while IFS= read -r line; do
    n=$((n + 1))
    [ "$n" -lt "$from" ] && continue
    process_line "$line" || { rc=$?; [ "$rc" -eq 10 ] && OFFSET=$((n + 1)) && return 10; }
    OFFSET=$((n + 1))
  done < "$log"
  return 0
}

log_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0
}

if [ -n "$REPLAY" ]; then
  OFFSET=1
  process_log_from "$REPLAY" 1 || true
  if [ -n "${RALPH_WATCH_PRINT_THRESHOLD:-}" ]; then
    echo "threshold_min=$(silence_threshold_min)"
  fi
  exit 0
fi

CURRENT_LOG=""
OFFSET=1
notify "watching issue #${ISSUE} (poll ${INTERVAL}s)"
while true; do
  LOG=$(newest_log || true)
  if [ -n "$LOG" ] && [ "$LOG" != "$CURRENT_LOG" ]; then
    # Lesson 1: a newer log means a relaunch — bind to it and reset state.
    [ -n "$CURRENT_LOG" ] && notify "rebound to new session log: $(basename "$LOG")"
    CURRENT_LOG="$LOG"
    OFFSET=1
    CONSEC_FAILS=0; LAST_REASON=""; ENV_WARNED=0; SILENCE_WARNED=0
    ITER_STARTED_EPOCH=""; LONGEST_ITER_S=0
    # Baseline the commit delta at bind time so iteration 1's delta counts
    # only what the SESSION produced (lesson 5).
    B=$(ralph_watch_branch || true)
    WATCH_LAST_HEAD=""
    [ -n "$B" ] && WATCH_LAST_HEAD=$(git -C "$ROOT" rev-parse "$B" 2>/dev/null || echo "")
  fi
  if [ -n "$CURRENT_LOG" ]; then
    if process_log_from "$CURRENT_LOG" "$OFFSET"; then : ; else
      rc=$?
      if [ "$rc" -eq 10 ]; then
        # Terminal event in the CURRENT log. A relaunch may still follow;
        # exit here — relaunch monitoring is a fresh ./ralph-watch.sh.
        exit 0
      fi
    fi
    # Silence alert (FOLLOW-UP 37b): no new NDJSON for longer than the
    # adaptive threshold → warn ONCE (reset when the log moves again).
    M=$(log_mtime "$CURRENT_LOG")
    NOW=$(date +%s)
    SILENCE_S=$(( NOW - M ))
    THRESH_MIN=$(silence_threshold_min)
    if [ "$SILENCE_S" -gt $(( THRESH_MIN * 60 )) ]; then
      if [ "$SILENCE_WARNED" -eq 0 ]; then
        SILENCE_WARNED=1
        notify "⚠️ no session activity for $(( SILENCE_S / 60 )) min (threshold ${THRESH_MIN} min — adaptive) — the session may be stuck; check the worktree"
      fi
    else
      SILENCE_WARNED=0
    fi
  fi
  sleep "$INTERVAL"
done
