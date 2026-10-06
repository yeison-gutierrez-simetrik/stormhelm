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
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCucumberConfig } from './load-cucumber-config.mjs';

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
// cucumber.mjs reads `# status:` only from the header (the leading comment
// block), so a per-scenario/mid-file status is silently ignored → the
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
  assert.equal(noArgs.status, 2, 'no args → rc 2 (usage)');
  const dir = setupFeature('# status: implemented\nFeature: X\n\n  @scn-1\n  Scenario: s\n    Given g\n');
  try {
    const r = runCI(dir);
    assert.notEqual(r.status, 2, 'a bare features-dir call must be wireable into CI (rc 0/1, never 2)');
    assert.equal(r.status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── FOLLOW-UP 134 — one `# status:` reader for the lint AND the runner ─────
// scripts/parse-feature-status.mjs is the single reader: the lint and the
// shipped cucumber.mjs template both IMPORT it (/setup vendors it beside the
// config, and a re-sync updates both at once). Black-box parity on top: the same fixture goes through the real lint
// (CI mode) and the real template config (local mode → warning list), and both
// must name exactly the same file:line set. `reads` is the status the runner
// must read — checked against the parser AND against the config's real CI
// surface decision, so the lint can never again read a feature differently
// from the runner (the FU-134 review's oracle gap).

const PARSER = pathToFileURL(join(here, '..', 'parse-feature-status.mjs')).href;
const notes = Array.from({ length: 10 }, (_, i) => `# note ${i + 1}`);
const PARITY = [
  { name: 'header-only status', expect: [], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'status after Feature:', expect: [4], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'status after a tag line', expect: [3], reads: 'approved',
    body: ['# status: approved', '@release', '# status: implemented', 'Feature: X', '  @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'no status at all (legacy = implemented)', expect: [], reads: null,
    body: ['Feature: X', '', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // The header is the leading comment block, however long: a status on line 11
  // is still THE header status and is read (the old 10-line read window left
  // it unread, so the feature ran as legacy — FU-134 review).
  { name: 'status on line 11, still in the leading comment block', expect: [], reads: 'approved',
    body: [...notes, '# status: approved', 'Feature: X', '', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // FU-134 review: the header ends at the first non-comment line, whatever the
  // keyword (`Ability:` / `Business Need:` are English synonyms of `Feature:`).
  { name: 'Ability: keyword ends the header like Feature:', expect: [3], reads: 'approved',
    body: ['# status: approved', 'Ability: X', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'status trailing a tag line', expect: [3], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '  @release @scn-1 # status: implemented', '  Scenario: s', '    Given g'] },
  // A docstring (a fence right under a step) is data: a `# status:` inside one
  // is never a declaration.
  { name: 'docstring content is data, not a status', expect: [], reads: 'implemented',
    body: ['# status: implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given a payload',
      '      """', '      # status: approved', '      """', '    And a json payload', '      ```json', '      # status: draft', '      ```'] },
  // The `# status:` key is reserved for the header's status line: any other
  // `# status:` comment is reported, whatever it says (the FU-134 review: a
  // state-word filter let `# status: done` through, which main flagged).
  // Prose uses another word (`# Note: flaky on CI`).
  { name: 'a `# Status:` comment after the header is reported, whatever it says', expect: [3], reads: 'implemented',
    body: ['# status: implemented', 'Feature: X', '  # Status: flaky on CI, see #12', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'mid-file `# status: done` (not a state word) is still reported', expect: [4], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '', '  # status: done', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // A fence in a description is plain text — only a fence under a step opens a
  // docstring (the review: an unbalanced ``` in a description hid everything after it).
  { name: 'a fence in the Feature description is text, not a docstring', expect: [4], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '  ```', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'prose after the state word in the header', expect: [], reads: 'implemented',
    body: ['# status: implemented (scn-042 delivered — issue #12)', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'indented header status is read', expect: [], reads: 'approved',
    body: ['  # status: approved', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'a UTF-8 BOM before the header status', expect: [], reads: 'approved',
    body: ['﻿# status: approved', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // Review round 3: a Feature/Rule description line may start with a step word
  // ("But only within 30 days:") — it is prose there, so a fence after it is
  // text, not a docstring that would hide everything below it.
  { name: 'a step-like description line does not open a docstring', expect: [5], reads: 'approved',
    body: ['# status: approved', 'Feature: Refunds', '  But only within 30 days, e.g.:', '  ```', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // Review round 3: near-miss spellings of the key are status lines too.
  { name: 'near-miss keys after the header (`##`, `# status :`) are reported', expect: [3, 4], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '  ## status: implemented', '  # Status : implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'a near-miss key in the header is read as the status', expect: [], reads: 'approved',
    body: ['## status: approved', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'CRLF line endings', expect: [4], reads: 'approved', eol: '\r\n',
    body: ['# status: approved', 'Feature: X', '', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
];

function parityRepo(body, eol = '\n') {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  mkdirSync(join(dir, 'features'), { recursive: true });
  writeFileSync(join(dir, 'features', 'f.feature'), body.join(eol) + eol);
  return dir;
}
const lines = (text) => [...text.matchAll(/features\/f\.feature:(\d+)/g)].map((m) => +m[1]);
const loadConfig = loadCucumberConfig;   // stages cucumber.mjs + scripts/parse-feature-status.mjs

for (const fx of PARITY) {
  test(`${fx.fu ?? 'FU-134'} parity: ${fx.name} → lint and cucumber.mjs both flag [${fx.expect.join(', ')}]`, async () => {
    const dir = parityRepo(fx.body, fx.eol);
    try {
      const lint = spawnSync('node', [GATE, 'features'], { cwd: dir, encoding: 'utf8' });
      const local = loadConfig(dir);
      const ci = loadConfig(dir, { CUCUMBER_IMPLEMENTED_ONLY: '1' });
      assert.deepEqual(lines(lint.stdout), fx.expect, `lint:\n${lint.stdout}${lint.stderr}`);
      assert.deepEqual(lines(local.stderr), fx.expect, `cucumber.mjs (local warn):\n${local.stderr}`);
      assert.equal(lint.status, fx.expect.length ? 1 : 0, 'lint rc tracks the finding');
      assert.equal(local.status, 0, 'local load never throws');
      assert.equal(ci.status === 0, fx.expect.length === 0, `CI load throws iff there is a finding:\n${ci.stderr}`);
      // The runner oracle: what the shared reader says the runner reads…
      const { parseFeatureStatus } = await import(PARSER);
      const text = fx.body.join(fx.eol ?? '\n') + (fx.eol ?? '\n');
      assert.equal(parseFeatureStatus(text).status, fx.reads, 'the reader reads the expected status');
      // …is what the config actually does with the feature on the CI surface.
      if (ci.status === 0) {
        const onSurface = ci.paths.includes('features/f.feature');
        assert.equal(onSurface, fx.reads === null || fx.reads === 'implemented', `CI surface: ${JSON.stringify(ci.paths)}`);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

// FU-134 review: an editor lock file (Emacs `.#x.feature`, a dangling symlink)
// crashed the lint's walk with ENOENT. Unreadable entries are skipped.
test('FU-134: a dangling symlink in features/ does not crash CI mode', () => {
  const dir = setupFeature('# status: implemented\nFeature: X\n\n  @scn-1\n  Scenario: s\n    Given g\n');
  try {
    symlinkSync(join(dir, 'nonexistent'), join(dir, 'features', '.#lock.feature'));
    const r = runCI(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED-SCN GATE: ok/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// FU-134 review: a missing features dir is a malformed call (rc 2, the script's
// own contract) — not a permanently green no-op on a typo or a monorepo path.
test('FU-134: a features dir that does not exist → rc 2, not a green no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nofeat-'));
  try {
    const r = spawnSync('node', [GATE, join(dir, 'featurez')], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /features dir not found/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// FU-134 review: the §130b claimed-scn index only knew `Scenario:` /
// `Scenario Outline:` with the tags directly above. Cucumber also tags a
// scenario through its Feature and Rule (inheritance), accepts `Example:` and
// `Scenario Template:`, and allows comments inside a tag block — each of those
// claimed @release scns was reported "implemented" while the runner skipped it.
test('FU-134: §130b sees @release inherited from Feature/Rule, Example:/Scenario Template:, and comment-split tag blocks', () => {
  const dir = setupFeature([
    '# status: approved',
    '@release',
    'Feature: X',
    '',
    '  @scn-1',
    '  Scenario: inherits @release from the Feature',
    '    Given g',
    '',
    '  @scn-2',
    '  Example: the Example synonym',
    '    Given g',
    '',
    '  @smoke',
    '  # a note between tags',
    '  @scn-3',
    '  Scenario: a comment inside the tag block',
    '    Given g',
    '',
    '  @scn-4',
    '  Scenario Template: the outline synonym <n>',
    '    Given <n>',
    '    Examples:',
    '      | n |',
    '      | 1 |',
    '',
  ].join('\n'));
  try {
    writeFileSync(join(dir, 'issue.md'), 'scenarios:scn-1+2+3+4\n');
    const r = runCI(dir, join(dir, 'issue.md'));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const scn of ['scn-1', 'scn-2', 'scn-3', 'scn-4']) {
      assert.match(r.stdout, new RegExp(`${scn} — @release but its feature is "# status: approved"`), `${scn} flagged`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FU-134: §130b sees @release on a Rule', () => {
  const dir = setupFeature('# status: approved\nFeature: X\n\n  @release\n  Rule: a rule\n\n    @scn-5\n    Scenario: inherits @release from the Rule\n      Given g\n');
  try {
    writeFileSync(join(dir, 'issue.md'), 'scenarios:scn-5\n');
    const r = runCI(dir, join(dir, 'issue.md'));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /scn-5 — @release/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// FU-134 review: claimed ranges lost their zero padding (scn-001..scn-002 →
// scn-1, scn-2 — never matching @scn-001), and the bare-number form
// check-invariants accepts (`scenarios:001+002`) was not read at all. The claim
// grammar now matches check-invariants / ralph_expand_scns.
test('FU-134: §130b reads zero-padded ranges and the bare-number form', () => {
  const body = '# status: approved\nFeature: X\n\n  @release @scn-001\n  Scenario: a\n    Given g\n\n  @release @scn-002\n  Scenario: b\n    Given g\n';
  for (const claim of ['scenarios:scn-001..scn-002', 'scenarios:001+002']) {
    const dir = setupFeature(body);
    try {
      writeFileSync(join(dir, 'issue.md'), `${claim}\n`);
      const r = runCI(dir, join(dir, 'issue.md'));
      assert.equal(r.status, 1, `${claim}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /scn-001 — @release/, claim);
      assert.match(r.stdout, /scn-002 — @release/, claim);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

// Review round 3: the index kept the first entry per scn id, so a scn tagged on
// a Scenario Outline lost the `@release` that only its Examples block carried.
test('FU-134: §130b sees @release that only an Examples block carries', () => {
  const dir = setupFeature([
    '# status: approved', 'Feature: X', '',
    '  @scn-003',
    '  Scenario Outline: refund <n>',
    '    Given <n>',
    '',
    '    @release',
    '    Examples:',
    '      | n |',
    '      | 1 |',
    '',
  ].join('\n'));
  try {
    writeFileSync(join(dir, 'issue.md'), 'scenarios:scn-003\n');
    const r = runCI(dir, join(dir, 'issue.md'));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /scn-003 — @release but its feature is "# status: approved"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Review round 3: the walk skipped EVERY unreadable entry, so a feature behind a
// broken symlink silently left the CI surface. Only dotfiles are skipped (as
// cucumber's own glob does — editor lock files like `.#x.feature` live there);
// anything else unreadable fails loudly.
test('FU-134: an unreadable non-dotfile feature fails loudly instead of vanishing', () => {
  const dir = setupFeature('# status: implemented\nFeature: X\n\n  @scn-1\n  Scenario: s\n    Given g\n');
  try {
    symlinkSync(join(dir, 'nonexistent'), join(dir, 'features', 'shared.feature'));
    const r = runCI(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /UNREADABLE .*shared\.feature/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
