#!/usr/bin/env node
// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
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
import { readFileSync, existsSync } from 'node:fs';

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

  // FOLLOW-UP 91: green must mean "every EXPECTED check present + concluded
  // success", never "no failure seen". mergeStateStatus=CLEAN only reflects
  // branch-protection REQUIRED checks — a check that is not branch-protected
  // (or never registered for the branch) is invisible to it, so an auto-pilot
  // reading absence-of-failure as green can merge a PR whose authoritative gate
  // never ran (live: belong PR #156 — `acceptance` never registered across 3
  // pushes while SonarCloud passed). Assert against a declared EXPECTED-checks
  // manifest: every name PRESENT + COMPLETED + SUCCESS, and zero pending.
  const expected = resolveExpectedChecks();
  const rollup = readStatusChecks(pr);
  // (a) zero-pending — a still-running check is not-green, never green.
  const pending = rollup.filter((c) => !c.done);
  if (pending.length) {
    fail(
      `PR #${pr} has ${pending.length} check(s) still pending: ${pending.map((c) => c.name).join(', ')}.`,
      'A pending check is NOT green. Wait for every check to conclude, then re-run.',
    );
  }
  if (expected.length) {
    // (b) every expected check is present AND succeeded.
    const byName = new Map(rollup.map((c) => [c.name, c]));
    const missing = expected.filter((n) => !byName.has(n));
    const failed = expected.filter((n) => byName.has(n) && byName.get(n).conclusion !== 'SUCCESS');
    if (missing.length || failed.length) {
      const parts = [];
      if (missing.length) parts.push(`never registered: ${missing.join(', ')}`);
      if (failed.length) parts.push(`did not succeed: ${failed.map((n) => `${n}=${byName.get(n).conclusion || 'NONE'}`).join(', ')}`);
      fail(
        `PR #${pr} expected-check gate FAILED — ${parts.join('; ')}.`,
        'A missing-expected check is the silent false-green (its absence looks identical to pass). ' +
        'Ensure the workflow registered and concluded success before merging.',
      );
    }
  } else {
    console.error(
      '⚠️  No expected-checks manifest (RALPH_EXPECTED_CHECKS env or .planning/expected-checks.json) — ' +
      'cannot verify a required check is PRESENT (a never-registered workflow reads as green). ' +
      'Declare one for the auto-merge path (FU-91).',
    );
  }

  ok(
    `PR #${pr} is mergeable: state=CLEAN, base=${baseRefOid.slice(0, 7)}, head=${headRefOid.slice(0, 7)}.\n` +
    (expected.length ? `   Expected checks present + passing: ${expected.join(', ')}.\n` : '') +
    `   Title: ${title}\n` +
    `   After 'gh pr merge', run:  node scripts/check-merge-safety.mjs ${pr} post ${headRefOid}`,
  );
}

// FU-91 helpers ------------------------------------------------------------
// The expected-check manifest: env RALPH_EXPECTED_CHECKS (comma/space-sep) takes
// precedence, else .planning/expected-checks.json (a JSON array of check names).
function resolveExpectedChecks() {
  const env = (process.env.RALPH_EXPECTED_CHECKS || '').split(/[,\s]+/).filter(Boolean);
  if (env.length) return env;
  const f = '.planning/expected-checks.json';
  if (existsSync(f)) {
    try {
      const arr = JSON.parse(readFileSync(f, 'utf8'));
      if (Array.isArray(arr)) return arr.map(String).filter(Boolean);
    } catch { /* malformed → treated as no manifest (the advisory fires) */ }
  }
  return [];
}
// Normalize statusCheckRollup (CheckRun: name/status/conclusion; legacy
// StatusContext: context/state) into { name, done, conclusion(SUCCESS|…) }.
function readStatusChecks(prNum) {
  let rollup = [];
  try {
    const v = JSON.parse(gh(['pr', 'view', prNum, '--json', 'statusCheckRollup']));
    rollup = v.statusCheckRollup || [];
  } catch { return []; }
  return rollup.map((c) => {
    if (c.__typename === 'StatusContext' || c.context) {
      const state = (c.state || '').toUpperCase();   // SUCCESS | PENDING | FAILURE | ERROR
      return { name: c.context, done: state !== 'PENDING' && state !== '', conclusion: state === 'SUCCESS' ? 'SUCCESS' : state };
    }
    const status = (c.status || '').toUpperCase();    // QUEUED | IN_PROGRESS | COMPLETED
    return { name: c.name, done: status === 'COMPLETED', conclusion: (c.conclusion || '').toUpperCase() };
  }).filter((c) => c.name);
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
