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
//     AFTER the header block (the leading comment block — read by the shared
//     parse-feature-status.mjs, the same reader cucumber.mjs uses) → FAIL, named.
//   - <features-dir> ALONE  → CI mode: just the lint (issue-independent backstop).
//   - <features-dir> <issue-file…> → ALSO the §130b claimed-scn check: extracts
//     claimed scns from each `scenarios:` token (compact forms scn-A,scn-B /
//     scn-A+B / scn-A..B) and FAILs naming any claimed @release scn whose feature
//     is not `# status: implemented` (would be skipped under IMPLEMENTED_ONLY).
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
// "scenarios: 2 slices" is prose, not a claim. Returns Map<key, id as claimed>.
function claimedScns(files) {
  const scns = new Map();
  for (const f of files) {
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/scenarios:(?:\s*(?=scn-))?((?:scn-)?\d+(?:(?:[,+]|\.\.)(?:scn-)?\d+)*)/gi)) {
      for (const seg of m[1].split(/[,+]/)) {
        const range = seg.match(/^(?:scn-)?(\d+)\.\.(?:scn-)?(\d+)$/i);
        if (range) {
          const [a, b, w] = [+range[1], +range[2], range[1].length];
          if (b >= a && b - a < 1000) {
            for (let n = a; n <= b; n++) { const d = String(n).padStart(w, '0'); scns.set(scnKey(d), `scn-${d}`); }
          }
          continue;
        }
        const one = seg.match(/^(?:scn-)?(\d+)$/i);
        if (one) scns.set(scnKey(one[1]), `scn-${one[1]}`);
      }
    }
  }
  return scns;
}

// Map scn key -> { id, file, status, release }. Mirrors how cucumber tags a
// scenario (the FU-134 review: each case below was missed, so a claimed @release
// scn read "implemented" while the runner skipped it):
//   - Feature and Rule tags are inherited by every scenario under them;
//   - `Scenario`, `Example`, `Scenario Outline` and `Scenario Template` are all
//     scenarios, and an `Examples` block adds its own tags to its outline's;
//   - blank lines and comments may sit inside a tag block; any other line
//     (a step, a description, a table row) ends it; docstring content is data.
// The status is the runner's own reading (parseFeatureStatus), not a regex of
// our own (the review: `\w+` read 'implemented' from `implemented-wip`).
const KEYWORD = /^(Feature|Business Need|Ability|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):/;
const STEP = /^(Given|When|Then|And|But|\*)\s/;
const tagsOf = (line) => line.replace(/\s+#.*$/, '').split(/\s+/).filter((t) => t.startsWith('@'));
function indexScenarios(parsed) {
  const idx = new Map();
  for (const [file, { text, status }] of parsed) {
    const add = (tags) => {
      const release = tags.includes('@release');
      for (const t of tags) {
        const m = t.match(/^@scn-(\d+)$/);
        if (m && !idx.has(scnKey(m[1]))) idx.set(scnKey(m[1]), { id: `scn-${m[1]}`, file, status, release });
      }
    };
    let pending = [], feature = [], rule = [], outline = [];
    let fence = null, underStep = false;
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (fence) { if (t.startsWith(fence)) fence = null; continue; }
      const open = t.match(/^("""|```)/);
      if (open && underStep) { fence = open[1]; continue; }
      if (!t || t.startsWith('#')) continue;
      if (t.startsWith('@')) { pending.push(...tagsOf(t)); continue; }
      const kw = t.match(KEYWORD);
      underStep = !kw && STEP.test(t);
      if (!kw) { pending = []; continue; }
      switch (kw[1]) {
        case 'Feature': case 'Business Need': case 'Ability': feature = pending; rule = []; break;
        case 'Rule': rule = pending; break;
        case 'Background': break;
        case 'Examples': case 'Scenarios': add([...outline, ...pending]); break;
        default: outline = [...feature, ...rule, ...pending]; add(outline);
      }
      pending = [];
    }
  }
  return idx;
}

// ISSUE #141 — mid-file `# status:` lint. The runner reads the status ONLY from
// the header (the leading comment block), so a `# status: implemented` placed
// per-scenario / mid-file is SILENTLY IGNORED: the whole approved/draft feature
// is excluded under IMPLEMENTED_ONLY and its @release scenarios never run — yet
// the gate reports green. This is the §106 false-green produced BY the
// §58-status mechanism itself (bit belong PRs #350/#357). The status is a
// header-only contract; a declaration after the header is the misuse that must
// be loud, not silent. FU-134: the detection lives in parse-feature-status.mjs,
// the one reader cucumber.mjs also uses (as a verbatim copy).
const MESSAGES = {
  default: (file, p) => `STATUS LINE ${file}:${p.line} \`${p.text}\` — a '# status:' the runner cannot honor (${p.kind}).`,
  'mid-file': (file, p) => `MID-FILE STATUS ${file}:${p.line} \`${p.text}\` — a '# status:' AFTER the header block (the leading comment block) is IGNORED by cucumber.mjs; the feature stays at its header status and its @release scns are silently skipped under IMPLEMENTED_ONLY → false-green (ISSUE #141). Status belongs only in the feature's FIRST comment block.`,
};

const features = featureFiles(featuresDir);
const parsed = new Map(features.map((f) => {
  const text = readFileSync(f, 'utf8');
  return [f, { text, ...parseFeatureStatus(text) }];
}));
const problems = [];

// (1) Status-line lint — ALWAYS (issue-independent; the silent-skip cause).
for (const [file, { problems: found }] of parsed) {
  for (const p of found) problems.push((MESSAGES[p.kind] ?? MESSAGES.default)(file, p));
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
    for (const key of claimed.keys()) {
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
