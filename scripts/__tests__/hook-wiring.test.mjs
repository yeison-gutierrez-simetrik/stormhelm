// Guards the hook wiring contract (FOLLOW-UP 67). The hook registration block
// is triplicated by design — the setup SKILL itself (the "keep this block in
// sync with §113" line) admits it — so tri-artifact sync enforced by prose is
// exactly the FU-17 drift class. This pins it executably.
//
// The bug it prevents: a `"command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/x.cjs"`
// value with the path UNQUOTED at the shell layer (JSON quotes are not shell
// quotes). Claude Code runs hook commands via `/bin/sh -c`, which word-splits
// the expansion — on any consumer repo whose absolute path contains a space,
// every hook dies (non-blocking → silently), including the §68 git guard.
//
// Run: node --test scripts/__tests__/hook-wiring.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');

// The three artifacts the FU names (SKILL wiring + verification, README, §113).
const ARTIFACTS = [
  'skills/setup/SKILL.md',
  'hooks/README.md',
  'docs/engineering/core/19-hooks-and-runtime-guards.md',
];

// Every `"command": "<value>"` whose value references CLAUDE_PROJECT_DIR and a
// hooks/ path. We assert the value is shell-quoted: the inner shell command
// must start and end with an escaped double-quote (\"…\" in the JSON source).
const CMD_RE = /"command":\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;

test('FU-67: every hook command referencing CLAUDE_PROJECT_DIR is shell-quoted', () => {
  let checked = 0;
  for (const rel of ARTIFACTS) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    for (const m of text.matchAll(CMD_RE)) {
      const raw = m[1]; // JSON-escaped value, e.g.  \"${CLAUDE_PROJECT_DIR}/.claude/hooks/x.cjs\"
      if (!raw.includes('CLAUDE_PROJECT_DIR') || !raw.includes('/.claude/hooks/')) continue;
      checked++;
      assert.ok(
        raw.startsWith('\\"') && raw.endsWith('\\"'),
        `${rel}: hook command is NOT shell-quoted — word-splits on a space path (FOLLOW-UP 67):\n  "command": "${raw}"`,
      );
    }
  }
  // Sanity: the artifacts actually carry wiring (guards against a silent
  // zero-match pass if the JSON shape ever changes).
  assert.ok(checked >= 10, `expected ≥10 hook command strings across the artifacts, found ${checked}`);
});

test('FU-67: no .js hook references survive in the wiring artifacts (hooks are .cjs since FU-45)', () => {
  for (const rel of ARTIFACTS) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    const stale = text.match(/\.claude\/hooks\/[a-z<>-]+\.js\b/g) || [];
    assert.deepEqual(stale, [], `${rel}: stale .js hook reference(s): ${stale.join(', ')}`);
  }
});
