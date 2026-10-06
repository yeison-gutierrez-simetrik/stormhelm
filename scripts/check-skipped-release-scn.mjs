#!/usr/bin/env node
// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/check-skipped-release-scn.mjs
//
// FOLLOW-UP 108 (§130b) — referenced-but-skipped = false-green. `test:acceptance`
// / `test:smoke` set CUCUMBER_IMPLEMENTED_ONLY=1, which skips whole
// `# status: approved` feature files. The documented practice writes scns
// `approved` first and flips to `implemented` only at close-out — so a @release
// scn an issue CLAIMS to deliver (its `scenarios:` token) that still lives in an
// approved feature is SKIPPED by CI, and CI goes green having never run it (a
// consumer shipped exactly that). A referenced-but-not-executed scenario is a
// gate failure, not a silent skip.
//
// This gate, run AT ACCEPTANCE: given the issue's `scenarios:` tokens and the
// features dir, it FAILS naming any claimed @release scn whose feature would be
// skipped under IMPLEMENTED_ONLY (it has a header status, and that status is not
// `implemented`; a header-less legacy feature runs, so it is not flagged) —
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
//     AFTER the header block (the leading comment block — read by the shared
//     parse-feature-status.mjs, the same reader cucumber.mjs uses) → FAIL, named.
//   - <features-dir> ALONE  → CI mode: just the lint (issue-independent backstop).
//   - A features dir that does not exist → rc 2. A feature that cannot be read
//     (not a dotfile — a symlink whose target is missing) → FAIL, named.
//   - <features-dir> <issue-file…> → ALSO the §130b claimed-scn check: extracts
//     claimed scns from each `scenarios:` token (compact forms scn-A,scn-B /
//     scn-A+B / scn-A..B, bare numbers — the check-invariants grammar) and FAILs
//     naming any claimed @release scn whose feature the runner skips under
//     IMPLEMENTED_ONLY (a header status other than `implemented`).
//   - Clean → `SKIPPED-SCN GATE: ok`; issue with no scenarios token + no mid-file
//     status → `na`. Any problem → `SKIPPED-SCN GATE: FAIL` + offenders, exit 1.

import { readFileSync, statSync, existsSync } from 'node:fs';
import { featureFiles, parseFeatureStatus } from './parse-feature-status.mjs';

// ISSUE #141: a sane exit contract so this wires plainly into a `pull_request`
// CI job. rc 0 = clean · rc 1 = a genuine false-green risk · rc 2 ONLY on a
// truly malformed call (no arguments, or a features dir that does not exist —
// a typo or a monorepo path must not become a permanently green no-op). Two modes:
//   <features-dir>               → CI mode: the issue-independent status-line
//                                  lint across every feature (FU-44: the script
//                                  owns its own scoping for a bare node/pnpm call).
//   <features-dir> <issue-file…> → Ralph per-slice: the above PLUS the §130b
//                                  claimed-@release-scn-in-a-non-implemented-feature
//                                  check (issue-aware).
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('usage: node scripts/check-skipped-release-scn.mjs <features-dir> [issue-or-spec-file...]');
  console.error('  <features-dir> alone = CI mode (status-line lint, §130b/ISSUE #141)');
  process.exit(2);
}
const [featuresDir, ...issueFiles] = args;
if (!existsSync(featuresDir) || !statSync(featuresDir).isDirectory()) {
  console.error(`features dir not found: ${featuresDir} — pass the directory that holds the .feature files (rc 2: a malformed call, never a green no-op).`);
  process.exit(2);
}

// scn ids compare by number, so `scn-1` and `scn-001` can never miss each other.
const scnKey = (digits) => `scn-${parseInt(digits, 10)}`;

// --- claimed scns from the issue/spec `scenarios:` tokens -------------------
// The grammar check-invariants and ralph_expand_scns read (they must agree): an
// optional `scn-` prefix on every element, `+`/`,` lists, and `A..B` ranges whose
// expansion keeps the start's zero padding (scn-001..scn-003 → scn-001, scn-002,
// scn-003 — the FU-134 review found scn-1.. here, which never matched @scn-001).
// Whitespace after `scenarios:` is tolerated only before an explicit `scn-`, so
// "scenarios: 2 slices" is prose, not a claim. Returns the Set of claimed keys.
function claimedScns(files) {
  const scns = new Set();
  for (const f of files) {
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/scenarios:(?:\s*(?=scn-))?((?:scn-)?\d+(?:(?:[,+]|\.\.)(?:scn-)?\d+)*)/gi)) {
      for (const seg of m[1].split(/[,+]/)) {
        const range = seg.match(/^(?:scn-)?(\d+)\.\.(?:scn-)?(\d+)$/i);
        if (range) {
          const [a, b, w] = [+range[1], +range[2], range[1].length];
          if (b >= a && b - a < 1000) {
            for (let n = a; n <= b; n++) scns.add(scnKey(String(n).padStart(w, '0')));
          }
          continue;
        }
        const one = seg.match(/^(?:scn-)?(\d+)$/i);
        if (one) scns.add(scnKey(one[1]));
      }
    }
  }
  return scns;
}

// Map scn key -> { id, file, status, release }, from the scenarios the shared
// reader scans with their EFFECTIVE tags — Feature and Rule tags inherited,
// `Scenario` / `Example` / `Scenario Outline` / `Scenario Template`, an Examples
// block adding its own tags (the FU-134 reviews: each case was missed, so a
// claimed @release scn read "implemented" while the runner skipped it). An id
// seen again in the same file ORs its @release flag (an outline's scn whose
// Examples block alone carries @release is still @release). The status is the
// runner's own reading.
function indexScenarios(parsed) {
  const idx = new Map();
  for (const [file, { status, scenarios }] of parsed) {
    for (const { tags } of scenarios) {
      const release = tags.includes('@release');
      for (const t of tags) {
        const m = t.match(/^@scn-(\d+)$/);
        if (!m) continue;
        const prev = idx.get(scnKey(m[1]));
        if (!prev) idx.set(scnKey(m[1]), { id: `scn-${m[1]}`, file, status, release });
        else if (prev.file === file) prev.release ||= release;
      }
    }
  }
  return idx;
}

// ISSUE #141 — the status-line lint. The runner reads the status ONLY from the
// header (the leading comment block), so a `# status: implemented` placed
// per-scenario / mid-file is SILENTLY IGNORED: the whole approved/draft feature
// is excluded under IMPLEMENTED_ONLY and its @release scenarios never run — yet
// the gate reports green. This is the §106 false-green produced BY the
// §58-status mechanism itself (a consumer shipped it twice). The status is a
// header-only contract; a declaration after the header is the misuse that must
// be loud, not silent. FU-134: the detection — and each problem's explanation —
// live in parse-feature-status.mjs, the one reader the cucumber.mjs template
// also imports.
const LABEL = { 'mid-file': 'MID-FILE STATUS' };

let features;
try {
  features = featureFiles(featuresDir);
} catch (e) {
  console.log('SKIPPED-SCN GATE: FAIL');
  console.log(`  ✗ UNREADABLE ${e.path ?? featuresDir} — ${e.code ?? e.message}: a feature the runner should see cannot be read (a symlink whose target is missing?). Fix or remove it; it must never drop off the CI surface silently.`);
  process.exit(1);
}
const parsed = new Map(features.map((f) => {
  const { status, problems: found, scenarios } = parseFeatureStatus(readFileSync(f, 'utf8'));
  return [f, { status, problems: found, scenarios }];
}));
const problems = [];

// (1) Status-line lint — ALWAYS (issue-independent; the silent-skip cause).
for (const [file, { problems: found }] of parsed) {
  for (const p of found) problems.push(`${LABEL[p.kind] ?? p.kind.toUpperCase()} ${file}:${p.line} \`${p.text}\` — ${p.message}`);
}

// (2) §130b claimed-@release-scn check — only when issue files are given
// (Ralph per-slice acceptance). Distinguishes a legitimately-in-planning
// @release scn (an approved feature with no claim) from a claimed-done-but-
// skipped one (the issue claims it via scenarios: yet the runner skips its
// feature — any header status but `implemented`; no status = legacy, it runs).
let claimedCount = 0;
if (issueFiles.length) {
  const claimed = claimedScns(issueFiles);
  claimedCount = claimed.size;
  if (claimed.size) {
    const idx = indexScenarios(parsed);
    for (const key of claimed) {
      const info = idx.get(key);
      if (!info) continue;            // not found / not in features — Step-3 count check owns that
      if (!info.release) continue;    // only @release scns gate CI's definition of done
      if (info.status !== null && info.status !== 'implemented') {
        problems.push(`${info.id} — @release but its feature is "# status: ${info.status}" (${info.file}); SKIPPED under CUCUMBER_IMPLEMENTED_ONLY → CI green without running it`);
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
