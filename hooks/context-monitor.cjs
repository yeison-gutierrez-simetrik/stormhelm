#!/usr/bin/env node
// hooks/context-monitor.cjs
// PostToolUse hook (matcher: *). Implements rule §112.
//
// Reads context usage telemetry from an opt-in bridge file and, when
// remaining context drops below configurable thresholds, injects a message
// to the AGENT (not just the user) suggesting graceful close, handoff, or
// human checkpoint.
//
// Telemetry source: ${CLAUDE_PROJECT_DIR}/.claude/context-bridge.json
//   {
//     "session_id": "...",
//     "tokens_used": 145000,
//     "tokens_max": 200000,
//     "updated_at": "ISO-8601"
//   }
//
// If the bridge file is absent or stale (>30s), the hook stays silent.
// Telemetry is opt-in: a statusline, MCP server, or SDK integration writes
// the bridge file. Without it, this hook never produces false signals.
//
// Debounce: at most one notification per 5 tool uses per session.
//
// No external dependencies.

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_WARN_PCT = 35;     // remaining < 35% → warning
const DEFAULT_CRITICAL_PCT = 25; // remaining < 25% → critical
const DEFAULT_DEBOUNCE_TOOLS = 5;
const STALE_BRIDGE_MS = 30_000;

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readConfig() {
  const cfg = await readJson(path.join(projectDir(), '.claude/hooks.config.json'));
  const cm = cfg?.context_monitor || {};
  return {
    warnPct: Number.isFinite(cm.warn_remaining_pct) ? cm.warn_remaining_pct : DEFAULT_WARN_PCT,
    criticalPct: Number.isFinite(cm.critical_remaining_pct) ? cm.critical_remaining_pct : DEFAULT_CRITICAL_PCT,
    debounceTools: Number.isFinite(cm.debounce_tools) ? cm.debounce_tools : DEFAULT_DEBOUNCE_TOOLS,
  };
}

async function readBridge() {
  const bridge = await readJson(path.join(projectDir(), '.claude/context-bridge.json'));
  if (!bridge) return null;
  if (!bridge.updated_at || !bridge.tokens_used || !bridge.tokens_max) return null;
  const updated = Date.parse(bridge.updated_at);
  if (Number.isNaN(updated)) return null;
  if (Date.now() - updated > STALE_BRIDGE_MS) return null;
  if (bridge.tokens_max <= 0) return null;
  return bridge;
}

function stateFilePath(sessionId) {
  return path.join(projectDir(), '.claude', `context-monitor-state-${sessionId || 'default'}.json`);
}

async function readState(sessionId) {
  const state = await readJson(stateFilePath(sessionId));
  return state || { tool_count_since_last_notify: 0, last_level: null };
}

async function writeState(sessionId, state) {
  const filePath = stateFilePath(sessionId);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state), 'utf8');
  } catch {
    // Non-fatal.
  }
}

function levelFor(remainingPct, thresholds) {
  if (remainingPct < thresholds.criticalPct) return 'critical';
  if (remainingPct < thresholds.warnPct) return 'warning';
  return null;
}

function messageFor(level, remainingPct, tokensUsed, tokensMax) {
  const used = `${tokensUsed.toLocaleString()} / ${tokensMax.toLocaleString()}`;
  const pct = remainingPct.toFixed(1);
  if (level === 'critical') {
    return [
      `🚨 CONTEXT CRITICAL: ${pct}% remaining (${used}).`,
      'Action expected NOW: stop opening new work. Invoke the /handoff skill to checkpoint the current state into a fresh session, or close cleanly and mark the issue blocked. Do not start a new tool chain.',
    ].join(' ');
  }
  return [
    `⚠️  CONTEXT WARNING: ${pct}% remaining (${used}).`,
    'Wrap up current work soon. If more remains after this task, invoke the /handoff skill to continue in a fresh session.',
  ].join(' ');
}

async function main() {
  let envelope;
  try {
    const raw = await readStdin();
    envelope = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }

  const bridge = await readBridge();
  if (!bridge) process.exit(0); // no telemetry → stay silent

  const remainingPct = ((bridge.tokens_max - bridge.tokens_used) / bridge.tokens_max) * 100;
  if (!Number.isFinite(remainingPct)) process.exit(0);

  const config = await readConfig();
  const level = levelFor(remainingPct, config);
  if (!level) process.exit(0);

  const sessionId = bridge.session_id || envelope.session_id || 'default';
  const state = await readState(sessionId);

  // Debounce: one notification per N tool uses, unless escalation (warning → critical)
  const escalating = state.last_level === 'warning' && level === 'critical';
  state.tool_count_since_last_notify += 1;
  const shouldNotify = escalating || state.tool_count_since_last_notify >= config.debounceTools;

  if (!shouldNotify) {
    await writeState(sessionId, state);
    process.exit(0);
  }

  // Reset debounce counter and emit notification to the agent.
  state.tool_count_since_last_notify = 0;
  state.last_level = level;
  await writeState(sessionId, state);

  process.stderr.write(messageFor(level, remainingPct, bridge.tokens_used, bridge.tokens_max));
  // Exit 2 sends the stderr content as a tool result the agent will see.
  // For PostToolUse this surfaces the message in the agent's next turn.
  process.exit(2);
}

main().catch(() => process.exit(0));
