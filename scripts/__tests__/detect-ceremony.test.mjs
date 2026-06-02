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

test('>=3 modules (one context) → multi-module via module count, NOT cross-context', () => {
  // 3 distinct modules under non-layer dirs → no contexts counted.
  const r = detectCeremony([rec(['src/core/a.ts', 'src/core/b.ts', 'src/lib/c.ts'])]);
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
