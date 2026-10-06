// Coverage for the scripts/check-framework-metadata.mjs gates that scan the whole
// tracked tree — English-only and project-agnostic, which share one listing of
// tracked text files. Each test runs the real linter against a throwaway COPY of
// the repo's tracked files (a fresh git repo, so `git ls-files` sees exactly
// them), mutates one file, and asserts the gate's verdict.
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
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' }).split('\0').filter(Boolean);
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

// The maintainer's two rules, each a gate: the framework is English only, and
// what it ships (and its tests) never cites a consumer. Manual sweeps missed both
// more than once.
test('both gates: the tracked tree as it stands is clean', () => {
  const { status, out } = withRepoCopy(() => {});
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /\[english-only\]|\[project-agnostic\]/);
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

// Review round 5: `git ls-files` (no -z) quotes a path with non-ASCII bytes, so
// existsSync was false and an accented-name file — the likeliest to be Spanish —
// was never scanned.
test('english-only gate: a file with an accented name is scanned', () => {
  const { status, out } = withRepoCopy((dir) => {
    writeFileSync(join(dir, 'docs', 'an\u00e1lisis.md'), '# Notes\n\nRevisa que los archivos tengan el formato correcto.\n'); // lang-ok: the gate's own fixture
  });
  assert.equal(status, 1, out);
  assert.match(out, /docs\/an\u00e1lisis\.md:3 +\[english-only\]/);
});

// Review round 5: one Spanish word alone collides with English ("make hay",
// "para. 3", "Los Angeles"); a line needs an accent / inverted punctuation or two
// different lower-case Spanish words.
test('english-only gate: English that happens to contain one Spanish-looking word is not flagged', () => {
  const { status, out } = withRepoCopy((dir) => {
    writeFileSync(join(dir, 'docs', 'note.md'), [
      '# Note', '',
      'Make hay while the sun shines.',
      'See para. 3 of the contract.',
      'The Los Angeles office ran the PoR review.', '',
    ].join('\n'));
  });
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /\[english-only\]/);
});

// ── project-agnostic gate ──────────────────────────────────────────────────

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
      'Files go where they belong.\nA hard-wrapped line where these checks belong\nto the setup step.\n' +
      'The rules credit the Belong A2A Marketplace team.\n' +
      'Kept as the regression fixture: slice-24. <!-- agnostic-ok: quoted from the upstream bug report -->\n');
    appendFileSync(join(dir, 'scripts', 'check-framework-metadata.mjs'), '\n// framework-self: live: slice-24\n'); // agnostic-ok: the gate's own fixture
    appendFileSync(join(dir, '.planning', 'FOLLOW-UPS-HANDOFF.md'), '\nLive evidence: belong-marketplace slice-24.\n'); // agnostic-ok: the gate's own fixture
  });
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /\[project-agnostic\]/);
});
