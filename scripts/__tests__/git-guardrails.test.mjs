// git-guardrails §68 hook — the heredoc false-positive fix (FOLLOW-UP 68) and
// the core blocking contract it must NOT weaken.
//
// The bug: the guard greps §68 patterns over the WHOLE command string, so
// prose that merely NAMES a blocked op inside a heredoc body trips it — and
// the framework prescribes exactly such prose (filing FUs, postmortems,
// runbooks). The fix strips heredoc payloads (data, not commands) before
// matching. The non-negotiable: a REAL destructive command must still block,
// including on its own line (also "after a newline"), which is why
// command-position matching was rejected in favor of heredoc-stripping.
//
// Run: node --test scripts/__tests__/git-guardrails.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const HOOK = join(here, '..', '..', 'hooks', 'git-guardrails.cjs');

function guard(command) {
  const payload = JSON.stringify({ tool_input: { command } });
  const r = spawnSync('node', [HOOK], { input: payload, encoding: 'utf8' });
  return r.status; // 0 = allow, 2 = block
}

// Each §68 pattern, as PROSE inside a heredoc body → must be allowed (exit 0).
const HEREDOC_PROSE = [
  'git push --force origin main',
  'git push -f',
  'git reset --hard HEAD~1',
  'git clean -fdx',
  'git branch -D feature',
  'git push --delete origin tag',
  'rm -rf .git',
];

test('FU-68: §68 patterns quoted as heredoc prose are allowed (the FU-filing case)', () => {
  for (const phrase of HEREDOC_PROSE) {
    const cmd = `cat >> notes.md << 'EOF'\nremember: never run ${phrase} in a slice-group train\nEOF`;
    assert.equal(guard(cmd), 0, `heredoc prose mentioning "${phrase}" must NOT block`);
  }
});

test('FU-68: the same patterns as REAL commands still block (no weakening)', () => {
  assert.equal(guard('git push --force origin main'), 2, 'bare force-push blocks');
  assert.equal(guard('echo start\ngit reset --hard HEAD'), 2, 'real command on its OWN line (after a newline) still blocks');
  assert.equal(guard('echo ok && git branch -D foo'), 2, 'real command after && still blocks');
  assert.equal(guard('rm -rf .git'), 2, 'rm -rf .git blocks');
});

test('FU-68: a heredoc body does not hide a real command that follows its close', () => {
  // body mentions branch -D (prose) AND a real branch -D runs after EOF.
  const cmd = "cat << EOF\nthe -D flag force-deletes; never: git branch -D x\nEOF\ngit branch -D actually-real";
  assert.equal(guard(cmd), 2, 'the executable git after the heredoc close must still block');
});

test('FU-68: <<- (tab-stripped) heredoc bodies are also stripped', () => {
  const cmd = 'cat <<- EOF\n\tdocs: git clean -fdx wipes session logs\n\tEOF';
  assert.equal(guard(cmd), 0, 'dashed heredoc prose must not block');
});

test('FU-68: a command before the heredoc opener is still scanned', () => {
  // The opener line carries a real destructive command BEFORE `<<`.
  const cmd = 'git reset --hard HEAD && cat << EOF\nharmless prose\nEOF';
  assert.equal(guard(cmd), 2, 'a real command on the opener line is not masked by the heredoc');
});

// FOLLOW-UP 114: a guarded verb inside a single-line QUOTED LITERAL is DATA,
// not a command — must be allowed. The single-line sibling of FU-68.
test('FU-114: §68 patterns inside quoted-literal DATA are allowed', () => {
  // single-quoted printf arg, double-quoted echo arg, -m commit message
  assert.equal(guard("printf 'run git reset --hard to undo\\n'"), 0, "single-quoted printf DATA must not block");
  assert.equal(guard('echo "tip: git push --force rewrites history"'), 0, 'double-quoted echo DATA must not block');
  assert.equal(guard('git commit -m "docs: warn against git reset --hard"'), 0, 'a commit MESSAGE naming the op must not block');
  assert.equal(guard("git commit -m 'chore: removed the git clean -fdx step'"), 0, 'single-quoted commit message must not block');
});

test('FU-114: quoting only the OPERANDS does not hide an unquoted destructive flag', () => {
  assert.equal(guard('git push --force "origin" "main"'), 2, 'unquoted --force still blocks though operands are quoted');
  assert.equal(guard("git reset --hard 'HEAD~1'"), 2, 'unquoted --hard still blocks though the ref is quoted');
});

test('FU-114: a quoted-literal mention does not mask a REAL command elsewhere', () => {
  // quoted DATA on line 1, a real destructive op on line 2 → must still block.
  const cmd = "printf 'note: never git reset --hard'\ngit reset --hard HEAD";
  assert.equal(guard(cmd), 2, 'the executable git after a quoted mention must still block');
});
