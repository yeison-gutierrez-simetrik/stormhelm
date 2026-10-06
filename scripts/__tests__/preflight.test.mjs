// Coverage for scripts/preflight.mjs `feature-approved` (FOLLOW-UP 20).
//
// findFeatures resolves a slug by CONTENT (the `# spec: docs/specs/<slug>.md`
// header or the `@feature:<slug>` tag that /to-scenarios writes), not just the
// legacy `<slug>.feature` filename — a multi-context feature produces N files,
// none necessarily named after the slug, and the filename-only matcher
// false-negatived on every one of them (live: a consumer slice, two approved files,
// gate said "run /to-scenarios").
//
// Run: node --test scripts/__tests__/preflight.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync } from 'node:fs';
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

// FU-135: preflight read the first `# status:` ANYWHERE in the file, so a
// feature with no header status and a mid-file `# status: approved` passed as
// approved — while the runner reads no status at all. It now uses the runner's
// reader (scripts/parse-feature-status.mjs).
test('FU-135: a mid-file status does not make a feature approved', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'f.feature'),
      '# language: en\n# spec: docs/specs/f.md\n\nFeature: X\n\n# status: approved\n  @release @scn-001\n  Scenario: s\n    Given a\n');
    const { status, out } = run(dir, 'feature-approved', 'f');
    assert.notEqual(status, 0, out);
    assert.match(out, /f\.feature \(line 6: mid-file\)/, 'named as the header problem it is — the runner reads no status there');
  });
});

// FU-135 review: a malformed header is a header problem, not a missing approval
// — `# status: approved.` used to send the agent back through /clarify and the
// human checkpoint for a punctuation typo, and an extra `# status:` line passed
// preflight while the CI config refuses to load on it.
test('FU-135: a broken status in an approved feature escalates, not "complete /clarify"', () => {
  for (const header of ['# status: approved.', '# status: approved\n# status: implemented']) {
    withConsumer((dir) => {
      mkdirSync(join(dir, 'features', 'a'), { recursive: true });
      writeFileSync(join(dir, 'features', 'a', 'f.feature'),
        `# language: en\n# spec: docs/specs/f.md\n${header}\n\nFeature: X\n\n  @release @scn-001\n  Scenario: s\n    Given a\n`);
      const { status, out } = run(dir, 'feature-approved', 'f');
      assert.notEqual(status, 0, out);
      assert.match(out, /`# status:` line\(s\) the runner cannot honor/, header);
      assert.doesNotMatch(out, /complete \/clarify/, `${header}: not an approval problem`);
      assert.match(out, /escalate to a human/, `${header}: an approved .feature is read-only to the agent (§58)`);
    });
  }
});

// FU-135 review: only feature-approved reads a status, so only it may depend on
// parse-feature-status.mjs — a partial re-sync must not break git-repo / gh-auth.
// Review round 4: the escalation is for files the agent may not edit. A draft or
// clarifying feature is agent-editable, so a status problem there is "not
// approved yet" — fix it while editable, then /clarify — never an escalation.
test('FU-135: a status problem in a draft feature routes to /clarify, not to a human', () => {
  for (const header of ['# status: draft.', '# status: draft\n\nFeature: Y\n# status: implemented', '# status: clarifying → approved']) {
    withConsumer((dir) => {
      mkdirSync(join(dir, 'features', 'a'), { recursive: true });
      writeFileSync(join(dir, 'features', 'a', 'f.feature'),
        `# language: en\n# spec: docs/specs/f.md\n${header}\n\n  @release @scn-001\n  Scenario: s\n    Given a\n`);
      const { status, out } = run(dir, 'feature-approved', 'f');
      assert.notEqual(status, 0, out);
      assert.match(out, /non-approved file/, header);
      assert.match(out, /complete \/clarify/, header);
      assert.match(out, /fix while editable: line \d+: (invalid|mid-file|transition)/, header);
      assert.doesNotMatch(out, /escalate to a human/, `${header}: a draft is agent-editable`);
    });
  }
});

// Review round 5: `draft` + an extra `approved` line was routed as an editable
// draft — the agent could delete the `draft` line and approve the feature
// without HUMAN CHECKPOINT 1. An extra (or empty) status line always escalates.
test('FU-135: a draft header with an extra approved line escalates instead of "fix while editable"', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'f.feature'),
      '# language: en\n# spec: docs/specs/f.md\n# status: draft\n# status: approved\n\nFeature: X\n\n  @release @scn-001\n  Scenario: s\n    Given a\n');
    const { status, out } = run(dir, 'feature-approved', 'f');
    assert.notEqual(status, 0, out);
    assert.match(out, /escalate to a human/);
    assert.doesNotMatch(out, /fix while editable/);
  });
});

// Review round 5: the slice that completes a file flips it to `implemented` in its
// own PR, so a later slice of the same feature finds that file implemented —
// post-approval by definition (FOLLOW-UP 39), never "non-approved".
test('FU-135: an implemented file counts as approved for a later slice of the same feature', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'one.feature'), feature({ spec: 'docs/specs/f.md', status: 'implemented' }));
    writeFileSync(join(dir, 'features', 'a', 'two.feature'), feature({ spec: 'docs/specs/f.md', status: 'approved' }));
    const { status, out } = run(dir, 'feature-approved', 'f');
    assert.equal(status, 0, out);
    assert.match(out, /one\.feature \(implemented\)/);
  });
});

test('FU-135: subcommands that read no status run without parse-feature-status.mjs', () => {
  withConsumer((dir) => {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    copyFileSync(PREFLIGHT, join(dir, 'scripts', 'preflight.mjs'));
    const r = spawnSync('node', ['scripts/preflight.mjs', 'git-repo'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  });
});

// FU-135 review: a missing reader is an actionable failure, not a stack trace;
// and an editor lock file in features/ does not crash the slug lookup.
test('FU-135: feature-approved without parse-feature-status.mjs fails with a re-sync instruction', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    copyFileSync(PREFLIGHT, join(dir, 'scripts', 'preflight.mjs'));
    writeFileSync(join(dir, 'features', 'a', 'f.feature'), feature({ spec: 'docs/specs/f.md', status: 'approved' }));
    const r = spawnSync('node', ['scripts/preflight.mjs', 'feature-approved', 'f'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(`${r.stdout}${r.stderr}`, /parse-feature-status\.mjs is missing/);
    assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND/, 'no raw stack trace');
  });
});

// Review round 4: only a MISSING reader gets the re-sync advice. Any other import
// failure (a syntax error in a hand-patched copy) is the real error, shown as is.
test('FU-135: a broken (not missing) reader surfaces its real error', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    copyFileSync(PREFLIGHT, join(dir, 'scripts', 'preflight.mjs'));
    writeFileSync(join(dir, 'scripts', 'parse-feature-status.mjs'), 'export function parseFeatureStatus( {\n');
    writeFileSync(join(dir, 'features', 'a', 'f.feature'), feature({ spec: 'docs/specs/f.md', status: 'approved' }));
    const r = spawnSync('node', ['scripts/preflight.mjs', 'feature-approved', 'f'], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /SyntaxError/, 'the real error');
    assert.doesNotMatch(`${r.stdout}${r.stderr}`, /is missing/, 'not misreported as missing');
  });
});

// Review round 4: preflight lists features with the runner's own walk
// (featureFiles), so a symlinked features directory is visible to it as it is to
// the runner, and a dangling non-dot feature symlink is an actionable failure.
test('FU-135: feature-approved sees a feature inside a symlinked directory', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'pkg', 'features'), { recursive: true });
    mkdirSync(join(dir, 'features'), { recursive: true });
    writeFileSync(join(dir, 'pkg', 'features', 'f.feature'), feature({ spec: 'docs/specs/f.md', status: 'approved' }));
    symlinkSync(join(dir, 'pkg', 'features'), join(dir, 'features', 'shared'));
    const { status, out } = run(dir, 'feature-approved', 'f');
    assert.equal(status, 0, out);
    assert.match(out, /features\/shared\/f\.feature/);
  });
});

test('FU-135: a dangling (non-dot) feature symlink fails feature-approved with an actionable message', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'f.feature'), feature({ spec: 'docs/specs/f.md', status: 'approved' }));
    symlinkSync(join(dir, 'nonexistent'), join(dir, 'features', 'a', 'gone.feature'));
    const { status, out } = run(dir, 'feature-approved', 'f');
    assert.notEqual(status, 0, out);
    assert.match(out, /cannot be read: .*gone\.feature \(ENOENT\)/);
    assert.doesNotMatch(out, /at .*preflight\.mjs:\d+/, 'no raw stack trace');
  });
});

test('FU-135: an editor lock symlink in features/ does not crash feature-approved', () => {
  withConsumer((dir) => {
    mkdirSync(join(dir, 'features', 'a'), { recursive: true });
    writeFileSync(join(dir, 'features', 'a', 'f.feature'), feature({ spec: 'docs/specs/f.md', status: 'approved' }));
    symlinkSync(join(dir, 'nonexistent'), join(dir, 'features', 'a', '.#f.feature'));
    const { status, out } = run(dir, 'feature-approved', 'f');
    assert.equal(status, 0, out);
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
// no-arg allocation helper. Live motivation: three consumer slices raced the same
// range even following the manual check-max ritual.

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
