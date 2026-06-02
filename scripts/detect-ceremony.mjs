#!/usr/bin/env node
// scripts/detect-ceremony.mjs
//
// ADR-0002 / PR-M. Derives a feature's CEREMONY classification labels from the
// dependency/module data that `parse-layers-affected.mjs` already extracts from
// /plan output — the third consumer of that one parser (alongside PR-Group's
// grouping and PR-N's escalation detector). Per OQ1, module counting comes from
// `/plan`'s "Layers affected" (`affected_modules`), not a hand-eyeballed guess.
//
// Emits the labels `/to-issues` and `/domain-model` apply (ADR-0002 safeguard 1):
//   feature:single-module | feature:multi-module   (§107 trigger)
//   feature:cross-context                            (vocabulary spans >=2 contexts)
//
// Rule (conservative — false positives over false negatives, per ADR-0002):
//   multi-module  ⇔  >= 3 distinct modules  OR  >= 2 bounded contexts
//   cross-context ⇔  >= 2 bounded contexts
//
// "Module" = an `affected_modules` entry (parse-layers groups by src/<layer>/<ctx>).
// "Bounded context" = the context segment under a known layer dir (domain/, modules/,
// contexts/, application/, infrastructure/, entrypoints/). The heuristic is
// deliberately simple; over-classification is safe (it only adds ceremony, which a
// human can downgrade via an audited label flip — never auto-degraded, ADR safeguard 3).
//
// Usage:  node scripts/detect-ceremony.mjs <issue1>.md <issue2>.md ...
// Output: JSON { modules, module_count, contexts, context_count, labels }
// Zero external deps beyond the sibling parser. Exit 0 always.

import { pathToFileURL } from 'node:url';
import { parseFile } from './parse-layers-affected.mjs';

const KNOWN_LAYERS = new Set([
  'domain', 'application', 'infrastructure', 'entrypoints', 'modules', 'contexts',
]);

// Derive ceremony labels from parsed /plan records (each from parseFile()).
export function detectCeremony(records) {
  const modules = new Set();
  const contexts = new Set();
  for (const r of records) {
    for (const m of r.affected_modules ?? []) {
      modules.add(m);
      const segs = m.split('/'); // e.g. ["src","domain","org"]
      if (segs[0] === 'src' && KNOWN_LAYERS.has(segs[1]) && segs[2]) {
        // strip a trailing file (e.g. "company.ts") — a context is a directory
        const ctx = /\.[a-z]+$/i.test(segs[2]) ? null : segs[2];
        if (ctx) contexts.add(ctx);
      }
    }
  }
  const module_count = modules.size;
  const context_count = contexts.size;
  const multiModule = module_count >= 3 || context_count >= 2;
  const labels = [multiModule ? 'feature:multi-module' : 'feature:single-module'];
  if (context_count >= 2) labels.push('feature:cross-context');
  return {
    modules: [...modules].sort(),
    module_count,
    contexts: [...contexts].sort(),
    context_count,
    labels,
  };
}

// --- CLI (only when run directly) -------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node scripts/detect-ceremony.mjs <issue1>.md [issue2>.md ...]');
    process.exit(2);
  }
  console.log(JSON.stringify(detectCeremony(files.map(parseFile)), null, 2));
}
