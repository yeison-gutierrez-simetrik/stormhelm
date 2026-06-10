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

// FOLLOW-UP 70 (consumer-review round-2): a segment under a known layer is a
// bounded CONTEXT only if it is not a FUNCTIONAL bucket. Layer-first-functional
// layouts sub-organize a layer by FUNCTION (`src/application/ports`,
// `src/infrastructure/config`), not by context — reading `ports`/`config` as
// bounded contexts mis-classified single-context slices as multi-module on
// every such consumer. These names are standard hexagonal / clean-arch
// vocabulary (universal, not project-specific). A real context literally named
// like one of these would UNDER-classify — bounded by the reviewer's live
// re-detect on the diff (`requires-escalation`), the same one-way backstop the
// over-direction relies on.
const FUNCTIONAL_BUCKETS = new Set([
  'ports', 'adapters', 'use-cases', 'usecases', 'services', 'repositories', 'repos',
  'mappers', 'dto', 'dtos', 'types', 'entities', 'value-objects', 'config',
  'handlers', 'controllers', 'middleware', 'schemas', 'validators', 'errors',
  'utils', 'helpers', 'factories',
]);

// Non-application roots: a slice touching its BDD features / SQL schema / docs
// for support is not multi-module BECAUSE of those — they are not application
// modules and must not inflate the §107 count.
const NON_APP_ROOTS = new Set([
  'features', 'schema', 'docs', 'test', 'tests', 'e2e', 'migrations',
  'scripts', 'dist', 'build', 'public', 'assets',
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
  // collapses `src/<known-layer>/<ctx>` entries to the bounded context `<ctx>`;
  // a layer entry that carries NO context (a functional bucket, a file, or a
  // bare layer) contributes NO module — it is just a layer of the slice's
  // context, not a module of its own. Non-layer roots (`src/core`, declared
  // `- **Module:**` entries) stay distinct; non-application roots
  // (`features/`, `schema/`) are excluded. This makes both the textbook
  // (context-sub-organized) and layer-first-functional layouts classify a
  // single-context slice as single-module.
  const effectiveModules = new Set();
  for (const r of records) {
    for (const m of r.affected_modules ?? []) {
      modules.add(m);
      const segs = m.split('/'); // e.g. ["src","domain","org"]
      if (NON_APP_ROOTS.has(segs[0])) continue;  // features/schema/… are not app modules
      if (segs[0] === 'src' && KNOWN_LAYERS.has(segs[1])) {
        const seg = segs[2];
        // A real bounded context: a directory segment that is not a file and
        // not a functional bucket. Files, buckets, and bare layers carry no
        // context → they add no module (just a layer of the slice's context).
        const ctx = seg && !/\.[a-z]+$/i.test(seg) && !FUNCTIONAL_BUCKETS.has(seg) ? seg : null;
        if (ctx) {
          contexts.add(ctx);
          effectiveModules.add(ctx);            // collapse this layer to its context
        }
        continue;
      }
      effectiveModules.add(m);                   // non-layer module stays distinct
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
