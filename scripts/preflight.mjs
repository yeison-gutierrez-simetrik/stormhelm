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

function findFeature(slug) {
  const root = 'features';
  if (!existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === `${slug}.feature`) return p;
    }
  }
  return null;
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
    const f = findFeature(arg);
    if (!f) fail(`no features/**/${arg}.feature found.`, 'run /to-scenarios for this feature first.');
    const s = featureStatus(f);
    if (s !== 'approved')
      fail(`feature '${arg}' is '${s ?? 'unmarked'}', not 'approved' (${f}).`,
        'complete /clarify and HUMAN CHECKPOINT 1 of /feature; the skill flips `# status:` to approved (§58).');
    ok(`feature '${arg}' is approved.`);
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
