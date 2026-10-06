// Integration test for scripts/check-invariants.mjs against a POPULATED consumer
// (issue #32). The framework repo itself is the most degenerate consumer (no
// issues/labels/features) — every invariant returns N/A and looks green, which is
// exactly why the silent no-op fixed in PR #31 was invisible. This runs the gate
// against scripts/__tests__/fixtures/synthetic-consumer/ (a real, populated slice)
// and asserts both the happy path AND that each invariant FAILS when its artifact
// is removed/broken — i.e. the rules catch what they claim, not just "the code parses".
//
// Run: node --test scripts/__tests__/check-invariants.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'check-invariants.mjs');
const FIXTURE = join(here, 'fixtures', 'synthetic-consumer');

// Run check-invariants with cwd = the given consumer dir.
function run(cwd) {
  const r = spawnSync('node', [SCRIPT], { cwd, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// Copy the fixture to a throwaway dir, let `mutate(dir)` break one thing, run.
function runMutated(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'inv-fixture-'));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    mutate(dir);
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('happy path: the populated consumer passes the gate (exit 0)', () => {
  const { status, out } = run(FIXTURE);
  assert.equal(status, 0, `expected exit 0, got ${status}\n${out}`);
  assert.match(out, /All invariants met/);
  assert.doesNotMatch(out, /❌/, 'no invariant should fail on the well-formed fixture');
  assert.doesNotMatch(out, /CONFIG/, 'CONFIG must not fire when issues carry **Labels:**');
  // Spot-check the populated invariants actually ran (not silently N/A):
  assert.match(out, /INV-2 §87: threat model present/);
  assert.match(out, /INV-3 §63: all ralph-ready scns defined and approved/);
  assert.match(out, /INV-5 §59: 2 @release scns mapped/);
});

test('CONFIG fires (loud, exit 1) when issue files carry no **Labels:** line', () => {
  const { status, out } = runMutated((dir) => {
    for (const f of ['issues/001-auth.md', 'issues/002-list.md']) {
      const p = join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/^\*\*Labels:\*\*.*$/m, ''));
    }
  });
  assert.equal(status, 1, 'stripping labels must fail the gate, not silently pass');
  assert.match(out, /❌ CONFIG/);
});

test('INV-2 fails (exit 1) when a require-human-review issue has no threat model', () => {
  const { status, out } = runMutated((dir) => rmSync(join(dir, 'docs/threat-models/auth.md')));
  assert.equal(status, 1);
  assert.match(out, /❌ INV-2/);
});

test('INV-3 fails (exit 1) when a ralph-ready scn is in a non-approved feature', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'features/identity/auth.feature');
    writeFileSync(p, readFileSync(p, 'utf8').replace('# status: approved', '# status: clarifying'));
  });
  assert.equal(status, 1);
  assert.match(out, /❌ INV-3/);
});

// FOLLOW-UP 39: 'implemented' is the §58 post-approval state INV-8 itself
// demands at close-out — INV-3 must accept it (the live close-out flagged all
// 18 shipped scenarios as non-approved). draft/clarifying still reject (the
// test above pins that half).
test('FU-39: INV-3 accepts a ralph-ready scn in an IMPLEMENTED feature (close-out state)', () => {
  const { status, out } = runMutated((dir) => {
    // The realistic close-out state: feature flipped to implemented AND the
    // -final matrix INV-8 demands is present. Pre-fix, INV-3 and INV-8
    // CONTRADICTED each other in exactly this state.
    const p = join(dir, 'features/identity/auth.feature');
    const text = readFileSync(p, 'utf8');
    writeFileSync(p, text.replace('# status: approved', '# status: implemented'));
    const scns = [...text.matchAll(/@(scn-\d+)/g)].map((m) => m[1]);
    mkdirSync(join(dir, 'docs/audit'), { recursive: true });
    writeFileSync(join(dir, 'docs/audit/traceability-v1.0.0-final.md'),
      `# Traceability v1.0.0 (final)\n${scns.map((s) => `- ${s}: shipped`).join('\n')}\n`);
  });
  assert.equal(status, 0, `INV-3 and INV-8 must hold SIMULTANEOUSLY at close-out:\n${out}`);
  assert.match(out, /INV-3 §63: all ralph-ready scns defined and approved/);
  assert.match(out, /INV-8 §58: .*pinned|INV-8 §58: pass|✅ INV-8/, 'INV-8 satisfied in the same state');
});

// FU-134 review: an editor lock file (Emacs `.#x.feature`, a dangling symlink)
// crashed the invariant gate's walk with ENOENT — the same file the lint and the
// cucumber config already skip.
test('a dangling symlink in features/ does not crash the gate', () => {
  const { status, out } = runMutated((dir) => {
    symlinkSync(join(dir, 'nonexistent'), join(dir, 'features', '.#lock.feature'));
  });
  assert.doesNotMatch(out, /ENOENT/, out);
  assert.equal(status, 0, out);
});

// Review round 3: the invariant gate listed features with its own walk, which
// does not follow a symlinked directory — the runner (and the lint) do, so the
// gate audited a different feature set. It now uses the shared featureFiles().
test('INV-8 sees an implemented feature inside a symlinked features directory', () => {
  const { status, out } = runMutated((dir) => {
    mkdirSync(join(dir, 'shared-features'), { recursive: true });
    writeFileSync(join(dir, 'shared-features', 'x.feature'),
      '# status: implemented\nFeature: X\n\n  @smoke @scn-900\n  Scenario: s\n    Given g\n');
    symlinkSync(join(dir, 'shared-features'), join(dir, 'features', 'shared'));
  });
  assert.equal(status, 1, out);
  assert.match(out, /❌ INV-8/, 'the implemented feature is seen and needs its -final matrix');
});

// FU-135: INV-8 matched `# status: implemented` on ANY line, so a close-out flip
// written as a second header line (approved + implemented) was certified
// "implemented, pinned to a -final matrix" while the runner reads `approved` and
// skips the feature. INV-3/INV-5/INV-8 now read the status through the same
// parser as the runner (scripts/parse-feature-status.mjs).
test('FU-135: INV-8 does not certify a feature whose header the runner reads as approved', () => {
  const { out } = runMutated((dir) => {
    const p = join(dir, 'features/identity/auth.feature');
    const text = readFileSync(p, 'utf8');
    writeFileSync(p, text.replace('# status: approved', '# status: approved\n# status: implemented'));
    const scns = [...text.matchAll(/@(scn-\d+)/g)].map((m) => m[1]);
    mkdirSync(join(dir, 'docs/audit'), { recursive: true });
    writeFileSync(join(dir, 'docs/audit/traceability-v1.0.0-final.md'),
      `# Traceability v1.0.0 (final)\n${scns.map((s) => `- ${s}: shipped`).join('\n')}\n`);
  });
  assert.doesNotMatch(out, /INV-8 §58: 1 implemented feature/, 'the runner reads approved — not implemented');
  assert.match(out, /INV-8 §58: no implemented features/);
});

// FU-135 review: release certification must not pass on a tree the CI config
// refuses to load. Any `# status:` line the runner cannot honor fails CONFIG §58,
// and a broken header is named as such — not as INV-5 orphans.
test('FU-135: a malformed # status line fails CONFIG §58 and is not reported as INV-5 orphans', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'features/identity/auth.feature');
    writeFileSync(p, readFileSync(p, 'utf8').replace('# status: approved', '# status: approved.'));
  });
  assert.equal(status, 1, out);
  assert.match(out, /❌ CONFIG §58: '# status:' line\(s\) the runner cannot honor: identity\/auth\.feature:\d+ \(invalid\)/);
  assert.doesNotMatch(out, /❌ INV-5/, 'the broken header is the CONFIG failure, not orphaned scns');
  assert.doesNotMatch(out, /❌ INV-3/, 'nor scns of a non-approved feature: the header is broken, not unapproved');
});

// Review round 4: one broken header was treated three ways — INV-3 acted on the
// read status ("non-approved"), INV-5 skipped it, INV-8 certified a transition
// line as implemented. Now all three leave a header-broken feature to CONFIG §58.
test('FU-135: a header-broken feature is CONFIG §58 only — INV-3 and INV-8 leave it out', () => {
  const dup = runMutated((dir) => {
    const p = join(dir, 'features/identity/auth.feature');
    writeFileSync(p, readFileSync(p, 'utf8').replace('# status: approved', '# status: draft\n# status: approved'));
  });
  assert.equal(dup.status, 1, dup.out);
  assert.match(dup.out, /❌ CONFIG §58: .*identity\/auth\.feature:\d+ \(duplicate\)/);
  assert.doesNotMatch(dup.out, /❌ INV-3/, 'not "re-approve": the fix is the header');

  const arrow = runMutated((dir) => {
    const p = join(dir, 'features/identity/auth.feature');
    const text = readFileSync(p, 'utf8');
    writeFileSync(p, text.replace('# status: approved', '# status: implemented → retired'));
    const scns = [...text.matchAll(/@(scn-\d+)/g)].map((m) => m[1]);
    mkdirSync(join(dir, 'docs/audit'), { recursive: true });
    writeFileSync(join(dir, 'docs/audit/traceability-v1.0.0-final.md'),
      `# Traceability v1.0.0 (final)\n${scns.map((s) => `- ${s}: shipped`).join('\n')}\n`);
  });
  assert.equal(arrow.status, 1, arrow.out);
  assert.match(arrow.out, /❌ CONFIG §58: .*\(invalid\)/);
  assert.match(arrow.out, /INV-8 §58: no implemented features/, 'a flip written into the line is never a certified release');
});

test('INV-4 fails (exit 1) when an Accepted ADR loses its Date', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'docs/adr/0001-auth-approach.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^\*\*Date:\*\*.*$/m, ''));
  });
  assert.equal(status, 1);
  assert.match(out, /❌ INV-4/);
});

// The framework is English-only: INV-4 used to accept a non-English alias of
// the ADR date field. An Accepted ADR dated only that way now fails like any
// other missing `Date:` (no known consumer used the alias).
test('INV-4 requires the English Date field (a Spanish "Fecha:" no longer counts)', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'docs/adr/0001-auth-approach.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^\*\*Date:\*\*/m, '**Fecha:**'));
  });
  assert.equal(status, 1, out);
  assert.match(out, /❌ INV-4/);
});

// Review round: INV-4 matched `date:` ANYWHERE, so `**Candidate:**` dated an ADR;
// and `**Status**: Accepted` / `**Date**: …` (colon outside the bold) slipped
// past it. Both fields are now read as header field lines, with a value.
const setAdr = (text) => (dir) => writeFileSync(join(dir, 'docs/adr/0001-auth-approach.md'), text);
test('INV-4 reads Date as a field line — a word ending in "date:" does not count', () => {
  const { status, out } = runMutated(setAdr('# ADR-0001\n\n**Status:** Accepted\n\n## Options\n\n**Candidate:** Postgres\n'));
  assert.equal(status, 1, out);
  assert.match(out, /❌ INV-4/);
});
test('INV-4 reads the `**Field**: value` markdown style for Status and Date', () => {
  const dated = runMutated(setAdr('# ADR-0001\n\n**Status**: Accepted\n**Date**: 2026-06-02\n'));
  assert.match(dated.out, /✅ INV-4/, dated.out);
  // …and the same style WITHOUT a date is an Accepted ADR missing its date (the
  // old regex never saw `**Status**:` as Accepted, so this passed silently).
  const undated = runMutated(setAdr('# ADR-0001\n\n**Status**: Accepted\n'));
  assert.equal(undated.status, 1, undated.out);
  assert.match(undated.out, /❌ INV-4/);
});
test('INV-4: an empty Date field is not a date', () => {
  const { status, out } = runMutated(setAdr('# ADR-0001\n\n**Status:** Accepted\n**Date:**\n'));
  assert.equal(status, 1, out);
  assert.match(out, /❌ INV-4/);
});

// Review round 5: a Nygard-style ADR (`## Status` heading, the value on the next
// line) or a `## Status: Accepted` heading was no longer read as Accepted, so an
// undated Accepted ADR passed. Both shapes are read now; a qualified date field
// (`**Decision date:**`) still counts as the date.
test('INV-4 reads a Nygard-style `## Status` section and a `## Status:` heading; a qualified date field counts', () => {
  const withAdr = (text) => runMutated((dir) => writeFileSync(join(dir, 'docs/adr/0001-auth-approach.md'), text));
  for (const text of ['# ADR 0001\n\n## Status\n\nAccepted\n\n## Context\nx\n', '# ADR 0001\n\n## Status: Accepted\n\n## Context\nx\n']) {
    const { status, out } = withAdr(text);
    assert.equal(status, 1, out);
    assert.match(out, /❌ INV-4 .*0001-auth-approach\.md/, JSON.stringify(text));
  }
  for (const text of ['# ADR 0001\n\n## Status\n\nAccepted\n\n## Date\n\n2026-06-02\n', '**Status:** Accepted\n**Decision date:** 2026-06-02\n']) {
    const { out } = withAdr(text);
    assert.match(out, /✅ INV-4/, JSON.stringify(text));
  }
});

// --- INV-6 (ADR-0002 PR-N): classification stable across the diff ---

const escalateTo3Contexts = (dir) => {
  const p = join(dir, 'issues/002-list.md');
  return readFileSync(p, 'utf8').replace(
    /### Layers affected[\s\S]*$/,
    '### Layers affected\n- `src/domain/identity/x.ts`\n- `src/domain/billing/y.ts`\n- `src/domain/orders/z.ts`\n',
  );
};

test('INV-6 passes when a single-module issue\'s plan matches (declared == detected)', () => {
  const { out } = run(FIXTURE);
  assert.match(out, /✅ INV-6 .*single-module issue\(s\) match/);
});

test('INV-6 fails (exit 1) when a single-module issue\'s plan escalates to multi-module', () => {
  const { status, out } = runMutated((dir) => {
    writeFileSync(join(dir, 'issues/002-list.md'), escalateTo3Contexts(dir));
  });
  assert.equal(status, 1, 'declared single-module but plan now detects multi-module must fail (one-way escalation)');
  assert.match(out, /❌ INV-6/);
});

test('INV-6 escalation can be overridden by an audited skip-invariant line', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'issues/002-list.md');
    writeFileSync(p, escalateTo3Contexts(dir) +
      '\nskip-invariant: INV-6 — accepted: cumulative slice; multi-module backfill tracked separately.\n');
  });
  assert.equal(status, 0, 'an audited skip-invariant line turns the INV-6 failure into a skip');
  assert.match(out, /⚠️ INV-6.*OVERRIDDEN/);
});

// Regression (PR #42 fix): a genuinely single-module slice that lists ≥3 FLAT files
// under one layer (a single logical context) must NOT escalate. Before the parser
// granularity fix, `src/domain/{user,order,cart}.ts` read as 3 modules and INV-6
// false-failed, forcing multi-module ceremony on a single-context change (§1).
const flatSingleContext = (dir) => {
  const p = join(dir, 'issues/002-list.md');
  return readFileSync(p, 'utf8').replace(
    /### Layers affected[\s\S]*$/,
    '### Layers affected\n- `src/domain/user.ts`\n- `src/domain/order.ts`\n- `src/domain/cart.ts`\n',
  );
};

test('INV-6 does NOT escalate a single-module slice of 3 flat files in one layer', () => {
  const { status, out } = runMutated((dir) => {
    writeFileSync(join(dir, 'issues/002-list.md'), flatSingleContext(dir));
  });
  assert.equal(status, 0, '3 flat files under one layer = 1 module, not a multi-module escalation');
  assert.match(out, /✅ INV-6 .*single-module issue\(s\) match/);
});

// --- FOLLOW-UP 21: the scenarios:* label parser must expand every wild form ---

// Move both @release scns onto ONE issue using each label form; pre-fix, the
// bare `+022`-style continuation was dropped → scn-002 reported as an INV-5
// orphan while only the first token was credited.
const relabelScns = (form) => (dir) => {
  const p1 = join(dir, 'issues/001-auth.md');
  writeFileSync(p1, readFileSync(p1, 'utf8').replace('`scenarios:scn-001`', `\`${form}\``));
  const p2 = join(dir, 'issues/002-list.md');
  writeFileSync(p2, readFileSync(p2, 'utf8').replace(' `scenarios:scn-002`', ''));
};

test('INV-5 credits every scn in the GitHub-compact form scenarios:scn-001+002', () => {
  const { status, out } = runMutated(relabelScns('scenarios:scn-001+002'));
  assert.equal(status, 0, `compact continuations must be credited, not dropped:\n${out}`);
  assert.match(out, /INV-5 §59: 2 @release scns mapped/);
});

test('INV-5 credits the spelled form scenarios:scn-001+scn-002', () => {
  const { status, out } = runMutated(relabelScns('scenarios:scn-001+scn-002'));
  assert.equal(status, 0, out);
  assert.match(out, /INV-5 §59: 2 @release scns mapped/);
});

test('INV-5 credits the comma form scenarios:scn-001,scn-002', () => {
  const { status, out } = runMutated(relabelScns('scenarios:scn-001,scn-002'));
  assert.equal(status, 0, out);
  assert.match(out, /INV-5 §59: 2 @release scns mapped/);
});

// FOLLOW-UP 96: the range form scn-A..scn-B is now a SUPPORTED grammar (it is
// the only single-label shape that fits a >8-scn slice). The malformed-label
// CONFIG check must ACCEPT it — and INV-5/INV-3 must read it identically to
// ralph_expand_scns. A trivial in-range mutation keeps the fixture valid.
test('FU-96: a range-form scenarios label is accepted (no malformed CONFIG)', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'issues/001-auth.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('`scenarios:scn-001`', '`scenarios:scn-001..001`'));
  });
  assert.equal(status, 0, `a valid range must not fail the gate:\n${out}`);
  assert.doesNotMatch(out, /unparseable scenarios label/, 'the range grammar is accepted, not flagged');
});

// A genuinely unsupported grammar still fails CONFIG-loudly — it expands to zero
// scenarios and would blind every label-driven invariant.
test('FU-35: an unparseable scenarios label → CONFIG failure naming file + canonical form', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'issues/001-auth.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('`scenarios:scn-001`', '`scenarios:scn-001..foo`'));
  });
  assert.equal(status, 1, 'unparseable grammar must fail the gate');
  assert.match(out, /❌ CONFIG.*scn-001\.\.foo/);
  assert.match(out, /scn-A\.\.scn-B/, 'the supported range form is named');
});

test('INV-5 still reports a real orphan (a scn no label form mentions)', () => {
  const { status, out } = runMutated((dir) => {
    const p2 = join(dir, 'issues/002-list.md');
    writeFileSync(p2, readFileSync(p2, 'utf8').replace(' `scenarios:scn-002`', ''));
  });
  assert.equal(status, 1, 'dropping the only reference to scn-002 must fail INV-5');
  assert.match(out, /❌ INV-5.*scn-002/);
});

// ── FOLLOW-UP 57: INV-5 ignores the §58 in-flight window ──────────────────────

// The lifecycle GUARANTEES a window where @release scns exist with no issues
// (between /to-scenarios' '# status: draft' and /to-issues). INV-5 counted
// them and went structurally red — a concurrent session investigating the
// false alarm live could not tell it from a real orphan.
test('FU-57: @release scns in a DRAFT feature do not trip INV-5 (the normal window)', () => {
  const { status, out } = runMutated((dir) => {
    writeFileSync(join(dir, 'features', 'inflight.feature'), [
      '# status: draft',
      'Feature: Parallel slice mid-pipeline',
      '  @scn-093 @release',
      '  Scenario: written by /to-scenarios, issues not created yet',
      '    Given the §58 window is open',
    ].join('\n'));
  });
  assert.equal(status, 0, `the in-flight window must not fail the gate:\n${out}`);
  assert.doesNotMatch(out, /scn-093/, 'draft scns are invisible to INV-5');
});

test('FU-57: an APPROVED feature with an issue-less @release scn still fails (real orphans stay caught)', () => {
  const { status, out } = runMutated((dir) => {
    writeFileSync(join(dir, 'features', 'orphan.feature'), [
      '# status: approved',
      'Feature: Approved but never issued',
      '  @scn-094 @release',
      '  Scenario: post-approval orphan — the case INV-5 exists for',
      '    Given approval happened but /to-issues never ran',
    ].join('\n'));
  });
  assert.equal(status, 1, 'a post-approval orphan is the real defect');
  assert.match(out, /INV-5.*scn-094/s);
});

// ── FOLLOW-UP 58: failures recap survives a truncated capture ─────────────────

// Operators keep piping the gate into `tail -N` (3rd live recurrence): the
// tail kept the count line while cutting the inline ❌ naming the failure.
test('FU-58: the LAST lines of a failing run name the failing invariant (recap block)', () => {
  const { out } = runMutated((dir) => {
    writeFileSync(join(dir, 'features', 'orphan.feature'),
      '# status: approved\nFeature: O\n  @scn-095 @release\n  Scenario: x\n    Given y\n');
  });
  const tail3 = out.trim().split('\n').slice(-3).join('\n');
  assert.match(tail3, /Failures recap:/);
  assert.match(tail3, /❌ INV-5.*scn-095/, 'the tailed capture still names WHAT failed');
});

test('FU-58: green runs carry no recap block (output contract unchanged)', () => {
  const { status, out } = run(FIXTURE);
  assert.equal(status, 0);
  assert.doesNotMatch(out, /Failures recap/);
});

// ── FOLLOW-UP 71: a >50-char scenarios list lives in the FILE, not a GH label ─

// GitHub's 50-char label limit blocks `gh label create` for a many-scenario
// foundation slice, but the issue FILE's **Labels:** line has no such limit —
// and INV-5 reads `scn-NNN` from the FILE (check-invariants is offline; it
// never sees GitHub labels). So omitting the GH `scenarios:` label and keeping
// the full compact list in the file is SAFE: every @release scenario still
// maps to its issue.
test('FU-71: a 19-scenario compact label (>50 chars) in the issue file maps via INV-5', () => {
  const longList = Array.from({ length: 19 }, (_, k) => 137 + k); // scn-137..155
  const compact = 'scn-' + longList.join('+').replace(/\+(?=\d)/g, '+'); // scn-137+138+…+155
  const labelToken = `scenarios:${compact}`;
  assert.ok(labelToken.length > 50, `the label must overflow 50 chars to be the FU-71 case (got ${labelToken.length})`);

  const { status, out } = runMutated((dir) => {
    // A foundation feature carrying all 19 @release scenarios.
    writeFileSync(join(dir, 'features', 'foundation.feature'),
      '# status: approved\nFeature: Foundation substrate\n' +
      longList.map((n) => `  @scn-${n} @release\n  Scenario: s${n}\n    Given x\n`).join(''));
    // An issue whose **Labels:** carries the >50-char compact list (no GH label needed).
    writeFileSync(join(dir, 'issues', '099-foundation.md'),
      `# Issue 099 — foundation\n\n**Labels:** \`ralph-ready\` \`shift:afk\` \`${labelToken}\` \`budget:200k\` \`tier:0\`\n\nFoundation slice.\n`);
  });
  assert.equal(status, 0, `INV-5 must map all 19 file-listed scenarios:\n${out}`);
  assert.match(out, /INV-5.*mapped/, 'INV-5 ran and passed');
  assert.doesNotMatch(out, /scn-1[3-5][0-9].*no issue/, 'none of scn-137..155 is a false orphan');
});

// ── FOLLOW-UP 78: skip-invariant overrides are scoped to the declaring file ───

// A `skip-invariant: INV-6` in issue A used to suppress INV-6 for EVERY issue
// (the override was keyed by invariant, not file) — live, a blessed schema-only
// override on one issue masked another issue's GENUINE classification mismatch.
// The override now covers only the file that declares it.
//
// Construct two single-module issues that both ESCALATE (their Layers detect
// multi-module): one carries the INV-6 override, the other does not → the gate
// must FAIL naming only the uncovered one.
const escalatingLayers = [
  '',
  '### Layers',
  '- **Module:** Alpha',
  '- **Module:** Beta',
  '- **Module:** Gamma',          // 3 distinct → detect-ceremony escalates to multi-module
  '',
].join('\n');

test('FU-78: an override in one issue does NOT mask another issue\'s real INV-6 failure', () => {
  const { status, out } = runMutated((dir) => {
    writeFileSync(join(dir, 'issues', '010-covered.md'),
      `# Issue 010\n\n**Labels:** \`ralph-ready\` \`scenarios:scn-001\` \`budget:50k\` \`feature:single-module\`\n\nskip-invariant: INV-6 — deliberately single-module substrate\n${escalatingLayers}`);
    writeFileSync(join(dir, 'issues', '011-uncovered.md'),
      `# Issue 011\n\n**Labels:** \`ralph-ready\` \`scenarios:scn-001\` \`budget:50k\` \`feature:single-module\`\n\n${escalatingLayers}`);
  });
  assert.equal(status, 1, 'the uncovered escalation must FAIL the gate');
  assert.match(out, /INV-6.*011-uncovered/s, 'fails naming the issue with no override');
  assert.doesNotMatch(out, /❌ INV-6[^\n]*010-covered/, 'the covered issue is not listed as a failure');
});

test('FU-78: a single-file override (only escalating issue carries it) still passes', () => {
  const { status, out } = runMutated((dir) => {
    writeFileSync(join(dir, 'issues', '010-covered.md'),
      `# Issue 010\n\n**Labels:** \`ralph-ready\` \`scenarios:scn-001\` \`budget:50k\` \`feature:single-module\`\n\nskip-invariant: INV-6 — deliberately single-module substrate\n${escalatingLayers}`);
  });
  assert.equal(status, 0, 'the lone covered escalation passes');
  assert.match(out, /INV-6.*OVERRIDDEN \(per-file\)/s);
});

// FOLLOW-UP 105: a scn-NNN defined in two feature files is an authoring-time
// collision (per-issue scn allocation with no campaign-wide reservation reused
// scn-470/471 live). check-invariants must fail it HERE, not let it surface as
// an INV-5 orphan at merge.
test('FU-105: a scn id reused across two feature files fails CONFIG (authoring-time)', () => {
  const { status, out } = runMutated((dir) => {
    // list.feature already owns scn-002; add a scenario reusing scn-001 (auth's).
    const p = join(dir, 'features/identity/list.feature');
    writeFileSync(p, readFileSync(p, 'utf8') + '\n@scn-001 @release\nScenario: duplicate id across files\n  Given x\n  When y\n  Then z\n');
  });
  assert.equal(status, 1, 'a cross-feature scn collision must fail the gate');
  assert.match(out, /scn id reused across feature files/);
  assert.match(out, /scn-001.*identity\/auth\.feature.*identity\/list\.feature|scn-001.*list\.feature.*auth\.feature/s);
});

test('FU-105: the clean fixture (disjoint scn ids per feature) has no collision', () => {
  const { status, out } = run(FIXTURE);
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /reused across feature files/);
});

// --- CONFIG §59 companion: title-embedded scn id must match the scenario's @scn tag (FU-124) ---
// Live class: a consumer slice shipped 6 scenarios TITLED with scn ids and zero tags — invisible
// to every invariant while silently overlapping a sibling's approved tag block.

test('CONFIG §59 fails on a Scenario titled scn-NNN with no @scn tag (title-only id)', () => {
  const { status, out } = runMutated((dir) => {
    writeFileSync(join(dir, 'features', 'identity', 'rogue.feature'),
      '# status: implemented\n\nFeature: Rogue\n\n  Scenario: scn-777 a name-only id\n    Given a\n    Then b\n');
  });
  assert.equal(status, 1, `a title-only scn id must fail the gate:\n${out}`);
  assert.match(out, /titled but not tagged/);
  assert.match(out, /scn-777/);
});

test('CONFIG §59 passes when the title id matches the scenario tag', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'features', 'identity', 'auth.feature');
    writeFileSync(p, readFileSync(p, 'utf8').replace('Scenario: a user signs in', 'Scenario: scn-001 a user signs in'));
  });
  assert.equal(status, 0, `a title id matching the tag is the house style elsewhere — must pass:\n${out}`);
});

test('CONFIG §59 fails when the title id and the scenario tag DISAGREE', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'features', 'identity', 'auth.feature');
    writeFileSync(p, readFileSync(p, 'utf8').replace('Scenario: a user signs in', 'Scenario: scn-999 a user signs in'));
  });
  assert.equal(status, 1, `a title/tag mismatch is drift, not style:\n${out}`);
  assert.match(out, /scn-999 titled but not tagged/);
});

// FU-134 review round 5: CONFIG §63 reads a `scenarios:` token with the SAME
// grammar as the expanders (scripts/scenario-claims.mjs, ralph_expand_scns): a
// trailing period is sentence punctuation; an upper-case `SCN-`, a backwards
// range and a range spanning 1000+ ids are malformed for every reader.
test('FU-134: CONFIG §63 shares the expanders\' grammar (trailing period ok; SCN-, backwards and oversized ranges malformed)', () => {
  const withToken = (token) => runMutated((dir) => {
    const p = join(dir, 'issues', '002-list.md');
    writeFileSync(p, readFileSync(p, 'utf8') + `\nDelivers ${token}\n`);
  });
  const period = withToken('scenarios:scn-002.');
  assert.doesNotMatch(period.out, /CONFIG §63/, `a trailing period is not part of the token:\n${period.out}`);
  for (const bad of ['scenarios:SCN-002', 'scenarios:scn-009..scn-003', 'scenarios:scn-1..scn-200000000']) {
    const r = withToken(bad);
    assert.equal(r.status, 1, `${bad}:\n${r.out}`);
    assert.match(r.out, /❌ CONFIG §63: unparseable scenarios label/, bad);
  }
});

// FU-134 review round 5: a feature that cannot be listed (a dangling, non-dot
// symlink) crashed the gate with a stack trace; it is a named CONFIG failure now,
// and every other invariant still reports.
test('FU-134: a dangling feature symlink is a named CONFIG failure, not a crash', () => {
  const { status, out } = runMutated((dir) => {
    symlinkSync(join(dir, 'nonexistent'), join(dir, 'features', 'gone.feature'));
  });
  assert.equal(status, 1, out);
  assert.match(out, /❌ CONFIG §58: feature file\(s\) that cannot be read: .*gone\.feature \(ENOENT\)/);
  assert.match(out, /INV-1/, 'the other invariants still ran');
  assert.doesNotMatch(out, /at .*check-invariants\.mjs:\d+/, 'no stack trace');
});

// FU-135 review round 5: INV-5 read @release off the raw tag line, so a Feature-
// level @release (inherited by every scenario under it) was invisible and an
// orphan went unreported; INV-3 counted an `@scn-` written in a docstring. The
// invariants now take scn ids from the reader's EFFECTIVE tags, as the runner does.
test('FU-135: INV-5 sees a Feature-level @release; an @scn- inside a docstring defines nothing', () => {
  const orphan = runMutated((dir) => {
    writeFileSync(join(dir, 'features', 'identity', 'export.feature'),
      '# status: approved\n@release\nFeature: Export\n\n  @scn-050\n  Scenario: a user exports a list\n    Given a list\n');
  });
  assert.equal(orphan.status, 1, orphan.out);
  assert.match(orphan.out, /❌ INV-5 .*scn-050/, 'the inherited @release scenario is an orphan (no issue claims it)');
  const docstring = runMutated((dir) => {
    const p = join(dir, 'features', 'identity', 'list.feature');
    writeFileSync(p, readFileSync(p, 'utf8') + '\n  Scenario: a note\n    Given a payload\n      """\n      @scn-060 @release\n      """\n');
  });
  assert.doesNotMatch(docstring.out, /scn-060/, 'docstring content is data, not a tag');
});

// FU-135 review round 5: a non-English feature failed CONFIG §58 under the
// status-line message and its fix; it has its own message now.
test('FU-135: a non-English feature fails CONFIG §58 with its own message, not the status-line one', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'features', 'identity', 'auth.feature');
    writeFileSync(p, '# language: es\n' + readFileSync(p, 'utf8'));
  });
  assert.equal(status, 1, out);
  assert.match(out, /❌ CONFIG §58: non-English feature file\(s\): identity\/auth\.feature:1 \(language\)\. Feature files are English Gherkin/);
  assert.doesNotMatch(out, /cannot honor: identity\/auth\.feature:1 \(language\)/);
});
