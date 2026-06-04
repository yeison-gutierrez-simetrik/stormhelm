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
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, chmodSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(here, '..', '..', 'templates');
const MOCK_BIN = join(here, 'fixtures', 'ralph-mock-bin');

// Make sure the mock executables are runnable even if the checkout dropped the bit.
for (const m of ['gh', 'claude', 'docker', 'git']) chmodSync(join(MOCK_BIN, m), 0o755);

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
// Post-FU-33 the verdict arrives via the result file's gates.reviewer (the
// skill's Step 11 makes a 🛑 exit non-zero), not via a loop-run /code-review.
test('reviewer blocking on last iteration: blocked, no PR opened', () => {
  withConsumer((dir) => {
    const { out } = runRalph(dir, ['1', '1'], { MOCK_ACCEPT_REVIEWER: 'blocking' });
    const ev = names(readEvents(dir, 1));
    assert.ok(ev.includes('ralph.issue.blocked'));
    assert.ok(!ev.includes('ralph.pr.opened'), 'a blocking finding must never ship a PR');
  });
});

// T6 — reviewer blocking with budget left → an extra /tdd iteration (§66).
test('reviewer blocking with iterations left: retries (≥2 iterations started)', () => {
  withConsumer((dir) => {
    runRalph(dir, ['1', '2'], { MOCK_ACCEPT_REVIEWER: 'blocking' });
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

// ── FOLLOW-UP 14: structured acceptance result channel ────────────────────────

// T9 — green is decided by the result FILE, not prose: the mock prints no
// "exit code: 0" anywhere, yet a green result file → PR + per-scenario truth.
test('FU-14: green via result file (no prose contract); per-scenario events from scenarios{}', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '3']);
    assert.equal(status, 0);
    assert.match(out, /pull\/9/);
    const ev = readEvents(dir, 1);
    const passed = ev.filter((e) => e.event === 'ralph.scenario.passed');
    assert.equal(passed.length, 1, 'exactly the scenarios{} entries, not blanket-passed labels');
    assert.equal(passed[0].details.scenario, 'scn-001');
  });
});

// T10 — the skill never writes the contract file → fail with a machine-greppable
// reason in the NDJSON (the live run's forensic gap: 8 iterations, zero reasons).
test('FU-14: missing result file → acceptance-failing with reason result-file-missing', () => {
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '2'], { MOCK_NO_RESULT_FILE: '1' });
    assert.notEqual(status, 0);
    const ev = readEvents(dir, 1);
    const fails = ev.filter((e) => e.event === 'ralph.iteration.completed' && e.details.outcome === 'acceptance-failing');
    assert.ok(fails.length >= 1);
    assert.match(fails[0].details.reason, /result-file-missing/);
    assert.equal(endStatus(ev), 'blocked');
  });
});

// T11 — a failing result file surfaces its failure_reason in the NDJSON.
test('FU-14: failing result file → failure_reason recorded in iteration.completed', () => {
  withConsumer((dir) => {
    runRalph(dir, ['1', '1'], { MOCK_ACCEPT: 'exit code: 1' });
    const ev = readEvents(dir, 1);
    const fail = ev.find((e) => e.event === 'ralph.iteration.completed' && e.details.outcome === 'acceptance-failing');
    assert.match(fail.details.reason, /exit_code=1: mock forced failure/);
    const scnFail = ev.find((e) => e.event === 'ralph.scenario.failed');
    assert.equal(scnFail?.details?.scenario, 'scn-001', 'per-scenario failure fed from the result file');
  });
});

// ── FOLLOW-UP 18: environment pre-flight ──────────────────────────────────────

// T13 — testcontainers declared + Docker down → exit BEFORE iteration 1, actionable
// message, issue NOT labeled ralph-blocked (operator problem, not issue problem).
test('FU-18: testcontainers + docker down → fail fast before iteration 1', () => {
  withConsumer((dir) => {
    writeFileSync(join(dir, 'package.json'), '{ "devDependencies": { "@testcontainers/postgresql": "^10.0.0" } }');
    const { status, out } = runRalph(dir, ['1', '3'], { MOCK_DOCKER_DOWN: '1' });
    assert.notEqual(status, 0);
    assert.match(out, /Docker daemon not running/);
    const ev = readEvents(dir, 1);
    assert.ok(names(ev).includes('ralph.preflight.failed'));
    assert.ok(!names(ev).includes('ralph.iteration.started'), 'no iteration burned on an unfixable env');
    assert.ok(!names(ev).includes('ralph.issue.blocked'), 'env failure must not ralph-block the issue');
  });
});

// T14 — testcontainers declared + Docker healthy → unchanged happy path.
test('FU-18: testcontainers + docker up → normal run', () => {
  withConsumer((dir) => {
    writeFileSync(join(dir, 'package.json'), '{ "devDependencies": { "@testcontainers/postgresql": "^10.0.0" } }');
    const { status } = runRalph(dir, ['1', '3']);
    assert.equal(status, 0);
  });
});

// T15b — placeholder secrets in .env → fail fast before iteration 1, keys named.
test('FU-18/Adj-3: .env with REPLACE_ME sentinel → fail fast naming the key', () => {
  withConsumer((dir) => {
    writeFileSync(join(dir, '.env'), '# comment with REPLACE_ME is fine\nSTRIPE_KEY=REPLACE_ME\nDB_URL=postgres://real:cred@host/db\n');
    const { status, out } = runRalph(dir, ['1', '3']);
    assert.notEqual(status, 0);
    assert.match(out, /placeholder values/);
    assert.match(out, /STRIPE_KEY/, 'the offending key is named');
    const ev = readEvents(dir, 1);
    assert.ok(!names(ev).includes('ralph.iteration.started'), 'no iteration burned');
    assert.ok(!names(ev).includes('ralph.issue.blocked'), 'env failure must not ralph-block the issue');
  });
});

// T15c — a real-valued .env (sentinel only in a comment) passes.
test('FU-18/Adj-3: .env with real values (sentinel only in comments) → normal run', () => {
  withConsumer((dir) => {
    writeFileSync(join(dir, '.env'), '# replace REPLACE_ME before prod\nSTRIPE_KEY=sk_test_real\n');
    const { status } = runRalph(dir, ['1', '3']);
    assert.equal(status, 0);
  });
});

// T15 — RALPH_PREFLIGHT_CMD consumer hook: non-zero blocks the launch.
test('FU-18: RALPH_PREFLIGHT_CMD failing → fail fast with the command named', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '3'], { RALPH_PREFLIGHT_CMD: 'test -f /nonexistent-sentinel' });
    assert.notEqual(status, 0);
    assert.match(out, /RALPH_PREFLIGHT_CMD failed/);
  });
});

// ── FOLLOW-UP 19: real token accounting ───────────────────────────────────────

// T16 — usage flows from the JSON envelope to the NDJSON: cumulative > 0
// (was 0 across every event of every live iteration — the budget gate was dead).
test('FU-19: token usage from --output-format json lands in the session log', () => {
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '3']);
    assert.equal(status, 0);
    const ev = readEvents(dir, 1);
    const maxCumulative = Math.max(...ev.map((e) => e.tokensConsumedCumulative));
    assert.ok(maxCumulative >= 1540, `expected cumulative >= one call's usage, got ${maxCumulative}`);
    assert.ok(ev.some((e) => e.tokensConsumedDelta > 0), 'at least one event carries a non-zero delta');
  });
});

// T17 — a tiny budget label now actually engages the §63/§65 gate:
// blocked with budget_exceeded (this path was unreachable before).
test('FU-19: budget:1k label → budget_exceeded block path engages', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '5'], { MOCK_LABELS: 'ralph-ready\nscenarios:scn-001\nbudget:1k' });
    assert.notEqual(status, 0);
    assert.match(out, /Budget exceeded/);
    const ev = readEvents(dir, 1);
    assert.ok(names(ev).includes('ralph.budget.exceeded'));
    assert.equal(endStatus(ev), 'budget_exceeded');
    assert.ok(names(ev).includes('ralph.issue.blocked'), 'budget exhaustion blocks the issue');
  });
});

// ── FOLLOW-UP 22: branch slug sanitization ────────────────────────────────────

// T18 — em-dash/accents/emoji in the issue title never reach the git ref.
test('FU-22: non-ASCII title → [a-z0-9-]-only branch slug', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '3'], { MOCK_TITLE: '02-Stripe Connect — Onboarding, Sí! 🚀' });
    assert.equal(status, 0);
    const m = out.match(/on branch (\S+)/);
    assert.ok(m, `branch line missing in: ${out}`);
    assert.match(m[1], /^agent\/feature-[a-z0-9-]+-1$/, `non-sanitized branch: ${m[1]}`);
    assert.ok(!/[^\x20-\x7E\n]/.test(m[1]), 'branch must be pure ASCII');
  });
});

// T19 — plain ASCII titles keep their obvious slug shape.
test('FU-22: ASCII title unchanged in spirit (lowercased, dashed)', () => {
  withConsumer((dir) => {
    const { out } = runRalph(dir, ['1', '3'], { MOCK_TITLE: 'Add Webhook Retry' });
    assert.match(out, /on branch agent\/feature-add-webhook-retry-1/);
  });
});

// ── FOLLOW-UP 29: the branch must be pushed before gh pr create ───────────────
// (The mock gh now enforces the real CLI's contract: `pr create` aborts unless
// the mock git recorded a `push` — so EVERY happy-path test in this file also
// pins the push-before-create order.)

// T22 — push precedes PR creation, in the NDJSON order too.
test('FU-29: green path pushes the branch before gh pr create', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '3']);
    assert.equal(status, 0, out);
    assert.match(out, /pull\/9/);
    const ev = readEvents(dir, 1);
    const idxPush = ev.findIndex((e) => e.event === 'ralph.git.action' && e.details.action === 'push' && e.details.status === 'success');
    const idxPr = ev.findIndex((e) => e.event === 'ralph.pr.opened');
    assert.ok(idxPush !== -1, 'a push event is logged');
    assert.ok(idxPr !== -1, 'the PR opens');
    assert.ok(idxPush < idxPr, 'push happens BEFORE pr create');
  });
});

// T23 — a failing push takes the block path with a structured reason (never a
// silent finish-line death like the live issue-15 run).
test('FU-29: push failure → blocked with reason git-push-failed, no PR', () => {
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '1'], { MOCK_PUSH_FAIL: '1' });
    assert.notEqual(status, 0);
    const ev = readEvents(dir, 1);
    assert.ok(names(ev).includes('ralph.issue.blocked'));
    assert.ok(!names(ev).includes('ralph.pr.opened'), 'no PR without a pushed branch');
    assert.equal(ev.find((e) => e.event === 'ralph.session.ended')?.details?.reason, 'git-push-failed');
  });
});

// ── FOLLOW-UP 27: VERDICT line beats emoji headers in severity parsing ────────

const severity = (text) => spawnSync('bash', ['-c',
  `source "${join(TEMPLATES, 'ralph-lib.sh')}"; ralph_reviewer_severity "$1"`, '_', text,
], { encoding: 'utf8' }).stdout.trim();

// The reviewer's structured report ALWAYS carries emoji section headers —
// a clean report contains "## 🛑 Blocking findings (0)" — which the old
// emoji grep classified as blocking (live false-blocking → wasted retry).
const CLEAN_REPORT = `# Code review — slice
## 🛑 Blocking findings (0)
## ⚠️ Should fix (0)
## 💡 Suggestions (0)
| 🛑 Blocking | 0 |
**Recommendation:** approve as-is
VERDICT: CLEAN`;

test('FU-27: clean report with emoji headers + VERDICT: CLEAN → clean', () => {
  assert.equal(severity(CLEAN_REPORT), 'clean');
});

test('FU-27: VERDICT wins over emojis, last occurrence, markdown/case tolerated', () => {
  assert.equal(severity('🛑 stuff\n**VERDICT: BLOCKING**'), 'blocking');
  assert.equal(severity('mentions VERDICT: CLEAN early\n…later real one:\nverdict: should-fix'), 'should-fix');
  assert.equal(severity('## 💡 Suggestions (2)\nVERDICT: SUGGESTION'), 'suggestion');
});

test('FU-27: legacy outputs without VERDICT keep the emoji fallback', () => {
  assert.equal(severity('🛑 §27 Authorization missing'), 'blocking');
  assert.equal(severity('💡 minor: extract a helper'), 'suggestion');
  assert.equal(severity('all good, nothing to report'), 'clean');
});

// Loop-level (post-FU-33 this is the LEGACY FALLBACK path): a result file
// without gates.reviewer → exactly one /code-review invocation, whose
// clean-with-emoji-headers report must take the PR path (no retry).
test('FU-27: fallback /code-review on a legacy result file — clean report → PR path', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '2'], { MOCK_NO_REVIEWER_GATE: '1', MOCK_REVIEW: CLEAN_REPORT });
    assert.equal(status, 0, out);
    assert.match(out, /pull\/9/);
    const ev = readEvents(dir, 1);
    assert.ok(names(ev).includes('ralph.reviewer.fallback_invocation'), 'fallback path taken');
    assert.ok(!names(ev).includes('ralph.reviewer.retry'), 'no false-blocking retry');
    const findings = ev.find((e) => e.event === 'ralph.reviewer.findings');
    assert.equal(findings?.details?.severity, 'clean');
    assert.equal(findings?.details?.source, 'fallback-invocation');
    const prompts = readFileSync(join(dir, '.mock-claude-prompts'), 'utf8');
    assert.equal((prompts.match(/\/code-review/g) || []).length, 1, 'exactly ONE fallback invocation');
  });
});

// ── FOLLOW-UP 26 (+33): blocking findings reach the next iteration via comment ─

// T28 — findings used to live only in shell memory. Post-FU-33 the blocking
// verdict arrives on the FAILING path (skill Step 11: 🛑 ⇒ exit non-zero) and
// the report file's content lands as the issue comment the next /tdd reads.
test('FU-26: blocking findings are posted as an issue comment before the next iteration', () => {
  withConsumer((dir) => {
    runRalph(dir, ['1', '2'], { MOCK_ACCEPT_REVIEWER: 'blocking', MOCK_REVIEW: '🛑 §27 missing auth check\nVERDICT: BLOCKING' });
    const ev = readEvents(dir, 1);
    const starts = names(ev).filter((e) => e === 'ralph.iteration.started').length;
    assert.ok(starts >= 2, 'a follow-up iteration happened');
    const comments = readFileSync(join(dir, '.mock-gh-comments'), 'utf8');
    assert.match(comments, /Reviewer findings \(iteration 1\)/, 'findings comment posted');
    assert.match(comments, /§27 missing auth check/, 'the report FILE content is in the comment');
  });
});

// ── FOLLOW-UP 33: the result file is the single reviewer channel ──────────────

// T-33a — a normal green run NEVER invokes /code-review: severity comes from
// gates.reviewer, the report from issue-<N>-reviewer.md (~15k tokens of
// measured duplication removed).
test('FU-33: green run → zero /code-review invocations, severity from the result file', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '3']);
    assert.equal(status, 0, out);
    assert.match(out, /pull\/9/);
    const prompts = readFileSync(join(dir, '.mock-claude-prompts'), 'utf8');
    assert.doesNotMatch(prompts, /\/code-review/, 'the loop must not re-invoke the reviewer');
    const ev = readEvents(dir, 1);
    const findings = ev.find((e) => e.event === 'ralph.reviewer.findings');
    assert.equal(findings?.details?.severity, 'clean');
    assert.equal(findings?.details?.source, 'result-file');
  });
});

// T-33b — the PR body embeds the report FILE's content (should-fix verdict).
test('FU-33: PR body embeds the reviewer report from the file', () => {
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '2'], { MOCK_ACCEPT_REVIEWER: 'should-fix', MOCK_REVIEW: '⚠️ §5 any type introduced\nVERDICT: SHOULD-FIX' });
    assert.equal(status, 0);
    const pr = readFileSync(join(dir, '.mock-gh-prcreate'), 'utf8');
    assert.match(pr, /MOCK-REVIEWER-REPORT/, 'report file content embedded in the PR body');
    assert.match(pr, /§5 any type introduced/);
  });
});

// T-33c — contract-violation belt-and-braces: exit_code 0 BUT gates.reviewer
// blocking → comment + retry (never a PR with a 🛑 embedded).
test('FU-33: green result claiming blocking reviewer → retry, never a PR', () => {
  withConsumer((dir) => {
    runRalph(dir, ['1', '1'], { MOCK_ACCEPT_REVIEWER: 'blocking', MOCK_GREEN_WITH_BLOCKING: '1' });
    const ev = readEvents(dir, 1);
    assert.ok(!names(ev).includes('ralph.pr.opened'), 'no PR on a blocking verdict');
    assert.ok(names(ev).includes('ralph.issue.blocked'), 'last-iteration blocking → blocked');
  });
});

// ── FOLLOW-UP 34: the failure diagnosis feeds the next /tdd prompt ────────────

// The gate already produced an actionable failure_reason; before this fix the
// next session had to re-discover it from scratch (or miss it).
test('FU-34: iteration N\'s failure_reason lands in iteration N+1\'s /tdd prompt', () => {
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '3'], { MOCK_FAIL_FIRST: '1' });
    assert.equal(status, 0, 'fail→green arc must still deliver the PR');
    const prompts = readFileSync(join(dir, '.mock-claude-prompts'), 'utf8')
      .split('―――').map((s) => s.trim()).filter(Boolean);
    const tdd = prompts.filter((p) => p.includes('/tdd'));
    assert.ok(tdd.length >= 2, 'two tdd iterations ran');
    assert.doesNotMatch(tdd[0], /PREVIOUS ITERATION failed/, 'first prompt is clean');
    assert.match(tdd[1], /PREVIOUS ITERATION failed acceptance with: exit_code=1: mock forced failure/,
      'the diagnosis reached the retry prompt');
  });
});

// ── FOLLOW-UP 35: unparseable scenarios label fails loudly, pre-iteration ─────

// A range form (live near-miss: scn-031..038) expanded to ZERO scenarios with
// no error — the engine must refuse BEFORE iteration 1 with the canonical form.
test('FU-35: range-form scenarios label → engine aborts pre-iteration with the canonical form named', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '3'], { MOCK_LABELS: 'ralph-ready\nscenarios:scn-031..038\nbudget:150k' });
    assert.notEqual(status, 0);
    assert.match(out, /unparseable scenarios label 'scn-031\.\.038'/);
    assert.match(out, /scn-NNN\+NNN/, 'the canonical form is named');
    const ev = readEvents(dir, 1);
    assert.ok(!names(ev).includes('ralph.iteration.started'), 'no iteration burned');
  });
});

test('FU-35: canonical compact label still runs normally', () => {
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '3'], { MOCK_LABELS: 'ralph-ready\nscenarios:scn-001\nbudget:150k' });
    assert.equal(status, 0);
  });
});

// ── FOLLOW-UP 36: review-grade PR title + body, composed from the result file ─

test('FU-36: PR title carries the issue title; body carries per-scenario outcomes + Closes', () => {
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '2'], { MOCK_TITLE: 'Stripe Connect onboarding' });
    assert.equal(status, 0);
    const pr = readFileSync(join(dir, '.mock-gh-prcreate'), 'utf8');
    assert.match(pr, /Stripe Connect onboarding \(#1\)/, 'real title, not "fix #1"');
    assert.match(pr, /Closes #1/);
    assert.match(pr, /✅ `scn-001` — passed/, 'per-scenario outcome line');
    assert.match(pr, /Scenarios \(ran\/expected\):.*1\/1/, 'count line from the result file');
    assert.match(pr, /Reviewer severity:.*clean/);
  });
});

// ── FOLLOW-UP 38c: per-call token/duration instrumentation ────────────────────

// Optimization decisions (skill pruning, session reuse) were guesswork sourced
// from manual checkpoint subtraction — ralph.call.completed gives the per-call
// breakdown every session log now carries.
test('FU-38c: every claude call emits ralph.call.completed with tokens + duration', () => {
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '3']);
    assert.equal(status, 0);
    const calls = readEvents(dir, 1).filter((e) => e.event === 'ralph.call.completed');
    const byName = Object.fromEntries(calls.map((c) => [c.details.call, c]));
    assert.ok(byName.tdd, 'tdd call instrumented');
    assert.ok(byName['run-acceptance'], 'acceptance call instrumented');
    for (const c of calls) {
      assert.equal(typeof c.details.tokens, 'number');
      assert.ok(c.details.tokens >= 1540, `per-call tokens measured, got ${c.details.tokens}`);
      assert.equal(typeof c.details.duration_s, 'number');
      assert.ok(c.details.duration_s >= 0);
    }
  });
});

// ── FOLLOW-UP 28: pre-delete the result file before each acceptance session ───

// T29 — a pre-seeded GREEN result file + a session that skips the mandatory
// rewrite must read as result-file-missing (contract violation), never go
// green off the seed nor read as -stale (the live confusion).
test('FU-28: stale green seed + no rewrite → result-file-missing, never green', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, '.planning', 'acceptance'), { recursive: true });
    writeFileSync(join(dir, '.planning', 'acceptance', 'issue-1-result.json'),
      '{ "issue": 1, "exit_code": 0, "scenarios": { "scn-001": "passed" }, "ran": 1, "expected": 1, "failure_reason": null }');
    const { status } = runRalph(dir, ['1', '1'], { MOCK_NO_RESULT_FILE: '1' });
    assert.notEqual(status, 0, 'a skipped rewrite must never ride a previous green');
    const ev = readEvents(dir, 1);
    const fail = ev.find((e) => e.event === 'ralph.iteration.completed' && e.details.outcome === 'acceptance-failing');
    assert.match(fail.details.reason, /result-file-missing/, 'unambiguous contract violation');
    assert.doesNotMatch(fail.details.reason, /stale/, 'never confusable with staleness');
    assert.ok(!names(ev).includes('ralph.pr.opened'));
  });
});

// ── FOLLOW-UP 30: block-path robustness ───────────────────────────────────────

// T30a — blocking an issue in a label-less repo provisions ralph-blocked first
// (gh issue edit --add-label fails SILENTLY on a missing label).
test('FU-30a: block path creates the ralph-blocked label idempotently', () => {
  withConsumer((dir) => {
    runRalph(dir, ['1', '1'], { MOCK_ACCEPT: 'exit code: 1' });
    const labels = readFileSync(join(dir, '.mock-gh-labels'), 'utf8');
    assert.match(labels, /ralph-blocked.*--force/, 'label provisioned with --force before the add');
  });
});

// T30b — a budget block right AFTER a green acceptance run must report the
// scenarios from the RESULT FILE (✅ passed), not "⚪ not attempted" (the
// NDJSON events are only emitted on the green path, which the budget guard
// preempts — the live blocked comment contradicted the result file).
test('FU-30b: blocked comment reads scenario truth from the result file', () => {
  withConsumer((dir) => {
    // tdd (1540) stays under 2k; acceptance (3080 cumulative) exceeds →
    // budget-block fires right after a GREEN acceptance wrote the file.
    const { status } = runRalph(dir, ['1', '3'], { MOCK_LABELS: 'ralph-ready\nscenarios:scn-001\nbudget:2k' });
    assert.notEqual(status, 0);
    const ev = readEvents(dir, 1);
    assert.equal(endStatus(ev), 'budget_exceeded');
    const comments = readFileSync(join(dir, '.mock-gh-comments'), 'utf8');
    assert.match(comments, /✅ `scn-001` — passed/, 'scenario truth from the result file');
    assert.doesNotMatch(comments, /⚪ `scn-001`/, 'never "not attempted" when the file says passed');
  });
});

// ── Review adjustment 1: @manual scenarios in the result contract (§60) ───────

// A scenarios{} entry of "manual" is a §60 exclusion, not a failure — it must
// produce NO scenario event (pre-fix the catch-all case logged scenario.failed
// with reason "manual").
test('Adj-1: scenarios{} value "manual" emits no passed/failed event', () => {
  withConsumer((dir) => {
    const file = join(dir, 'r.json');
    writeFileSync(file, JSON.stringify({
      issue: 7, exit_code: 0,
      scenarios: { 'scn-001': 'passed', 'scn-002': 'manual' },
      ran: 1, expected: 1, failure_reason: null,
    }));
    const r = spawnSync('bash', ['-c', [
      `source "${join(TEMPLATES, 'ralph-lib.sh')}"`,
      `RALPH_SESSION_LOG="${join(dir, 's.log')}"; RALPH_SESSION_ID=t; RALPH_ISSUE_NUMBER=7`,
      `ralph_log_scenarios_from_result "${file}" "scn-001,scn-002"`,
    ].join('\n')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const log = readFileSync(join(dir, 's.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(log.filter((e) => e.event === 'ralph.scenario.passed').length, 1);
    assert.equal(log.filter((e) => e.event === 'ralph.scenario.failed').length, 0,
      'a manual scenario must not be logged as failed');
  });
});

// ── FOLLOW-UP 21: scenarios:* label expansion (shared lib helper) ─────────────

// T20 — ralph_expand_scns normalizes compact/spelled/comma label forms.
test('FU-21: ralph_expand_scns expands every wild label form', () => {
  const r = spawnSync('bash', ['-c',
    `source "${join(TEMPLATES, 'ralph-lib.sh')}"; ralph_expand_scns "scn-021+022,scn-030+scn-031"`,
  ], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), 'scn-021 scn-022 scn-030 scn-031');
});

// T20b — non-numeric garbage is dropped, matching check-invariants.mjs' parser
// (the two auditors must agree on what a label means).
test('FU-21: ralph_expand_scns drops non-numeric segments', () => {
  const r = spawnSync('bash', ['-c',
    `source "${join(TEMPLATES, 'ralph-lib.sh')}"; ralph_expand_scns "scn-021+foo+022,scn-"`,
  ], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), 'scn-021 scn-022');
});

// ── render_blocked_comment: multiline substitution (found during FU-19) ───────

// T21 — multiline values (every real substitution: scenario_results,
// last_actions, reviewer_section) must render. `awk -v` errors "newline in
// string" on BSD awk and escape-processes backslashes — placeholders were left
// unrendered on macOS.
test('render_blocked_comment substitutes multiline values and leaves no placeholder', () => {
  withConsumer((dir) => {
    const tpl = join(dir, 'tpl.md');
    writeFileSync(tpl, '## Scenarios\n{scenario_results}\n## Reviewer\n{reviewer_section}\n');
    const r = spawnSync('bash', ['-c', [
      `source "${join(TEMPLATES, 'ralph-lib.sh')}"`,
      `ralph_render_blocked_comment "${tpl}" \\`,
      `  scenario_results "- ✅ scn-001 — passed\n- 🛑 scn-002 — failed" \\`,
      `  reviewer_section "line1 \\n is literal\nline2"`,
    ].join('\n')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /scn-001 — passed/);
    assert.match(r.stdout, /scn-002 — failed/);
    assert.match(r.stdout, /line2/);
    assert.match(r.stdout, /line1 \\n is literal/, 'backslash sequences must stay literal (no -v escape processing)');
    assert.doesNotMatch(r.stdout, /\{scenario_results\}|\{reviewer_section\}/, 'no placeholder may survive');
    assert.doesNotMatch(r.stderr, /newline in string/, 'BSD awk must not reject multiline values');
  });
});

// T12 — unit coverage for ralph_acceptance_result_check: every rejection reason.
test('FU-14: ralph_acceptance_result_check rejects stale/wrong-issue/invalid/ran<expected; accepts green', () => {
  withConsumer((dir) => {
    const check = (json, args) => {
      const r = spawnSync('bash', ['-c',
        `source "${join(TEMPLATES, 'ralph-lib.sh')}"; ralph_acceptance_result_check ${args}`,
      ], { cwd: dir, encoding: 'utf8', input: '' });
      return { rc: r.status, out: r.stdout.trim() };
    };
    const file = join(dir, 'r.json');
    const write = (obj) => spawnSync('bash', ['-c', `cat > "${file}"`], { input: JSON.stringify(obj), encoding: 'utf8' });

    write({ issue: 7, exit_code: 0, scenarios: {}, ran: 2, expected: 2, failure_reason: null });
    assert.deepEqual(check(null, `"${file}" 7 0`), { rc: 0, out: 'green' });

    assert.match(check(null, `"${dir}/absent.json" 7 0`).out, /result-file-missing/);

    write({ issue: 9, exit_code: 0 });
    assert.match(check(null, `"${file}" 7 0`).out, /result-file-wrong-issue/);

    write({ issue: 7, exit_code: 0, ran: 0, expected: 2 });
    assert.match(check(null, `"${file}" 7 0`).out, /ran-below-expected/, 'empty selection is never a pass');

    write({ issue: 7, exit_code: 1, failure_reason: 'smoke gate red' });
    assert.match(check(null, `"${file}" 7 0`).out, /exit_code=1: smoke gate red/);

    // stale: min_epoch far in the future
    write({ issue: 7, exit_code: 0 });
    assert.match(check(null, `"${file}" 7 99999999999`).out, /result-file-stale/);

    spawnSync('bash', ['-c', `echo "not json" > "${file}"`]);
    assert.match(check(null, `"${file}" 7 0`).out, /result-file-invalid-json/);
  });
});

// ── FOLLOW-UP 41: ralph-done provisioned just-in-time before the rotation ─────

// The live first autonomous run ended with ZERO ralph-* labels: ralph-done
// didn't exist in the (re-sync-adopted) repo and gh failed the rotation
// silently — the issue lost ralph-ready and gained nothing. The mock gh now
// REFUSES --add-label for non-created labels, so this green run only passes
// if the engine provisions ralph-done first AND the rotation succeeds.
test('FU-41: green run provisions ralph-done before rotating; rotation failure is never silent', () => {
  withConsumer((dir) => {
    const { status } = runRalph(dir, ['1', '3']);
    assert.equal(status, 0);
    const labels = readFileSync(join(dir, '.mock-gh-labels'), 'utf8');
    assert.match(labels, /ralph-done.*--force/, 'ralph-done created just-in-time');
    const ev = readEvents(dir, 1);
    const rotationErr = ev.find((e) => e.event === 'ralph.error.tool' && /label rotation/.test(e.details.message || ''));
    assert.equal(rotationErr, undefined, 'the rotation succeeded — no error event');
    assert.ok(names(ev).includes('ralph.pr.opened'));
  });
});

// ── E2E: the full autonomous arc with every Day Shift channel exercised ───────
//
// One run, the whole contract: issue labels (§63) → /tdd told to read body AND
// comments (FU-17) → iteration 1 fails with a gate diagnosis → the diagnosis
// feeds iteration 2's prompt (FU-34) → green → reviewer verdict+report arrive
// from the acceptance session's files, never a /code-review (FU-33) → per-call
// instrumentation (FU-38c) → push before PR (FU-29) → review-grade PR composed
// from the result file (FU-36) → session completed. If Ralph can't be
// autonomous with the Day Shift's information, this test names where.
test('E2E: fail→feedback→green→reviewer-from-file→push→composed PR, fully autonomous', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '3'], {
      MOCK_FAIL_FIRST: '1',
      MOCK_TITLE: 'Stripe Connect onboarding',
      MOCK_ACCEPT_REVIEWER: 'should-fix',
      MOCK_REVIEW: '⚠️ §5 any type introduced\nVERDICT: SHOULD-FIX',
    });
    assert.equal(status, 0, out);

    const ev = readEvents(dir, 1);
    // Arc shape: exactly fail → green, then completed.
    const outcomes = ev.filter((e) => e.event === 'ralph.iteration.completed').map((e) => e.details.outcome);
    assert.deepEqual(outcomes, ['acceptance-failing', 'green']);
    assert.equal(endStatus(ev), 'completed');

    // Day Shift channels reach the implementer:
    const prompts = readFileSync(join(dir, '.mock-claude-prompts'), 'utf8')
      .split('―――').map((s) => s.trim()).filter(Boolean);
    const tdd = prompts.filter((p) => p.includes('/tdd'));
    assert.equal(tdd.length, 2);
    assert.match(tdd[0], /body AND comments/, 'FU-17: plan + amendments channel in every prompt');
    assert.match(tdd[1], /PREVIOUS ITERATION failed acceptance with: exit_code=1/, 'FU-34: gate diagnosis fed forward');

    // FU-33: zero loop-side reviewer invocations; verdict came from the file.
    assert.doesNotMatch(readFileSync(join(dir, '.mock-claude-prompts'), 'utf8'), /\/code-review/);
    const findings = ev.filter((e) => e.event === 'ralph.reviewer.findings');
    assert.ok(findings.some((f) => f.details.source === 'result-file' && f.details.severity === 'should-fix'));

    // FU-38c: every call instrumented (2 tdd + 2 acceptance).
    const calls = ev.filter((e) => e.event === 'ralph.call.completed');
    assert.equal(calls.length, 4, `4 instrumented calls, got ${calls.length}`);

    // FU-29 + FU-36: push precedes a composed, review-grade PR.
    const idxPush = ev.findIndex((e) => e.event === 'ralph.git.action' && e.details.action === 'push' && e.details.status === 'success');
    const idxPr = ev.findIndex((e) => e.event === 'ralph.pr.opened');
    assert.ok(idxPush !== -1 && idxPr !== -1 && idxPush < idxPr);
    const pr = readFileSync(join(dir, '.mock-gh-prcreate'), 'utf8');
    assert.match(pr, /Stripe Connect onboarding \(#1\)/);
    assert.match(pr, /Closes #1/);
    assert.match(pr, /✅ `scn-001` — passed/);
    assert.match(pr, /Reviewer severity:.*should-fix/);
    assert.match(pr, /MOCK-REVIEWER-REPORT/, 'the report FILE is what the PR embeds');
  });
});

// ── FOLLOW-UP 38a: base-branch chaining for slice-groups ──────────────────────

// The maintainer's ruling: Night Shift slice-groups chain (deliberate §123
// exception) — each sibling branches FROM the previous one and PRs AGAINST it,
// with merge-commit + base-first stated in the PR body.
test('FU-38a: --base chains the slice — branch from base, PR against base, stack note in body', () => {
  withConsumer((dir) => {
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    // a foundation branch with a commit main doesn't have:
    git('checkout', '-qb', 'agent/feature-foundation-9');
    writeFileSync(join(dir, 'foundation.txt'), 'wiring');
    git('add', '-A'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'foundation wiring');
    git('checkout', '-q', '-');

    const { status, out } = runRalph(dir, ['1', '2', '--base', 'agent/feature-foundation-9'], {});
    assert.equal(status, 0, out);
    // The slice branch contains the foundation commit (chained, not from main):
    const branch = (out.match(/on branch (\S+)/) || [])[1];
    assert.ok(branch, 'branch line present');
    const contains = git('branch', '--contains', git('rev-parse', 'agent/feature-foundation-9').stdout.trim()).stdout;
    assert.match(contains, new RegExp(branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'slice branch built on the foundation');
    // PR opened AGAINST the base, with the stack contract stated:
    const pr = readFileSync(join(dir, '.mock-gh-prcreate'), 'utf8');
    assert.match(pr, /--base agent\/feature-foundation-9/, 'PR targets the previous sibling');
    assert.match(pr, /STACKED PR \(slice-group chain/, 'stack note present');
    assert.match(pr, /merge commit/i, 'merge-commit requirement stated');
  });
});

test('FU-38a: --base with a non-existent ref refuses before any work', () => {
  withConsumer((dir) => {
    const { status, out } = runRalph(dir, ['1', '2', '--base', 'agent/feature-ghost-9'], {});
    assert.notEqual(status, 0);
    assert.match(out, /--base 'agent\/feature-ghost-9' does not resolve/);
    assert.equal(readEvents(dir, 1).filter((e) => e.event === 'ralph.iteration.started').length, 0);
  });
});
