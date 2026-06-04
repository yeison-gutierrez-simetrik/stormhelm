#!/bin/bash
# ralph-watch.sh — observability for a running Night Shift session.
#
# Tails the issue's NDJSON session log (§69) and emits one notification per
# iteration outcome plus terminal alerts (completed/blocked/budget), with an
# environmental-blocker heuristic. Notifier-agnostic: every message goes to
# stdout, and — if RALPH_NOTIFY_CMD is set — is ALSO piped (stdin) to that
# command. Slack example (webhook URL from .env, never hardcoded):
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
#
# Lessons pinned from the consumer prototype (FOLLOW-UP 32 — all hit live):
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
      ;;
    ralph.iteration.completed)
      iter=$(printf '%s' "$line" | jq -r '.iteration')
      outcome=$(printf '%s' "$line" | jq -r '.details.outcome // "?"')
      reason=$(printf '%s' "$line" | jq -r '.details.reason // empty')
      cumulative=$(printf '%s' "$line" | jq -r '.tokensConsumedCumulative // 0')
      notify "iteration ${iter}: ${outcome}${reason:+ (${reason})} — tokens ${cumulative}"
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

if [ -n "$REPLAY" ]; then
  OFFSET=1
  process_log_from "$REPLAY" 1 || true
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
    CONSEC_FAILS=0; LAST_REASON=""; ENV_WARNED=0
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
  fi
  sleep "$INTERVAL"
done
