#!/usr/bin/env node
// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/check-skipped-release-scn.mjs
//
// FOLLOW-UP 108 (§130b) — referenced-but-skipped = false-green. `test:acceptance`
// / `test:smoke` set CUCUMBER_IMPLEMENTED_ONLY=1, which skips whole
// `# status: approved` feature files. The documented practice writes scns
// `approved` first and flips to `implemented` only at close-out — so a @release
// scn an issue CLAIMS to deliver (its `scenarios:` token) that still lives in an
// approved feature is SKIPPED by CI, and CI goes green having never run it
// (live: slice-40b D-11 scn-566). A referenced-but-not-executed scenario is a
// gate failure, not a silent skip.
//
// This gate, run AT ACCEPTANCE: given the issue's `scenarios:` tokens and the
// features dir, it FAILS naming any claimed @release scn whose feature would be
// skipped under IMPLEMENTED_ONLY (its `# status:` header is not `implemented`) —
// so the skip is observable in /tdd, not discovered by the §114 reviewer or a
// production deploy. Pairs with the §58 approved→implemented close-out flip, but
// is the durable fix: it does not rely on the human remembering the flip.
//
// Pure of network/gh: reads the issue text it is handed and the features dir.
//
// ISSUE #141: also lints for a mid-file `# status:` (the silent-skip the status
// mechanism produces of itself — cucumber.mjs ignores a status after the header,
// so an approved feature with a per-scenario `# status: implemented` is skipped
// while the gate is green), and has a CI-safe exit contract so it wires into a
// plain `pull_request` job.
//
// Usage:
//   node scripts/check-skipped-release-scn.mjs <features-dir> [issue-or-spec-file...]
//
// Behavior (rc 0 clean · 1 a genuine false-green risk · 2 only on a malformed call):
//   - ALWAYS: the mid-file-status lint across every feature — a `# status:` line
//     AFTER the header block (cucumber's statusOf break point) → FAIL, named.
//   - <features-dir> ALONE  → CI mode: just the lint (issue-independent backstop).
//   - <features-dir> <issue-file…> → ALSO the §130b claimed-scn check: extracts
//     claimed scns from each `scenarios:` token (compact forms scn-A,scn-B /
//     scn-A+B / scn-A..B) and FAILs naming any claimed @release scn whose feature
//     is not `# status: implemented` (would be skipped under IMPLEMENTED_ONLY).
//   - Clean → `SKIPPED-SCN GATE: ok`; issue with no scenarios token + no mid-file
//     status → `na`. Any problem → `SKIPPED-SCN GATE: FAIL` + offenders, exit 1.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ISSUE #141: a sane exit contract so this wires plainly into a `pull_request`
// CI job. rc 0 = clean · rc 1 = a genuine false-green risk · rc 2 ONLY on a
// truly malformed call (no features dir). Two modes:
//   <features-dir>               → CI mode: the issue-independent mid-file-status
//                                  lint across every feature (FU-44: the script
//                                  owns its own scoping for a bare node/pnpm call).
//   <features-dir> <issue-file…> → Ralph per-slice: the above PLUS the §130b
//                                  claimed-@release-scn-in-a-non-implemented-feature
//                                  check (issue-aware).
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('usage: node scripts/check-skipped-release-scn.mjs <features-dir> [issue-or-spec-file...]');
  console.error('  <features-dir> alone = CI mode (mid-file-status lint, §130b/ISSUE #141)');
  process.exit(2);
}
const [featuresDir, ...issueFiles] = args;

// --- claimed scns from the issue/spec `scenarios:` tokens -------------------
function claimedScns(files) {
  const scns = new Set();
  for (const f of files) {
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    // Capture ONLY the structured token list after `scenarios:` — a leading
    // scn-N then compact continuations (,/+ lists, .. ranges). Stops at prose
    // (a space), so "scenarios:scn-566 for the slice" yields just scn-566.
    // Forms: scenarios:scn-021,scn-022 · scenarios:scn-021+022 · scn-021..023
    for (const m of text.matchAll(/scenarios:\s*(scn-\d+(?:(?:[,+]|\.\.)(?:scn-)?\d+)*)/g)) {
      for (const tok of m[1].split(/[,+]/)) {
        // range scn-A..scn-B or scn-A..B (or bare A..B from a compact list)
        const range = tok.match(/^(?:scn-)?(\d+)\.\.(?:scn-)?(\d+)$/);
        if (range) {
          const a = +range[1], b = +range[2];
          if (b >= a && b - a < 1000) for (let n = a; n <= b; n++) scns.add(`scn-${n}`);
          continue;
        }
        // Inside a scenarios: token, a bare number IS a scn (compact + form).
        const one = tok.match(/^(?:scn-)?(\d+)$/);
        if (one) scns.add(`scn-${one[1]}`);
      }
    }
  }
  return scns;
}

// --- walk .feature files ----------------------------------------------------
function featureFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...featureFiles(p));
    else if (e.endsWith('.feature')) out.push(p);
  }
  return out;
}

// Map scn -> { file, status, release } by scanning each feature.
function indexScenarios(files) {
  const idx = new Map();
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    // `# status: <word>` — the IMPLEMENTED_ONLY runner reads this header.
    let status = 'unknown';
    for (const l of lines) {
      const m = l.match(/^#\s*status:\s*(\w+)/i);
      if (m) { status = m[1].toLowerCase(); break; }
    }
    // A scn's tags can span multiple lines above its Scenario:. Accumulate the
    // contiguous @tag lines, then attribute them to the @scn-NNN they precede.
    let tagBuf = '';
    for (const l of lines) {
      const t = l.trim();
      if (t.startsWith('@')) { tagBuf += ' ' + t; continue; }
      if (/^(Scenario|Scenario Outline):/i.test(t)) {
        for (const sm of tagBuf.matchAll(/@scn-(\d+)\b/g)) {
          const scn = `scn-${sm[1]}`;
          const release = /@release\b/.test(tagBuf);
          if (!idx.has(scn)) idx.set(scn, { file, status, release });
        }
        tagBuf = '';
      } else if (t !== '') {
        tagBuf = ''; // a non-tag, non-scenario line breaks the tag block
      }
    }
  }
  return idx;
}

// ISSUE #141 — mid-file `# status:` lint. `cucumber.mjs` statusOf() reads the
// status ONLY from the header (it `break`s at the first `Feature`/`@` line), so
// a `# status: implemented` placed per-scenario / mid-file is SILENTLY IGNORED:
// the whole approved/draft feature is excluded under IMPLEMENTED_ONLY and its
// @release scenarios never run — yet the gate reports green. This is the §106
// false-green produced BY the §58-status mechanism itself (bit belong PRs
// #350/#357). The status is a header-only contract; a `# status:` after the
// header break is the misuse that must be loud, not silent.
function findMidFileStatus(files) {
  const offenders = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let pastHeader = false;
    lines.forEach((l, i) => {
      // cucumber's statusOf() break point: the first Feature: or @tag line.
      if (!pastHeader && /^\s*(Feature|@)/.test(l)) pastHeader = true;
      else if (pastHeader && /^\s*#\s*status:\s*\w+/i.test(l)) {
        offenders.push(`MID-FILE STATUS ${file}:${i + 1} \`${l.trim()}\` — a '# status:' AFTER the header block is IGNORED by cucumber.mjs (statusOf breaks at the first Feature/@); the feature stays at its header status and its @release scns are silently skipped under IMPLEMENTED_ONLY → false-green (ISSUE #141). Status belongs only in the feature's FIRST comment block.`);
      }
    });
  }
  return offenders;
}

const features = featureFiles(featuresDir);
const problems = [];

// (1) Mid-file-status lint — ALWAYS (issue-independent; the silent-skip cause).
problems.push(...findMidFileStatus(features));

// (2) §130b claimed-@release-scn check — only when issue files are given
// (Ralph per-slice acceptance). Distinguishes a legitimately-in-planning
// @release scn (an approved feature with no claim) from a claimed-done-but-
// skipped one (the issue claims it via scenarios: yet its feature isn't
// implemented).
let claimedCount = 0;
if (issueFiles.length) {
  const claimed = claimedScns(issueFiles);
  claimedCount = claimed.size;
  if (claimed.size) {
    const idx = indexScenarios(features);
    for (const scn of claimed) {
      const info = idx.get(scn);
      if (!info) continue;            // not found / not in features — Step-3 count check owns that
      if (!info.release) continue;    // only @release scns gate CI's definition of done
      if (info.status !== 'implemented') {
        problems.push(`${scn} — @release but its feature is "# status: ${info.status}" (${info.file}); SKIPPED under CUCUMBER_IMPLEMENTED_ONLY → CI green without running it`);
      }
    }
  }
}

if (problems.length) {
  console.log('SKIPPED-SCN GATE: FAIL');
  for (const p of problems) console.log('  ✗ ' + p);
  console.log('\nFix: keep `# status:` in the feature\'s FIRST comment block, and flip it to');
  console.log('`# status: implemented` at close-out (§58). A deliverable @release scenario that');
  console.log('does not actually run can never pass the acceptance gate silently (§130b, ISSUE #141).');
  process.exit(1);
}

if (issueFiles.length && claimedCount === 0) {
  console.log('SKIPPED-SCN GATE: na (no scenarios: tokens in the issue/spec; no mid-file status)');
} else {
  console.log(`SKIPPED-SCN GATE: ok (${features.length} feature(s) scanned; no mid-file status${issueFiles.length ? `; ${claimedCount} claimed scn(s), all @release ones implemented` : ', CI mode'})`);
}
process.exit(0);
