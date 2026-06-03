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
RALPH_TOKENS_DELTA=0
# Per-call token ledger. ralph_call_claude_with_retry runs inside $(…)
# command substitutions — a SUBSHELL — so any global it sets dies with
# the subshell and the parent's cumulative would stay 0 forever. The
# function appends each call's tokens to this file instead; the parent
# syncs from it (ralph_sync_tokens) before every budget decision.
RALPH_TOKENS_FILE=""

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
  RALPH_TOKENS_FILE=".planning/ralph-sessions/${issue}-${timestamp}.tokens"

  # Touch the files so subsequent appends succeed even on first call
  : > "$RALPH_SESSION_LOG"
  : > "$RALPH_TOKENS_FILE"

  ralph_log_event "info" "ralph.session.started" \
    "{\"script_version\":\"1.0\",\"worker_id\":$(ralph_json_string "${RALPH_WORKER_ID:-w0}"),\"working_dir\":\"$(pwd)\"}"
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
      --argjson delta "${RALPH_TOKENS_DELTA:-0}" \
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
        tokensConsumedDelta: $delta,
        tokensConsumedCumulative: $cumulative,
        details: $details
      }' 2>/dev/null); then
    echo "$line" >> "$RALPH_SESSION_LOG"
  else
    # Fallback: emit a line marking the malformed details so we have an audit trail.
    printf '{"timestamp":"%s","level":"%s","event":"%s","sessionId":"%s","workerId":"%s","issueNumber":%s,"iteration":%d,"tokensConsumedDelta":%d,"tokensConsumedCumulative":%d,"details":{"_malformed":true}}\n' \
      "$timestamp" "$level" "$event" "$RALPH_SESSION_ID" "$RALPH_WORKER_ID" \
      "${RALPH_ISSUE_NUMBER:-0}" "$RALPH_ITERATION" "${RALPH_TOKENS_DELTA:-0}" "$RALPH_TOKENS_CUMULATIVE" \
      >> "$RALPH_SESSION_LOG"
  fi
  # The delta is consumed by exactly one event (the first one after the
  # sync that produced it); later events report delta 0 until a new call.
  RALPH_TOKENS_DELTA=0
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
  local reason="${2:-}"
  if [ -n "$reason" ]; then
    ralph_log_event "info" "ralph.iteration.completed" \
      "{\"outcome\":$(ralph_json_string "$outcome"),\"reason\":$(ralph_json_string "$reason")}"
  else
    ralph_log_event "info" "ralph.iteration.completed" \
      "{\"outcome\":$(ralph_json_string "$outcome")}"
  fi
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
# env_preflight
#
# Validate the EXECUTION ENVIRONMENT before iteration 1: a down Docker
# daemon or placeholder secrets fail every iteration identically — no
# code edit can fix them, so burning iterations on them is pure waste
# (live: ~25 min / 3 iterations on a stopped daemon, fixed in seconds
# once diagnosed).
#
# Checks:
#   1. testcontainers declared (§31 test-real default) → docker daemon
#      must answer. Heuristics: "@testcontainers/ in package.json (TS)
#      or testcontainers in pyproject.toml / requirements*.txt (Python).
#   2. RALPH_PREFLIGHT_CMD (consumer hook point): if set, must exit 0.
#      Stack-specific checks (env-var sentinels, service health) belong
#      there or in the stack capability — not hardcoded here.
#
# Prints an actionable message and returns 1 on the first failure;
# returns 0 (silent) when the environment is ready.
# ──────────────────────────────────────────────────────────────────────
ralph_env_preflight() {
  if grep -qs '"@testcontainers/' package.json \
     || grep -qs 'testcontainers' pyproject.toml requirements.txt requirements-dev.txt 2>/dev/null; then
    if ! docker info >/dev/null 2>&1; then
      echo "❌ Docker daemon not running — the acceptance stack uses testcontainers (§31). Start Docker and relaunch."
      return 1
    fi
  fi
  if [ -n "${RALPH_PREFLIGHT_CMD:-}" ]; then
    if ! eval "$RALPH_PREFLIGHT_CMD" >/dev/null 2>&1; then
      echo "❌ RALPH_PREFLIGHT_CMD failed: ${RALPH_PREFLIGHT_CMD} — fix the environment and relaunch."
      return 1
    fi
  fi
  return 0
}

# ──────────────────────────────────────────────────────────────────────
# file_mtime <path>
#
# Portable mtime-as-epoch (GNU stat on Linux, BSD stat on macOS).
# GNU must be tried FIRST: on GNU, `stat -f %m` does not fail — it is
# "filesystem status" and prints the MOUNT POINT (e.g. "/"), which a
# `-lt` comparison then silently mis-evaluates. BSD errors on `-c`, so
# the fallback chain is safe in this order. The numeric guard catches
# any remaining non-epoch output.
# Prints 0 if the file does not exist or stat fails.
# ──────────────────────────────────────────────────────────────────────
ralph_file_mtime() {
  local f="${1:?ralph_file_mtime requires <path>}"
  local m
  m=$(stat -c %Y "$f" 2>/dev/null) || m=$(stat -f %m "$f" 2>/dev/null) || m=0
  if [[ "$m" =~ ^[0-9]+$ ]]; then
    echo "$m"
  else
    echo 0
  fi
}

# ──────────────────────────────────────────────────────────────────────
# acceptance_result_check <file> <issue> <min_epoch>
#
# The loop's ONLY green signal (§66). /run-acceptance writes a
# machine-readable result file as its MANDATORY last step:
#
#   .planning/acceptance/issue-<N>-result.json
#   { "issue": 14, "exit_code": 0,
#     "scenarios": { "scn-021": "passed", "scn-022": "passed" },
#     "ran": 2, "expected": 2,
#     "gates": { "smoke": "pass", "slice_scenarios": "pass", ... },
#     "failure_reason": null }
#
# This replaces grepping the literal string "exit code: 0" in the LLM
# session's free-text output — a correctness gate must not depend on an
# LLM's phrasing (any wording drift read as failure; certain prose could
# read as a false green).
#
# Checks, in order (each failure prints a machine-greppable reason to
# stdout and returns 1):
#   result-file-missing          — skill never wrote the contract file
#   result-file-invalid-json     — file exists but is not valid JSON
#   result-file-stale            — older than this iteration's start
#   result-file-wrong-issue      — written for another issue
#   ran-below-expected           — scenario filter matched fewer than the
#                                  labels claim (empty-selection false green)
#   exit_code=N: <failure_reason>— the gate itself failed
# Prints "green" and returns 0 only when everything holds.
# ──────────────────────────────────────────────────────────────────────
ralph_acceptance_result_check() {
  local file="${1:?ralph_acceptance_result_check requires <file>}"
  local issue="${2:?ralph_acceptance_result_check requires <issue>}"
  local min_epoch="${3:-0}"

  if [ ! -f "$file" ]; then
    echo "result-file-missing (${file})"
    return 1
  fi
  if ! jq -e . "$file" >/dev/null 2>&1; then
    echo "result-file-invalid-json (${file})"
    return 1
  fi
  local mtime
  mtime=$(ralph_file_mtime "$file")
  if [ "$mtime" -lt "$min_epoch" ]; then
    echo "result-file-stale (mtime ${mtime} < iteration start ${min_epoch})"
    return 1
  fi
  local rissue
  rissue=$(jq -r '.issue // empty' "$file")
  if [ "$rissue" != "$issue" ]; then
    echo "result-file-wrong-issue (got ${rissue:-none}, expected ${issue})"
    return 1
  fi
  # Empty-selection guard: if the skill reports ran/expected, fewer ran
  # than expected means the tag filter is wrong — never a pass, even if
  # exit_code claims 0 (defense in depth vs the ANDed-tags class of bug).
  local ran expected
  ran=$(jq -r '.ran // empty' "$file")
  expected=$(jq -r '.expected // empty' "$file")
  if [[ "$ran" =~ ^[0-9]+$ ]] && [[ "$expected" =~ ^[0-9]+$ ]] && [ "$ran" -lt "$expected" ]; then
    echo "ran-below-expected (${ran} < ${expected})"
    return 1
  fi
  local code
  code=$(jq -r '.exit_code // empty' "$file")
  if [ "$code" = "0" ]; then
    echo "green"
    return 0
  fi
  local reason
  reason=$(jq -r '.failure_reason // "unspecified"' "$file")
  echo "exit_code=${code:-missing}: ${reason}"
  return 1
}

# ──────────────────────────────────────────────────────────────────────
# expand_scns <label_value>
#
# Normalize a scenarios:* label VALUE to space-separated scn-NNN tokens.
# Accepts every form the label takes in the wild: GitHub-compact
# `scn-021+022` (the canonical — 50-char label limit), spelled
# `scn-021+scn-022`, and comma `scn-021,scn-022`.
#   ralph_expand_scns "scn-021+022,scn-030" → "scn-021 scn-022 scn-030"
# ──────────────────────────────────────────────────────────────────────
ralph_expand_scns() {
  local out="" scn
  for scn in $(echo "${1:-}" | tr ',+' ' '); do
    case "$scn" in
      scn-*) : ;;
      *) scn="scn-${scn}" ;;   # compact-form continuation: 022 → scn-022
    esac
    out="${out}${out:+ }${scn}"
  done
  echo "$out"
}

# ──────────────────────────────────────────────────────────────────────
# log_scenarios_from_result <file> <expected_scenarios>
#
# Emit ralph.scenario.passed / ralph.scenario.failed per scenario from
# the result file's scenarios{} map — per-scenario TRUTH, instead of
# blanket-marking every labeled scenario as passed on a green run.
# `expected_scenarios` is the scenarios:* label value (any form —
# see expand_scns). A scenario absent from the map is left un-logged →
# the blocked-comment summary reports it as "not attempted".
# ──────────────────────────────────────────────────────────────────────
ralph_log_scenarios_from_result() {
  local file="${1:?ralph_log_scenarios_from_result requires <file>}"
  local expected="${2:-}"
  local scn status
  for scn in $(ralph_expand_scns "$expected"); do
    status=$(jq -r --arg s "$scn" '.scenarios[$s] // "missing"' "$file" 2>/dev/null || echo "missing")
    case "$status" in
      passed) ralph_scenario_passed "$scn" ;;
      missing) : ;;
      *) ralph_scenario_failed "$scn" "$status" ;;
    esac
  done
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
# parse_budget_label <budget_label_value>
#
# Convert a budget label like "50k", "120k", "200k", or a raw number
# "50000" into an integer token count. Returns 0 on parse failure.
# ──────────────────────────────────────────────────────────────────────
ralph_parse_budget_label() {
  local raw="${1:-}"
  if [[ "$raw" =~ ^([0-9]+)[kK]$ ]]; then
    echo $(( ${BASH_REMATCH[1]} * 1000 ))
  elif [[ "$raw" =~ ^([0-9]+)[mM]$ ]]; then
    echo $(( ${BASH_REMATCH[1]} * 1000000 ))
  elif [[ "$raw" =~ ^[0-9]+$ ]]; then
    echo "$raw"
  else
    echo 0
  fi
}

# ──────────────────────────────────────────────────────────────────────
# extract_tokens_from_output <output_text>
#
# Best-effort heuristic to extract a token count from the combined
# stdout+stderr of a `claude -p` invocation. Returns 0 if no token
# information can be parsed (caller treats 0 as "unknown — do not
# update cumulative").
#
# Strategies tried in order:
#   1. JSON with usage.input_tokens + usage.output_tokens (modern
#      claude --output-format json)
#   2. Plain-text patterns: "tokens used: NNNN", "Total tokens: NNNN",
#      "NNNN input tokens, MMMM output tokens"
#   3. User-supplied extractor via RALPH_TOKEN_EXTRACTOR_CMD env var
#      (the env var is invoked with the output on stdin; expected to
#      print a single integer to stdout)
#
# The function is intentionally tolerant: it never errors. If parsing
# fails the caller gets 0 and Ralph continues without budget tracking
# for that call (worse than nothing? no — silently breaking the loop
# would be worse).
# ──────────────────────────────────────────────────────────────────────
ralph_extract_tokens_from_output() {
  local output="${1:-}"

  if [ -z "$output" ]; then
    echo 0
    return 0
  fi

  # User-supplied extractor takes precedence
  if [ -n "${RALPH_TOKEN_EXTRACTOR_CMD:-}" ]; then
    local custom
    custom=$(echo "$output" | eval "$RALPH_TOKEN_EXTRACTOR_CMD" 2>/dev/null || echo "")
    if [[ "$custom" =~ ^[0-9]+$ ]]; then
      echo "$custom"
      return 0
    fi
  fi

  # Strategy 1: JSON usage block
  local json_tokens
  json_tokens=$(echo "$output" \
    | jq -r 'try (.usage.input_tokens + .usage.output_tokens) catch empty' 2>/dev/null \
    | head -1)
  if [[ "$json_tokens" =~ ^[0-9]+$ ]]; then
    echo "$json_tokens"
    return 0
  fi

  # Strategy 2a: "tokens used: NNNN" / "Total tokens: NNNN"
  local plain
  plain=$(echo "$output" | grep -oE '(tokens used|Total tokens|token count)[: ]+[0-9]+' \
    | grep -oE '[0-9]+' | head -1)
  if [[ "$plain" =~ ^[0-9]+$ ]]; then
    echo "$plain"
    return 0
  fi

  # Strategy 2b: "NNNN input tokens, MMMM output tokens"
  local in_tok out_tok
  in_tok=$(echo "$output" | grep -oE '[0-9]+ input tokens?' | grep -oE '[0-9]+' | head -1)
  out_tok=$(echo "$output" | grep -oE '[0-9]+ output tokens?' | grep -oE '[0-9]+' | head -1)
  if [[ "$in_tok" =~ ^[0-9]+$ ]] && [[ "$out_tok" =~ ^[0-9]+$ ]]; then
    echo $(( in_tok + out_tok ))
    return 0
  fi

  # Nothing matched
  echo 0
}

# ──────────────────────────────────────────────────────────────────────
# add_tokens <delta>
#
# Increment RALPH_TOKENS_CUMULATIVE by <delta>. No-op if delta is 0
# or non-numeric.
# ──────────────────────────────────────────────────────────────────────
ralph_add_tokens() {
  local delta="${1:-0}"
  if [[ "$delta" =~ ^[0-9]+$ ]] && [ "$delta" -gt 0 ]; then
    RALPH_TOKENS_CUMULATIVE=$(( RALPH_TOKENS_CUMULATIVE + delta ))
  fi
}

# ──────────────────────────────────────────────────────────────────────
# sync_tokens
#
# Fold the per-call token ledger (RALPH_TOKENS_FILE, appended to by
# ralph_call_claude_with_retry from inside its command-substitution
# subshell) into the parent shell's RALPH_TOKENS_CUMULATIVE, recording
# the increase as RALPH_TOKENS_DELTA for the next log_event. Idempotent
# and tolerant: missing file or no growth → no-op.
# ──────────────────────────────────────────────────────────────────────
ralph_sync_tokens() {
  if [ -z "$RALPH_TOKENS_FILE" ] || [ ! -f "$RALPH_TOKENS_FILE" ]; then
    return 0
  fi
  local total
  total=$(awk '{ s += $1 } END { print s + 0 }' "$RALPH_TOKENS_FILE" 2>/dev/null || echo 0)
  if [[ "$total" =~ ^[0-9]+$ ]] && [ "$total" -gt "$RALPH_TOKENS_CUMULATIVE" ]; then
    RALPH_TOKENS_DELTA=$(( total - RALPH_TOKENS_CUMULATIVE ))
    RALPH_TOKENS_CUMULATIVE="$total"
  fi
  return 0
}

# ──────────────────────────────────────────────────────────────────────
# check_budget <budget_tokens>
#
# Return 0 if cumulative <= budget, 1 if exceeded. Caller decides what
# to do (typically: call ralph_block_issue with reason "budget-exceeded").
# Budget 0 means "no budget configured" → always returns 0.
# Syncs the token ledger first, so the decision always sees the latest
# call's usage.
# ──────────────────────────────────────────────────────────────────────
ralph_check_budget() {
  local budget="${1:-0}"
  ralph_sync_tokens
  if [ "$budget" -le 0 ]; then
    return 0
  fi
  if [ "$RALPH_TOKENS_CUMULATIVE" -gt "$budget" ]; then
    return 1
  fi
  return 0
}

# ──────────────────────────────────────────────────────────────────────
# call_claude_with_retry <prompt>
#
# Wraps `claude -p <prompt>` with exponential backoff on HTTP 429.
# Schedule: 1s, 2s, 4s, 8s, 16s, 32s, 60s (7 retries, ~123s total max).
# After exhausting all retries, returns exit code 124 so the caller can
# distinguish rate-limit exhaustion from a regular tool failure.
#
# Detection heuristics for 429 — any of these in stderr signals a rate
# limit:
#   - "429"
#   - "rate_limit_exceeded"
#   - "rate limit"
#   - "Too Many Requests"
#
# Captures stdout via process substitution so it can be returned to the
# caller while stderr is inspected for the 429 signal.
#
# Usage:
#   if OUTPUT=$(ralph_call_claude_with_retry "/tdd for issue 42"); then
#     echo "succeeded: $OUTPUT"
#   else
#     local rc=$?
#     if [ "$rc" -eq 124 ]; then
#       echo "rate-limit exhausted"
#     else
#       echo "claude failed with code $rc"
#     fi
#   fi
# ──────────────────────────────────────────────────────────────────────
ralph_call_claude_with_retry() {
  local prompt="${1:?ralph_call_claude_with_retry requires <prompt>}"
  local backoff_schedule=(1 2 4 8 16 32 60)
  local attempt=0
  local max_attempts=${#backoff_schedule[@]}
  local stderr_file
  stderr_file=$(mktemp)

  # Ensure stderr file is removed even on early return
  # shellcheck disable=SC2064
  trap "rm -f '$stderr_file'" RETURN

  while [ "$attempt" -le "$max_attempts" ]; do
    local output
    # Run claude with JSON output: the result envelope carries usage data
    # (plain-text output has none — token accounting reported 0 forever).
    if output=$(claude -p "$prompt" --output-format json 2> "$stderr_file"); then
      # Extract usage and append to the per-call ledger. This function
      # runs inside $(…) subshells, so updating the parent's cumulative
      # directly is impossible — the file is the channel (see sync_tokens).
      local tokens result_text
      tokens=$(ralph_extract_tokens_from_output "$output")
      if [ "$tokens" -gt 0 ]; then
        ralph_add_tokens "$tokens"   # keeps non-subshell callers correct
        if [ -n "$RALPH_TOKENS_FILE" ]; then
          echo "$tokens" >> "$RALPH_TOKENS_FILE"
        fi
      fi
      # Hand the caller the assistant's TEXT (transcript consumers parse
      # prose/markers, not envelopes); fall back to raw output if the
      # envelope shape is unexpected.
      result_text=$(printf '%s' "$output" | jq -r '.result // empty' 2>/dev/null)
      if [ -n "$result_text" ]; then
        printf '%s' "$result_text"
      else
        printf '%s' "$output"
      fi
      return 0
    fi

    local exit_code=$?
    local stderr_content
    stderr_content=$(cat "$stderr_file")

    # Inspect stderr for 429 signals
    if echo "$stderr_content" | grep -qiE "429|rate.?limit|too.?many.?requests"; then
      if [ "$attempt" -ge "$max_attempts" ]; then
        # All retries exhausted — log and return distinct exit code
        ralph_log_event "error" "ralph.api.rate_limit_exhausted" \
          "{\"attempts\":${attempt},\"backoff_total_seconds\":$(IFS=+; echo "$((${backoff_schedule[*]}))")}"
        printf '%s' "$stderr_content" >&2
        return 124
      fi

      local sleep_for="${backoff_schedule[$attempt]}"
      ralph_log_event "warn" "ralph.api.rate_limited" \
        "{\"attempt\":${attempt},\"backoff_seconds\":${sleep_for}}"
      sleep "$sleep_for"
      attempt=$((attempt + 1))
      continue
    fi

    # Non-429 error — propagate immediately
    printf '%s' "$stderr_content" >&2
    return "$exit_code"
  done

  # Defensive: unreachable, but explicit
  return 124
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

  local scn
  for scn in $(ralph_expand_scns "$expected"); do
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

  # Process key/value pairs from remaining args.
  # Values are passed via ENVIRON, NOT `awk -v`: -v processes backslash
  # escapes (mangling reviewer output containing \n etc.) and BSD awk
  # hard-errors "newline in string" on multiline values — which every
  # real substitution here is (scenario_results, last_actions,
  # reviewer_section), leaving {placeholders} unrendered on macOS.
  while [ "$#" -gt 1 ]; do
    local key="$1"
    local value="$2"
    shift 2
    content=$(printf '%s' "$content" | RALPH_TPL_KEY="{${key}}" RALPH_TPL_VAL="$value" awk '
      BEGIN { RS="\0"; ORS=""; k = ENVIRON["RALPH_TPL_KEY"]; v = ENVIRON["RALPH_TPL_VAL"] }
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
file_mtime() { ralph_file_mtime "$@"; }
env_preflight() { ralph_env_preflight "$@"; }
acceptance_result_check() { ralph_acceptance_result_check "$@"; }
log_scenarios_from_result() { ralph_log_scenarios_from_result "$@"; }
expand_scns() { ralph_expand_scns "$@"; }
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
call_claude_with_retry() { ralph_call_claude_with_retry "$@"; }
parse_budget_label() { ralph_parse_budget_label "$@"; }
extract_tokens_from_output() { ralph_extract_tokens_from_output "$@"; }
add_tokens() { ralph_add_tokens "$@"; }
check_budget() { ralph_check_budget "$@"; }
sync_tokens() { ralph_sync_tokens "$@"; }
