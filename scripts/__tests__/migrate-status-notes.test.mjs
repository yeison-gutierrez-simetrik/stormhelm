// Coverage for scripts/migrate-status-notes.mjs — the one-time FOLLOW-UP 135
// migration that moves a note off the header's `# status:` line (the status line
// holds the state word alone) onto its own `# status-note:` line.
//
// Run: node --test scripts/__tests__/migrate-status-notes.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATE = join(here, '..', 'migrate-status-notes.mjs');
const LINT = join(here, '..', 'check-skipped-release-scn.mjs');
const { parseFeatureStatus } = await import(pathToFileURL(join(here, '..', 'parse-feature-status.mjs')).href);

function withFeatures(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
  try {
    mkdirSync(join(dir, 'features'), { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'features', name), text);
    return fn(dir, (name) => readFileSync(join(dir, 'features', name), 'utf8'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const run = (dir, ...args) => spawnSync('node', [MIGRATE, join(dir, 'features'), ...args], { encoding: 'utf8' });
const body = '\nFeature: X\n  @release @scn-1\n  Scenario: s\n    Given g\n';

test('FU-135 migration: a dry run lists the move and changes nothing', () => {
  const before = '# language: en\n# status: implemented — ratified in #12' + body;
  withFeatures({ 'a.feature': before }, (dir, read) => {
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Would migrate 1 status line\(s\) \(dry run/);
    assert.match(r.stdout, /\+ # status: implemented\n\s+\+ # status-note: ratified in #12/);
    assert.equal(read('a.feature'), before);
  });
});

test('FU-135 migration: --write moves the note, keeps the status, and the lint is clean afterwards; a rerun changes nothing', () => {
  withFeatures({ 'a.feature': '# status: implemented (issue #7 — scn-1 wired)' + body, 'b.feature': '# status: approved' + body }, (dir, read) => {
    const r = run(dir, '--write');
    assert.match(r.stdout, /Migrated 1 status line/);
    assert.equal(read('a.feature').split('\n').slice(0, 2).join('\n'), '# status: implemented\n# status-note: (issue #7 — scn-1 wired)');
    assert.equal(parseFeatureStatus(read('a.feature')).status, 'implemented');
    assert.equal(read('b.feature'), '# status: approved' + body, 'a clean feature is untouched');
    const lint = spawnSync('node', [LINT, join(dir, 'features')], { encoding: 'utf8' });
    assert.equal(lint.status, 0, lint.stdout);
    assert.match(run(dir, '--write').stdout, /Migrated 0 status line/);
  });
});

test('FU-135 migration: a note that names a state, or a first word that is not a state, is MANUAL and left alone', () => {
  const flip = '# status: approved → implemented' + body;
  const noted = '# status: implemented — approved by ops' + body;
  const punct = '# status: implemented.' + body;
  withFeatures({ 'flip.feature': flip, 'noted.feature': noted, 'punct.feature': punct }, (dir, read) => {
    const r = run(dir, '--write');
    assert.match(r.stdout, /Migrated 0 status line/);
    assert.match(r.stdout, /MANUAL — 3 status line\(s\) left alone/);
    assert.equal(read('flip.feature'), flip, 'a flip written into the line is never turned into a note');
    assert.equal(read('noted.feature'), noted);
    assert.equal(read('punct.feature'), punct);
  });
});

test('FU-135 migration: CRLF line endings and an indented / BOM-prefixed status line are kept', () => {
  const crlf = '\uFEFF  # status: implemented — ratified\r\nFeature: X\r\n  @release @scn-1\r\n  Scenario: s\r\n    Given g\r\n';
  withFeatures({ 'c.feature': crlf }, (dir, read) => {
    run(dir, '--write');
    const after = read('c.feature');
    assert.ok(after.startsWith('\uFEFF  # status: implemented\r\n  # status-note: ratified\r\nFeature: X\r\n'), JSON.stringify(after.slice(0, 80)));
    assert.equal(parseFeatureStatus(after).problems.length, 0);
  });
});

test('FU-135 migration: a missing features dir is rc 2', () => {
  const r = spawnSync('node', [MIGRATE, '/nonexistent-features-dir'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
