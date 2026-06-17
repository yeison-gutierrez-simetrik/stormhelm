// Unit coverage for ralph-lib.sh pure helpers (sourced into bash, called directly).
// FOLLOW-UP 96: ralph_expand_scns must accept the RANGE form scn-A..scn-B — the
// only single-label shape that fits GitHub's 50-char label cap for a slice with
// more than ~8 scenarios (the `+`-joined form overflows; FU-71's documented range
// fallback was previously dropped as "unparseable").
//
// Run: node --test scripts/__tests__/ralph-lib.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'ralph-lib.sh');

// Source the lib and call one function; return trimmed stdout (stderr discarded —
// the expander warns on a dropped segment there, which we assert separately).
const expand = (label) => {
  const r = spawnSync('bash', ['-c', `source "${LIB}"; ralph_expand_scns "$1"`, '_', label], { encoding: 'utf8' });
  return { out: r.stdout.trim(), err: r.stderr.trim(), status: r.status };
};

test('FU-96: range form scn-A..scn-B expands inclusively', () => {
  assert.equal(expand('scn-409..scn-412').out, 'scn-409 scn-410 scn-411 scn-412');
});

test('FU-96: range preserves zero-pad width', () => {
  assert.equal(expand('scn-021..scn-023').out, 'scn-021 scn-022 scn-023');
});

test('FU-96: scn-A..B short form (no scn- on the upper bound) works', () => {
  assert.equal(expand('scn-001..003').out, 'scn-001 scn-002 scn-003');
});

test('FU-96: a range mixes with comma/plus segments', () => {
  assert.equal(expand('scn-001..003,scn-010').out, 'scn-001 scn-002 scn-003 scn-010');
  assert.equal(expand('scn-021+022,scn-030').out, 'scn-021 scn-022 scn-030', 'the +/comma forms still work');
});

test('FU-96: a 20-scn contiguous range fits a ≤50-char label and round-trips', () => {
  const label = 'scenarios:scn-370..scn-389';
  assert.ok(label.length <= 50, `label is ${label.length} chars (must be ≤50)`);
  const out = expand(label.replace('scenarios:', '')).out.split(' ');
  assert.equal(out.length, 20, '20 scenarios expanded');
  assert.equal(out[0], 'scn-370');
  assert.equal(out[19], 'scn-389');
});

test('FU-96: a backwards or non-numeric range is dropped (not silently mis-expanded)', () => {
  assert.equal(expand('scn-005..scn-003').out, '', 'backwards range yields nothing');
  const g = expand('scn-foo..bar');
  assert.equal(g.out, '');
  assert.match(g.err, /dropping unparseable segment/);
});
