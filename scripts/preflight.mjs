#!/usr/bin/env node
// scripts/preflight.mjs
//
// Executable pre-flight gates for Stormhelm skills (PR-B).
//
// Skills are agent instructions (Markdown), not shell scripts — so each skill's
// "## Pre-flight checks" section tells the agent to RUN the relevant check here
// and act on the exit code. A failed check prints an actionable message and
// exits 1, so the workflow stops at the start instead of failing deep inside.
//
// Usage:
//   node scripts/preflight.mjs git-repo
//   node scripts/preflight.mjs gh-auth
//   node scripts/preflight.mjs feature-approved <feature-slug>
//   node scripts/preflight.mjs slice-implemented <slug>
//
// Zero external dependencies. Exit 0 = precondition met, 1 = blocked.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [, , check, arg] = process.argv;

const fail = (msg, fix) => {
  console.error(`❌ Pre-flight failed: ${msg}`);
  if (fix) console.error(`   Fix: ${fix}`);
  process.exit(1);
};
const ok = (msg) => { console.log(`✅ ${msg}`); process.exit(0); };

// Resolve a slug to its feature file(s) by CONTENT, not just filename:
// /to-scenarios names outputs features/<context>/<topic>.feature and a
// multi-context feature produces N files — none necessarily named after
// the slug. A file belongs to the slug iff any of (FW: FOLLOW-UP 20):
//   1. it is literally named <slug>.feature           (legacy fast-path)
//   2. its header says `# spec: docs/specs/<slug>.md` (canonical, see
//      skills/to-scenarios/references/feature-file-format.md)
//   3. it carries the `@feature:<slug>` tag           (same template)
function findFeatures(slug) {
  const root = 'features';
  if (!existsSync(root)) return [];
  const matches = [];
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!e.name.endsWith('.feature')) continue;
      if (e.name === `${slug}.feature`) { matches.push(p); continue; }
      const text = readFileSync(p, 'utf8');
      const spec = text.match(/^#\s*spec:\s*(\S+)/im)?.[1];
      if (spec === `docs/specs/${slug}.md` || new RegExp(`^@feature:${slug}\\s*$`, 'm').test(text)) {
        matches.push(p);
      }
    }
  }
  return matches;
}
// approval status lives in a `# status: <state>` Gherkin comment (NOT YAML —
// Gherkin has no frontmatter). See §58.
const featureStatus = (file) => {
  const m = readFileSync(file, 'utf8').match(/^#\s*status:\s*([a-z]+)/im);
  return m ? m[1].toLowerCase() : null;
};

switch (check) {
  case 'git-repo': {
    try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' }); }
    catch { fail('not inside a git repository.', 'run `git init && gh repo create` (Stormhelm requires git + GitHub — ADR-0001).'); }
    ok('git repository present.');
    break;
  }
  case 'gh-auth': {
    try { execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' }); }
    catch { fail('GitHub CLI not authenticated.', 'run `gh auth login` (Stormhelm requires GitHub — ADR-0001).'); }
    ok('gh authenticated.');
    break;
  }
  case 'feature-approved': {
    if (!arg) fail('missing <feature-slug>.', 'node scripts/preflight.mjs feature-approved <slug>');
    const files = findFeatures(arg);
    if (!files.length)
      fail(`no feature files for '${arg}' found (no features/**/${arg}.feature, no '# spec: docs/specs/${arg}.md' header, no '@feature:${arg}' tag).`,
        'run /to-scenarios for this feature first.');
    // A multi-context feature is approved only when EVERY one of its files is.
    const offenders = files
      .map((f) => [f, featureStatus(f)])
      .filter(([, s]) => s !== 'approved');
    if (offenders.length)
      fail(`feature '${arg}' has ${offenders.length} non-approved file(s): ${offenders.map(([f, s]) => `${f} ('${s ?? 'unmarked'}')`).join(', ')}.`,
        'complete /clarify and HUMAN CHECKPOINT 1 of /feature; the skill flips `# status:` to approved (§58).');
    ok(`feature '${arg}' is approved (${files.length} file(s): ${files.join(', ')}).`);
    break;
  }
  case 'slice-implemented': {
    if (!arg) fail('missing <slug>.', 'node scripts/preflight.mjs slice-implemented <slug>');
    const hits = existsSync('src') && (function find(d) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) { if (find(p)) return true; }
        else if (e.name.includes(arg) && statSync(p).size > 0) return true;
      }
      return false;
    })('src');
    if (!hits) fail(`slice '${arg}' has no implementation under src/.`, 'run /tdd to implement the slice before this gate.');
    ok(`slice '${arg}' has implementation files.`);
    break;
  }
  default:
    console.error('Usage: node scripts/preflight.mjs <git-repo|gh-auth|feature-approved|slice-implemented> [slug]');
    process.exit(2);
}
