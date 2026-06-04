// Coverage for the graduated Night Shift operator tooling (FOLLOW-UP 32):
// templates/ralph-watch.sh (NDJSON → notifications) and
// templates/ralph-isolated.sh (worktree-per-run isolation).
//
// The watcher's four pinned lessons (all hit live on the consumer prototype):
//   1. rebind to the newest session log (covered structurally; replay mode
//      parses one log — the rebind path is poll-loop-only),
//   2. blocked detection is NDJSON session.ended-first,
//   3. an empty `gh pr list` must never render "null null",
//   4. notifier abstracted behind RALPH_NOTIFY_CMD (stdout assertions here).
//
// Run: node --test scripts/__tests__/ralph-tooling.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, chmodSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(here, '..', '..', 'templates');
const MOCK_BIN = join(here, 'fixtures', 'ralph-mock-bin');
for (const m of ['gh', 'claude', 'docker', 'git']) chmodSync(join(MOCK_BIN, m), 0o755);

const WATCH = join(TEMPLATES, 'ralph-watch.sh');
const ISOLATED = join(TEMPLATES, 'ralph-isolated.sh');

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ralph-tooling-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const evt = (event, details = {}, extra = {}) => JSON.stringify({
  timestamp: '2026-06-04T03:00:00Z', level: 'info', event,
  sessionId: 'ralph-x-w1', workerId: 'w1', issueNumber: 15, iteration: 1,
  tokensConsumedDelta: 0, tokensConsumedCumulative: 50000, details, ...extra,
});

function replay(dir, lines, env = {}) {
  const log = join(dir, 'session.log');
  writeFileSync(log, lines.join('\n') + '\n');
  const r = spawnSync('bash', [WATCH, '15', dir], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, PATH: `${MOCK_BIN}:${process.env.PATH}`, RALPH_WATCH_REPLAY: log, ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('watch: completed session with a PR → COMPLETED alert carrying the PR line', () => {
  withDir((dir) => {
    const { status, out } = replay(dir, [
      evt('ralph.session.started'),
      evt('ralph.iteration.completed', { outcome: 'green' }),
      evt('ralph.session.ended', { status: 'completed', iterations_completed: 1 }),
    ], { MOCK_PR_LIST: 'fix #15 → https://github.com/acme/app/pull/19' });
    assert.equal(status, 0, out);
    assert.match(out, /session COMPLETED — PR: fix #15 → https:\/\/github\.com\/acme\/app\/pull\/19/);
  });
});

test('watch: empty gh pr list never renders "null null" (lesson 3)', () => {
  withDir((dir) => {
    const { out } = replay(dir, [
      evt('ralph.session.started'),
      evt('ralph.session.ended', { status: 'completed' }),
    ]);
    assert.match(out, /COMPLETED — no PR found/);
    assert.doesNotMatch(out, /null/, 'empty list must not leak null fields');
  });
});

test('watch: blocked session ends with the NDJSON status+reason (lesson 2 — labels not consulted)', () => {
  withDir((dir) => {
    const { out } = replay(dir, [
      evt('ralph.session.started'),
      evt('ralph.iteration.completed', { outcome: 'acceptance-failing', reason: 'result-file-missing (x)' }),
      evt('ralph.session.ended', { status: 'blocked', reason: 'max-iterations-reached' }),
    ]);
    assert.match(out, /🛑 session ended: blocked \(max-iterations-reached\)/);
  });
});

test('watch: ≥2 consecutive same-reason failures → environmental-blocker warning, once', () => {
  withDir((dir) => {
    const { out } = replay(dir, [
      evt('ralph.session.started'),
      evt('ralph.iteration.completed', { outcome: 'acceptance-failing', reason: 'result-file-missing (x)' }, { iteration: 1 }),
      evt('ralph.iteration.completed', { outcome: 'acceptance-failing', reason: 'result-file-missing (x)' }, { iteration: 2 }),
      evt('ralph.iteration.completed', { outcome: 'acceptance-failing', reason: 'result-file-missing (x)' }, { iteration: 3 }),
      evt('ralph.session.ended', { status: 'blocked', reason: 'max-iterations-reached' }),
    ]);
    const warnings = out.match(/ENVIRONMENTAL blocker/g) || [];
    assert.equal(warnings.length, 1, `warning fires exactly once, got ${warnings.length}:\n${out}`);
  });
});

test('watch: iteration notifications carry outcome, reason and token figure', () => {
  withDir((dir) => {
    const { out } = replay(dir, [
      evt('ralph.session.started'),
      evt('ralph.iteration.completed', { outcome: 'acceptance-failing', reason: 'exit_code=1: smoke red' }),
      evt('ralph.session.ended', { status: 'blocked', reason: 'max-iterations-reached' }),
    ]);
    assert.match(out, /iteration 1: acceptance-failing \(exit_code=1: smoke red\) — tokens 50000/);
  });
});

// ── ralph-isolated.sh ─────────────────────────────────────────────────────────

test('isolated: runs the loop in a worktree, copies .env, keeps the worktree', () => {
  withDir((dir) => {
    // consumer with the engine co-located + a committed repo (worktree needs HEAD)
    for (const [src, dst] of [['ralph-lib.sh', 'ralph-lib.sh'], ['ralph-blocked-comment.md.tmpl', 'ralph-blocked-comment.md.tmpl'], ['ralph-local.sh.tmpl', 'ralph-local.sh']]) {
      copyFileSync(join(TEMPLATES, src), join(dir, dst));
    }
    copyFileSync(ISOLATED, join(dir, 'ralph-isolated.sh'));
    chmodSync(join(dir, 'ralph-local.sh'), 0o755);
    chmodSync(join(dir, 'ralph-isolated.sh'), 0o755);
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    git('add', '-A'); git('commit', '-qm', 'init');
    writeFileSync(join(dir, '.env'), 'STRIPE_KEY=sk_test_real\n');

    const r = spawnSync('bash', [join(dir, 'ralph-isolated.sh'), '1', '--max-iterations', '2'], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, PATH: `${MOCK_BIN}:${process.env.PATH}`, RALPH_WORKER_ID: 'w0' },
    });
    const out = `${r.stdout}${r.stderr}`;
    assert.equal(r.status, 0, out);
    assert.match(out, /Isolated worktree:/);
    const wts = existsSync(join(dir, '.worktrees')) ? readdirSync(join(dir, '.worktrees')) : [];
    assert.equal(wts.length, 1, 'worktree created and kept');
    const wt = join(dir, '.worktrees', wts[0]);
    assert.ok(existsSync(join(wt, '.env')), '.env copied into the worktree');
    assert.ok(existsSync(join(wt, '.planning', 'ralph-sessions')), 'session dir provisioned');
    assert.match(out, /git worktree remove/, 'cleanup hint printed');
    // The main checkout's HEAD was never touched (isolation):
    assert.match(git('branch', '--show-current').stdout, /^(main|master)/);
  });
});
