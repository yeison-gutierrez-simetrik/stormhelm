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
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, chmodSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCucumberConfig } from './load-cucumber-config.mjs';
import { PARITY, INDEX } from './fixtures/feature-status-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GATE = join(here, '..', 'check-skipped-release-scn.mjs');

function setup({ status = 'approved', tags = '@release', scn = 'scn-566', issueToken = 'scenarios:scn-566' }) {
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
    writeFileSync(join(dir, 'issue.md'), 'No scenarios claimed here.\n');
    const r = runCI(dir, join(dir, 'issue.md'));   // an issue with no claims — the lint always runs
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

function parityRepo(body, eol = '\n') {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  mkdirSync(join(dir, 'features'), { recursive: true });
  writeFileSync(join(dir, 'features', 'f.feature'), body.join(eol) + eol);
  return dir;
}
const lines = (text) => [...text.matchAll(/features\/f\.feature:(\d+)/g)].map((m) => +m[1]);

for (const fx of PARITY) {
  test(`${fx.fu ?? 'FU-134'} parity: ${fx.name} → lint and cucumber.mjs both flag [${fx.expect.join(', ')}]`, async () => {
    const dir = parityRepo(fx.body, fx.eol);
    try {
      const lint = spawnSync('node', [GATE, 'features'], { cwd: dir, encoding: 'utf8' });
      const local = loadCucumberConfig(dir);
      const ci = loadCucumberConfig(dir, { CUCUMBER_IMPLEMENTED_ONLY: '1' });
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

// ── The reader against the REAL Gherkin parser (review round 4) ─────────────
// The lint and the config import the same reader, so their parity alone cannot
// catch the reader disagreeing with cucumber. gherkin-oracle.json is what
// @cucumber/gherkin (the parser cucumber-js runs) sees in the same fixtures —
// regenerate it with fixtures/gen-gherkin-oracle.mjs after changing a fixture.
const ORACLE = JSON.parse(readFileSync(join(here, 'fixtures', 'gherkin-oracle.json'), 'utf8'));
const releaseOf = (scenarios) => {
  const out = {};
  for (const { tags } of scenarios) for (const t of tags) {
    const m = t.match(/^@scn-(\d+)$/);
    if (m) out[`scn-${m[1]}`] = (out[`scn-${m[1]}`] ?? false) || tags.includes('@release');
  }
  return out;
};
for (const [set, fixtures] of [['parity', PARITY], ['index', INDEX]]) {
  for (const fx of fixtures) {
    test(`${fx.fu ?? 'FU-134'} oracle (${set}): ${fx.name} — the reader matches @cucumber/gherkin`, async () => {
      const golden = ORACLE[set][fx.name];
      assert.ok(golden, `no golden for "${fx.name}" — run fixtures/gen-gherkin-oracle.mjs`);
      assert.equal(golden.parseError, undefined, golden.parseError);
      const { parseFeatureStatus } = await import(PARSER);
      const r = parseFeatureStatus(fx.body.join(fx.eol ?? '\n') + (fx.eol ?? '\n'));
      assert.deepEqual(r.statusComments, golden.statusComments, 'the `# status:` comment lines cucumber parses');
      // A non-English feature is reported (and not indexed — the readers know English keywords only).
      if (!r.problems.some((p) => p.kind === 'language')) assert.deepEqual(releaseOf(r.scenarios), golden.release, '@release selection per scn');
    });
  }
}

// Review round 4: a claim that matches no scenario was skipped silently, and the
// ok line still said every claimed @release scn is implemented.
test('FU-134: a claimed scn found in no feature is named as unverified, not counted as implemented', () => {
  const dir = setupFeature('# status: implemented\nFeature: X\n\n  @release @scn-1\n  Scenario: s\n    Given g\n');
  try {
    writeFileSync(join(dir, 'issue.md'), 'scenarios:scn-1+scn-9\n');
    const r = runCI(dir, join(dir, 'issue.md'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1 claimed scn\(s\) not found in features\/ \(scn-9\)/);
    assert.doesNotMatch(r.stdout, /2 claimed scn\(s\), all @release ones implemented/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Review round 4: a feature that passes stat but cannot be read crashed the lint
// with a stack trace instead of the documented FAIL, named.
test('FU-134: a feature that cannot be read fails as UNREADABLE, named', { skip: process.getuid?.() === 0 && 'root reads everything' }, () => {
  const dir = setupFeature('# status: implemented\nFeature: X\n');
  try {
    chmodSync(join(dir, 'features', 'x', 'x.feature'), 0o000);
    const r = runCI(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /UNREADABLE .*x\.feature/);
  } finally { chmodSync(join(dir, 'features', 'x', 'x.feature'), 0o644); rmSync(dir, { recursive: true, force: true }); }
});

// Review round 4: the explanation is printed once per kind, not once per line.
test('FU-134: the explanation is printed once per kind, however many lines it covers', () => {
  const dir = setupFeature('# status: approved\nFeature: X\n  # status: implemented\n  # status: implemented\n  # status: implemented\n  @release @scn-1\n  Scenario: s\n    Given g\n');
  try {
    const r = runCI(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal((r.stdout.match(/MID-FILE STATUS .*x\.feature:\d/g) ?? []).length, 3);
    assert.equal((r.stdout.match(/is IGNORED/g) ?? []).length, 1, r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Review round 4: the lint and check-invariants read `scenarios:` through ONE
// expander (scripts/scenario-claims.mjs) — prose after `Scenarios:` is not a
// claim to either, and a trailing period does not swallow the last id.
test('FU-134: scenario claims — prose is not a claim, a trailing period is not part of the id', async () => {
  const { expandScenarioClaims } = await import(pathToFileURL(join(here, '..', 'scenario-claims.mjs')).href);
  assert.deepEqual(expandScenarioClaims('Scenarios: scn-7 is deferred to slice 9'), []);
  assert.deepEqual(expandScenarioClaims('Delivers scenarios:scn-7.'), ['scn-7']);
  assert.deepEqual(expandScenarioClaims('scenarios:scn-001..scn-003'), ['scn-001', 'scn-002', 'scn-003']);
  assert.deepEqual(expandScenarioClaims('scenarios:021+022,scn-030'), ['scn-021', 'scn-022', 'scn-030']);
});

// FU-134 review round 5: a missing issue file (an empty "$ISSUE_FILE", a typo)
// read as "no claims" → `na`, rc 0 — the green no-op the rc-2 contract exists to
// prevent.
test('FU-134: a missing or empty issue-file argument → rc 2, not a green na', () => {
  const dir = setupFeature('# status: implemented\nFeature: X\n\n  @release @scn-1\n  Scenario: s\n    Given g\n');
  try {
    for (const arg of [join(dir, 'no-such-issue.md'), '']) {
      const r = runCI(dir, arg);
      assert.equal(r.status, 2, `'${arg}': ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /issue\/spec file not found/);
      assert.doesNotMatch(r.stdout, /SKIPPED-SCN GATE: (na|ok)/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// FU-134 review round 5: an unreadable entry no longer aborts the scan — it is
// named, and every other feature is still checked.
test('FU-134: a dangling feature symlink is named and the other features are still checked', () => {
  const dir = setupFeature('# status: approved\nFeature: X\n  # status: implemented\n  @release @scn-1\n  Scenario: s\n    Given g\n');
  try {
    symlinkSync(join(dir, 'nonexistent'), join(dir, 'features', 'x', 'gone.feature'));
    const r = runCI(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /UNREADABLE .*gone\.feature `ENOENT`/);
    assert.match(r.stdout, /MID-FILE STATUS .*x\.feature:3/, 'the readable feature is still linted');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// FU-134 review round 5: one grammar for every reader — the expander drops what
// CONFIG §63 rejects (upper-case `SCN-`, backwards or 1000+-id ranges), and a
// trailing period ends the token.
test('FU-134: the shared claims grammar — trailing period, case, range bounds', async () => {
  const { parseClaimToken, expandScenarioClaims, MAX_RANGE } = await import(pathToFileURL(join(here, '..', 'scenario-claims.mjs')).href);
  assert.equal(MAX_RANGE, 1000);
  assert.deepEqual(parseClaimToken('scn-007.'), { ids: ['scn-007'], bad: [] });
  assert.deepEqual(parseClaimToken('SCN-021+022'), { ids: ['scn-022'], bad: ['SCN-021'] });
  assert.deepEqual(parseClaimToken('scn-009..scn-003'), { ids: [], bad: ['scn-009..scn-003'] });
  assert.deepEqual(parseClaimToken('scn-1..scn-200000000'), { ids: [], bad: ['scn-1..scn-200000000'] });
  assert.equal(parseClaimToken('scn-1..scn-1000').ids.length, 1000, 'a 1000-id range is the largest accepted');
  assert.deepEqual(parseClaimToken('scn-1..scn-1001').ids, []);
  assert.deepEqual(expandScenarioClaims('scenarios:scn-1..scn-200000000 and scenarios:scn-5'), ['scn-5']);
});

// ── FOLLOW-UP 135 — duplicate / invalid / transition / empty header status ──
// The exact duplicate shape: header `approved` then `implemented`, both before
// Feature. The runner reads the first → the feature is skipped under
// IMPLEMENTED_ONLY; CI mode was rc 0 on this file — the residual FU-134 recorded.
test('FU-135: CI mode names a duplicate header status → FAIL exit 1, anchored on the line the runner reads', () => {
  const dir = setupFeature('# status: approved\n# status: implemented\nFeature: X\n\n  @release @scn-9\n  Scenario: s\n    Given g\n');
  try {
    const r = runCI(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /DUPLICATE HEADER STATUS/);
    assert.match(r.stdout, /x\.feature:2 /, 'the second status line is the offender');
    assert.match(r.stdout, /the runner reads line 1 \('approved'\)/, 'names the line and status the runner actually reads');
    assert.doesNotMatch(r.stdout, /MID-FILE STATUS/, 'not misreported as mid-file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FU-135: a single header status (plus other header comments) stays clean in CI mode', () => {
  const dir = setupFeature('# language: en\n# status: approved\n# approved_at: 2026-10-06\n# approved_in_commit: a1b2c3d\nFeature: X\n\n  @release @scn-9\n  Scenario: s\n    Given g\n');
  try {
    const r = runCI(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED-SCN GATE: ok/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The value residual: `# status: implemented.` — the runner reads
// 'implemented.' and SKIPS the feature, while the old §130b check read \w+ →
// 'implemented' and passed even with the scn claimed (rc 0).
test('FU-135: an invalid header status value fails the per-slice gate even when the scn is claimed', () => {
  const dir = setupFeature('# status: implemented.\nFeature: X\n\n  @release @scn-7\n  Scenario: s\n    Given g\n');
  try {
    writeFileSync(join(dir, 'issue.md'), 'Delivers scenarios:scn-7\n');
    const r = runCI(dir, join(dir, 'issue.md'));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /INVALID STATUS VALUE/);
    assert.match(r.stdout, /x\.feature:1 /);
    assert.match(r.stdout, /reads the status as 'implemented\.'/, 'names the token the runner actually reads');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The failure footer must not tell an author to flip a planning feature to
// `implemented` just because its status token was malformed.
test('FU-135: the failure footer does not prescribe a flip to implemented', () => {
  const dir = setupFeature('# status: draft.\nFeature: X\n\n  @release @scn-7\n  Scenario: s\n    Given g\n');
  try {
    const r = runCI(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /flip it to\s+`# status: implemented`/);
    assert.match(r.stdout, /one §58 state word/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Review round 4: the §130b claim check runs inside Ralph's per-slice acceptance,
// where the approved .feature is read-only to the agent. Its remedy must never
// tell the agent to flip the status itself — escalate, or drop the claim.
test('FU-135: the §130b skipped-claim remedy escalates or drops the claim, never "flip it"', () => {
  withRepo({ status: 'approved' }, (dir, issue) => {
    const r = run(dir, issue);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /SKIPPED CLAIM scn-566/);
    assert.match(r.stdout, /escalate to a human/);
    assert.match(r.stdout, /drop it from the issue's scenarios: token/);
    assert.match(r.stdout, /never edits an approved \.feature/);
    assert.doesNotMatch(r.stdout, /flip (?:that feature's|it to|the feature's '# status:' to) implemented in place/i);
    assert.equal((r.stdout.match(/Why \(SKIPPED CLAIM\)/g) ?? []).length, 1);
  });
});

// Each offending line carries its OWN detail (which line the runner reads, which
// word it read) while each kind's explanation prints once.
test('FU-135: per-line detail with each offender, one explanation per kind', () => {
  const dir = setupFeature('# status: approved\n# status: implemented\nFeature: X\n  @release @scn-1\n  Scenario: s\n    Given g\n');
  try {
    writeFileSync(join(dir, 'features', 'x', 'y.feature'), '# status: draft\n# status: approved\nFeature: Y\n  @release @scn-2\n  Scenario: s\n    Given g\n');
    const r = runCI(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /x\.feature:2 `# status: implemented` — the runner reads line 1 \('approved'\)/);
    assert.match(r.stdout, /y\.feature:2 `# status: approved` — the runner reads line 1 \('draft'\)/);
    assert.equal((r.stdout.match(/Why \(DUPLICATE HEADER STATUS\)/g) ?? []).length, 1, r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
