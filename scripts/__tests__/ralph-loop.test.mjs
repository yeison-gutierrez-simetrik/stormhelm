// CI coverage for the Night Shift engine — `templates/ralph-local.sh` (+ ralph-lib.sh).
//
// The loop runs UNATTENDED overnight and opens PRs, yet had ZERO automated coverage
// (verify-scripts-tests.yml only ran the other scripts/__tests__). A regression in the
// gate / loop / queue / block paths would be silent and expensive. This commits the
// mock-driven harness used to validate it: the REAL ralph-local.sh runs against fake
// `claude`/`gh` on PATH (fixtures/ralph-mock-bin/), so the FRAMEWORK's orchestration is
// tested deterministically and the externals (the LLM + GitHub) are mocked — including
// the failure paths a real LLM can't be made to produce on demand.
//
// Node orchestrates bash so this rides the existing `node --test scripts/__tests__/*`
// CI step (no bats / no new tooling). NDJSON is parsed with JSON.parse (no jq dependency).
//
// Run: node --test scripts/__tests__/ralph-loop.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, chmodSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(here, '..', '..', 'templates');
const MOCK_BIN = join(here, 'fixtures', 'ralph-mock-bin');

// Make sure the mock executables are runnable even if the checkout dropped the bit.
for (const m of ['gh', 'claude']) chmodSync(join(MOCK_BIN, m), 0o755);

// Stand up a throwaway consumer with the Ralph engine co-located at its root, a git
// repo (the loop runs `git checkout -b`), and a session-log dir.
function setupConsumer() {
  const dir = mkdtempSync(join(tmpdir(), 'ralph-loop-'));
  copyFileSync(join(TEMPLATES, 'ralph-lib.sh'), join(dir, 'ralph-lib.sh'));
  copyFileSync(join(TEMPLATES, 'ralph-blocked-comment.md.tmpl'), join(dir, 'ralph-blocked-comment.md.tmpl'));
  copyFileSync(join(TEMPLATES, 'ralph-local.sh.tmpl'), join(dir, 'ralph-local.sh'));
  chmodSync(join(dir, 'ralph-local.sh'), 0o755); // queue mode self-invokes "$0"
  mkdirSync(join(dir, '.planning', 'ralph-sessions'), { recursive: true });
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'ralph@test.local');
  git('config', 'user.name', 'ralph-test');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return dir;
}

function runRalph(dir, args = [], env = {}) {
  const r = spawnSync('bash', [join(dir, 'ralph-local.sh'), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${MOCK_BIN}:${process.env.PATH}`, RALPH_WORKER_ID: 'w0', ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// Parse a session log to JSON events (asserts every line is valid NDJSON).
function readEvents(dir, issue) {
  const sdir = join(dir, '.planning', 'ralph-sessions');
  const files = readdirSync(sdir).filter((f) => f.endsWith('.log') && (issue ? f.startsWith(`${issue}-`) : true));
  if (!files.length) return [];
  files.sort();
  const log = readFileSync(join(sdir, files[files.length - 1]), 'utf8').trim();
  if (!log) return [];
  return log.split('\n').map((line) => {
    try { return JSON.parse(line); } catch { throw new assert.AssertionError({ message: `invalid NDJSON line: ${line}` }); }
  });
}
const names = (events) => events.map((e) => e.event);
const endStatus = (events) => events.find((e) => e.event === 'ralph.session.ended')?.details?.status;

function withConsumer(fn) {
  const dir = setupConsumer();
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// T1 — §63 gate: an issue without `ralph-ready` is refused before any session log.
test('gate (§63): missing ralph-ready label → exit≠0, no session log, no PR', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1'], { MOCK_LABELS: 'scenarios:scn-001\nbudget:50k' });
    assert.notEqual(status, 0, 'must refuse an issue without ralph-ready');
    assert.match(out, /ralph-ready/);
    assert.equal(readEvents(dir).length, 0, 'no session log for a refused issue');
  });
});

// T2 — happy path: green acceptance + clean review → draft PR + completed.
test('happy path: green acceptance + clean review → PR opened, session completed', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '3']);
    assert.equal(status, 0);
    assert.match(out, /pull\/9/, 'a draft PR is created');
    const ev = names(readEvents(dir, 1));
    assert.ok(ev.includes('ralph.scenario.passed'));
    assert.ok(ev.includes('ralph.pr.opened'));
    assert.equal(endStatus(readEvents(dir, 1)), 'completed');
  });
});

// T3 — positional back-compat + flags; worker-id flows to the log.
test('args: positional [issue max] and --max-iterations/--worker-id both run; worker_id logged', () => {
  withConsumer((dir) => {
    assert.equal(runRalph(dir, ['1', '3']).status, 0, 'positional back-compat');
  });
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '--max-iterations', '2', '--worker-id', 'w7']);
    assert.equal(status, 0, 'flag form runs');
    const started = readEvents(dir, 1).find((e) => e.event === 'ralph.session.started');
    assert.equal(started?.details?.worker_id, 'w7', 'worker_id is recorded in session.started');
  });
});

// T4 — acceptance never green → exhausts iterations → blocked, no PR.
test('max-iterations exhausted: blocked (not budget_exceeded), no PR', () => {
  withConsumer((dir) => {
    const { out } = runRalph(dir, ['1', '2'], { MOCK_ACCEPT: 'exit code: 1' });
    const ev = readEvents(dir, 1);
    assert.ok(names(ev).includes('ralph.issue.blocked'), 'issue is blocked');
    assert.ok(!names(ev).includes('ralph.pr.opened'), 'no PR on a never-green slice');
    assert.equal(endStatus(ev), 'blocked', 'terminal status is blocked, not budget_exceeded');
    assert.equal(ev.find((e) => e.event === 'ralph.session.ended')?.details?.reason, 'max-iterations-reached');
  });
});

// T5 — reviewer blocking on the last iteration → blocked, no PR (never ships a 🛑).
test('reviewer blocking on last iteration: blocked, no PR opened', () => {
  withConsumer((dir) => {
    const { out } = runRalph(dir, ['1', '1'], { MOCK_REVIEW: '🛑 §27 Authorization missing before domain action.' });
    const ev = names(readEvents(dir, 1));
    assert.ok(ev.includes('ralph.issue.blocked'));
    assert.ok(!ev.includes('ralph.pr.opened'), 'a blocking finding must never ship a PR');
  });
});

// T6 — reviewer blocking with budget left → an extra /tdd iteration (§66).
test('reviewer blocking with iterations left: retries (≥2 iterations started)', () => {
  withConsumer((dir) => {
    runRalph(dir, ['1', '2'], { MOCK_REVIEW: '🛑 still blocking' });
    const starts = names(readEvents(dir, 1)).filter((e) => e === 'ralph.iteration.started').length;
    assert.ok(starts >= 2, `expected a retry iteration on blocking, got ${starts}`);
  });
});

// T7 — queue mode: processes the whole ralph-ready backlog; a blocked issue doesn't halt it.
test('queue mode: backlog [1,2] both processed; a blocked issue does not halt the queue', () => {
  withConsumer((dir) => {
    const { out } = runRalph(dir, ['--max-iterations', '2'], { MOCK_READY: '1\n2', MOCK_FAIL_ISSUE: '2' });
    assert.match(out, /Issue #1/);
    assert.match(out, /Issue #2/, 'queue continued to #2 after #1');
    assert.equal(endStatus(readEvents(dir, 1)), 'completed', '#1 (green) completes + PR');
    assert.equal(endStatus(readEvents(dir, 2)), 'blocked', '#2 (forced fail) is blocked, not skipped');
  });
});

// T8 — every emitted log line across a run is valid NDJSON (readEvents throws otherwise).
test('session log is valid NDJSON throughout', () => {
  withConsumer((dir) => {
    runRalph(dir, ['1', '2']);
    const ev = readEvents(dir, 1);
    assert.ok(ev.length >= 5);
    assert.equal(ev[0].event, 'ralph.session.started');
    assert.equal(ev[ev.length - 1].event, 'ralph.session.ended');
  });
});
