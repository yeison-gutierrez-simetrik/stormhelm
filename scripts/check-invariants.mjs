#!/usr/bin/env node
// scripts/check-invariants.mjs
//
// Makes "MANDATORY" rules EXECUTABLE instead of prose (PR-D). Several rules use
// strong words (OBLIGATORIO / MUST / mandatory) but rely on a human reading to
// enforce them — so a multi-module feature shipped without its required §107 SAD
// and an auth feature without its §87 threat model, and nothing flagged it.
//
// This checks a project's artifacts against those invariants and fails on any
// unmet one. Run pre-release; /traceability-matrix invokes it, and the reviewer
// agent reads the result (a blocking failure ⇒ the agent does not approve).
//
// Invariants (keyed on Stormhelm conventions — issue labels, §58 `# status:`,
// artifact presence):
//   INV-1 §107  multi-module feature  ⇒ a SAD exists in docs/architecture/
//   INV-2 §87   require-human-review  ⇒ a threat model exists in docs/threat-models/
//   INV-3 §63   ralph-ready issue     ⇒ every referenced scn lives in an APPROVED .feature (§58)
//   INV-4 —     ADR marked Accepted   ⇒ has a Date line
//   INV-5 §59   @release scenario      ⇒ referenced by some issue (scn ↔ issue coverage)
//
// Override one invariant globally with a line  skip-invariant: INV-X — <reason>
// anywhere in the repo (the reason is logged and stays auditable in git).
// Zero external dependencies. Exit 0 = all met (or N/A), 1 = a blocking failure.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir, re, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git'].includes(e.name)) walk(p, re, acc); }
    else if (re.test(e.name)) acc.push(p);
  }
  return acc;
};
const read = (f) => readFileSync(f, 'utf8');

// --- gather artifacts -------------------------------------------------------
const issueFiles = walk('.planning/issues', /^\d.*\.md$/);
const featureFiles = walk('features', /\.feature$/);
const sads = walk('docs/architecture', /\.md$/).filter((f) => !/INDEX/i.test(f));
const threats = walk('docs/threat-models', /\.md$/).filter((f) => !/TEMPLATE/i.test(f));
// PR-I: docs/decisions/ now holds rationale (grilling, clarify-logs, open-questions),
// not ADRs. ADRs live only in docs/adr/. The README of docs/decisions/ documents the split.
const adrs = walk('docs/adr', /^\d.*\.md$/);

const labelLine = (t) => (t.match(/^\*\*Labels:\*\*(.*)$/m) || [, ''])[1];
const issues = issueFiles.map((f) => {
  const t = read(f);
  const lbl = labelLine(t);
  const scns = [...t.matchAll(/scenarios:([a-z0-9+-]+)/gi)].flatMap((m) => m[1].match(/scn-\d+/g) || []);
  return {
    f, hasLabel: (l) => new RegExp('`' + l + '`').test(lbl),
    ralphReady: /`ralph-ready`/.test(lbl), multiModule: /`feature:multi-module`/.test(lbl),
    sensitive: /`require-human-review`/.test(lbl), scns: [...new Set(scns)],
  };
});

// scn → approved? (from .feature # status, PR-B/§58)
const scnApproved = {};
const definedScns = new Set();
for (const f of featureFiles) {
  const t = read(f);
  const status = (t.match(/^#\s*status:\s*([a-zA-Z]+)/im) || [, null])[1]?.toLowerCase();
  for (const m of t.matchAll(/@(scn-\d+)/g)) { definedScns.add(m[1]); scnApproved[m[1]] = status === 'approved'; }
}
const releaseScns = new Set();
for (const f of featureFiles) {
  const t = read(f);
  // a scn is @release if its tag line contains @release
  for (const line of t.split('\n')) { const m = line.match(/@(scn-\d+)/); if (m && /@release/.test(line)) releaseScns.add(m[1]); }
}
const issueScns = new Set(issues.flatMap((i) => i.scns));

// global overrides
const overrides = {};
for (const f of [...issueFiles, ...featureFiles, ...adrs, ...sads, ...threats])
  for (const m of read(f).matchAll(/skip-invariant:\s*(INV-\d)\s*[—-]\s*(.+)/g)) overrides[m[1]] = m[2].trim();

// --- invariants -------------------------------------------------------------
const results = [];
const add = (id, rule, status, detail) => results.push({ id, rule, status, detail });

// INV-1: multi-module ⇒ SAD exists
if (!issues.some((i) => i.multiModule)) add('INV-1', '§107', 'na', 'no multi-module issue');
else if (sads.length) add('INV-1', '§107', 'pass', `SAD present (${sads.length})`);
else add('INV-1', '§107', 'fail', 'multi-module issue(s) but no docs/architecture/*.md — run /sad');

// INV-2: require-human-review ⇒ threat model exists
if (!issues.some((i) => i.sensitive)) add('INV-2', '§87', 'na', 'no require-human-review issue');
else if (threats.length) add('INV-2', '§87', 'pass', `threat model present (${threats.length})`);
else add('INV-2', '§87', 'fail', 'sensitive issue(s) but no docs/threat-models/*.md — run /security-hardening');

// INV-3: ralph-ready ⇒ referenced scns are in an approved .feature
{
  const bad = [];
  for (const i of issues.filter((x) => x.ralphReady))
    for (const scn of i.scns)
      if (definedScns.has(scn) && !scnApproved[scn]) bad.push(`${scn} (${i.f.split('/').pop()})`);
  if (!issues.some((x) => x.ralphReady)) add('INV-3', '§63', 'na', 'no ralph-ready issue');
  else if (!bad.length) add('INV-3', '§63', 'pass', 'all ralph-ready scns in approved features');
  else add('INV-3', '§63', 'fail', `ralph-ready scns in non-approved features (§58): ${bad.join(', ')}`);
}

// INV-4: ADR Accepted ⇒ has a Date
{
  const bad = adrs.filter((f) => { const t = read(f); return /status:?\s*\**\s*accepted/i.test(t) && !/(date|fecha):/i.test(t); });
  if (!adrs.length) add('INV-4', '—', 'na', 'no ADRs');
  else if (!bad.length) add('INV-4', '—', 'pass', `${adrs.length} ADR(s) have Date`);
  else add('INV-4', '—', 'fail', `Accepted ADR without Date: ${bad.map((f) => f.split('/').pop()).join(', ')}`);
}

// INV-5: @release scenario ⇒ referenced by an issue
{
  const orphan = [...releaseScns].filter((s) => !issueScns.has(s));
  if (!releaseScns.size) add('INV-5', '§59', 'na', 'no @release scenarios');
  else if (!orphan.length) add('INV-5', '§59', 'pass', `${releaseScns.size} @release scns mapped to issues`);
  else add('INV-5', '§59', 'fail', `@release scns with no issue: ${orphan.join(', ')}`);
}

// --- report -----------------------------------------------------------------
const icon = { pass: '✅', fail: '❌', na: '⏭️', skip: '⚠️' };
let blocking = 0;
console.log('Invariant checks:');
for (const r of results) {
  let { status } = r;
  if (status === 'fail' && overrides[r.id]) { status = 'skip'; r.detail = `OVERRIDDEN — ${overrides[r.id]} (orig: ${r.detail})`; }
  if (status === 'fail') blocking++;
  console.log(`  ${icon[status]} ${r.id} ${r.rule}: ${r.detail}`);
}
if (blocking) {
  console.error(`\n❌ ${blocking} invariant(s) failed. Fix, or override with a line "skip-invariant: INV-X — <reason>".`);
  process.exit(1);
}
console.log('\n✅ All invariants met (or N/A).');
