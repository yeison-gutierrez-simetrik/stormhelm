#!/usr/bin/env node
// scripts/check-merge-safety.mjs
//
// Merge safety asserts (PR-Sec / FW-5).
//
// PROBLEM: merging a PR with mergeable=UNKNOWN (GitHub still recomputing
// mergeability in the background) silently picks the prior head, dropping any
// commit pushed in the last few seconds. Recovery requires a cherry-pick PR.
//
// Observed failure mode: a PR merged while mergeStateStatus was UNKNOWN; the
// merge commit's 2nd parent was the prior HEAD, not the just-pushed commit, so
// the last push was silently excluded and had to be recovered separately.
//
// FIX: two cheap asserts.
//   pre    — refuse to proceed if mergeable != MERGEABLE or state != CLEAN.
//   post   — after merge, verify the merge commit's 2nd parent == the head
//            we intended to merge. If not, a commit was dropped.
//
// Usage:
//   node scripts/check-merge-safety.mjs <pr_number> pre
//   node scripts/check-merge-safety.mjs <pr_number> post [expected_head_sha]
//
// Exit codes:
//   0  — safe to proceed (pre) / merge integrity verified (post)
//   1  — unsafe / inconsistent
//   2  — usage error
//
// Zero external dependencies (matches hooks/ + scripts/ convention).
// Requires `gh` and `git` in PATH.

import { execFileSync } from 'node:child_process';

const [, , prArg, mode, expectedHeadArg] = process.argv;

if (!prArg || !mode || !['pre', 'post'].includes(mode)) {
  console.error('Usage:');
  console.error('  node scripts/check-merge-safety.mjs <pr_number> pre');
  console.error('  node scripts/check-merge-safety.mjs <pr_number> post [expected_head_sha]');
  process.exit(2);
}

const pr = String(prArg).replace(/^#/, '');
if (!/^\d+$/.test(pr)) {
  console.error(`❌ Invalid PR number: '${prArg}' (expected a positive integer).`);
  process.exit(2);
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function fail(msg, hint) {
  console.error(`❌ ${msg}`);
  if (hint) console.error(`   Hint: ${hint}`);
  process.exit(1);
}
function ok(msg) {
  console.log(`✅ ${msg}`);
  process.exit(0);
}

// ---- pre-merge ------------------------------------------------------------
if (mode === 'pre') {
  let view;
  try {
    view = JSON.parse(gh([
      'pr', 'view', pr,
      '--json', 'number,state,mergeable,mergeStateStatus,headRefOid,baseRefOid,isDraft,title',
    ]));
  } catch (e) {
    fail(
      `Could not read PR #${pr} via 'gh pr view'.`,
      'Confirm gh is authenticated and the PR exists in the current repo.',
    );
  }

  const { state, mergeable, mergeStateStatus, headRefOid, baseRefOid, isDraft, title } = view;

  if (state !== 'OPEN') fail(`PR #${pr} is ${state}, not OPEN.`, 'Re-open the PR or pick a different one.');
  if (isDraft) fail(`PR #${pr} is a draft.`, 'Mark it ready for review before merging (§67).');

  // mergeable can be MERGEABLE | CONFLICTING | UNKNOWN. UNKNOWN is the dangerous one.
  if (mergeable !== 'MERGEABLE') {
    fail(
      `PR #${pr} mergeable=${mergeable} (expected MERGEABLE).`,
      mergeable === 'UNKNOWN'
        ? 'GitHub is still recomputing mergeability. WAIT and re-run; do NOT merge while UNKNOWN — merging in this state has silently dropped a just-pushed commit.'
        : 'Resolve conflicts and push again.',
    );
  }

  // mergeStateStatus can be CLEAN | BLOCKED | BEHIND | HAS_HOOKS | UNSTABLE | DIRTY | DRAFT | UNKNOWN.
  // CLEAN is the only safe state.
  if (mergeStateStatus !== 'CLEAN') {
    const hints = {
      BLOCKED: 'A required check is pending or failing; wait for green CI.',
      BEHIND: 'Branch is behind base; rebase or update before merging.',
      HAS_HOOKS: 'Branch protection hook is configured; verify it has run.',
      UNSTABLE: 'A non-required check is failing; review before merging.',
      DIRTY: 'Branch has merge conflicts; resolve before merging.',
      DRAFT: 'Mark the PR ready for review.',
      UNKNOWN: 'GitHub is still recomputing; WAIT and re-run.',
    };
    fail(
      `PR #${pr} mergeStateStatus=${mergeStateStatus} (expected CLEAN).`,
      hints[mergeStateStatus] || 'Investigate the merge state before merging.',
    );
  }

  ok(
    `PR #${pr} is mergeable: state=CLEAN, base=${baseRefOid.slice(0, 7)}, head=${headRefOid.slice(0, 7)}.\n` +
    `   Title: ${title}\n` +
    `   After 'gh pr merge', run:  node scripts/check-merge-safety.mjs ${pr} post ${headRefOid}`,
  );
}

// ---- post-merge -----------------------------------------------------------
if (mode === 'post') {
  // 1. Find the merge commit on the default branch that closed this PR.
  //    Approach: 'gh pr view --json mergeCommit,headRefOid' gives us the merge
  //    commit SHA and the head we *intended* to merge (the latter is preserved
  //    by GitHub even after merge).
  let view;
  try {
    view = JSON.parse(gh([
      'pr', 'view', pr,
      '--json', 'number,state,mergedAt,mergeCommit,headRefOid',
    ]));
  } catch (e) {
    fail(`Could not read PR #${pr} via 'gh pr view'.`, 'Confirm gh is authenticated.');
  }

  const { state, mergedAt, mergeCommit, headRefOid } = view;
  if (state !== 'MERGED') fail(`PR #${pr} is ${state}, not MERGED.`, 'Cannot post-verify an unmerged PR.');
  if (!mergeCommit || !mergeCommit.oid) fail(`No merge commit recorded for PR #${pr}.`, 'GitHub API anomaly; re-fetch later.');

  const mergeSha = mergeCommit.oid;
  const intendedHead = expectedHeadArg || headRefOid;
  if (!intendedHead) fail(`No intended head sha to compare against.`, 'Pass it as the 3rd argument or re-fetch via gh.');

  // 2. Read the parents of the merge commit from local git.
  //    The 2nd parent of a merge commit is the head of the merged branch.
  let parentsRaw;
  try {
    parentsRaw = git(['cat-file', '-p', mergeSha]);
  } catch (e) {
    fail(
      `Merge commit ${mergeSha.slice(0, 7)} not found locally.`,
      'Run: git fetch origin && re-run.',
    );
  }

  // {40,64} covers both SHA-1 (40 hex) and SHA-256 (64 hex) object formats.
  const parents = (parentsRaw.match(/^parent ([0-9a-f]{40,64})$/gm) || [])
    .map((line) => line.split(' ')[1]);

  if (parents.length < 2) {
    fail(
      `Merge commit ${mergeSha.slice(0, 7)} has ${parents.length} parents — expected ≥2 (this isn't a merge commit).`,
      'The PR was likely squashed or rebased; post-verify is N/A for non-merge strategies.',
    );
  }

  const secondParent = parents[1];

  // 3. Compare. If secondParent != intendedHead, a commit was dropped.
  if (secondParent.toLowerCase() === intendedHead.toLowerCase()) {
    ok(
      `Merge commit ${mergeSha.slice(0, 7)} integrity verified.\n` +
      `   2nd parent: ${secondParent.slice(0, 7)} == intended head: ${intendedHead.slice(0, 7)}.\n` +
      `   Merged at:  ${mergedAt}.`,
    );
  } else {
    // The dangerous case. Surface enough info to recover.
    fail(
      `Merge commit ${mergeSha.slice(0, 7)}: 2nd parent ${secondParent.slice(0, 7)} != intended head ${intendedHead.slice(0, 7)}.`,
      `Possible silent commit loss. Recover with:\n` +
      `     git log ${secondParent}..${intendedHead}\n` +
      `   If commits show up there, they exist on the branch but were excluded from the merge.\n` +
      `   Either cherry-pick them into main or open a recovery PR.`,
    );
  }
}
