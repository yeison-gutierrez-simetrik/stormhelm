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
// Usage:
//   node scripts/check-skipped-release-scn.mjs <features-dir> <issue-or-spec-file...>
//
// Behavior:
//   - Extracts claimed scns from every <issue-or-spec-file> `scenarios:` token
//     (both compact forms: scenarios:scn-021,scn-022 and scenarios:scn-021+022).
//   - No claimed scns  → prints `SKIPPED-SCN GATE: na`  and exits 0.
//   - For each claimed scn that is @release, finds its .feature file and reads
//     the file's `# status:` header. A @release scn in a feature whose header is
//     not `# status: implemented` would be skipped under IMPLEMENTED_ONLY.
//   - Any such scn → prints `SKIPPED-SCN GATE: FAIL` + the offenders, exits 1.
//   - All claimed @release scns live in implemented features → `ok`, exits 0.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: node scripts/check-skipped-release-scn.mjs <features-dir> <issue-or-spec-file...>');
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

const claimed = claimedScns(issueFiles);
if (claimed.size === 0) {
  console.log('SKIPPED-SCN GATE: na (no scenarios: tokens in the issue/spec)');
  process.exit(0);
}

const idx = indexScenarios(featureFiles(featuresDir));
const offenders = [];
for (const scn of claimed) {
  const info = idx.get(scn);
  if (!info) continue;            // not found / not in features — Step-3 count check owns that
  if (!info.release) continue;    // only @release scns gate CI's definition of done
  if (info.status !== 'implemented') {
    offenders.push(`${scn} — @release but its feature is "# status: ${info.status}" (${info.file}); SKIPPED under CUCUMBER_IMPLEMENTED_ONLY → CI green without running it`);
  }
}

if (offenders.length) {
  console.log('SKIPPED-SCN GATE: FAIL');
  for (const o of offenders) console.log('  ✗ ' + o);
  console.log('\nFix: flip the feature header to `# status: implemented` at close-out (§58),');
  console.log('or run it without IMPLEMENTED_ONLY to confirm red→green. A referenced @release');
  console.log('scn that CI skips is a false-green (§130b).');
  process.exit(1);
}

console.log(`SKIPPED-SCN GATE: ok (${claimed.size} claimed scn(s); all @release ones are in implemented features)`);
process.exit(0);
