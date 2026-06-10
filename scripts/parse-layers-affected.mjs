#!/usr/bin/env node
// scripts/parse-layers-affected.mjs
//
// Shared parser for the "### Layers affected" section of a /plan artifact
// (issue body or comment from `gh issue view`). Emits a stable JSON AST so
// two downstream consumers — PR-Group's grouping algorithm and PR-M's
// module-count detector (ADR-0002 INV-6) — share the same source of truth.
//
// PROBLEM: parsing the plan twice in two different scripts is the classic
// drift trap. One parser, two consumers, one fixture.
//
// Sources of edges (each pattern is exercised by a synthetic 5-issue slice in
// scripts/__tests__/fixtures/):
//
//   Backward (B references A — "B depends on A"):
//     "Depends on: #A" / "Depends on: 01a (...)"
//     "reuse <symbol>.ts (#A)"
//     "from #A"
//     "reuse X (from #A)"
//   Forward / reverse-projected (A references B — "this is reused by B"):
//     "reused by #B/#C"
//     "#B builds"
//
// The forward direction is NOT decorative. On real data, edge #2→#5 appears
// ONLY in #2's plan ("reused by #5") and NOT in #5's plan. A backward-only
// parser misses it and produces a wrong DAG. Both directions are required.
//
// Cross-check (warning, not error): if an edge appears in only one direction,
// surface it — it usually means the other plan was updated and didn't carry
// the reference forward (plan drift, §22-adjacent).
//
// Usage:
//   node scripts/parse-layers-affected.mjs <issue.md>           # one file
//   node scripts/parse-layers-affected.mjs <issue1.md> <issue2.md> ...  # multi
//
// Output:
//   JSON to stdout, one object per input file:
//   {
//     "issue_number": 4,
//     "affected_modules": ["src/modules/c", "src/core", ...],
//     "references_to_issues": [
//       { "from": 4, "to": 3, "kind": "backward", "evidence": "reuse invariant.ts (#3)" },
//       ...
//     ],
//     "warnings": ["..."]
//   }
//
// When multiple files are passed, output is an array. The CLI also runs the
// optional cross-check across files and adds warnings to each issue's record.
//
// Zero external dependencies. Exit 0 always (parse errors become warnings).

import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

// --- helpers ---------------------------------------------------------------
//
// The five edge patterns are implemented inline in parseFile() below (search
// for "Pattern 1".."Pattern 5"). An earlier draft kept a parallel EDGE_PATTERNS
// table here that was never wired in — removed, since two copies of the patterns
// is exactly the drift trap this shared parser exists to avoid.

function contextSnippet(src, start, span) {
  const begin = Math.max(0, start - 0);
  const end = Math.min(src.length, start + span);
  return src.slice(begin, end).replace(/\s+/g, ' ').trim();
}

// Extract `### Layers affected` section + a `## Depends on` section if present.
// Both are passed to the edge extractor; modules come from "Layers affected".
function extractSections(md) {
  // Two structured input shapes (FOLLOW-UP 54): the /plan artifact's
  // "### Layers affected" AND the slice-doc's "### Layers" — at /to-issues
  // time the plans don't exist yet (they're a later /feature step), so the
  // detector must read the artifact that DOES exist or it never fires
  // (live: module_count 0 on every real slice, 3-for-3 manual flips).
  const layers = sectionByHeader(md, /^###\s+Layers\s+affected\s*$/im)
    || sectionByHeader(md, /^###\s+Layers\s*$/im);
  const dependsOn = sectionByHeader(md, /^##\s+Depends\s+on\s*$/im);
  return { layers, dependsOn };
}

function sectionByHeader(md, headerRe) {
  const m = headerRe.exec(md);
  if (!m) return '';
  const startIdx = m.index + m[0].length;
  // Next header of same-or-higher level ends the section.
  const tail = md.slice(startIdx);
  const next = /^#{1,4}\s+/m.exec(tail);
  return next ? tail.slice(0, next.index) : tail;
}

// Issue number from filename — accepts "01.md", "01-some-slug.md", "#01.md", "issue-01.md".
function issueNumberFromPath(p) {
  const base = basename(p).replace(/\.md$/i, '');
  const m = base.match(/^(?:issue-?)?#?0*(\d+)/);
  return m ? Number(m[1]) : null;
}

// Affected modules: parse list items under "Layers affected" looking for file
// paths and group each by the DIRECTORY that contains it, at src/<layer>/<ctx>
// granularity (`src/<a>/<b>` under src/, else the first 2 segments).
function extractModules(layersSection) {
  if (!layersSection) return [];
  const set = new Set();
  for (const line of layersSection.split('\n')) {
    // Lines that start with - or * are list items; backticks delimit file paths.
    const matches = line.matchAll(/`([a-zA-Z0-9_./-]+\.[a-zA-Z0-9_.-]+)`/g);
    for (const m of matches) {
      // The regex matches a FILE path (its last segment carries an extension). A
      // "module" is the DIRECTORY containing it — strip the filename FIRST so depth
      // doesn't change whether we count per-file or per-directory. A 3-segment
      // `src/domain/user.ts` must group to `src/domain`, NOT stay per-file as
      // `src/domain/user.ts` — otherwise 3 flat files in one layer falsely read as
      // 3 modules (INV-6 false-escalation; see PR #42).
      const dir = m[1].split('/').slice(0, -1);
      if (!dir.length) continue; // top-level file (e.g. package.json) — no module
      set.add((dir[0] === 'src' ? dir.slice(0, 3) : dir.slice(0, 2)).join('/'));
    }
  }
  return [...set].sort();
}

// Split on top-level commas only — commas inside parentheses are part of a
// single module's parenthetical clarification, not separators (FOLLOW-UP 79).
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// Slice-doc module declarations (FOLLOW-UP 54): `- **Module:** <Context> →
// <A>, <B>, <C>` — a de-facto structured contract in the slice template.
// RHS entries are the modules; the LHS (before the arrow) names the bounded
// context, giving cross-context detection an in-document source that does
// not depend on the §3 filesystem layout.
function extractDeclaredModules(layersSection) {
  const modules = new Set();
  const contexts = new Set();
  if (!layersSection) return { modules: [], contexts: [] };
  for (const line of layersSection.split('\n')) {
    const m = line.match(/^\s*[-*]\s+\*\*Modules?:?\*\*\s*(.+)$/i);
    if (!m) continue;
    const txt = m[1].trim();
    const parts = txt.split(/→|->/);
    const lhs = parts.length > 1 ? parts[0].trim() : null;
    const rhs = splitTopLevel(parts.length > 1 ? parts.slice(1).join(' ') : txt)
      // FOLLOW-UP 79: strip a parenthetical clarification from each module name
      // (`Onboarding (readiness orchestration)` → `Onboarding`). The natural
      // way to annotate a module's responsibilities must not inflate the count.
      .map((x) => x.replace(/\s*\([^)]*\)\s*/g, ' ').trim())
      .filter(Boolean);
    if (lhs) contexts.add(lhs.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
    for (const r of rhs) modules.add(lhs ? `${lhs} → ${r}` : r);
  }
  return { modules: [...modules].sort(), contexts: [...contexts].sort() };
}

// --- per-file extraction ---------------------------------------------------

function parseFile(filePath) {
  if (!existsSync(filePath)) {
    return { issue_number: null, file: filePath, error: 'file not found', warnings: [] };
  }
  const md = readFileSync(filePath, 'utf8');
  const issueNumber = issueNumberFromPath(filePath);
  const { layers, dependsOn } = extractSections(md);

  // Affected modules: only extracted from the "Layers affected" section so
  // unrelated paths in preamble/comments don't pollute the list. Both input
  // shapes contribute (FOLLOW-UP 54): backtick file paths (/plan) and
  // declared `- **Module:**` lines (slice doc).
  const declared = extractDeclaredModules(layers);
  const modules = [...new Set([...extractModules(layers), ...declared.modules])].sort();

  // Edges: scanned over the WHOLE document — preambles, "Layers affected",
  // dependency graphs all carry edge claims. Real plans put a sizable share of
  // edges in the preamble or dependency-graph section, not in Layers affected
  // itself, so the whole document is scanned.
  const edgeMap = new Map(); // key: `${to}|${kind}` → { from, to, kind, evidence: [snippets] }

  function addEdge(to, kind, evidence) {
    if (!to || !Number.isFinite(to) || (issueNumber && to === issueNumber)) return;
    const key = `${to}|${kind}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { from: issueNumber, to, kind, evidence: [evidence] });
    } else {
      const e = edgeMap.get(key);
      if (!e.evidence.includes(evidence)) e.evidence.push(evidence);
    }
  }

  // Pattern 1: "(#N)" — backward (something references issue N parenthetically).
  for (const m of md.matchAll(/[^\s(]+\s*\(#(\d+)\)/g)) {
    addEdge(Number(m[1]), 'backward', contextSnippet(md, m.index, 60));
  }

  // Pattern 2: "from #N" — backward.
  for (const m of md.matchAll(/\bfrom\s+#(\d+)\b/g)) {
    addEdge(Number(m[1]), 'backward', contextSnippet(md, m.index, 60));
  }

  // Pattern 3: "reused by #N(/#M/#K... and #Z)" — forward.
  // Unbounded list: match the whole "reused by <list>" tail, then pull every
  // number from it. Separators include "/", ",", whitespace, and "and"
  // (e.g. "reused by #3/#4/#5", "reused by #3, #4 and #5").
  for (const m of md.matchAll(/\breused\s+by\s+((?:#?\d+)(?:\s*(?:[,/]|and)\s*#?\d+)*)/g)) {
    const snippet = contextSnippet(md, m.index, 60);
    for (const num of m[1].matchAll(/\d+/g)) {
      addEdge(Number(num[0]), 'forward', snippet);
    }
  }

  // Pattern 4: "#N builds" — forward (N builds on top of this).
  for (const m of md.matchAll(/#(\d+)\s+builds\b/g)) {
    addEdge(Number(m[1]), 'forward', contextSnippet(md, m.index, 60));
  }

  // Pattern 5: structured "Depends on" section (line-level) — backward.
  // Strict — only fires inside "## Depends on" section, ending at first blank
  // line followed by non-list content (the preamble).
  if (dependsOn) {
    const strictDepends = dependsOn.split(/\n\s*\n/)[0] || dependsOn;
    for (const m of strictDepends.matchAll(/#(\d+)/g)) {
      addEdge(Number(m[1]), 'backward', `Depends on: #${m[1]}`);
    }
  }

  return {
    issue_number: issueNumber,
    file: filePath,
    affected_modules: modules,
    declared_contexts: declared.contexts,
    references_to_issues: [...edgeMap.values()].sort(
      (a, b) => (a.to - b.to) || a.kind.localeCompare(b.kind),
    ),
    warnings: [],
  };
}

// --- cross-file consistency check -----------------------------------------

function addCrossWarnings(records) {
  // Build pairs (from, to, kind). Warn if (#A,#B,backward) exists but no
  // corresponding (#B,#A,forward) in #B's record (or vice versa).
  const byIssue = new Map();
  for (const r of records) {
    if (r.issue_number != null) byIssue.set(r.issue_number, r);
  }

  for (const r of records) {
    if (!r.references_to_issues) continue;
    for (const e of r.references_to_issues) {
      // For a backward edge from=A to=B in A's record, expect a matching forward
      // edge from=B to=A in B's record.
      const counterpart = byIssue.get(e.to);
      if (!counterpart) continue;
      const counterEdges = counterpart.references_to_issues || [];
      const expectedKind = e.kind === 'backward' ? 'forward' : 'backward';
      const found = counterEdges.some((c) => c.to === e.from && c.kind === expectedKind);
      if (!found) {
        // Only warn for backward→missing forward; forward→missing backward is
        // common and not a drift signal (forward edges in the source are
        // explicit broadcasts, not always mirrored).
        if (e.kind === 'backward') {
          r.warnings.push(
            `edge #${e.from}→#${e.to} (backward) has no matching forward reference in #${e.to}'s plan — possible plan drift`,
          );
        }
      }
    }
  }
}

// --- public API ------------------------------------------------------------
// Exported so the two downstream consumers (PR-Group's grouping algorithm and
// PR-M's module-count detector) import the same parser instead of re-parsing.
export { parseFile, addCrossWarnings, extractModules, extractDeclaredModules, issueNumberFromPath };

// --- CLI -------------------------------------------------------------------
// Only runs when executed directly (`node parse-layers-affected.mjs ...`), not
// on import — otherwise importing the module would trigger the usage error.

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/parse-layers-affected.mjs <issue.md> [issue2.md ...]');
    process.exit(2);
  }

  const records = args.map(parseFile);
  addCrossWarnings(records);

  const out = records.length === 1 ? records[0] : records;
  console.log(JSON.stringify(out, null, 2));
}
