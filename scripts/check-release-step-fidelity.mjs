#!/usr/bin/env node
// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/check-release-step-fidelity.mjs — [consumer-runtime] the mechanical,
// stack-agnostic HALF of §127 (FOLLOW-UP 103, round-2 / consumer review).
//
// §127: a @release scenario must drive the PRODUCTION input adapter, not call
// the use case directly. The reachability half ("does this use case have a
// production caller?") needs the consumer's DI vocabulary → it stays a §114
// review convention. But the OTHER half is a pure-syntax grep, no DI knowledge:
// an acceptance STEP DEFINITION that drives behavior via `container.<x>.execute(`
// bypasses the input adapter — exactly the live miss (slice-27c scn-482 called
// the container directly and shipped a money use case with no route). This lint
// fails RED in CI on that pattern instead of relying on a reviewer's grep.
//
// Scans step-definition files (features/**/steps/, application/steps/ — §61) for
// `container.<member>.execute(`. A legitimate Given-seed that must use the
// container carries an inline `// acceptance-driver-ok` opt-out (on the line or
// the line above) — auditable in git, the §36/skip-invariant pattern.
//
// Usage:  node scripts/check-release-step-fidelity.mjs
// Exit:   0 = clean / na (no step files) ; 1 = a direct container.execute in a step.
// Zero deps beyond node. Consumer-runtime; copied by /setup.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STEP_DIRS = ['features', 'application'];           // §61: both step homes
const STEP_RE = /\.steps\.(ts|js|mjs)$|[/\\]steps[/\\].*\.(ts|js|mjs)$/;
const DIRECT_CALL = /\bcontainer\.\w+\.execute\s*\(/;
const OPT_OUT = 'acceptance-driver-ok';

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git', 'dist', 'build'].includes(e.name)) walk(p, acc); }
    else if (STEP_RE.test(e.name) || STEP_RE.test(p)) acc.push(p);
  }
  return acc;
}

const stepFiles = STEP_DIRS.flatMap((d) => walk(d));
if (!stepFiles.length) {
  console.log('✅ §127 step-fidelity: na — no acceptance step-definition files found.');
  process.exit(0);
}

const findings = [];
for (const f of stepFiles) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!DIRECT_CALL.test(line)) return;
    const onLine = line.includes(OPT_OUT);
    const onPrev = i > 0 && lines[i - 1].includes(OPT_OUT);
    if (onLine || onPrev) return;   // audited opt-out (a legitimate Given-seed)
    findings.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
  });
}

if (findings.length) {
  console.error(`❌ §127 step-fidelity: ${findings.length} acceptance step(s) drive a use case via container.<x>.execute( instead of the production input adapter (FU-103). A @release scenario must traverse the real surface (HTTP/MCP/CLI); a container-direct step can pass while the production wiring does not exist:`);
  for (const x of findings) console.error(`   - ${x}`);
  console.error(`   Drive the route/handler instead, or — for a legitimate Given-seed — add an inline '// ${OPT_OUT}' opt-out (auditable).`);
  process.exit(1);
}
console.log(`✅ §127 step-fidelity: ${stepFiles.length} step file(s) drive the production surface (no unguarded container.<x>.execute).`);
process.exit(0);
