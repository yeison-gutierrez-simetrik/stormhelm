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
import { cpSync, rmSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

test('INV-4 fails (exit 1) when an Accepted ADR loses its Date', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'docs/adr/0001-auth-approach.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^\*\*Date:\*\*.*$/m, ''));
  });
  assert.equal(status, 1);
  assert.match(out, /❌ INV-4/);
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

// FOLLOW-UP 35: an unsupported scenarios grammar must fail CONFIG-loudly —
// it expands to zero scenarios and blinds every label-driven invariant.
test('FU-35: range-form scenarios label → CONFIG failure naming file + canonical form', () => {
  const { status, out } = runMutated((dir) => {
    const p = join(dir, 'issues/001-auth.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('`scenarios:scn-001`', '`scenarios:scn-001..003`'));
  });
  assert.equal(status, 1, 'unparseable grammar must fail the gate');
  assert.match(out, /❌ CONFIG.*scn-001\.\.003/);
  assert.match(out, /scn-NNN\+NNN/, 'canonical form named');
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
