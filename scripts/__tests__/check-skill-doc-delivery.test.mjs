// CI coverage for scripts/check-skill-doc-delivery.mjs (FOLLOW-UP 88).
//
// The gate is diff-aware: it stands up a throwaway git repo, commits a base,
// makes a slice change, and asserts the gate fires (or stays silent) by the
// real `git diff` — the same way the engine runs it at acceptance. Mirrors a
// real consumer's layout: a spec FR pinning a skill doc + a CLI skills/ tree.
//
// Run: node --test scripts/__tests__/check-skill-doc-delivery.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const GATE = join(here, '..', 'check-skill-doc-delivery.mjs');

function setupRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'skilldoc-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  mkdirSync(join(dir, 'docs', 'specs'), { recursive: true });
  mkdirSync(join(dir, 'packages', 'cli', 'skills'), { recursive: true });
  mkdirSync(join(dir, 'src', 'domain'), { recursive: true });
  // A baseline skill doc exists so "modified" is distinguishable from "added".
  writeFileSync(join(dir, 'packages', 'cli', 'skills', 'contract-management.md'), '# contract-management\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  return { dir, git };
}

const runGate = (dir, base, ...files) =>
  spawnSync('node', [GATE, base, ...files], { cwd: dir, encoding: 'utf8' });

function withRepo(fn) {
  const { dir, git } = setupRepo();
  try { return fn(dir, git); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// The FU's exact failure: spec FR pins "Skill doc `contract-management.md`
// extended", the slice ships only production code → green PR, doc skipped.
test('FU-88: spec declares a skill doc + diff omits it → FAIL (named, exit 1)', () => {
  withRepo((dir, git) => {
    const issue = join(dir, 'issue-16.md');
    writeFileSync(issue, [
      '# Issue 16 — deliverable external URL',
      'Spec source: docs/specs/16-deliverable-external-url.md',
    ].join('\n'));
    writeFileSync(join(dir, 'docs', 'specs', '16-deliverable-external-url.md'),
      '## FR-10\nSkill doc `contract-management.md` extended with the external-URL flow.\n');
    // Slice change: production only, no skill doc.
    writeFileSync(join(dir, 'src', 'domain', 'deliverable.ts'), 'export const x = 1;\n');
    git('add', '-A'); git('commit', '-qm', 'slice work, no doc');

    const r = runGate(dir, 'HEAD~1', issue);
    assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
    assert.match(`${r.stdout}${r.stderr}`, /FAIL/);
    assert.match(`${r.stdout}${r.stderr}`, /contract-management\.md/, 'names the missing doc');
  });
});

test('FU-88: spec declares a skill doc + diff DELIVERS it → pass (exit 0)', () => {
  withRepo((dir, git) => {
    const issue = join(dir, 'issue-16.md');
    writeFileSync(issue, 'Spec source: docs/specs/16-x.md\n');
    writeFileSync(join(dir, 'docs', 'specs', '16-x.md'),
      '## FR-10\nSkill doc `contract-management.md` extended.\n');
    writeFileSync(join(dir, 'src', 'domain', 'deliverable.ts'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'packages', 'cli', 'skills', 'contract-management.md'),
      '# contract-management\nExtended with the external-URL flow.\n');
    git('add', '-A'); git('commit', '-qm', 'slice work + doc');

    const r = runGate(dir, 'HEAD~1', issue);
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /pass/);
  });
});

test('FU-88: no skill-doc deliverable declared → na (exit 0, never fires)', () => {
  withRepo((dir, git) => {
    const issue = join(dir, 'issue-20.md');
    writeFileSync(issue, 'Spec source: docs/specs/20-plain.md\n');
    writeFileSync(join(dir, 'docs', 'specs', '20-plain.md'),
      '## FR-1\nThe Customer views a published listing.\n');
    writeFileSync(join(dir, 'src', 'domain', 'listing.ts'), 'export const y = 2;\n');
    git('add', '-A'); git('commit', '-qm', 'slice, no doc FR');

    const r = runGate(dir, 'HEAD~1', issue);
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /na/);
  });
});

test('FU-88: a wrong-named skill doc does not satisfy a specifically-named FR', () => {
  withRepo((dir, git) => {
    const issue = join(dir, 'issue-17.md');
    writeFileSync(issue, 'Spec source: docs/specs/17-y.md\n');
    writeFileSync(join(dir, 'docs', 'specs', '17-y.md'),
      '## FR-3\nSkill doc `delivery.md` extended.\n');
    // Touches a DIFFERENT skill doc, not the declared one.
    writeFileSync(join(dir, 'packages', 'cli', 'skills', 'contract-management.md'), '# changed\n');
    git('add', '-A'); git('commit', '-qm', 'wrong doc touched');

    const r = runGate(dir, 'HEAD~1', issue);
    assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
    assert.match(`${r.stdout}${r.stderr}`, /delivery\.md/);
  });
});
