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
//   CONFIG —    issue files exist      ⇒ at least one carries a `**Labels:**` line
//                                        (else the label-driven checks below are a no-op)
//   INV-1 §107  multi-module feature  ⇒ a SAD exists in docs/architecture/
//   INV-2 §87   require-human-review  ⇒ a threat model exists in docs/threat-models/
//   INV-3 §63   ralph-ready issue     ⇒ every referenced scn is DEFINED and APPROVED (§58)
//   INV-4 —     ADR marked Accepted   ⇒ has a Date line
//   INV-5 §59   @release scenario      ⇒ referenced by some issue (scn ↔ issue coverage)
//   INV-6 —     ADR-0002 PR-N: classification stable — a feature:single-module issue
//               whose /plan now detects multi-module has escalated (one-way) ⇒ fail (cites —)
//   INV-7 —     intentionally NOT an executable invariant. Finding-attribution
//               (PR-Attr) is a reviewer + process concern — no offline artifact to
//               check. See agents/reviewer.md (blame → owning branch) and core/13
//               §67 "Cumulative vs stacked PRs". Slot kept so INV-8 isn't renumbered.
//   INV-8 §58   feature 'implemented' ⇒ traceability-v*-final.md covers its scns (PR-MatrixStable)
//
// Override one invariant globally with a line  skip-invariant: INV-X — <reason>
// anywhere in the repo (the reason is logged and stays auditable in git).
// Zero npm dependencies (imports only the sibling parser/detector, which /setup
// installs alongside this script). Exit 0 = all met (or N/A), 1 = a blocking failure.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from './parse-layers-affected.mjs';
import { detectCeremony } from './detect-ceremony.mjs';

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
// Issue files: canonical location is `issues/` (per /feature + /to-issues);
// `.planning/issues/` is also accepted for projects that keep them with planning
// evidence. Both are scanned so the gate runs regardless of the project's choice.
const issueFiles = [...walk('issues', /^\d.*\.md$/), ...walk('.planning/issues', /^\d.*\.md$/)];
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
  // Accept every form the scenarios:* label takes in the wild (FOLLOW-UP 21):
  // canonical GitHub-compact `scn-021+022` (the 50-char label limit forces it),
  // spelled `scn-021+scn-022`, and comma `scn-021,scn-022`. The old /scn-\d+/g
  // silently dropped bare numeric continuations → INV-5 false orphans on every
  // multi-scenario label.
  const scns = [...t.matchAll(/scenarios:([a-z0-9+,-]+)/gi)].flatMap((m) =>
    m[1].split(/[+,]/).flatMap((seg) => {
      const n = seg.match(/^(?:scn-)?(\d+)$/);
      return n ? [`scn-${n[1]}`] : [];
    }),
  );
  return {
    f, hasLabel: (l) => new RegExp('`' + l + '`').test(lbl),
    labelsPresent: lbl.trim().length > 0,
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
  for (const m of read(f).matchAll(/skip-invariant:\s*(INV-\d+)\s*[—-]\s*(.+)/g)) overrides[m[1]] = m[2].trim();

// --- invariants -------------------------------------------------------------
const results = [];
const add = (id, rule, status, detail) => results.push({ id, rule, status, detail });

// CONFIG: if issue files exist but none carry a `**Labels:**` line, the label-
// driven invariants (INV-1/2/3/5) all read N/A — a green no-op. Fail loudly.
// (/to-issues must write a `**Labels:** \`label\` ...` line into each issue file;
// GitHub labels alone are not visible to this offline checker.)
if (issueFiles.length && !issues.some((i) => i.labelsPresent))
  add('CONFIG', '§63', 'fail',
    `${issueFiles.length} issue file(s) found but none carry a "**Labels:**" line — the label-driven invariants cannot run and would silently pass. Emit a "**Labels:** \`ralph-ready\` ..." line per issue (see /to-issues).`);

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
  const bad = [], undef = [];
  for (const i of issues.filter((x) => x.ralphReady))
    for (const scn of i.scns) {
      if (!definedScns.has(scn)) undef.push(`${scn} (${i.f.split('/').pop()})`);
      else if (!scnApproved[scn]) bad.push(`${scn} (${i.f.split('/').pop()})`);
    }
  if (!issues.some((x) => x.ralphReady)) add('INV-3', '§63', 'na', 'no ralph-ready issue');
  else if (!bad.length && !undef.length) add('INV-3', '§63', 'pass', 'all ralph-ready scns defined and approved');
  else add('INV-3', '§63', 'fail', [
    bad.length ? `scns in non-approved features (§58): ${bad.join(', ')}` : '',
    undef.length ? `scns not defined in any .feature: ${undef.join(', ')}` : '',
  ].filter(Boolean).join('; '));
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

// INV-6 (ADR-0002 PR-N): classification stable across the diff. A feature:single-module
// issue whose /plan ("Layers affected") now detects multi-module has ESCALATED — the
// declared label is lighter than reality. Fail and demand the multi-module backfill
// (SAD via INV-1, multi-actor/capacity spec sections) or an audited label flip.
// One-way: only detected-heavier-than-declared fails; over-classification (declared
// multi, detected single) is allowed and never auto-degraded. The reviewer (agents/
// reviewer.md) re-detects on the live diff incl. sensitive paths; INV-6 is the offline
// backstop for the module-classification part. Override (audited degrade):
// `skip-invariant: INV-6 — <reason>`.
{
  const declaredSingle = issues.filter((i) => i.hasLabel('feature:single-module'));
  const escalated = declaredSingle
    .map((i) => ({ i, d: detectCeremony([parseFile(i.f)]) }))
    .filter(({ d }) => d.labels.includes('feature:multi-module'))
    .map(({ i, d }) => `${i.f.split('/').pop()} (plan detects ${d.module_count} modules / ${d.context_count} contexts)`);
  if (!declaredSingle.length) add('INV-6', '—', 'na', 'no feature:single-module issue');
  else if (!escalated.length) add('INV-6', '—', 'pass', `${declaredSingle.length} single-module issue(s) match detected classification`);
  else add('INV-6', '—', 'fail', `classification escalated (declared single-module, plan detects multi-module): ${escalated.join('; ')} — add the multi-module artifacts (SAD + spec sections) or flip the label`);
}

// INV-8 (PR-MatrixStable): every feature in `# status: implemented` must be
// covered by a `traceability-v*-final.md` artifact in docs/audit/ — checked
// PER FEATURE, by requiring each of the feature's @scn-NNN scenarios to appear
// in some -final matrix. A `-draft.md` does not satisfy this; Step 13 of
// /feature must re-run /traceability-matrix post-merge to produce the -final.
// Per-feature (not "≥1 -final exists anywhere"): a stale -final from a prior
// release must NOT satisfy a newly-implemented feature whose Step 13 was skipped.
{
  const implementedFeatures = featureFiles.filter((f) => /^#\s*status:\s*implemented/im.test(read(f)));
  if (!implementedFeatures.length) {
    add('INV-8', '§58', 'na', 'no implemented features');
  } else {
    const finalText = walk('docs/audit', /^traceability-.*-final\.md$/).map(read).join('\n');
    const scnsOf = (f) => [...read(f).matchAll(/@(scn-\d+)/g)].map((m) => m[1]);
    const uncovered = implementedFeatures.filter((f) => {
      const scns = scnsOf(f);
      // a feature with no scenario tags can't be pinned to a matrix row → treat as uncovered
      return scns.length === 0 || !scns.every((s) => finalText.includes(s));
    });
    if (!finalText || uncovered.length) {
      add('INV-8', '§58', 'fail',
        `implemented feature(s) not pinned to a -final matrix: ${uncovered.map((f) => f.split('/').pop()).join(', ') || '(no -final matrix in docs/audit/)'} — Step 13 of /feature must re-run /traceability-matrix post-merge`);
    } else {
      add('INV-8', '§58', 'pass',
        `${implementedFeatures.length} implemented feature(s), all scenarios pinned to a -final matrix`);
    }
  }
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
