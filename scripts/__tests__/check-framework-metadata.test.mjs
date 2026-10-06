// Coverage for scripts/check-framework-metadata.mjs gates that scan the whole
// tracked tree. Each test runs the real linter against a throwaway COPY of the
// repo's tracked files (a fresh git repo, so `git ls-files` sees exactly them),
// mutates one file, and asserts the gate's verdict.
//
// Run: node --test scripts/__tests__/check-framework-metadata.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');

function withRepoCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'meta-'));
  try {
    const files = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean);
    for (const f of files) {
      mkdirSync(join(dir, dirname(f)), { recursive: true });
      try { copyFileSync(join(REPO, f), join(dir, f)); } catch { /* deleted in the working tree */ }
    }
    mutate(dir);
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['add', '-A'], { cwd: dir });
    const r = spawnSync('node', ['scripts/check-framework-metadata.mjs'], { cwd: dir, encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// The maintainer's rule: the framework is English only. A manual sweep missed
// Spanish twice, so the rule is a gate: Spanish markers in any tracked text file
// fail the linter, naming file:line.
test('english-only gate: the tracked tree as it stands is clean', () => {
  const { status, out } = withRepoCopy(() => {});
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /\[english-only\]/);
});

test('english-only gate: a Spanish line in a skill fails, naming file:line', () => {
  const { status, out } = withRepoCopy((dir) => {
    appendFileSync(join(dir, 'skills', 'setup', 'SKILL.md'), '\nRevisa que los archivos tengan el formato correcto.\n'); // lang-ok: the gate's own fixture
  });
  assert.equal(status, 1, out);
  assert.match(out, /skills\/setup\/SKILL\.md:\d+ +\[english-only\]/);
});

test('english-only gate: an accented letter fails too; a lang-ok marker with a reason exempts the line', () => {
  const bad = withRepoCopy((dir) => writeFileSync(join(dir, 'docs', 'note.md'), '# Note\n\nA café line.\n')); // lang-ok: the gate's own fixture
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.out, /docs\/note\.md:3 +\[english-only\]/);
  const ok = withRepoCopy((dir) => writeFileSync(join(dir, 'docs', 'note.md'), '# Note\n\nA café line. <!-- lang-ok: a fixture name -->\n'));
  assert.doesNotMatch(ok.out, /\[english-only\]/, ok.out);
});
