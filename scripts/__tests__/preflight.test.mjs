// Coverage for scripts/preflight.mjs `feature-approved` (FOLLOW-UP 20).
//
// findFeatures resolves a slug by CONTENT (the `# spec: docs/specs/<slug>.md`
// header or the `@feature:<slug>` tag that /to-scenarios writes), not just the
// legacy `<slug>.feature` filename — a multi-context feature produces N files,
// none necessarily named after the slug, and the filename-only matcher
// false-negatived on every one of them (live: slice-02, two approved files,
// gate said "run /to-scenarios").
//
// Run: node --test scripts/__tests__/preflight.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = join(here, '..', 'preflight.mjs');

function withConsumer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function run(dir, ...args) {
  const r = spawnSync('node', [PREFLIGHT, ...args], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const feature = ({ spec, slugTag, status }) => `# language: en
# generated-by: /to-scenarios
${spec ? `# spec: ${spec}` : ''}
# status: ${status}

${slugTag ? `@feature:${slugTag}` : ''}
Feature: X

  @release @scn-001
  Scenario: s
    Given a
    Then b
`;

test('legacy <slug>.feature naming still passes', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'billing'), { recursive: true });
    writeFileSync(join(dir, 'features', 'billing', 'pay.feature'), feature({ status: 'approved' }));
    const { status, out } = run(dir, 'feature-approved', 'pay');
    assert.equal(status, 0, out);
  });
});

test('multi-context: spec-header files (none named after slug), all approved → pass', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'onboarding'), { recursive: true });
    mkdirSync(join(dir, 'features', 'settlement'), { recursive: true });
    writeFileSync(join(dir, 'features', 'onboarding', 'connect-onboarding.feature'),
      feature({ spec: 'docs/specs/02-stripe.md', status: 'approved' }));
    writeFileSync(join(dir, 'features', 'settlement', 'account-webhook.feature'),
      feature({ spec: 'docs/specs/02-stripe.md', status: 'approved' }));
    const { status, out } = run(dir, 'feature-approved', '02-stripe');
    assert.equal(status, 0, out);
    assert.match(out, /2 file\(s\)/);
  });
});

test('@feature:<slug> tag resolves without spec header', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'search'), { recursive: true });
    writeFileSync(join(dir, 'features', 'search', 'query.feature'),
      feature({ slugTag: 'site-search', status: 'approved' }));
    const { status, out } = run(dir, 'feature-approved', 'site-search');
    assert.equal(status, 0, out);
  });
});

test('one draft among N → fail naming the offending file', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    mkdirSync(join(dir, 'features', 'b'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'one.feature'),
      feature({ spec: 'docs/specs/f.md', status: 'approved' }));
    writeFileSync(join(dir, 'features', 'b', 'two.feature'),
      feature({ spec: 'docs/specs/f.md', status: 'draft' }));
    const { status, out } = run(dir, 'feature-approved', 'f');
    assert.notEqual(status, 0);
    assert.match(out, /two\.feature.*'draft'/);
    // The approved sibling must NOT be listed among the offenders.
    assert.doesNotMatch(out, /one\.feature/);
  });
});

test('zero matches → actionable /to-scenarios message', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features'), { recursive: true });
    const { status, out } = run(dir, 'feature-approved', 'ghost');
    assert.notEqual(status, 0);
    assert.match(out, /run \/to-scenarios/);
  });
});

test('a same-spec file must not borrow approval from its siblings (regression: first-match-wins)', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    // legacy-named file approved, but a content-matched sibling is draft → fail
    writeFileSync(join(dir, 'features', 'a', 'f.feature'),
      feature({ status: 'approved' }));
    writeFileSync(join(dir, 'features', 'a', 'extra.feature'),
      feature({ spec: 'docs/specs/f.md', status: 'draft' }));
    const { status, out } = run(dir, 'feature-approved', 'f');
    assert.notEqual(status, 0, 'the draft sibling must block even when the named file is approved');
    assert.match(out, /extra\.feature/);
  });
});
