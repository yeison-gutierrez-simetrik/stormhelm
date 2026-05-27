#!/bin/bash
# ralph-lib.sh — shared helpers sourced by ralph-local.sh
#
# Implements:
#   - §69 structured JSON session logs (log_event)
#   - Session lifecycle (init_session / end_session)
#   - Label/field extraction helpers
#
# Dependencies:
#   - jq (NDJSON validation, label parsing)
#   - gh (GitHub CLI for issue queries)
#   - date (GNU or BSD; uses portable formatting)
#
# Conventions:
#   - All functions prefixed `ralph_` to avoid collisions
#   - All log events follow §69 schema: timestamp, level, event, sessionId,
#     workerId, issueNumber, iteration, tokensConsumedDelta,
#     tokensConsumedCumulative, details
#   - Pure shell + jq; no Python, no Node, no external languages

# Guard against double-sourcing
if [ -n "${_RALPH_LIB_LOADED:-}" ]; then
  return 0
fi
_RALPH_LIB_LOADED=1

# ──────────────────────────────────────────────────────────────────────
# Session state (set by init_session, read by log_event)
# ──────────────────────────────────────────────────────────────────────

RALPH_SESSION_ID=""
RALPH_SESSION_LOG=""
RALPH_WORKER_ID="${RALPH_WORKER_ID:-w1}"
RALPH_ISSUE_NUMBER=""
RALPH_ITERATION=0
RALPH_TOKENS_CUMULATIVE=0

# ──────────────────────────────────────────────────────────────────────
# init_session <issue_number>
#
# Creates the session log file under .planning/ralph-sessions/ and
# emits ralph.session.started. Idempotent: safe to call multiple times
# in the same shell (later calls reset state for a new issue).
# ──────────────────────────────────────────────────────────────────────
ralph_init_session() {
  local issue="${1:?ralph_init_session requires <issue_number>}"
  local timestamp
  timestamp=$(date -u +"%Y%m%d-%H%M%S")

  RALPH_ISSUE_NUMBER="$issue"
  RALPH_SESSION_ID="ralph-${timestamp}-${RALPH_WORKER_ID}"
  RALPH_ITERATION=0
  RALPH_TOKENS_CUMULATIVE=0

  mkdir -p .planning/ralph-sessions
  RALPH_SESSION_LOG=".planning/ralph-sessions/${issue}-${timestamp}.log"

  # Touch the file so subsequent log_event appends succeed even on first call
  : > "$RALPH_SESSION_LOG"

  ralph_log_event "info" "ralph.session.started" \
    "{\"script_version\":\"1.0\",\"working_dir\":\"$(pwd)\"}"
}

# ──────────────────────────────────────────────────────────────────────
# end_session <status> [reason]
#
# Emits ralph.session.ended with terminal status. Valid statuses:
#   completed | blocked | budget_exceeded | rate_limit_exhausted
# ──────────────────────────────────────────────────────────────────────
ralph_end_session() {
  local status="${1:?ralph_end_session requires <status>}"
  local reason="${2:-}"

  local details
  if [ -n "$reason" ]; then
    details="{\"status\":\"${status}\",\"reason\":$(ralph_json_string "$reason"),\"iterations_completed\":${RALPH_ITERATION}}"
  else
    details="{\"status\":\"${status}\",\"iterations_completed\":${RALPH_ITERATION}}"
  fi

  ralph_log_event "info" "ralph.session.ended" "$details"
}

# ──────────────────────────────────────────────────────────────────────
# log_event <level> <event> [details_json]
#
# Appends one NDJSON line to the session log. `details_json` must be a
# valid JSON object string (e.g., '{"foo":"bar"}'); pass '{}' or omit
# if there are no details.
#
# Schema (§69):
#   {
#     "timestamp": "2026-05-20T19:45:12.034Z",
#     "level": "info|warn|error",
#     "event": "ralph.iteration.started",
#     "sessionId": "ralph-20260520-194512-w1",
#     "workerId": "w1",
#     "issueNumber": 42,
#     "iteration": 7,
#     "tokensConsumedDelta": 0,
#     "tokensConsumedCumulative": 28734,
#     "details": { ... }
#   }
#
# If the session log is not initialized (RALPH_SESSION_LOG is empty),
# the function writes a warning to stderr and returns — it never blocks
# the caller. This makes the helper safe to invoke before init_session
# without crashing the script.
# ──────────────────────────────────────────────────────────────────────
ralph_log_event() {
  local level="${1:?ralph_log_event requires <level>}"
  local event="${2:?ralph_log_event requires <event>}"
  local details="${3:-{\}}"

  if [ -z "$RALPH_SESSION_LOG" ]; then
    echo "ralph_log_event: session not initialized; event '${event}' dropped" >&2
    return 0
  fi

  # ISO-8601 UTC with millisecond precision when GNU date is available,
  # otherwise second precision (BSD date on macOS).
  local timestamp
  if timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ" 2>/dev/null) && [[ "$timestamp" != *"%3N"* ]]; then
    : # GNU date succeeded
  else
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  fi

  # Build the line via jq for robust escaping.
  # If jq fails (e.g., malformed `details`), fall back to a plain JSON
  # line so we never silently drop an event.
  local line
  if line=$(jq -c -n \
      --arg ts "$timestamp" \
      --arg level "$level" \
      --arg event "$event" \
      --arg session "$RALPH_SESSION_ID" \
      --arg worker "$RALPH_WORKER_ID" \
      --argjson issue "${RALPH_ISSUE_NUMBER:-0}" \
      --argjson iter "$RALPH_ITERATION" \
      --argjson cumulative "$RALPH_TOKENS_CUMULATIVE" \
      --argjson details "$details" \
      '{
        timestamp: $ts,
        level: $level,
        event: $event,
        sessionId: $session,
        workerId: $worker,
        issueNumber: $issue,
        iteration: $iter,
        tokensConsumedDelta: 0,
        tokensConsumedCumulative: $cumulative,
        details: $details
      }' 2>/dev/null); then
    echo "$line" >> "$RALPH_SESSION_LOG"
  else
    # Fallback: emit a line marking the malformed details so we have an audit trail.
    printf '{"timestamp":"%s","level":"%s","event":"%s","sessionId":"%s","workerId":"%s","issueNumber":%s,"iteration":%d,"tokensConsumedDelta":0,"tokensConsumedCumulative":%d,"details":{"_malformed":true}}\n' \
      "$timestamp" "$level" "$event" "$RALPH_SESSION_ID" "$RALPH_WORKER_ID" \
      "${RALPH_ISSUE_NUMBER:-0}" "$RALPH_ITERATION" "$RALPH_TOKENS_CUMULATIVE" \
      >> "$RALPH_SESSION_LOG"
  fi
}

# ──────────────────────────────────────────────────────────────────────
# iteration_start / iteration_end
#
# Convenience wrappers that increment RALPH_ITERATION and emit the
# canonical start/end events.
# ──────────────────────────────────────────────────────────────────────
ralph_iteration_start() {
  RALPH_ITERATION=$((RALPH_ITERATION + 1))
  ralph_log_event "info" "ralph.iteration.started" \
    "{\"action\":\"${1:-tdd}\"}"
}

ralph_iteration_end() {
  local outcome="${1:-unknown}"
  ralph_log_event "info" "ralph.iteration.completed" \
    "{\"outcome\":$(ralph_json_string "$outcome")}"
}

# ──────────────────────────────────────────────────────────────────────
# scenario_passed / scenario_failed
# ──────────────────────────────────────────────────────────────────────
ralph_scenario_passed() {
  local scn="${1:?ralph_scenario_passed requires <scn-id>}"
  ralph_log_event "info" "ralph.scenario.passed" \
    "{\"scenario\":$(ralph_json_string "$scn")}"
}

ralph_scenario_failed() {
  local scn="${1:?ralph_scenario_failed requires <scn-id>}"
  local reason="${2:-}"
  ralph_log_event "warn" "ralph.scenario.failed" \
    "{\"scenario\":$(ralph_json_string "$scn"),\"reason\":$(ralph_json_string "$reason")}"
}

# ──────────────────────────────────────────────────────────────────────
# git_action <action> <status> [command]
#
# Emit a ralph.git.action event. Used by both the script itself
# (recording its own git operations) and indirectly by the
# git-guardrails hook output if the script catches the exit code.
# ──────────────────────────────────────────────────────────────────────
ralph_git_action() {
  local action="${1:?ralph_git_action requires <action>}"
  local status="${2:?ralph_git_action requires <status>}"
  local command="${3:-}"
  ralph_log_event "info" "ralph.git.action" \
    "{\"action\":$(ralph_json_string "$action"),\"status\":$(ralph_json_string "$status"),\"command\":$(ralph_json_string "$command")}"
}

# ──────────────────────────────────────────────────────────────────────
# budget_checkpoint
#
# Emit a budget snapshot. Call every N iterations (caller decides).
# Caller supplies the cumulative token count; the helper just records.
# ──────────────────────────────────────────────────────────────────────
ralph_budget_checkpoint() {
  local cumulative="${1:?ralph_budget_checkpoint requires <cumulative_tokens>}"
  local budget="${2:-0}"
  RALPH_TOKENS_CUMULATIVE="$cumulative"
  ralph_log_event "info" "ralph.budget.checkpoint" \
    "{\"cumulative\":${cumulative},\"budget\":${budget}}"
}

# ──────────────────────────────────────────────────────────────────────
# error_tool <tool> <message>
# ──────────────────────────────────────────────────────────────────────
ralph_error_tool() {
  local tool="${1:?ralph_error_tool requires <tool>}"
  local message="${2:?ralph_error_tool requires <message>}"
  ralph_log_event "error" "ralph.error.tool" \
    "{\"tool\":$(ralph_json_string "$tool"),\"message\":$(ralph_json_string "$message")}"
}

# ──────────────────────────────────────────────────────────────────────
# json_string <text>
#
# Escape a shell string as a JSON string literal (with surrounding
# quotes). Uses jq for correctness. Used internally by all event
# helpers; exposed for callers that need to embed strings in custom
# `details` payloads.
# ──────────────────────────────────────────────────────────────────────
ralph_json_string() {
  local input="${1:-}"
  jq -Rn --arg s "$input" '$s' 2>/dev/null || printf '"%s"' "${input//\"/\\\"}"
}

# ──────────────────────────────────────────────────────────────────────
# reviewer_severity <reviewer_output_text>
#
# Classify the reviewer agent's output into one of:
#   blocking    — has any 🛑 marker or "BLOCKED:" line → must retry /tdd
#   should-fix  — has any ⚠️ marker or "SHOULD FIX:" line → embed in PR, human decides
#   suggestion  — only 💡 markers — proceed to PR
#   clean       — no findings at all
#
# Conventions match the reviewer agent (agents/reviewer.md):
# - 🛑 / "BLOCKED:" → blocking finding (must fix before merge)
# - ⚠️ / "SHOULD FIX:" → significant but not blocking
# - 💡 / "SUGGESTION:" → suggestion / nit
# ──────────────────────────────────────────────────────────────────────
ralph_reviewer_severity() {
  local output="${1:-}"
  if [ -z "$output" ]; then
    echo "clean"
    return 0
  fi
  if echo "$output" | grep -qE "🛑|^BLOCKED:|^\s*BLOCKING:"; then
    echo "blocking"
  elif echo "$output" | grep -qE "⚠️|^SHOULD FIX:|^\s*WARNING:"; then
    echo "should-fix"
  elif echo "$output" | grep -qE "💡|^SUGGESTION:"; then
    echo "suggestion"
  else
    echo "clean"
  fi
}

# ──────────────────────────────────────────────────────────────────────
# format_reviewer_section <reviewer_output_text> <severity>
#
# Produce the "Reviewer report" markdown section that goes into the
# PR body. Trims excessive whitespace and wraps in a collapsible
# <details> block if the report is long (>30 lines).
# ──────────────────────────────────────────────────────────────────────
ralph_format_reviewer_section() {
  local output="${1:-}"
  local severity="${2:-unknown}"
  local line_count
  line_count=$(printf '%s\n' "$output" | wc -l | tr -d ' ')

  echo "## Reviewer report"
  echo ""
  echo "**Severity:** ${severity}"
  echo ""
  if [ "$line_count" -gt 30 ]; then
    echo "<details><summary>Full report (${line_count} lines) — click to expand</summary>"
    echo ""
    echo '```'
    printf '%s\n' "$output"
    echo '```'
    echo ""
    echo "</details>"
  else
    echo '```'
    printf '%s\n' "$output"
    echo '```'
  fi
}

# ──────────────────────────────────────────────────────────────────────
# read_label_value <labels_newline_separated> <prefix>
#
# Given a newline-separated list of labels from `gh issue view`, return
# the suffix of the first label whose name starts with `<prefix>`.
# Example: read_label_value "$LABELS" "budget:" → "50k"
# ──────────────────────────────────────────────────────────────────────
ralph_read_label_value() {
  local labels="${1:-}"
  local prefix="${2:?ralph_read_label_value requires <prefix>}"
  echo "$labels" | grep -E "^${prefix}" | head -1 | sed "s/^${prefix}//"
}

# ──────────────────────────────────────────────────────────────────────
# has_label <labels_newline_separated> <name>
#
# Return 0 if `<name>` appears in the label list, 1 otherwise.
# ──────────────────────────────────────────────────────────────────────
ralph_has_label() {
  local labels="${1:-}"
  local name="${2:?ralph_has_label requires <name>}"
  echo "$labels" | grep -qE "^${name}$"
}

# ──────────────────────────────────────────────────────────────────────
# extract_last_actions <log_file> [count]
#
# Read the session log and pretty-print the last N `details.action` /
# `event` / `outcome` lines from iteration events. Used to build the
# "Last actions taken" section of the ralph-blocked comment.
# Default count: 5.
# ──────────────────────────────────────────────────────────────────────
ralph_extract_last_actions() {
  local log="${1:?ralph_extract_last_actions requires <log_file>}"
  local count="${2:-5}"

  if [ ! -f "$log" ]; then
    echo "_(no session log found at ${log})_"
    return 0
  fi

  # Take the last N events that have a meaningful 'event' field
  # excluding session boundary events (session.started / session.ended).
  jq -c 'select(.event | test("ralph\\.(iteration|scenario|reviewer|git|error|api|budget)\\."))' "$log" 2>/dev/null \
    | tail -n "$count" \
    | jq -r '"- **\(.timestamp | sub("T"; " ") | sub("\\..*Z$"; "Z"))** — `\(.event)` — \(.details | tostring)"' 2>/dev/null \
    || echo "_(log parse failed; see file directly)_"
}

# ──────────────────────────────────────────────────────────────────────
# summarize_scenarios <log_file> <expected_scenarios>
#
# Build a markdown bullet list reporting which scenarios passed,
# which failed, and which were never attempted.
# `expected_scenarios` is a comma-separated list (matches the
# scenarios:scn-* label value).
# ──────────────────────────────────────────────────────────────────────
ralph_summarize_scenarios() {
  local log="${1:?ralph_summarize_scenarios requires <log_file>}"
  local expected="${2:-}"

  if [ ! -f "$log" ]; then
    echo "_(no session log)_"
    return 0
  fi

  local passed failed
  passed=$(jq -r 'select(.event == "ralph.scenario.passed") | .details.scenario' "$log" 2>/dev/null | sort -u)
  failed=$(jq -r 'select(.event == "ralph.scenario.failed") | .details.scenario' "$log" 2>/dev/null | sort -u)

  for scn in $(echo "$expected" | tr ',' ' '); do
    if echo "$passed" | grep -qx "$scn"; then
      echo "- ✅ \`${scn}\` — passed"
    elif echo "$failed" | grep -qx "$scn"; then
      echo "- 🛑 \`${scn}\` — failed"
    else
      echo "- ⚪ \`${scn}\` — not attempted"
    fi
  done
}

# ──────────────────────────────────────────────────────────────────────
# render_blocked_comment <template_file> <substitution_vars...>
#
# Substitute {placeholder} tokens in the template with provided values.
# Usage:
#   ralph_render_blocked_comment template.md \
#     issue_number 42 \
#     iterations 15 \
#     reason "max-iterations exhausted" \
#     branch "agent/feature-foo-42" \
#     session_log ".planning/ralph-sessions/42-xxx.log" \
#     scenario_results "..." \
#     last_actions "..." \
#     reviewer_section "..."
# ──────────────────────────────────────────────────────────────────────
ralph_render_blocked_comment() {
  local template="${1:?ralph_render_blocked_comment requires <template>}"
  shift

  if [ ! -f "$template" ]; then
    echo "ralph_render_blocked_comment: template not found: $template" >&2
    return 1
  fi

  local content
  content=$(cat "$template")

  # Process key/value pairs from remaining args
  while [ "$#" -gt 1 ]; do
    local key="$1"
    local value="$2"
    shift 2
    # Use awk for safe literal replacement (no regex interpretation in value)
    content=$(printf '%s' "$content" | awk -v k="{${key}}" -v v="$value" '
      BEGIN { RS="\0"; ORS="" }
      {
        s = $0
        n = index(s, k)
        while (n > 0) {
          before = substr(s, 1, n - 1)
          after = substr(s, n + length(k))
          s = before v after
          n = index(s, k)
        }
        print s
      }
    ')
  done

  printf '%s\n' "$content"
}

# ──────────────────────────────────────────────────────────────────────
# block_issue <issue_number> <reason> <branch> <log> <scenarios> <reviewer_section> <template_path>
#
# Apply `ralph-blocked`, remove `ralph-ready`, post a structured
# comment, log the event. The branch is preserved (caller must not
# delete it). Idempotent: if `ralph-blocked` is already present, only
# the comment is posted.
# ──────────────────────────────────────────────────────────────────────
ralph_block_issue() {
  local issue="${1:?ralph_block_issue requires <issue>}"
  local reason="${2:?ralph_block_issue requires <reason>}"
  local branch="${3:?ralph_block_issue requires <branch>}"
  local log="${4:?ralph_block_issue requires <log>}"
  local scenarios="${5:-}"
  local reviewer_section="${6:-_No reviewer report._}"
  local template="${7:?ralph_block_issue requires <template_path>}"

  local scenario_results last_actions comment

  scenario_results=$(ralph_summarize_scenarios "$log" "$scenarios")
  last_actions=$(ralph_extract_last_actions "$log" 5)

  comment=$(ralph_render_blocked_comment "$template" \
    issue_number "$issue" \
    iterations "$RALPH_ITERATION" \
    reason "$reason" \
    branch "$branch" \
    session_log "$log" \
    scenario_results "$scenario_results" \
    last_actions "$last_actions" \
    reviewer_section "$reviewer_section")

  # Apply / remove labels (idempotent: gh edit ignores already-present / already-absent)
  gh issue edit "$issue" --add-label "ralph-blocked" --remove-label "ralph-ready" 2>/dev/null || true

  # Post the structured comment
  gh issue comment "$issue" --body "$comment"

  ralph_log_event "warn" "ralph.issue.blocked" \
    "{\"reason\":$(ralph_json_string "$reason"),\"branch\":$(ralph_json_string "$branch")}"
}

# Public function aliases without prefix for ergonomic use inside the
# main script (caller can choose). Sourcing scripts can prefer the
# prefixed forms to avoid collisions with their own helpers.
log_event() { ralph_log_event "$@"; }
init_session() { ralph_init_session "$@"; }
end_session() { ralph_end_session "$@"; }
iteration_start() { ralph_iteration_start "$@"; }
iteration_end() { ralph_iteration_end "$@"; }
scenario_passed() { ralph_scenario_passed "$@"; }
scenario_failed() { ralph_scenario_failed "$@"; }
git_action() { ralph_git_action "$@"; }
budget_checkpoint() { ralph_budget_checkpoint "$@"; }
error_tool() { ralph_error_tool "$@"; }
json_string() { ralph_json_string "$@"; }
read_label_value() { ralph_read_label_value "$@"; }
has_label() { ralph_has_label "$@"; }
reviewer_severity() { ralph_reviewer_severity "$@"; }
format_reviewer_section() { ralph_format_reviewer_section "$@"; }
extract_last_actions() { ralph_extract_last_actions "$@"; }
summarize_scenarios() { ralph_summarize_scenarios "$@"; }
render_blocked_comment() { ralph_render_blocked_comment "$@"; }
block_issue() { ralph_block_issue "$@"; }
