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
