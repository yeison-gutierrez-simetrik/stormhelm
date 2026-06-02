// Regression test for scripts/group-slice-issues.mjs (PR-Group / FW-2).
// Reuses the synthetic 5-issue fixtures (the same ones the parser test uses):
// they form one cohesive dependency graph #1→#2→#3→#4→#5 (plus shortcuts), so
// the grouping must produce exactly one slice-group {1..5} rooted at #1.
//
// Run: node --test scripts/__tests__/group-slice-issues.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFile } from '../parse-layers-affected.mjs';
import { groupIssues } from '../group-slice-issues.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => join(here, 'fixtures', name);
const ALL = ['01-foundation', '02-component-a', '03-component-b', '04-component-c', '05-component-d']
  .map((n) => fx(`${n}.md`));

test('a cohesive slice resolves to ONE group {1..5} rooted at #1', () => {
  const { groups, standalone, warnings } = groupIssues(ALL.map(parseFile));
  assert.equal(groups.length, 1, 'the connected slice must be a single group');
  assert.deepEqual(groups[0].members, [1, 2, 3, 4, 5]);
  assert.equal(groups[0].root, 1, '#1 (foundation) is the topological root');
  assert.deepEqual(groups[0].closes, [1, 2, 3, 4, 5]);
  assert.equal(standalone.length, 0);
  assert.equal(warnings.length, 0, 'unambiguous root → no warnings');
});

test('an issue with no dependency edges is standalone, not a group', () => {
  // Foundation alone: its own record has no references → no edges → singleton.
  const { groups, standalone } = groupIssues([parseFile(fx('01-foundation.md'))]);
  assert.equal(groups.length, 0, 'a singleton is not a group');
  assert.deepEqual(standalone, [1]);
});

// Note: grouping follows the dependency EDGES, not the set of files passed. If
// #2's plan says "reused by #3/#4/#5", those land in #2's group even when their
// own files aren't provided — which is why the graph tests below build synthetic
// records directly instead of relying on which fixtures happen to be passed.

const rec = (n, refs = []) => ({ issue_number: n, references_to_issues: refs });
const bwd = (from, to) => ({ from, to, kind: 'backward' }); // from depends on to
const fwd = (from, to) => ({ from, to, kind: 'forward' });  // to depends on from

test('two disconnected components → one group + one standalone', () => {
  const records = [
    rec(10),                 // isolated
    rec(20),                 // foundation of the other component
    rec(21, [bwd(21, 20)]),  // 21 depends on 20
  ];
  const { groups, standalone } = groupIssues(records);
  assert.deepEqual(standalone, [10]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].members, [20, 21]);
  assert.equal(groups[0].root, 20);
});

test('forward reference pulls the consumer into the group', () => {
  // #2 declares "reused by #5" (forward) → #5 depends on #2 → same group.
  const { groups } = groupIssues([rec(1), rec(2, [bwd(2, 1), fwd(2, 5)])]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].members, [1, 2, 5]);
  assert.equal(groups[0].root, 1);
});

test('ambiguous foundation (two roots) is warned, not silently picked', () => {
  // #3 depends on both #1 and #2, neither of which depends on the other.
  const { groups, warnings } = groupIssues([rec(3, [bwd(3, 1), bwd(3, 2)])]);
  assert.equal(groups[0].root, null, 'no single root when the foundation is ambiguous');
  assert.deepEqual(groups[0].candidate_roots.sort(), [1, 2]);
  assert.ok(warnings.some((w) => /ambiguous/.test(w)));
});
