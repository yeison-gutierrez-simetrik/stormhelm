#!/usr/bin/env node
// hooks/closed-set-check.js
// PostToolUse hook (matcher: Write|Edit|MultiEdit). Implements §36 continuous verification.
//
// After a Markdown file is written, if it contains a closed-set block
// (<!-- closed-set-start: path#symbol --> … <!-- closed-set-end -->) whose list
// no longer matches the canonical symbol in code, surface a NON-BLOCKING warning
// telling the agent to run `node scripts/sync-closed-sets.mjs`.
//
// It delegates to scripts/sync-closed-sets.mjs (single source of the parsing
// logic) and stays silent when that script or the markers are absent — so it
// never produces false signals in projects that don't use the convention.
// Zero external dependencies.

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function main() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return; }
  let evt; try { evt = JSON.parse(raw); } catch { return; }

  const input = evt.tool_input || evt.toolInput || {};
  const file = input.file_path || input.path;
  if (!file || !file.endsWith('.md')) return;
  if (!fs.existsSync(file)) return;
  if (!/<!--\s*closed-set-start:/.test(fs.readFileSync(file, 'utf8'))) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const script = path.join(projectDir, 'scripts', 'sync-closed-sets.mjs');
  if (!fs.existsSync(script)) return; // convention not adopted here

  const res = spawnSync('node', [script, '--check', file], { cwd: projectDir, encoding: 'utf8' });
  if (res.status === 1) {
    // Non-blocking: surface to the agent's next turn via stderr.
    process.stderr.write(
      '⚠️ closed-set drift (§36): the value list in ' + file + ' no longer matches its canonical symbol in code.\n' +
      '   Run `node scripts/sync-closed-sets.mjs` to regenerate, then re-check.\n'
    );
  }
}

try { main(); } catch { /* never break the tool call */ }
