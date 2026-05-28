#!/usr/bin/env node
// scripts/sync-closed-sets.mjs
//
// Single source of truth for closed sets (§36). A closed set (e.g. AuditEvent)
// lives ONCE in code; docs reference it and the value list is GENERATED, so the
// two cannot drift (cf. the AuditEvent set that diverged in CONTEXT.md vs an
// ADR — different count AND format).
//
// Convention — in a Markdown doc:
//
//   <!-- closed-set-start: src/domain/audit-event.ts#AuditEvents -->
//   - `auth.magic_link.requested`
//   - `auth.session.created`
//   <!-- closed-set-end -->
//
// The block between the markers is derived from the named symbol in the named
// file; prose OUTSIDE the markers is never touched.
//
// Usage:
//   node scripts/sync-closed-sets.mjs            # rewrite blocks from code (write)
//   node scripts/sync-closed-sets.mjs --check    # verify only; exit 1 on drift (CI / hook)
//   node scripts/sync-closed-sets.mjs <file.md>  # limit to one doc
//
// Parser is intentionally simple (regex): it understands
//   TS:     export const NAME = [ "a", "b", ... ] as const
//   Python: NAME = [ "a", "b", ... ]   (and NAME: T = [...])
// Any other shape fails with a clear message — extend deliberately, don't guess.
// Zero external dependencies.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const only = args.find((a) => !a.startsWith('--'));

const BLOCK = /<!--\s*closed-set-start:\s*([^\s#]+)#([A-Za-z_]\w*)\s*-->\n([\s\S]*?)<!--\s*closed-set-end\s*-->/g;

function extractSet(file, symbol) {
  if (!existsSync(file)) throw new Error(`code file not found: ${file}`);
  const src = readFileSync(file, 'utf8');
  const m = src.match(new RegExp(`\\b${symbol}\\b\\s*(?::[^=\\n]*)?=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`symbol '${symbol}' not found as an array literal in ${file} (supported: 'export const ${symbol} = [...] as const' / '${symbol} = [...]')`);
  const values = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
  if (!values.length) throw new Error(`'${symbol}' in ${file} has no string values`);
  return values;
}

function mdFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git'].includes(e.name)) mdFiles(p, acc); }
    else if (e.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}

const files = only ? [only] : mdFiles('.');
let drift = 0, blocks = 0, errors = 0;

for (const f of files) {
  let src = readFileSync(f, 'utf8');
  if (!BLOCK.test(src)) continue;
  BLOCK.lastIndex = 0;
  let out = src;
  for (const m of src.matchAll(BLOCK)) {
    blocks++;
    const [whole, path, symbol, body] = m;
    let values;
    try { values = extractSet(join(dirname(f) === '.' ? '' : '', path) || path, symbol); }
    catch (e) { console.error(`❌ ${relative(ROOT, f)} [${path}#${symbol}]: ${e.message}`); errors++; continue; }
    const generated = values.map((v) => `- \`${v}\``).join('\n') + '\n';
    const want = `<!-- closed-set-start: ${path}#${symbol} -->\n${generated}<!-- closed-set-end -->`;
    if (whole.trim() !== want.trim()) {
      drift++;
      if (checkOnly) console.error(`❌ closed-set drift in ${relative(ROOT, f)} [${path}#${symbol}] — doc list ≠ code`);
      else { out = out.replace(whole, want); console.log(`↻ synced ${relative(ROOT, f)} [${path}#${symbol}] (${values.length} values)`); }
    }
  }
  if (!checkOnly && out !== src) writeFileSync(f, out);
}

if (errors) { console.error(`\n${errors} parse error(s).`); process.exit(1); }
if (checkOnly && drift) {
  console.error(`\n❌ ${drift} closed-set block(s) out of sync. Run: node scripts/sync-closed-sets.mjs`);
  process.exit(1);
}
console.log(`\n✅ ${blocks} closed-set block(s) checked${checkOnly ? '' : '/synced'}, ${drift} updated.`);
