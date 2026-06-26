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

// ── ISSUE #140 — branch-aware force-push policy ──────────────────────────
// The documented GIT_GUARDRAILS_DISABLE=1 inline bypass is mechanically
// unreachable (the hook is a sibling of the Bash command). The fix is a
// structured policy: --force-with-lease to a NON-protected branch is allowed;
// bare force, or any force to a protected branch, stays blocked.

test('#140: --force-with-lease to an agent branch (explicit HEAD:branch) → allowed', () => {
  assert.equal(guard('git push --force-with-lease origin HEAD:agent/issue-x'), 0, 'post-rebase update to an agent branch is the legitimate flow');
  assert.equal(guard('git push --force-with-lease origin feature/x'), 0, 'a feature branch is non-protected');
});

test('#140: --force-with-lease to a PROTECTED branch → still blocked', () => {
  assert.equal(guard('git push --force-with-lease origin main'), 2, 'main is protected');
  assert.equal(guard('git push --force-with-lease origin HEAD:master'), 2, 'master is protected');
  assert.equal(guard('git push --force-with-lease origin develop'), 2, 'develop is protected');
});

test('#140: BARE -f/--force is never auto-allowed, even to a non-protected branch', () => {
  assert.equal(guard('git push -f origin agent/issue-x'), 2, 'bare -f must use --force-with-lease');
  assert.equal(guard('git push --force origin feature/x'), 2, 'bare --force is not the safe form');
});

test('#140: an undeterminable target (no remote+refspec) stays blocked', () => {
  assert.equal(guard('git push --force-with-lease'), 2, 'no target → block; specify origin HEAD:branch');
  assert.equal(guard('git push --force-with-lease origin'), 2, 'remote only, no refspec → block');
});

test('#140: GIT_GUARDRAILS_PROTECTED_BRANCHES extends the protected set', () => {
  const payload = JSON.stringify({ tool_input: { command: 'git push --force-with-lease origin release' } });
  const r = spawnSync('node', [HOOK], { input: payload, encoding: 'utf8', env: { ...process.env, GIT_GUARDRAILS_PROTECTED_BRANCHES: 'release,staging' } });
  assert.equal(r.status, 2, 'a configured protected branch is blocked');
});

test('#140: the core block is NOT weakened — force-push to main still blocks both forms', () => {
  assert.equal(guard('git push --force origin main'), 2);
  assert.equal(guard('git push -f origin main'), 2);
});
