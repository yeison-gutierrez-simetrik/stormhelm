#!/usr/bin/env node
// scripts/train-merge.mjs — [consumer-runtime] safe merge for stacked
// slice-group trains (FOLLOW-UP 60).
//
// PROBLEM: merging a train's first PR with `gh pr merge --delete-branch`
// deletes its head — which is the BASE of the stacked siblings — and GitHub
// CLOSES those PRs. A closed PR with a deleted base cannot be reopened or
// re-based; recovery means recreated PRs and orphaned review continuity.
// TWO live incidents in two slices (manual deletion, then the flag path) —
// the FU-53 runbook alone was demonstrably insufficient, which is exactly
// the activation criterion its DEFER recorded. The ecosystem agrees:
// Graphite/ghstack/spr all mechanize stack merges instead of documenting
// them.
//
// WHAT IT DOES, in order:
//   1. pre-merge safety: delegates to check-merge-safety.mjs (MERGEABLE/CLEAN
//      or refuse — the merged-at-UNSTABLE lesson).
//   2. RETARGET-BEFORE-DELETE: every open PR based on this PR's head branch
//      is retargeted to this PR's base FIRST (gh pr edit --base).
//   3. merge with a MERGE COMMIT (§123 — squash breaks stacked diffs) and
//      --delete-branch (safe now: nothing depends on the branch).
//   4. post-merge verify: check-merge-safety post with the pre-captured head.
//
// Usage:  node scripts/train-merge.mjs <pr-number>
// Bare `gh pr merge --delete-branch` inside a slice-group train is FORBIDDEN
// (core/13 runbook) — this script IS the how; the runbook stays as the why.
// Zero deps beyond gh + git + node (the framework's floor).

import { execFileSync } from 'node:child_process';

const pr = process.argv[2];
if (!pr || !/^\d+$/.test(pr)) {
  console.error('Usage: node scripts/train-merge.mjs <pr-number>');
  process.exit(2);
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: 'inherit' });

// 1. pre-merge safety (refuses on mergeable≠MERGEABLE or state≠CLEAN).
run('node', ['scripts/check-merge-safety.mjs', pr, 'pre']);

const view = JSON.parse(gh('pr', 'view', pr, '--json', 'headRefName,baseRefName,headRefOid'));
const { headRefName, baseRefName, headRefOid } = view;

// 2. retarget every open dependent BEFORE the branch can disappear.
const dependents = JSON.parse(
  gh('pr', 'list', '--base', headRefName, '--state', 'open', '--json', 'number'),
).map((d) => d.number);
for (const dep of dependents) {
  console.log(`↪ retargeting dependent PR #${dep}: ${headRefName} → ${baseRefName}`);
  gh('pr', 'edit', String(dep), '--base', baseRefName);
}
if (dependents.length) {
  console.log(`✅ ${dependents.length} dependent(s) retargeted — branch deletion is now safe.`);
} else {
  console.log('✅ no open dependents on this branch.');
}

// 3. merge commit + delete (safe: step 2 ran).
run('gh', ['pr', 'merge', pr, '--merge', '--delete-branch']);

// 4. post-merge verify with the head captured BEFORE the merge.
run('node', ['scripts/check-merge-safety.mjs', pr, 'post', headRefOid]);
console.log(`✅ train-merge of PR #${pr} complete — dependents intact, merge verified.`);
