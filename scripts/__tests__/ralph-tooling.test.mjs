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
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, chmodSync, writeFileSync, existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
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

// ── FOLLOW-UP 45: hooks must run under "type": "module" consumers ─────────────

// The live failure: CJS hooks with a .js extension die with 'require is not
// defined in ES module scope' the moment the consumer's package.json declares
// "type": "module" — and hook failures are NON-BLOCKING, so the consumer ran
// since adoption with ZERO functioning guardrails. .cjs forces CJS regardless.
test('FU-45: every shipped hook runs (rc=0) inside a type:module consumer', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
    const hooksDir = join(TEMPLATES, '..', 'hooks');
    const hooks = readdirSync(hooksDir).filter((f) => f.endsWith('.cjs'));
    assert.equal(hooks.length, 5, `5 shipped hooks expected, found: ${hooks.join(', ')}`);
    mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
    for (const h of hooks) {
      copyFileSync(join(hooksDir, h), join(dir, '.claude', 'hooks', h));
      const r = spawnSync('node', [join(dir, '.claude', 'hooks', h)], {
        cwd: dir, encoding: 'utf8', input: '{}',
      });
      assert.equal(r.status, 0, `${h} must run under type:module — got rc=${r.status}\n${r.stderr}`);
    }
    // And no shipped hook keeps the .js extension (the regression vector):
    assert.equal(readdirSync(hooksDir).filter((f) => f.endsWith('.js')).length, 0,
      'a .js hook would silently die under type:module');
  });
});

// ── FOLLOW-UP 46b: --queue mode follows the whole night ───────────────────────

function replayQueue(dir, lines, env = {}) {
  const log = join(dir, 'queue.log');
  writeFileSync(log, lines.join('\n') + '\n');
  const r = spawnSync('bash', [WATCH, '--queue', dir], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, PATH: `${MOCK_BIN}:${process.env.PATH}`, RALPH_WATCH_REPLAY: log, ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('watch --queue: surfaces queue.skipped reasons and exits on queue.completed', () => {
  withDir((dir) => {
    const { status, out } = replayQueue(dir, [
      evt('ralph.queue.skipped', { issue: 29, blocked_on: [27], mode: 'merged-deps' }),
      evt('ralph.queue.skipped', { issue: 30, blocked_on: [27, 29], mode: 'merged-deps' }),
      evt('ralph.queue.completed', { processed: 1, skipped: 2, rc: 0, mode: 'merged-deps' }),
    ]);
    assert.equal(status, 0, out);
    assert.match(out, /#29 skipped — blocked on #27/, 'skip events surfaced — nobody read them before');
    assert.match(out, /#30 skipped — blocked on #27, #29/);
    assert.match(out, /queue COMPLETED — 1 processed, 2 skipped, rc 0/);
  });
});

test('watch --queue: a CHILD session.ended is informational, never terminal for the night', () => {
  withDir((dir) => {
    const { out } = replayQueue(dir, [
      evt('ralph.session.started'),
      evt('ralph.session.ended', { status: 'completed' }),     // a child finishing…
      evt('ralph.queue.skipped', { issue: 9, blocked_on: [8], mode: 'merged-deps' }),  // …must not stop the watch
      evt('ralph.queue.completed', { processed: 1, skipped: 1, rc: 0, mode: 'merged-deps' }),
    ]);
    assert.match(out, /session COMPLETED/, 'the child end is still notified');
    assert.match(out, /#9 skipped/, 'processing CONTINUED past the child terminal');
    assert.match(out, /queue COMPLETED/, 'the night ends on queue.completed');
  });
});

// ── FOLLOW-UP 50: status-aware cucumber config template ───────────────────────

// §58 lands approved features BEFORE steps exist; §60 CI must not run them.
// The narrowing lives INSIDE the config (cucumber v12 merges CLI paths with
// config paths — a wrapper file-list is a silent no-op, hit live).
const importCucumberCfg = async (dir, env) => {
  copyFileSync(join(TEMPLATES, 'cucumber.mjs.tmpl'), join(dir, 'cucumber.mjs'));
  const r = spawnSync('node', ['-e', `
    import(${JSON.stringify('file://' + join(dir, 'cucumber.mjs'))})
      .then((m) => console.log(JSON.stringify(m.default.paths)));
  `], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  return { paths: JSON.parse(r.stdout.trim()), stderr: r.stderr, status: r.status };
};

test('FU-50: implemented-only gate runs implemented features, skips approved LOUDLY', async () => {
  // NOTE: withDir is sync (its finally would rm the dir under the pending
  // promise) — manage the tmp dir manually for this async test.
  const dir = mkdtempSync(join(tmpdir(), 'ralph-fu50-'));
  try {
    mkdirSync(join(dir, 'features', 'pay'), { recursive: true });
    writeFileSync(join(dir, 'features', 'pay', 'done.feature'), '# status: implemented\nFeature: Done\n');
    writeFileSync(join(dir, 'features', 'pay', 'planned.feature'), '# status: approved\nFeature: Planned\n');
    writeFileSync(join(dir, 'features', 'legacy.feature'), 'Feature: Legacy headerless\n');
    const on = await importCucumberCfg(dir, { CUCUMBER_IMPLEMENTED_ONLY: '1' });
    assert.deepEqual(on.paths.sort(), ['features/legacy.feature', 'features/pay/done.feature'],
      'implemented + legacy join the surface; approved stays off');
    assert.match(on.stderr, /skipping 1 in-flight feature file/, 'never silent truncation');
    assert.match(on.stderr, /planned\.feature \(# status: approved\)/);
    const off = await importCucumberCfg(dir, {});
    assert.deepEqual(off.paths, ['features/**/*.feature'], 'flag unset → full suite (today\'s behavior)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Consumer-review round-2: ZERO implemented features (a fresh consumer's
// FIRST planning PR). paths: [] would make cucumber v12 fall back to default
// discovery and run the full suite — the exact headline failure, reproduced
// empirically by the consumer. The config must emit a benign non-matching
// glob, never an empty array.
test('FU-50: zero implemented features → benign glob + explicit log, never paths []', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ralph-fu50z-'));
  try {
    mkdirSync(join(dir, 'features'), { recursive: true });
    writeFileSync(join(dir, 'features', 'planned.feature'), '# status: approved\nFeature: Planned\n');
    const { paths, stderr } = await importCucumberCfg(dir, { CUCUMBER_IMPLEMENTED_ONLY: '1' });
    assert.notDeepEqual(paths, [], 'an empty array re-opens the v12 default-discovery fallback');
    assert.deepEqual(paths, ['features/__none__/*.feature'], 'benign non-matching glob → 0 scenarios, exit 0');
    assert.match(stderr, /no implemented features yet — regression surface empty/);
    assert.match(stderr, /skipping 1 in-flight feature file/, 'the skip list still names what is off-surface');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── FOLLOW-UP 60: train-merge retargets dependents BEFORE deleting the base ───

// Second live incident of the closed-siblings class (manual deletion, then
// the --delete-branch flag path): the runbook alone was demonstrably
// insufficient — the FU-53 DEFER's exact activation criterion. The script
// mechanizes retarget-before-delete (the Graphite/ghstack pattern).
test('FU-60: train-merge retargets open dependents to the train base, THEN merges', () => {
  withDir((dir) => {
    // Real repo so check-merge-safety post verifies a REAL merge commit.
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    writeFileSync(join(dir, 'a.txt'), '1'); git('add', '-A'); git('commit', '-qm', 'init');
    git('checkout', '-qb', 'train-head');
    writeFileSync(join(dir, 'b.txt'), '2'); git('add', '-A'); git('commit', '-qm', 'work');
    const headOid = git('rev-parse', 'HEAD').stdout.trim();
    git('checkout', '-q', '-');
    git('merge', '--no-ff', '-q', '--no-edit', 'train-head');
    const mergeSha = git('rev-parse', 'HEAD').stdout.trim();
    // The framework scripts must be reachable as scripts/ from cwd:
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    for (const f of ['train-merge.mjs', 'check-merge-safety.mjs']) {
      copyFileSync(join(TEMPLATES, '..', 'scripts', f), join(dir, 'scripts', f));
    }
    const r = spawnSync('node', ['scripts/train-merge.mjs', '71'], {
      cwd: dir, encoding: 'utf8',
      env: {
        ...process.env, PATH: `${MOCK_BIN}:${process.env.PATH}`,
        MOCK_TRAIN_PRE_JSON: JSON.stringify({ number: 71, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', headRefOid: headOid, baseRefOid: 'base', isDraft: false, title: 'train first' }),
        MOCK_TRAIN_VIEW_JSON: JSON.stringify({ headRefName: 'train-head', baseRefName: 'main', headRefOid: headOid }),
        MOCK_PR_DEPENDENTS_JSON: JSON.stringify([{ number: 72 }, { number: 73 }]),
        MOCK_TRAIN_POST_JSON: JSON.stringify({ number: 71, state: 'MERGED', mergedAt: 'x', mergeCommit: { oid: mergeSha }, headRefOid: headOid }),
      },
    });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    const log = readFileSync(join(dir, '.mock-gh-trainlog'), 'utf8').trim().split('\n');
    const firstMerge = log.findIndex((l) => l.startsWith('MERGE'));
    const edits = log.filter((l) => l.startsWith('EDIT'));
    assert.equal(edits.length, 2, 'both dependents retargeted');
    assert.match(edits[0], /72 --base main/, 'retargeted to the TRAIN base, not left on the doomed branch');
    assert.ok(log.findIndex((l) => l.startsWith('EDIT')) < firstMerge, 'retarget happens BEFORE the merge');
    assert.match(log[firstMerge], /--merge --delete-branch/, 'merge commit + safe deletion');
  });
});

// ── FOLLOW-UP 65: sonar-sweep — the post-PR read-out, fixture-served ──────────
// (an http.Server hung under the sandbox; the script's fixture hook mirrors
//  the RALPH_WATCH_REPLAY pattern — the unit is parsing/exit logic, not HTTP)

const SONAR_FIXTURE = {
  '/api/qualitygates/project_status': {
    projectStatus: {
      status: 'ERROR',
      conditions: [
        { status: 'ERROR', metricKey: 'new_duplicated_lines_density', comparator: 'GT', errorThreshold: '3', actualValue: '6.7' },
        { status: 'OK', metricKey: 'new_violations', comparator: 'GT', errorThreshold: '0', actualValue: '0' },
      ],
    },
  },
  '/api/issues/search': {
    issues: [
      { severity: 'MAJOR', rule: 'typescript:S1871', component: 'proj:src/routes/a.ts', line: 42, message: 'duplicated branches' },
    ],
  },
  '/api/measures/component_tree': {
    components: [
      // BOTH new-code shapes — the periods[0] pitfall that cost a re-diagnosis:
      { path: 'src/routes/a.ts', measures: [{ metric: 'new_duplicated_lines', period: { value: '9' } }] },
      { path: 'src/routes/b.ts', measures: [{ metric: 'new_duplicated_lines', periods: [{ value: '9' }] }] },
      { path: 'src/clean.ts', measures: [{ metric: 'new_duplicated_lines', period: { value: '0' } }] },
    ],
  },
};

test('FU-65: sonar-sweep prints QG conditions + issues + per-file dups, exits 1 on ERROR', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonar-sweep-'));
  try {
    writeFileSync(join(dir, 'sonar-project.properties'), 'sonar.projectKey=proj\n');
    for (const [path, body] of Object.entries(SONAR_FIXTURE)) {
      writeFileSync(join(dir, path.replace(/\//g, '_') + '.json'), JSON.stringify(body));
    }
    const r = spawnSync('node', [join(TEMPLATES, '..', 'scripts', 'sonar-sweep.mjs'), '73', '--files'], {
      cwd: dir, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, SONARQ_TOKEN: 't', SONAR_API_FIXTURE_DIR: dir },
    });
    assert.equal(r.status, 1, `QG ERROR must exit 1 (pipeable into the train guard):\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /Quality Gate \(PR #73\): ❌ ERROR/);
    assert.match(r.stdout, /new_duplicated_lines_density: 6\.7 \(required ≤ 3\)/, 'failing condition named');
    assert.match(r.stdout, /\[MAJOR\] typescript:S1871 src\/routes\/a\.ts:42/, 'issue with rule/file:line');
    assert.match(r.stdout, /9\tsrc\/routes\/a\.ts/, 'period.value shape read');
    assert.match(r.stdout, /9\tsrc\/routes\/b\.ts/, 'periods[0].value shape read — the live pitfall');
    assert.doesNotMatch(r.stdout, /clean\.ts/, 'zero-dup files stay out');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── FOLLOW-UP 69: the isolated worktree exposes resolvable node_modules ───────

// A git worktree gets a FRESH working dir with no node_modules — yet /tdd
// (vitest), /run-acceptance (cucumber-js) and §60's pre-push smoke all resolve
// binaries from node_modules/.bin. Without provisioning, the first command in
// the worktree fails 127. The script symlinks the primary checkout's
// node_modules.
test('FU-69: ralph-isolated symlinks node_modules so the worktree can run the loop', () => {
  withDir((dir) => {
    for (const [src, dst] of [['ralph-lib.sh', 'ralph-lib.sh'], ['ralph-blocked-comment.md.tmpl', 'ralph-blocked-comment.md.tmpl'], ['ralph-local.sh.tmpl', 'ralph-local.sh']]) {
      copyFileSync(join(TEMPLATES, src), join(dir, dst));
    }
    copyFileSync(ISOLATED, join(dir, 'ralph-isolated.sh'));
    chmodSync(join(dir, 'ralph-local.sh'), 0o755);
    chmodSync(join(dir, 'ralph-isolated.sh'), 0o755);
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    // Real consumers gitignore node_modules → it is UNTRACKED, so a worktree
    // does NOT receive it (the whole point of FU-69). The fixture must mirror
    // that, or the worktree would inherit a committed copy and mask the bug.
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.worktrees/\n.planning/\n');
    // A primary node_modules with a resolvable .bin (the thing the loop needs):
    mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', '.bin', 'cucumber-js'), '#!/bin/sh\necho ok\n');
    chmodSync(join(dir, 'node_modules', '.bin', 'cucumber-js'), 0o755);
    writeFileSync(join(dir, 'package.json'), '{ "name": "c" }');
    git('add', '-A'); git('commit', '-qm', 'init');

    const r = spawnSync('bash', [join(dir, 'ralph-isolated.sh'), '1', '--max-iterations', '1'], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, PATH: `${MOCK_BIN}:${process.env.PATH}`, RALPH_WORKER_ID: 'w0' },
    });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(`${r.stdout}${r.stderr}`, /Linked node_modules/);
    const wt = join(dir, '.worktrees', readdirSync(join(dir, '.worktrees'))[0]);
    // The worktree's node_modules/.bin/cucumber-js resolves through the link.
    const probe = spawnSync('sh', ['-c', 'node_modules/.bin/cucumber-js'], { cwd: wt, encoding: 'utf8' });
    assert.equal(probe.status, 0, 'cucumber-js must resolve in the worktree (127 = the bug)');
    assert.match(probe.stdout, /ok/);
  });
});

// ── FOLLOW-UP 76 + 77: --resume refreshes the engine + bypasses ralph-ready ───

function setupIsolatedConsumer(dir) {
  for (const [src, dst] of [['ralph-lib.sh', 'ralph-lib.sh'], ['ralph-blocked-comment.md.tmpl', 'ralph-blocked-comment.md.tmpl'], ['ralph-local.sh.tmpl', 'ralph-local.sh']]) {
    copyFileSync(join(TEMPLATES, src), join(dir, dst));
  }
  copyFileSync(ISOLATED, join(dir, 'ralph-isolated.sh'));
  chmodSync(join(dir, 'ralph-local.sh'), 0o755);
  chmodSync(join(dir, 'ralph-isolated.sh'), 0o755);
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.worktrees/\n.planning/\n');
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  git('add', '-A'); git('commit', '-qm', 'init');
  return git;
}
const isoRun = (dir, args, env = {}) => spawnSync('bash', [join(dir, 'ralph-isolated.sh'), ...args], {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, PATH: `${MOCK_BIN}:${process.env.PATH}`, RALPH_WORKER_ID: 'w0', ...env },
});

test('FU-76: --resume refreshes a STALE engine script from the primary checkout', () => {
  withDir((dir) => {
    setupIsolatedConsumer(dir);
    assert.equal(isoRun(dir, ['1', '--max-iterations', '1']).status, 0, 'initial run');
    const wt = join(dir, '.worktrees', readdirSync(join(dir, '.worktrees'))[0]);
    // Doctor the worktree's engine to a STALE version, then resume.
    writeFileSync(join(wt, 'ralph-lib.sh'), '#!/bin/bash\n# STALE pre-resync engine\n');
    const r = isoRun(dir, ['1', '--resume', '--max-iterations', '1']);
    assert.match(`${r.stdout}${r.stderr}`, /Refreshed stale engine scripts.*ralph-lib\.sh/, 'the stale lib is refreshed');
    assert.equal(spawnSync('cmp', ['-s', join(dir, 'ralph-lib.sh'), join(wt, 'ralph-lib.sh')]).status, 0,
      'the worktree now runs the primary version');
  });
});

test('FU-77: --resume bypasses the ralph-ready check Ralph itself removed', () => {
  withDir((dir) => {
    setupIsolatedConsumer(dir);
    // Initial run claims issue 1 (ralph-ready present) → creates its worktree.
    assert.equal(isoRun(dir, ['1', '--max-iterations', '1']).status, 0);
    // The issue no longer carries ralph-ready (Ralph removed it at claim).
    const noReady = { MOCK_LABELS: 'scenarios:scn-001\nbudget:50k\nshift:afk' };
    // Resume that SAME worktree: launches anyway, announcing the bypass.
    const res = isoRun(dir, ['1', '--resume', '--max-iterations', '1'], noReady);
    assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
    assert.match(`${res.stdout}${res.stderr}`, /--resumed: bypassing the ralph-ready check/);
  });
});

test('FU-77: §63 preserved — a NEVER-started issue without ralph-ready still refuses', () => {
  withDir((dir) => {
    setupIsolatedConsumer(dir);
    const fresh = isoRun(dir, ['2', '--max-iterations', '1'], { MOCK_LABELS: 'scenarios:scn-001\nbudget:50k\nshift:afk' });
    assert.notEqual(fresh.status, 0);
    assert.match(`${fresh.stdout}${fresh.stderr}`, /missing label 'ralph-ready'/);
  });
});

// ── FOLLOW-UP 85: in a WORKSPACE monorepo, FU-69's node_modules symlink makes ─
// every workspace package resolve through the PRIMARY checkout — main's code,
// not the branch under test (live: 4-for-4 CLI-touching slices red locally,
// green in CI). A workspace gets a REAL per-worktree install instead — the
// same semantics as CI, per pnpm's own git-worktrees guidance. Non-workspace
// consumers keep the FU-69 symlink (covered by the FU-69 test above).
test('FU-85: workspace monorepo → real install in the worktree, never the primary symlink', () => {
  withDir((dir) => {
    setupIsolatedConsumer(dir);
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    // A workspace consumer: root manifest declares workspaces + a member pkg.
    writeFileSync(join(dir, 'package.json'), '{ "name": "c", "workspaces": ["packages/*"] }');
    mkdirSync(join(dir, 'packages', 'cli'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'cli', 'package.json'), '{ "name": "@scope/cli" }');
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.worktrees/\n.planning/\n');
    git('add', '-A'); git('commit', '-qm', 'workspace consumer');
    // A primary node_modules EXISTS — the FU-69 path would have symlinked it
    // (that is exactly the staleness vector under test).
    mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });

    const r = isoRun(dir, ['1', '--max-iterations', '1'], {
      // The override knob doubles as the test seam: a hermetic install that
      // stamps WHERE it ran (a real pnpm/npm here would hit the network).
      RALPH_WORKTREE_INSTALL_CMD: 'mkdir -p node_modules && echo branch-install > node_modules/.installed-here',
    });
    const out = `${r.stdout}${r.stderr}`;
    assert.equal(r.status, 0, out);
    assert.match(out, /Workspace monorepo detected/);
    assert.doesNotMatch(out, /Linked node_modules/, 'the symlink path must not run for a workspace');
    const wt = join(dir, '.worktrees', readdirSync(join(dir, '.worktrees'))[0]);
    assert.ok(!lstatSync(join(wt, 'node_modules')).isSymbolicLink(),
      'worktree node_modules is REAL — workspace packages resolve to this branch, not the primary');
    assert.ok(existsSync(join(wt, 'node_modules', '.installed-here')), 'RALPH_WORKTREE_INSTALL_CMD ran with cwd = the worktree');
    assert.ok(!existsSync(join(dir, 'node_modules', '.installed-here')), 'the primary checkout is untouched');
  });
});

// ── FOLLOW-UP 98: no-sleep guard. A host idle-sleep mid-call wedges the run
// (the FU-92 gtimeout's monotonic timer is suspended during sleep). The fix that
// stopped recurrence is to inhibit idle sleep for the run; ralph-isolated wraps
// the loop in caffeinate/systemd-inhibit (auto) or a RALPH_NOSLEEP command.
test('FU-98: RALPH_NOSLEEP wraps the run (the guard command is invoked around the loop)', () => {
  withDir((dir) => {
    setupIsolatedConsumer(dir);
    const marker = join(dir, '.nosleep-ran');
    const rec = join(dir, 'nosleep-rec.sh');
    writeFileSync(rec, '#!/usr/bin/env bash\n: > "$NOSLEEP_MARKER"\nexec "$@"\n');
    chmodSync(rec, 0o755);
    const r = isoRun(dir, ['1', '--max-iterations', '1'], { RALPH_NOSLEEP: `bash ${rec}`, NOSLEEP_MARKER: marker });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.ok(existsSync(marker), 'the RALPH_NOSLEEP guard command wrapped (and ran) the loop');
    assert.match(`${r.stdout}${r.stderr}`, /no-sleep guard/);
  });
});

test('FU-98: RALPH_NOSLEEP=off runs without a guard (back-compat)', () => {
  withDir((dir) => {
    setupIsolatedConsumer(dir);
    const r = isoRun(dir, ['1', '--max-iterations', '1'], { RALPH_NOSLEEP: 'off' });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.doesNotMatch(`${r.stdout}${r.stderr}`, /no-sleep guard:/);
  });
});
