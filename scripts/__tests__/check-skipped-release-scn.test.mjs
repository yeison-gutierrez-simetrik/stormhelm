// CI coverage for scripts/check-skipped-release-scn.mjs (FOLLOW-UP 108, §130b).
//
// The gate is file-aware (pure of git/network): it stands up a throwaway repo
// layout — a features/ tree with `# status:` headers + @release-tagged scns and
// an issue file with a `scenarios:` token — and asserts the gate fires (or stays
// silent) exactly as the engine runs it at acceptance. Mirrors a real consumer:
// the documented approved-first / implemented-at-close-out practice (§58).
//
// Run: node --test scripts/__tests__/check-skipped-release-scn.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const GATE = join(here, '..', 'check-skipped-release-scn.mjs');

function setup({ status, tags = '@release', scn = 'scn-566', issueToken = 'scenarios:scn-566' }) {
  const dir = mkdtempSync(join(tmpdir(), 'skipscn-'));
  mkdirSync(join(dir, 'features', 'notifications'), { recursive: true });
  const feature = [
    `# status: ${status}`,
    'Feature: Notifications',
    '',
    `  ${tags} @${scn}`,
    '  Scenario: a thing happens',
    '    Given a precondition',
    '    When an action',
    '    Then an outcome',
    '',
  ].join('\n');
  writeFileSync(join(dir, 'features', 'notifications', 'notifications.feature'), feature);
  const issue = join(dir, 'issue.md');
  writeFileSync(issue, `# Issue\nDelivers ${issueToken} for the slice.\n`);
  return { dir, issue };
}

const run = (dir, issue) =>
  spawnSync('node', [GATE, join(dir, 'features'), issue], { cwd: dir, encoding: 'utf8' });

function withRepo(opts, fn) {
  const { dir, issue } = setup(opts);
  try { return fn(dir, issue); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// The FU's exact failure: an issue claims a @release scn that still lives in a
// `# status: approved` feature → CI (IMPLEMENTED_ONLY) skips it → false-green.
test('FU-108: claimed @release scn in an approved feature → FAIL (named, exit 1)', () => {
  withRepo({ status: 'approved' }, (dir, issue) => {
    const r = run(dir, issue);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED-SCN GATE: FAIL/);
    assert.match(r.stdout, /scn-566/);
    assert.match(r.stdout, /IMPLEMENTED_ONLY/);
  });
});

test('FU-108: same scn once the feature is flipped to implemented → ok (exit 0)', () => {
  withRepo({ status: 'implemented' }, (dir, issue) => {
    const r = run(dir, issue);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED-SCN GATE: ok/);
  });
});

// Only @release scns gate CI's definition of done — a non-@release approved scn
// is legitimately not in the @release run, so it must NOT fail the gate.
test('FU-108: a claimed NON-@release scn in an approved feature → ok (not a false-green)', () => {
  withRepo({ status: 'approved', tags: '@smoke' }, (dir, issue) => {
    const r = run(dir, issue);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED-SCN GATE: ok/);
  });
});

// No scenarios: token at all → the gate is a no-op (na), never a false failure.
test('FU-108: issue with no scenarios: token → na (exit 0)', () => {
  withRepo({ issueToken: 'nothing here' }, (dir, issue) => {
    const r = run(dir, issue);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED-SCN GATE: na/);
  });
});

// A scn the issue claims but that is absent from features/ is the Step-3
// count-check's job (a missing @scn tag), NOT this gate's — it must not crash
// or false-fail here.
test('FU-108: claimed scn absent from features/ → ok here (Step-3 owns that)', () => {
  withRepo({ status: 'approved', issueToken: 'scenarios:scn-999' }, (dir, issue) => {
    const r = run(dir, issue);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED-SCN GATE: ok/);
  });
});

// Compact label forms (+ and ranges) expand correctly.
test('FU-108: compact scenarios:scn-565+566 form is parsed (566 still caught)', () => {
  withRepo({ status: 'approved', issueToken: 'scenarios:scn-565+566' }, (dir, issue) => {
    const r = run(dir, issue);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /scn-566/);
  });
});

// ── ISSUE #141 — mid-file `# status:` lint + CI mode + exit contract ───────
// cucumber.mjs statusOf() reads `# status:` only from the header (breaks at the
// first Feature/@), so a per-scenario/mid-file status is silently ignored → the
// feature is skipped under IMPLEMENTED_ONLY and its @release scns never run, yet
// the gate is green. The lint makes that misuse LOUD; the CI mode wires it into
// a plain pull_request job (rc 0/1, never 2 on a bare call).

function setupFeature(content) {
  const dir = mkdtempSync(join(tmpdir(), 'midfile-'));
  mkdirSync(join(dir, 'features', 'x'), { recursive: true });
  writeFileSync(join(dir, 'features', 'x', 'x.feature'), content);
  return dir;
}
const runCI = (dir, ...extra) => spawnSync('node', [GATE, join(dir, 'features'), ...extra], { cwd: dir, encoding: 'utf8' });

test('#141: a mid-file `# status:` (after the header) trips the lint → FAIL exit 1', () => {
  // line-1 header says approved; a per-scenario `# status: implemented` is IGNORED.
  const dir = setupFeature([
    '# status: approved',
    'Feature: X',
    '',
    '  # status: implemented',   // mid-file — silently ignored by cucumber
    '  @release @scn-701',
    '  Scenario: a deliverable',
    '    Given a precondition',
    '    Then an outcome',
    '',
  ].join('\n'));
  try {
    const r = runCI(dir, join(dir, 'issue.md'));   // issue file absent — irrelevant; the lint always runs
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED-SCN GATE: FAIL/);
    assert.match(r.stdout, /MID-FILE STATUS/);
    assert.match(r.stdout, /x\.feature:4/);   // the mid-file line number
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('#141: CI mode (features-dir ALONE) — clean feature → ok exit 0, never rc 2', () => {
  const dir = setupFeature([
    '# status: approved',
    'Feature: X',
    '',
    '  @release @scn-702',
    '  Scenario: in-planning is fine',
    '    Given a precondition',
    '    Then an outcome',
    '',
  ].join('\n'));
  try {
    const r = runCI(dir);   // no issue file → CI mode
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED-SCN GATE: ok/);
    assert.match(r.stdout, /CI mode/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('#141: CI mode catches a mid-file status with NO issue file → FAIL exit 1', () => {
  const dir = setupFeature('# status: draft\nFeature: X\n\n  @scn-1\n  Scenario: s\n    Given g\n  # status: implemented\n');
  try {
    const r = runCI(dir);   // bare features-dir
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /MID-FILE STATUS/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('#141: exit contract — 0 args → rc 2 (usage); a bare features-dir is NOT rc 2', () => {
  const noArgs = spawnSync('node', [GATE], { encoding: 'utf8' });
  assert.equal(noArgs.status, 2, 'no args is the only rc=2 case');
  const dir = setupFeature('# status: implemented\nFeature: X\n\n  @scn-1\n  Scenario: s\n    Given g\n');
  try {
    const r = runCI(dir);
    assert.notEqual(r.status, 2, 'a bare features-dir call must be wireable into CI (rc 0/1, never 2)');
    assert.equal(r.status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
