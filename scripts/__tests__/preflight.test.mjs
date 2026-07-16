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

// --- scn-fresh (§59 reservation gate, FU-121/FU-124) -------------------------
// The three ways an id can be "taken" (tag, title-only, issues label) plus the
// no-arg allocation helper. Live motivation: three belong slices raced the same
// range (2026-07-16) even following the manual check-max ritual.

const scnFeature = (body) => `# status: implemented\n\nFeature: X\n\n${body}`;

test('scn-fresh with no args reports max + next free id', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'x.feature'),
      scnFeature('  @scn-041 @release\n  Scenario: s\n    Given a\n'));
    const { status, out } = run(dir, 'scn-fresh');
    assert.equal(status, 0, out);
    assert.match(out, /max is scn-41/);
    assert.match(out, /starts at scn-42/);
  });
});

test('scn-fresh fails on an id already TAGGED in a feature, naming the owner', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'x.feature'),
      scnFeature('  @scn-042 @release\n  Scenario: s\n    Given a\n'));
    const { status, out } = run(dir, 'scn-fresh', 'scn-042..scn-044');
    assert.notEqual(status, 0);
    assert.match(out, /scn-42/);
    assert.match(out, /x\.feature/);
  });
});

test('scn-fresh fails on a TITLE-ONLY id (no @scn tag — the gate-invisible class)', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'x.feature'),
      scnFeature('  Scenario: scn-050 a name-only id\n    Given a\n'));
    const { status, out } = run(dir, 'scn-fresh', 'scn-050');
    assert.notEqual(status, 0);
    assert.match(out, /title-only/);
  });
});

test('scn-fresh fails on an id claimed by an issues/*.md scenarios: RANGE label', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'issues'), { recursive: true });
    writeFileSync(join(dir, 'issues', '07-x.md'),
      '# Issue\n\n**Labels:** `ralph-ready` `scenarios:scn-060..scn-063`\n');
    const { status, out } = run(dir, 'scn-fresh', 'scn-061');
    assert.notEqual(status, 0);
    assert.match(out, /07-x\.md/);
  });
});

test('scn-fresh passes on genuinely unclaimed ids', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'x.feature'),
      scnFeature('  @scn-042 @release\n  Scenario: s\n    Given a\n'));
    const { status, out } = run(dir, 'scn-fresh', 'scn-043+044');
    assert.equal(status, 0, out);
    assert.match(out, /2 scn id\(s\) fresh/);
  });
});
