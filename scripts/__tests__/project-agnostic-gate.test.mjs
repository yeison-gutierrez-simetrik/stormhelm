// Coverage for the project-agnostic gate in scripts/check-framework-metadata.mjs.
// Each test runs the real linter against a throwaway COPY of the repo's tracked
// files, mutates one file, and asserts the gate's verdict.
//
// The maintainer's rule: the framework is copied into any project, so its
// shipped files and its tests never cite a consumer. Two manual scrubs each
// missed citations, so the common shapes are a gate.
//
// Run: node --test scripts/__tests__/project-agnostic-gate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');

function withRepoCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'agnostic-'));
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

test('project-agnostic gate: the tracked tree as it stands is clean', () => {
  const { status, out } = withRepoCopy(() => {});
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /\[project-agnostic\]/);
});

test('project-agnostic gate: a consumer name in a skill fails, naming file:line', () => {
  const { status, out } = withRepoCopy((dir) => {
    appendFileSync(join(dir, 'skills', 'setup', 'SKILL.md'), '\nThis step was added after belong-marketplace hit it twice.\n'); // agnostic-ok: the gate's own fixture
  });
  assert.equal(status, 1, out);
  assert.match(out, /skills\/setup\/SKILL\.md:\d+ +\[project-agnostic\] cites a consumer \(consumer name/);
});

test('project-agnostic gate: consumer ids in a live note fail, in a template and in a test', () => {
  const { status, out } = withRepoCopy((dir) => {
    appendFileSync(join(dir, 'templates', 'ralph-lib.sh'), '\n# (live: slice-24 lost a commit here)\n'); // agnostic-ok: the gate's own fixture
    appendFileSync(join(dir, 'scripts', '__tests__', 'ralph-loop.test.mjs'), '\n// two slices reused scn-470/471 (live).\n'); // agnostic-ok: the gate's own fixture
    appendFileSync(join(dir, 'docs', 'engineering', 'core', '13-ralph-and-afk.md'), '\nPromoted after slices 08+09.\n'); // agnostic-ok: the gate's own fixture
  });
  assert.equal(status, 1, out);
  assert.match(out, /templates\/ralph-lib\.sh:\d+ +\[project-agnostic\] .*live-note id/);
  assert.match(out, /scripts\/__tests__\/ralph-loop\.test\.mjs:\d+ +\[project-agnostic\] .*live-note id/);
  assert.match(out, /core\/13-ralph-and-afk\.md:\d+ +\[project-agnostic\] .*slice id/);
});

// The verb, generic examples, the §1–§55 attribution credit and an explicit
// `agnostic-ok` exception are not citations; framework-self files and the
// .planning/ handoff (the consumer feedback log) are out of scope.
test('project-agnostic gate: no false alarm on the verb, generic examples, the credit, or out-of-scope files', () => {
  const { status, out } = withRepoCopy((dir) => {
    appendFileSync(join(dir, 'skills', 'setup', 'SKILL.md'),
      '\nThese checks belong to /setup; slice 1 and scn-001 are examples. (live: a consumer slice)\n' +
      'The rules credit the Belong A2A Marketplace team.\n' +
      'Kept as the regression fixture: slice-24. <!-- agnostic-ok: quoted from the upstream bug report -->\n');
    appendFileSync(join(dir, 'scripts', 'check-framework-metadata.mjs'), '\n// framework-self: live: slice-24\n'); // agnostic-ok: the gate's own fixture
    appendFileSync(join(dir, '.planning', 'FOLLOW-UPS-HANDOFF.md'), '\nLive evidence: belong-marketplace slice-24.\n'); // agnostic-ok: the gate's own fixture
  });
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /\[project-agnostic\]/);
});
