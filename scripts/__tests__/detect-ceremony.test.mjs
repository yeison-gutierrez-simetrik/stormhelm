// Regression test for scripts/detect-ceremony.mjs (ADR-0002 / PR-M).
// Built on synthetic parsed-records so the classification logic is tested directly,
// independent of /plan phrasing. Rule under test:
//   multi-module ⇔ >=3 modules OR >=2 contexts ; cross-context ⇔ >=2 contexts.
//
// Run: node --test scripts/__tests__/detect-ceremony.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectCeremony } from '../detect-ceremony.mjs';

const rec = (modules) => ({ affected_modules: modules });

test('single module → feature:single-module, no cross-context', () => {
  const r = detectCeremony([rec(['src/domain/org'])]);
  assert.deepEqual(r.labels, ['feature:single-module']);
  assert.equal(r.module_count, 1);
  assert.equal(r.context_count, 1);
});

test('>=3 module dirs under non-layer roots → multi-module via module count, NOT cross-context', () => {
  // Directory-form entries, exactly what parse-layers-affected emits (it groups
  // files to their src/<layer>/<ctx> dir). None of these roots is a known layer,
  // so no contexts are counted — multi-module is driven purely by the module count.
  const r = detectCeremony([rec(['src/core', 'src/lib', 'src/api'])]);
  assert.deepEqual(r.labels, ['feature:multi-module']);
  assert.equal(r.module_count, 3);
  assert.equal(r.context_count, 0);
  assert.ok(!r.labels.includes('feature:cross-context'));
});

test('>=2 bounded contexts (only 2 modules) → multi-module AND cross-context', () => {
  const r = detectCeremony([rec(['src/domain/org', 'src/domain/billing'])]);
  assert.ok(r.labels.includes('feature:multi-module'));
  assert.ok(r.labels.includes('feature:cross-context'));
  assert.deepEqual(r.contexts, ['billing', 'org']);
});

test('a domain file directly under a layer (no context dir) is not a context', () => {
  // "src/domain/company.ts" → segment "company.ts" has a file suffix → not a context.
  const r = detectCeremony([rec(['src/domain/company.ts', 'src/application'])]);
  assert.equal(r.context_count, 0);
  assert.deepEqual(r.labels, ['feature:single-module']); // 2 modules, 0 contexts
});

test('records union across multiple issues', () => {
  const r = detectCeremony([rec(['src/domain/org']), rec(['src/domain/billing']), rec(['src/domain/payments'])]);
  assert.equal(r.context_count, 3);
  assert.ok(r.labels.includes('feature:multi-module'));
  assert.ok(r.labels.includes('feature:cross-context'));
});

test('CLI runs and emits valid JSON with a labels array', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const script = join(here, '..', 'detect-ceremony.mjs');
  const fixture = join(here, 'fixtures', '02-component-a.md');
  const r = spawnSync('node', [script, fixture], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(Array.isArray(out.labels));
  assert.ok(out.labels[0].startsWith('feature:'));
});

// ── FOLLOW-UP 54: the slice-doc input shape (the detector had never fired) ────

// detect-ceremony ran at /to-issues with the /plan "Layers affected" parser —
// but plans don't exist yet at that point: module_count was 0 on every real
// slice (3-for-3 manual audited flips). The parser now also reads the
// slice-doc shape: `### Layers` + `- **Module:** <Context> → <A>, <B>, <C>`.
import { writeFileSync as wfs, mkdtempSync as mdt, rmSync as rms } from 'node:fs';
import { tmpdir as tmpd } from 'node:os';
import { join as j } from 'node:path';
import { parseFile as pf } from '../parse-layers-affected.mjs';

test('FU-54: slice-doc Layers block → multi-module fires (the live 3-for-3 gap)', () => {
  const dir = mdt(j(tmpd(), 'fu54-'));
  try {
    const doc = j(dir, '03-register-provider-agent.md');
    wfs(doc, [
      '# Slice 03 — register provider agent', '',
      '### Layers',
      '- **Module:** Marketplace Backend → Onboarding, Auth, Catalog Integration',
      '', '## Depends on', 'None (foundation)', '',
    ].join('\n'));
    const out = detectCeremony([pf(doc)]);
    assert.equal(out.module_count, 3, 'three RHS modules counted');
    assert.ok(out.labels.includes('feature:multi-module'), `labels: ${out.labels}`);
  } finally { rms(dir, { recursive: true, force: true }); }
});

test('FU-54: two Module lines with distinct contexts → cross-context, layout-independent', () => {
  const dir = mdt(j(tmpd(), 'fu54x-'));
  try {
    const doc = j(dir, '04-campaign.md');
    wfs(doc, [
      '### Layers',
      '- **Module:** Marketplace Backend → Campaigns',
      '- **Module:** Catalog Service → Pricing, Inventory',
      '',
    ].join('\n'));
    const out = detectCeremony([pf(doc)]);
    assert.equal(out.context_count, 2, 'LHS names are the contexts');
    assert.ok(out.labels.includes('feature:cross-context'), `labels: ${out.labels}`);
    assert.ok(out.labels.includes('feature:multi-module'), '3 modules + 2 contexts');
  } finally { rms(dir, { recursive: true, force: true }); }
});

// ── FOLLOW-UP 66: schema-only substrate stays conservatively multi-module ─────

// A schema substrate slice lands tables OWNED by several modules — table
// ownership is persistence span, NOT runtime coupling. Per the maintainer
// decision (Option A, docs-only), the classification is left CONSERVATIVE:
// detect-ceremony still flags multi-module, and the resolution is the
// canonical pre-blessed `skip-invariant: INV-6` reason (core/12 §57) — a
// deliberate human single-module affirmation, not an auto-suppression. This
// test PINS that contract: the detector must NOT silently relax for
// persistence-only slices (which a future refactor toward "Option A +
// detector signal" would change — and would need to update this pin AND the
// docs together).
test('FU-66: a schema-only slice owning ≥2 modules tables is still multi-module (override is the contract)', () => {
  const dir = mdt(j(tmpd(), 'fu66-'));
  try {
    const doc = j(dir, '06-schema-foundations.md');
    wfs(doc, [
      '# Slice 06 — schema foundations (substrate, no behavior)', '',
      '### Layers',
      '- **Module:** Contract Engine → msas, sow_fixed_details',
      '- **Module:** Settlement → service_scopings',
      'API: none',
      'use-cases: none',
      '', '## Depends on', 'None (foundation)', '',
    ].join('\n'));
    const out = detectCeremony([pf(doc)]);
    assert.ok(out.context_count >= 2, 'table ownership genuinely spans contexts');
    assert.ok(out.labels.includes('feature:multi-module'),
      'conservative default INTACT — detector does not silently relax; INV-6 is resolved by the canonical skip-invariant reason, not by changing the count');
  } finally { rms(dir, { recursive: true, force: true }); }
});

// ── FOLLOW-UP 70: one bounded context across hexagonal layers is single-module ─

// §3: a module IS a bounded context, not a hexagonal layer. A normal vertical
// slice in ONE context touching domain+application+infrastructure is ONE
// module — the old `module_count >= 3` arm read it as multi-module and forced
// a bespoke INV-6 override on the most common slice shape. The §107 count now
// collapses `src/<layer>/<ctx>` to `<ctx>`.
test('FU-70: one context across domain/application/infrastructure → single-module', () => {
  const r = detectCeremony([rec([
    'src/domain/audit', 'src/application/audit', 'src/infrastructure/audit',
  ])]);
  assert.equal(r.module_count, 1, 'three layers of ONE context collapse to one module');
  assert.equal(r.context_count, 1);
  assert.deepEqual(r.labels, ['feature:single-module'], 'no bespoke INV-6 override needed for a normal slice');
});

test('FU-70: a genuine multi-context slice still escalates (collapse is per-context)', () => {
  const r = detectCeremony([rec([
    'src/domain/audit', 'src/application/audit',
    'src/domain/billing', 'src/infrastructure/billing',
  ])]);
  assert.equal(r.module_count, 2, 'audit + billing = two distinct contexts');
  assert.ok(r.labels.includes('feature:multi-module'));
  assert.ok(r.labels.includes('feature:cross-context'));
});

test('FU-70: three distinct non-layer module roots still count as three (no false collapse)', () => {
  const r = detectCeremony([rec(['src/core', 'src/lib', 'src/api'])]);
  assert.equal(r.module_count, 3, 'non-layer roots are not collapsed');
  assert.ok(r.labels.includes('feature:multi-module'));
});

// ── FU-70 round-2 (consumer review): layer-first-FUNCTIONAL layouts ───────────

// The reporting consumer is layer-first with FUNCTIONAL sub-dirs
// (src/application/ports, src/infrastructure/config) + non-app roots
// (features/, schema/). The first FU-70 collapse read ports/config as bounded
// contexts → a single-context slice still classified multi-module. Functional
// buckets and non-app roots no longer count.
test('FU-70: a single-context slice in a layer-first-FUNCTIONAL layout is single-module', () => {
  const r = detectCeremony([rec([
    'src/application/ports', 'src/application/types', 'src/application/use-cases',
    'src/domain/audit',                                  // the ONE real bounded context
    'src/infrastructure/config', 'src/infrastructure/adapters',
    'features/audit', 'schema',                          // non-app roots
  ])]);
  assert.equal(r.context_count, 1, 'only "audit" is a bounded context; ports/types/config/adapters are functional buckets');
  assert.equal(r.module_count, 1, 'one context across functional sub-dirs = one module');
  assert.deepEqual(r.labels, ['feature:single-module']);
});

test('FU-70: functional buckets do not mask a genuine second context', () => {
  const r = detectCeremony([rec([
    'src/application/ports', 'src/domain/audit', 'src/domain/billing',
  ])]);
  assert.deepEqual(r.contexts, ['audit', 'billing']);
  assert.ok(r.labels.includes('feature:multi-module'));
  assert.ok(r.labels.includes('feature:cross-context'));
});

test('FU-70: non-application roots alone never escalate ceremony', () => {
  const r = detectCeremony([rec(['features/audit', 'features/support', 'schema', 'docs'])]);
  assert.equal(r.module_count, 0);
  assert.deepEqual(r.labels, ['feature:single-module']);
});

// ── FOLLOW-UP 87: workspace packages + test-support are not bounded contexts ──

// The reporting consumer is a workspace monorepo: a single-context slice that
// adds a CLI command (`packages/cli`) and a test-support seeder
// (`src/test-support`) was read as 3 modules → false multi-module escalation,
// forcing a per-file `skip-invariant: INV-6` on the MOST COMMON slice shape.
test('FU-87: one context + a workspace package + a test-support seeder is single-module', () => {
  const r = detectCeremony([rec([
    'src/domain/contract-engine', 'src/application/contract-engine', 'src/infrastructure/contract-engine',
    'packages/cli',                 // CLI entry/SDK adapter of the slice's context, NOT a context
    'src/test-support',             // test scaffolding, like test/tests
  ])]);
  assert.equal(r.context_count, 1, 'only contract-engine is a bounded context');
  assert.equal(r.module_count, 1, 'packages/cli + src/test-support do not inflate the §107 count');
  assert.deepEqual(r.labels, ['feature:single-module'], 'no bespoke skip-invariant: INV-6 needed');
});

test('FU-87: src/test-support carries segs[0]==="src" — the bare-root check would miss it', () => {
  // Regression guard for the peek-under-src fix: a 2-segment src non-app subroot.
  const r = detectCeremony([rec(['src/domain/org', 'src/test-support'])]);
  assert.equal(r.module_count, 1, 'src/test-support excluded; only org counts');
});

test('FU-87: a genuine multi-package slice still escalates (exclusion is not a blanket mute)', () => {
  // packages/* collapses to "not a context", but ≥2 real contexts still escalate.
  const r = detectCeremony([rec(['src/domain/audit', 'src/domain/billing', 'packages/cli'])]);
  assert.equal(r.context_count, 2, 'audit + billing are real contexts');
  assert.ok(r.labels.includes('feature:multi-module'));
});

// ── FOLLOW-UP 79: commas inside parentheses are not module separators ─────────

test('FU-79: a Module line with parenthetical clarifications counts the real modules', () => {
  const dir = mdt(j(tmpd(), 'fu79-'));
  try {
    const doc = j(dir, '09-readiness.md');
    wfs(doc, [
      '### Layers',
      '- **Module:** Onboarding (readiness orchestration, Agent Tester management), Provider Gateway (probe delivery)',
      '',
    ].join('\n'));
    const out = detectCeremony([pf(doc)]);
    assert.deepEqual(out.modules, ['Onboarding', 'Provider Gateway'], 'two real modules, parentheticals stripped');
    assert.equal(out.module_count, 2, 'the inner commas did not inflate the count to 3');
  } finally { rms(dir, { recursive: true, force: true }); }
});
