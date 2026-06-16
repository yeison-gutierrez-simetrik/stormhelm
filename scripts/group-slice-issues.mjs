#!/usr/bin/env node
// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/group-slice-issues.mjs
//
// PR-Group / FW-2. Decides which issues of a slice form a cohesive group that
// must ship together, by consuming the dependency graph that
// `parse-layers-affected.mjs` already extracts from /plan output. This is the
// "one parser, two consumers" cross-link: the same parser feeds PR-Group's
// grouping (here) and ADR-0002's module-count detector.
//
// Two axes (see core/13-ralph-and-afk.md "Cumulative vs stacked PRs"):
//   Axis 1 — COHESION (decided here): issues connected in the dependency graph
//     form a slice-group. A connected component of size >= 2 ships together;
//     singletons are standalone (their own PR, no group label).
//   Axis 2 — PACKAGING (decided by review-size budget, NOT here): a cohesive
//     group within the review budget => one cumulative branch
//     `agent/feature-<slug>` with `Closes #a #b ...`. Over budget => stacked
//     PRs in topological order (where PR-Attr / finding-attribution earns its
//     keep). This script reports the group + suggested cumulative branch; the
//     human/agent picks the packaging.
//
// The group ROOT is the foundation: the issue the others depend on but which
// depends on nothing within the group (out-degree 0 in the depends-on DAG).
// Per ADR-0002, the root is normally the `introduces-capability:*` issue — the
// agent verifies that label; if the topological root is ambiguous, we warn.
//
// Usage:   node scripts/group-slice-issues.mjs <issue1.md> <issue2.md> ...
// Output:  JSON { groups: [...], standalone: [...], warnings: [...] }
// Zero external deps beyond the sibling parser. Exit 0 always.

import { pathToFileURL } from 'node:url';
import { parseFile } from './parse-layers-affected.mjs';

// Group a set of parsed /plan records (from parseFile) into slice-groups.
export function groupIssues(records) {
  const warnings = [];

  // Canonical dependency edges "dependent -> dependency":
  //   backward {from:F,to:T} => F depends on T  => F->T
  //   forward  {from:F,to:T} => T depends on F  => T->F
  const deps = new Set(); // "F|T" meaning F depends on T
  const nodes = new Set();
  for (const r of records) {
    if (r.issue_number == null) {
      warnings.push(`could not resolve an issue number from ${r.file} — excluded`);
      continue;
    }
    nodes.add(r.issue_number);
    for (const e of r.references_to_issues ?? []) {
      nodes.add(e.to);
      const [dependent, dependency] = e.kind === 'backward' ? [e.from, e.to] : [e.to, e.from];
      if (dependent != null && dependency != null && dependent !== dependency)
        deps.add(`${dependent}|${dependency}`);
    }
  }

  // Undirected adjacency for connected components.
  const adj = new Map([...nodes].map((n) => [n, new Set()]));
  for (const d of deps) {
    const [a, b] = d.split('|').map(Number);
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  }

  const seen = new Set();
  const components = [];
  for (const n of [...nodes].sort((a, b) => a - b)) {
    if (seen.has(n)) continue;
    const comp = [];
    const stack = [n];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      comp.push(cur);
      for (const m of adj.get(cur) ?? []) if (!seen.has(m)) stack.push(m);
    }
    components.push(comp.sort((a, b) => a - b));
  }

  // Root of a component = node that depends on nothing else IN the component.
  const rootsOf = (comp) => {
    const set = new Set(comp);
    return comp.filter((n) => ![...deps].some((d) => {
      const [f, t] = d.split('|').map(Number);
      return f === n && set.has(t);
    }));
  };

  const groups = [];
  const standalone = [];
  for (const comp of components) {
    if (comp.length < 2) {
      standalone.push(comp[0]);
      continue;
    }
    const roots = rootsOf(comp);
    if (roots.length !== 1)
      warnings.push(`group {${comp.join(',')}} has ${roots.length} topological roots (${roots.join(',') || 'none'}) — the foundation issue is ambiguous; expected exactly one (normally the introduces-capability:* issue)`);
    groups.push({
      members: comp,
      root: roots.length === 1 ? roots[0] : null,
      candidate_roots: roots,
      // One cumulative branch per slice-group (PR-Group branch convention).
      // <slug> is filled by the caller; the issue numbers drive Closes.
      suggested_branch: 'agent/feature-<slug>',
      closes: comp,
      note: 'cohesive group (Axis 1); choose cumulative vs stacked by review-size budget (Axis 2)',
    });
  }

  return { groups, standalone, warnings };
}

// --- CLI (only when run directly, not on import) ----------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node scripts/group-slice-issues.mjs <issue1.md> [issue2.md ...]');
    process.exit(2);
  }
  console.log(JSON.stringify(groupIssues(files.map(parseFile)), null, 2));
}
