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
// LAYOUT ASSUMPTION: context detection assumes the §3 layer-first hexagonal layout
// (`src/<layer>/<ctx>/…`, layers = KNOWN_LAYERS below). The MODULE count — the primary
// §107 trigger — is layout-independent and always works. Only cross-context detection is
// layout-sensitive: a project that nests differently (e.g. `src/features/<ctx>`, or no
// `src/` prefix) UNDER-detects cross-context — safe by design (conservative + one-way
// escalation), but set `feature:cross-context` by hand if your layout diverges.
//
// Usage:  node scripts/detect-ceremony.mjs <issue1>.md <issue2>.md ...
// Output: JSON { modules, module_count, contexts, context_count, labels }
// Zero external deps beyond the sibling parser. Exit 0 on success; 2 on usage error.

import { pathToFileURL } from 'node:url';
import { parseFile } from './parse-layers-affected.mjs';

const KNOWN_LAYERS = new Set([
  'domain', 'application', 'infrastructure', 'entrypoints', 'modules', 'contexts',
]);

// Derive ceremony labels from parsed /plan records (each from parseFile()).
export function detectCeremony(records) {
  const modules = new Set();
  const contexts = new Set();
  // FOLLOW-UP 70: the §107 module count must be by BOUNDED CONTEXT, not by
  // hexagonal layer-dir. §3 defines a module AS a bounded context — so a
  // normal vertical slice wholly inside one context (`src/domain/audit`,
  // `src/application/audit`, `src/infrastructure/audit`) is ONE module, not
  // three. The old `module_count >= 3` arm read every such slice as
  // multi-module, forcing a bespoke INV-6 override on the MOST COMMON slice
  // shape (FU-66's blessed reason only covers schema-only). The effective set
  // collapses `src/<known-layer>/<ctx>` entries to `<ctx>`; anything else
  // (non-layer roots like `src/core`, declared `- **Module:**` entries, a
  // file directly under a layer) stays distinct — preserving every prior
  // genuine multi-module case.
  const effectiveModules = new Set();
  for (const r of records) {
    for (const m of r.affected_modules ?? []) {
      modules.add(m);
      const segs = m.split('/'); // e.g. ["src","domain","org"]
      if (segs[0] === 'src' && KNOWN_LAYERS.has(segs[1]) && segs[2]) {
        // strip a trailing file (e.g. "company.ts") — a context is a directory
        const ctx = /\.[a-z]+$/i.test(segs[2]) ? null : segs[2];
        if (ctx) {
          contexts.add(ctx);
          effectiveModules.add(ctx);            // collapse this layer to its context
          continue;
        }
      }
      effectiveModules.add(m);                   // non-collapsible module stays distinct
    }
    // FOLLOW-UP 54: slice-doc `- **Module:** <Context> → …` lines declare
    // their bounded context explicitly — an in-document cross-context source
    // that works at /to-issues time and is layout-independent.
    for (const c of r.declared_contexts ?? []) contexts.add(c);
  }
  // module_count is the §107 trigger count: distinct bounded-context-level
  // modules (FU-70). `modules` (the output list) stays the raw affected set
  // for transparency.
  const module_count = effectiveModules.size;
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
