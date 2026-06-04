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
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, chmodSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
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

// ── FOLLOW-UP 37b: adaptive silence threshold ─────────────────────────────────

test('watch: silence threshold is 45 before any completed iteration (first iterations are heaviest)', () => {
  withDir((dir) => {
    const { out } = replay(dir, [evt('ralph.session.started')], { RALPH_WATCH_PRINT_THRESHOLD: '1' });
    assert.match(out, /threshold_min=45/);
  });
});

test('watch: threshold floors at 25 after a short iteration, adapts to 1.5× a long one', () => {
  withDir((dir) => {
    // 10-minute iteration → 1.5× = 15 < floor 25 → 25
    const short = replay(dir, [
      evt('ralph.session.started'),
      evt('ralph.iteration.started', {}, { timestamp: '2026-06-04T03:00:00Z' }),
      evt('ralph.iteration.completed', { outcome: 'green' }, { timestamp: '2026-06-04T03:10:00Z' }),
    ], { RALPH_WATCH_PRINT_THRESHOLD: '1' });
    assert.match(short.out, /threshold_min=25/);
    // 40-minute iteration → 1.5× (+1 rounding) = 61 > floor → adaptive
    const long = replay(dir, [
      evt('ralph.session.started'),
      evt('ralph.iteration.started', {}, { timestamp: '2026-06-04T03:00:00Z' }),
      evt('ralph.iteration.completed', { outcome: 'green' }, { timestamp: '2026-06-04T03:40:00Z' }),
    ], { RALPH_WATCH_PRINT_THRESHOLD: '1' });
    assert.match(long.out, /threshold_min=61/, `a healthy 36-40 min first iteration must not false-alert:\n${long.out}`);
  });
});

// ── FOLLOW-UP 37c: commit-delta orientation (the prototype miscounted) ────────

test('watch: commit_delta counts exactly the commits between polls (prev..new orientation)', () => {
  withDir((dir) => {
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    writeFileSync(join(dir, 'a.txt'), '1'); git('add', '-A'); git('commit', '-qm', 'c1');
    git('checkout', '-qb', 'agent/feature-x-7');
    const call = (prev) => spawnSync('bash', [WATCH, '7', dir], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, RALPH_WATCH_CALL: `ralph_watch_commit_delta agent/feature-x-7 '${prev}'` },
    }).stdout.trim();
    // First poll: baseline head, 0 new commits.
    const [head1, count1] = call('').split(' ');
    assert.equal(count1, '0', 'no prev → baseline only, never a phantom count');
    // A commit lands between polls:
    writeFileSync(join(dir, 'b.txt'), '2'); git('add', '-A'); git('commit', '-qm', 'c2');
    const [head2, count2] = call(head1).split(' ');
    assert.notEqual(head2, head1);
    assert.equal(count2, '1', 'exactly the one commit between polls (the live bug reported 0)');
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

// ── FOLLOW-UP 37a: --resume is the sanctioned re-entry ────────────────────────

test('isolated: --resume refuses with no worktree, then reuses the kept one (no second worktree)', () => {
  withDir((dir) => {
    for (const [src, dst] of [['ralph-lib.sh', 'ralph-lib.sh'], ['ralph-blocked-comment.md.tmpl', 'ralph-blocked-comment.md.tmpl'], ['ralph-local.sh.tmpl', 'ralph-local.sh']]) {
      copyFileSync(join(TEMPLATES, src), join(dir, dst));
    }
    copyFileSync(ISOLATED, join(dir, 'ralph-isolated.sh'));
    chmodSync(join(dir, 'ralph-local.sh'), 0o755);
    chmodSync(join(dir, 'ralph-isolated.sh'), 0o755);
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    git('add', '-A'); git('commit', '-qm', 'init');
    writeFileSync(join(dir, '.env'), 'STRIPE_KEY=sk_test_old\n');
    const run = (...args) => {
      const r = spawnSync('bash', [join(dir, 'ralph-isolated.sh'), ...args], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, PATH: `${MOCK_BIN}:${process.env.PATH}`, RALPH_WORKER_ID: 'w0' },
      });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };

    // (1) --resume with nothing to resume → actionable refusal.
    const refuse = run('1', '--resume');
    assert.notEqual(refuse.status, 0);
    assert.match(refuse.out, /no existing worktree/);

    // (2) normal run creates the worktree…
    assert.equal(run('1', '--max-iterations', '1').status, 0);
    assert.equal(readdirSync(join(dir, '.worktrees')).length, 1);

    // (3) …and --resume relaunches IN it (no second worktree), refreshing .env.
    writeFileSync(join(dir, '.env'), 'STRIPE_KEY=sk_test_fresh\n');
    const resume = run('1', '--resume', '--max-iterations', '1');
    assert.equal(resume.status, 0, resume.out);
    assert.match(resume.out, /Resuming in existing worktree/);
    const wts = readdirSync(join(dir, '.worktrees'));
    assert.equal(wts.length, 1, 'resume must never create a second worktree');
    assert.match(readFileSync(join(dir, '.worktrees', wts[0], '.env'), 'utf8'), /sk_test_fresh/,
      'fresh secrets win on resume');
  });
});

// ── FOLLOW-UP 42: the §60 CI surface ships as a template ─────────────────────

test('FU-42: acceptance.yml template exists and maps §60\'s three promises', () => {
  const yml = readFileSync(join(TEMPLATES, 'github-workflows', 'acceptance.yml'), 'utf8');
  assert.match(yml, /on:\s*\n\s*pull_request:/, 'runs on every PR (pre-merge)');
  assert.match(yml, /--tags @release/, '@release scoping documented (the script owns it)');
  assert.match(yml, /secrets\./, 'sandbox specs gated by secret presence');
  assert.match(yml, /ubuntu-latest/, 'testcontainers-capable runner');
});

// FOLLOW-UP 44: the three first-adoption assumptions, pinned. The live failure
// chain: no packageManager → action-setup dies; no test:acceptance script →
// unknown command; `pnpm script -- --tags x` → pnpm passes the literal `--`
// through and cucumber ENOENTs on '@release' as a feature path.
test('FU-44: workflow invokes the script PLAINLY and documents both prerequisites', () => {
  const yml = readFileSync(join(TEMPLATES, 'github-workflows', 'acceptance.yml'), 'utf8');
  assert.doesNotMatch(yml, /test:acceptance -- --tags/, 'the pnpm `--` passthrough trap must never return');
  assert.match(yml, /run: pnpm test:acceptance\s*$/m, 'plain invocation — the script owns the tags');
  assert.match(yml, /packageManager/, 'prerequisite 1 documented in the header');
  assert.match(yml, /test:acceptance.*script|script.*test:acceptance/i, 'prerequisite 2 documented');
});
