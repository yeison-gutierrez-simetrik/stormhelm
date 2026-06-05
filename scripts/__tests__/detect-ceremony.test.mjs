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
