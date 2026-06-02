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
// Sources of edges (verified against belong-marketplace slice 01 planes
// #1-#5; see `.planning/framework-feedback/housekeeping-close.md`):
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
//     "affected_modules": ["src/domain/org", "src/application", ...],
//     "references_to_issues": [
//       { "from": 4, "to": 3, "kind": "backward", "evidence": "reuse ownership.ts (#3)" },
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

// --- helpers ---------------------------------------------------------------

const EDGE_PATTERNS = [
  // 1. "(#N)" after a symbol/file/word — backward
  {
    re: /([^\s(]+)\s*\(#(\d+)\)/g,
    kind: 'backward',
    getEvidence: (m, source) => contextSnippet(source, m.index, 80),
  },
  // 2. "from #N" — backward
  {
    re: /\bfrom\s+#(\d+)\b/g,
    kind: 'backward',
    getEvidence: (m, source) => contextSnippet(source, m.index, 80),
  },
  // 3. "Depends on: #N" / "Depends on: #N, #M" — backward (issue body)
  //    Matches the structured form PR-Group will emit; also tolerates the
  //    pre-PR-Group prose form "Depends on: 01a" (returns nothing — the
  //    01a → #N migration is a separate PR-Group concern).
  {
    re: /^\s*(?:-\s+)?(?:#(\d+))(?:\s*\(.*?\))?\s*$/gm,
    kind: 'backward',
    section: 'depends-on',
    getEvidence: (m, source) => `Depends on: #${m[1]}`,
  },
  // 4. "reused by #N/#M..." — forward
  {
    re: /\breused\s+by\s+#?(\d+)(?:[\s,/]+#?(\d+))?(?:[\s,/]+#?(\d+))?(?:[\s,/]+#?(\d+))?/g,
    kind: 'forward',
    multi: true,
    getEvidence: (m, source) => contextSnippet(source, m.index, 80),
  },
  // 5. "#N builds" — forward (the consumer is described as building on top)
  {
    re: /#(\d+)\s+builds\b/g,
    kind: 'forward',
    getEvidence: (m, source) => contextSnippet(source, m.index, 80),
  },
];

function contextSnippet(src, start, span) {
  const begin = Math.max(0, start - 0);
  const end = Math.min(src.length, start + span);
  return src.slice(begin, end).replace(/\s+/g, ' ').trim();
}

// Extract `### Layers affected` section + a `## Depends on` section if present.
// Both are passed to the edge extractor; modules come from "Layers affected".
function extractSections(md) {
  const layers = sectionByHeader(md, /^###\s+Layers\s+affected\s*$/im);
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

// Affected modules: parse list items under "Layers affected" looking for
// `src/<context>/...` paths and group by first 2 segments.
function extractModules(layersSection) {
  if (!layersSection) return [];
  const set = new Set();
  for (const line of layersSection.split('\n')) {
    // Lines that start with - or * are list items; backticks delimit file paths.
    const matches = line.matchAll(/`([a-zA-Z0-9_./-]+\.[a-zA-Z0-9_.-]+)`/g);
    for (const m of matches) {
      const path = m[1];
      // Group by first 2 directory segments under src/.
      const segs = path.split('/');
      if (segs[0] === 'src' && segs.length >= 3) {
        set.add(segs.slice(0, 3).join('/'));
      } else if (segs.length >= 2) {
        // Top-level paths like "package.json" or "drizzle.config.ts" — keep as-is.
        set.add(segs.slice(0, 2).join('/'));
      }
    }
  }
  return [...set].sort();
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
  // unrelated paths in preamble/comments don't pollute the list.
  const modules = extractModules(layers);

  // Edges: scanned over the WHOLE document — preambles, "Layers affected",
  // dependency graphs, all carry edge claims (verified against belong slice 01
  // planes #1-#5 where ~30% of edges live in the preamble or dependency-graph
  // section, not in Layers affected itself).
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

  // Pattern 3: "reused by #N(/#M/#K...)" — forward.
  for (const m of md.matchAll(/\breused\s+by\s+#?(\d+)(?:[\s,/]+#?(\d+))?(?:[\s,/]+#?(\d+))?(?:[\s,/]+#?(\d+))?/g)) {
    const snippet = contextSnippet(md, m.index, 60);
    for (const g of [m[1], m[2], m[3], m[4]]) {
      if (g) addEdge(Number(g), 'forward', snippet);
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

// --- CLI -------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/parse-layers-affected.mjs <issue.md> [issue2.md ...]');
  process.exit(2);
}

const records = args.map(parseFile);
addCrossWarnings(records);

const out = records.length === 1 ? records[0] : records;
console.log(JSON.stringify(out, null, 2));
