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
import { expandScenarioClaims } from './scenario-claims.mjs';

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
// Read with scripts/scenario-claims.mjs — the same expander check-invariants uses
// (FU-134 review), so the two can never read a claim differently. Returns
// Map<key, id as claimed>.
function claimedScns(files) {
  const scns = new Map();
  for (const f of files) {
    if (!existsSync(f)) continue;
    for (const id of expandScenarioClaims(readFileSync(f, 'utf8'))) scns.set(scnKey(id.slice(4)), id);
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
// also imports. The explanation is printed once per kind, after the list.
const LABEL = { 'mid-file': 'MID-FILE STATUS', language: 'NON-ENGLISH FEATURE', unreadable: 'UNREADABLE' };
const label = (kind) => LABEL[kind] ?? kind.toUpperCase();

let features;
try {
  features = featureFiles(featuresDir);
} catch (e) {
  console.log('SKIPPED-SCN GATE: FAIL');
  console.log(`  ✗ UNREADABLE ${e.path ?? featuresDir} — ${e.code ?? e.message}: a feature the runner should see cannot be read (a symlink whose target is missing?). Fix or remove it; it must never drop off the CI surface silently.`);
  process.exit(1);
}
const parsed = new Map();
const problems = [];   // [{ file, line, kind, text, message }]
for (const f of features) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch (e) {
    problems.push({ file: f, line: 0, kind: 'unreadable', text: e.code ?? e.message, message: 'a feature the runner should see cannot be read (permissions?) — fix it; it must never drop off the CI surface silently.' });
    continue;
  }
  const { status, problems: found, scenarios } = parseFeatureStatus(text);
  parsed.set(f, { status, scenarios });
  for (const p of found) problems.push({ file: f, ...p });
}

// (2) §130b claimed-@release-scn check — only when issue files are given
// (Ralph per-slice acceptance). Distinguishes a legitimately-in-planning
// @release scn (an approved feature with no claim) from a claimed-done-but-
// skipped one (the issue claims it via scenarios: yet the runner skips its
// feature — any header status but `implemented`; no status = legacy, it runs).
// A claim that matches no scenario is named as unverified — it is Step 3's
// count check's to judge, but it must never read as "implemented" here.
const skippedClaims = [];
const unresolved = [];
let claimedCount = 0;
if (issueFiles.length) {
  const claimed = claimedScns(issueFiles);
  claimedCount = claimed.size;
  if (claimed.size) {
    const idx = indexScenarios(parsed);
    for (const [key, id] of claimed) {
      const info = idx.get(key);
      if (!info) { unresolved.push(id); continue; }
      if (!info.release) continue;    // only @release scns gate CI's definition of done
      if (info.status !== null && info.status !== 'implemented') {
        skippedClaims.push(`${info.id} — @release but its feature is "# status: ${info.status}" (${info.file}); SKIPPED under CUCUMBER_IMPLEMENTED_ONLY → CI green without running it`);
      }
    }
  }
}
const unverified = unresolved.length ? `; ${unresolved.length} claimed scn(s) not found in features/ (${unresolved.join(', ')}) — not verified here, Step 3's count check owns them` : '';

if (problems.length || skippedClaims.length) {
  console.log('SKIPPED-SCN GATE: FAIL');
  for (const p of problems) console.log(`  ✗ ${label(p.kind)} ${p.file}${p.line ? `:${p.line}` : ''} \`${p.text}\``);
  for (const c of skippedClaims) console.log(`  ✗ ${c}`);
  const kinds = [...new Map(problems.map((p) => [p.kind, p.message])).entries()];
  if (kinds.length) console.log('');
  for (const [kind, message] of kinds) console.log(`Why (${label(kind)}): ${message}`);
  if (unverified) console.log(`\nNote${unverified.slice(1)}.`);
  console.log('\nThe contract: exactly ONE `# status:` line, in the feature\'s FIRST comment block (§58). A');
  console.log('deliverable @release scenario that does not actually run can never pass the acceptance gate');
  console.log('silently (§130b, ISSUE #141).');
  process.exit(1);
}

if (issueFiles.length && claimedCount === 0) {
  console.log('SKIPPED-SCN GATE: na (no scenarios: tokens in the issue/spec; no mid-file status)');
} else {
  const verified = claimedCount - unresolved.length;
  console.log(`SKIPPED-SCN GATE: ok (${features.length} feature(s) scanned; no mid-file status${issueFiles.length ? `; ${verified} claimed scn(s) found, all @release ones implemented${unverified}` : ', CI mode'})`);
}
process.exit(0);
