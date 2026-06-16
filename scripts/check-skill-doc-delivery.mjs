#!/usr/bin/env node
// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/check-skill-doc-delivery.mjs
//
// FOLLOW-UP 88 — spec-FR ⇒ gate. A spec/issue routinely pins "Skill doc
// `<name>` extended" as an FR-deliverable, but no gate checks the slice's diff
// actually touched a skill doc. Ralph then satisfies every @release scenario +
// all unit tests and opens a GREEN PR while silently skipping the doc — the
// acceptance gate cannot see a missing Markdown file (no scenario exercises
// it), so it falls entirely to the §114 merge-gate reviewer, which can only
// BLOCK and hand it back (an extra round-trip). Maintainer decision (batch-21):
// a diff-aware gate the engine runs AT ACCEPTANCE, firing ONLY when the
// spec/issue declares a skill-doc deliverable — so it fails with a NAME before
// the reviewer and Ralph self-corrects in the next /tdd iteration.
//
// The contract this gate enforces — name it in all three places so they cannot
// drift (FU-17): the spec FR token ("Skill doc `<name>`") ⇒ THIS gate ⇒ the
// /tdd feedback that fixes it. Pure of network/gh: it reads the declaration
// from the issue/spec text it is handed and the diff from git.
//
// Usage:
//   node scripts/check-skill-doc-delivery.mjs <base-ref> <issue-or-spec-file...>
//
// Behavior:
//   - Reads every <issue-or-spec-file>; ALSO auto-includes any
//     `docs/specs/<...>.md` path those files reference (the issue points at its
//     spec), when that file exists — so passing just the issue file suffices.
//   - Detects a skill-doc DELIVERABLE declaration (the "Skill doc `<name>`"
//     FR token, or an FR line naming a `**/skills/**/*.md` path).
//   - If none declared → prints `SKILL-DOC GATE: na` and exits 0 (no-op for the
//     majority of slices — generality bar).
//   - Else diffs `git diff --name-only <base-ref>...HEAD` and PASSES iff a
//     `**/skills/**/*.md` was added/modified (the specifically-named file when a
//     name was parsed, else any skill doc).
//
// Exit: 0 = na / pass ; 1 = declared-but-undelivered (named) ; 2 = usage error.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [, , baseRef, ...declFiles] = process.argv;
if (!baseRef || !declFiles.length) {
  console.error('Usage: node scripts/check-skill-doc-delivery.mjs <base-ref> <issue-or-spec-file...>');
  process.exit(2);
}

const readSafe = (f) => {
  try { return readFileSync(f, 'utf8'); } catch { return ''; }
};

// Gather the declaration corpus: the handed files + any docs/specs/*.md they
// reference (the issue links its spec). De-duplicated.
const seen = new Set();
let corpus = '';
const addFile = (f) => {
  if (!f || seen.has(f) || !existsSync(f)) return;
  seen.add(f);
  corpus += '\n' + readSafe(f);
};
for (const f of declFiles) addFile(f);
// Pull in referenced spec files (docs/specs/<...>.md) named anywhere in the corpus.
for (const m of corpus.matchAll(/docs\/specs\/[\w./-]+\.md/g)) addFile(m[0]);

// A skill-doc path: a `.md` file under a `skills/` directory segment, at any
// depth — matches both Stormhelm's own `skills/<name>/SKILL.md` and a
// consumer's `packages/cli/skills/<name>.md`.
const SKILL_DOC_PATH = /(?:^|\/)skills\/[\w./-]*?\.md\b/i;

// Detect DELIVERABLE declarations (not incidental prose):
//   1. the "Skill doc `<name>.md`" FR token  → captures <name>.md
//   2. an FR line that names a `**/skills/**/*.md` path directly
const declaredNames = new Set();
let declared = false;
for (const line of corpus.split('\n')) {
  const tok = line.match(/skill\s+docs?\b[^\n]*?[`'"]?([\w./-]+\.md)[`'"]?/i);
  if (tok) { declared = true; declaredNames.add(tok[1].split('/').pop()); continue; }
  if (/skill\s+docs?\b/i.test(line) && SKILL_DOC_PATH.test(line)) {
    declared = true;
    const p = line.match(SKILL_DOC_PATH);
    if (p) declaredNames.add(p[0].split('/').pop());
  }
}

if (!declared) {
  console.log('SKILL-DOC GATE: na (no skill-doc deliverable declared in the spec/issue)');
  process.exit(0);
}

let changed = '';
try {
  changed = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], { encoding: 'utf8' });
} catch (e) {
  // A diff that cannot be computed (bad base) is a setup error, not a pass —
  // surface it loudly rather than silently green-lighting an undelivered doc.
  console.error(`SKILL-DOC GATE: error — could not diff ${baseRef}...HEAD: ${e.message}`);
  process.exit(1);
}
const changedFiles = changed.split('\n').filter(Boolean);
const touchedDocs = changedFiles.filter((f) => SKILL_DOC_PATH.test(f));

// When specific filenames were declared, require at least one of them; else any
// skill doc satisfies the declaration.
const names = [...declaredNames];
const satisfied = names.length
  ? touchedDocs.some((f) => names.includes(f.split('/').pop()))
  : touchedDocs.length > 0;

if (satisfied) {
  console.log(`SKILL-DOC GATE: pass (declared ${names.join(', ') || 'a skill doc'}; diff touches ${touchedDocs.join(', ')})`);
  process.exit(0);
}

const want = names.length ? `skill doc(s) ${names.join(', ')}` : 'a skill doc';
console.error(
  `SKILL-DOC GATE: FAIL — the spec/issue declares ${want} as a deliverable, but this slice's diff ` +
  `(${baseRef}...HEAD) adds/modifies no **/skills/**/*.md. Write the declared skill doc, then re-gate.`,
);
process.exit(1);
