// Test for scripts/compose-sonar-properties.mjs (FOLLOW-UP 10).
//
// The composer had ZERO coverage; the rest of the suite never exercises it, so a
// green `node --test` said nothing about it. This pins the vendored-exclusion
// behavior: every consumer copies scripts/ + .claude/ from the framework, so the
// composed sonar gate must always exclude them (SonarCloud Automatic Analysis
// scans the whole repo and ignores sonar.sources=src). Uses isolated fixture
// capabilities under fixtures/sonar-caps/ so it doesn't break when a real
// CAPABILITY.md's frontmatter evolves.
//
// Run: node --test scripts/__tests__/compose-sonar-properties.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'compose-sonar-properties.mjs');
const FIXTURE_ROOT = join(here, 'fixtures', 'sonar-caps'); // holds docs/engineering/capabilities/<cap>

// Run the composer with cwd = the fixture root so it loads fixture capabilities.
function compose(...caps) {
  const r = spawnSync('node', [SCRIPT, ...caps], { cwd: FIXTURE_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
const exclusionsLine = (out) => out.split('\n').find((l) => l.startsWith('sonar.exclusions='));

// The standing vendored prefix every composed sonar.exclusions starts with:
// the two vendored dirs + the root Night Shift engine /setup delivers (FOLLOW-UP 10 + 12).
const VENDORED = 'scripts/**,.claude/**,ralph-local.sh,ralph-lib.sh,ralph-blocked-comment.md.tmpl';

test('no capability exclusions → exactly the vendored set (dirs + root Ralph engine)', () => {
  // Regression that matters most: pre-fix, a capability with no exclusions emitted
  // NO sonar.exclusions line at all. Now it must always emit the vendored set.
  const line = exclusionsLine(compose('cap-plain'));
  assert.equal(line, `sonar.exclusions=${VENDORED}`);
  // FOLLOW-UP 12: the root Night Shift files (outside scripts/ and .claude/) must be covered.
  for (const f of ['ralph-local.sh', 'ralph-lib.sh', 'ralph-blocked-comment.md.tmpl']) {
    assert.ok(line.includes(f), `${f} (vendored at project root) must be excluded`);
  }
});

test('capability exclusions are appended AFTER the vendored set', () => {
  assert.equal(
    exclusionsLine(compose('cap-excl')),
    `sonar.exclusions=${VENDORED},src/**/migrations/**`,
  );
});

test('sonar.exclusions is always emitted, preceded by the explanatory comment block', () => {
  const out = compose('cap-plain');
  assert.ok(exclusionsLine(out), 'sonar.exclusions must always be present (vendored dirs are standing)');
  const lines = out.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('sonar.exclusions='));
  assert.match(lines[idx - 1], /^#/, 'a # comment line must immediately precede sonar.exclusions');
  assert.ok(out.includes('framework-vendored'), 'the comment block explains the vendored exclusion');
});

test('a capability that declares scripts/** itself is deduped, not duplicated', () => {
  const line = exclusionsLine(compose('cap-dup'));
  assert.equal(line, `sonar.exclusions=${VENDORED},src/**/foo/**`);
  assert.equal((line.match(/scripts\/\*\*/g) || []).length, 1, 'scripts/** must appear exactly once');
});

test('--write emits BOTH .sonarcloud.properties and sonar-project.properties (FOLLOW-UP 13)', () => {
  // Automatic Analysis reads .sonarcloud.properties (not sonar-project.properties), so
  // --write must produce both, each carrying the vendored exclusions.
  const dir = mkdtempSync(join(tmpdir(), 'sonar-write-'));
  try {
    const capDst = join(dir, 'docs', 'engineering', 'capabilities', 'cap-plain');
    mkdirSync(capDst, { recursive: true });
    copyFileSync(join(FIXTURE_ROOT, 'docs/engineering/capabilities/cap-plain/CAPABILITY.md'), join(capDst, 'CAPABILITY.md'));
    const r = spawnSync('node', [SCRIPT, '--write', 'cap-plain'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    for (const f of ['.sonarcloud.properties', 'sonar-project.properties']) {
      assert.ok(existsSync(join(dir, f)), `${f} must be written`);
      const line = readFileSync(join(dir, f), 'utf8').split('\n').find((l) => l.startsWith('sonar.exclusions='));
      assert.equal(line, `sonar.exclusions=${VENDORED}`, `${f} must carry the full vendored exclusion set`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--check round-trips: composing then --check against that output exits 0', () => {
  const out = compose('cap-plain');
  const dir = mkdtempSync(join(tmpdir(), 'sonar-compose-'));
  try {
    const expected = join(dir, 'sonar-project.properties');
    writeFileSync(expected, out);
    const r = spawnSync('node', [SCRIPT, '--check', expected, 'cap-plain'], { cwd: FIXTURE_ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, `--check should pass on its own output:\n${r.stdout}${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
