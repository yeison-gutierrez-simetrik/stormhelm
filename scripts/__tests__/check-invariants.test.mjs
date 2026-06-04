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
import { cpSync, rmSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
