#!/usr/bin/env node
// scope: framework-self   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/check-framework-metadata.mjs
//
// Framework self-consistency linter (Stormhelm — framework metadata).
//
// PROBLEM: cardinality facts (skill/hook/agent/rule/file/step counts) are
// hand-written in prose across many docs and drift from the filesystem. PRs #7
// and #8 were pure count-sync; PR #3 re-introduced "28 skills" the same day the
// repo went to 30. This script derives the truth from the filesystem and FAILS
// if the canonical metadata phrases disagree.
//
// DESIGN — precision over recall. It does NOT scan for every "<N> <noun>"
// (that matches rule numbers like "§107 Agent Teams" and hypotheticals like
// "only 5 skills"). It matches a small set of *canonical metadata phrasings* —
// exactly the spots that drift — so the CI gate stays low-noise and trusted.
//
// Checks:
//   [BLOCK] cardinality — canonical phrases ("N skills", version footer, "Active rule count", …)
//   [BLOCK] rule refs   — every §N cited resolves to a rule defined in core/ or capabilities/ (-py twins ok)
//   [WARN]  phantom skills — "/slug" in markdown links / cheat-sheet rows must have skills/<slug>/SKILL.md
//
// Suppress a single intentional line with a trailing  <!-- metadata-ok -->  comment.
// Zero external dependencies (matches hooks/ convention). Exit 0 = clean, 1 = blocking mismatch.

import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SUPPRESS = 'metadata-ok';
const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (s) => (/^\d+$/.test(s) ? +s : WORD[String(s).toLowerCase()]);
const ls = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)) : []);
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git'].includes(e.name)) walk(p, acc); }
    else if (e.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}

// --- actuals from the filesystem -------------------------------------------
// `skills/` holds consumer-facing (invokable) skills — adoption copies this tree
// wholesale, so the "N invokable skills" cardinality counts ONLY these.
// `skills-internal/` holds framework-self skills (e.g. verify-framework-consistency)
// that maintain Stormhelm itself and are NOT shipped to consumers. They are excluded
// from the count, but included in the resolution set so /skill links to them in
// framework docs still resolve (and their §refs are still validated below).
const skills = ls('skills', /.+/).filter((d) => existsSync(join('skills', d, 'SKILL.md')));
const internalSkills = ls('skills-internal', /.+/).filter((d) => existsSync(join('skills-internal', d, 'SKILL.md')));
const skillSet = new Set([...skills, ...internalSkills]);
const ruleHeader = /^#{2,4}\s+§(\d+)(-py)?\b/gm;
const defined = new Set();
for (const f of [...walk('docs/engineering/core'), ...walk('docs/engineering/capabilities')])
  for (const m of readFileSync(f, 'utf8').matchAll(ruleHeader)) defined.add(m[1] + (m[2] || ''));
const coreDefined = new Set();
for (const f of walk('docs/engineering/core'))
  for (const m of readFileSync(f, 'utf8').matchAll(ruleHeader)) if (!m[2]) coreDefined.add(m[1]);

const A = {
  skills: skills.length,
  // .cjs since FOLLOW-UP 45: a `"type": "module"` consumer makes Node load
  // every .js as ESM → CJS hooks died on require() at every invocation,
  // silently (hook failures are non-blocking). .cjs forces CJS everywhere.
  hooks: ls('hooks', /\.cjs$/).length,
  agents: ls('agents', /\.md$/).length,
  coreFiles: ls('docs/engineering/core', /\.md$/).length,
  coreRules: coreDefined.size,
  totalRules: Math.max(...[...defined].filter((r) => !r.endsWith('-py')).map(Number)),
  featureSteps: (readFileSync('skills/feature/SKILL.md', 'utf8').match(/^#{2,4}\s+Step\s+\d+\b/gm) || []).length,
};
console.log('Derived actuals:', JSON.stringify(A), `(+${internalSkills.length} framework-self skill(s) in skills-internal/, not shipped)`);

// --- canonical claim patterns (precise; capture group 1 = the number) ------
const W = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)';
const claims = [
  { re: new RegExp(`${W}\\s+invokable\\s+skills`, 'gi'), exp: () => A.skills, label: 'skills' },
  { re: new RegExp(`${W}\\s+numbered\\s+rules`, 'gi'), exp: () => A.totalRules, label: 'rules(total)' },
  { re: new RegExp(`the\\s+${W}\\s+rules\\b`, 'gi'), exp: () => A.totalRules, label: 'rules(total)' },
  { re: new RegExp(`(?:currently\\s+)?${W}\\s+rules?\\b`, 'gi'), exp: () => A.coreRules, label: 'rules(core)', only: (l) => /core/i.test(l) },
  // FOLLOW-UP 94: a `§1–§N` range upper-bound asserts the WHOLE rule set, so N
  // must equal the current max §N — these strings rotted silently on every new
  // rule (the linter checked only that each §N *exists*). The negative lookahead
  // `(?!\s*,\s*§)` skips a SUB-range that opens an enumeration (`§1–§4, §11–…`);
  // a genuine non-max standalone range (a capability slice, the Belong §1–§55
  // foundation, a frozen ADR figure) carries a trailing `<!-- metadata-ok -->`.
  // Subsumes the old `Active rule count: §1 – §N` claim.
  { re: /§1\s*[–-]\s*§(\d+)(?!\s*,\s*§)/g, exp: () => A.totalRules, label: 'rules(range)' },
  { re: new RegExp(`${W}\\s+(?:Claude Code\\s+)?hooks?\\s+(?:are\\s+shipped|that\\b)`, 'gi'), exp: () => A.hooks, label: 'hooks' },
  { re: new RegExp(`all\\s+${W}\\s+files\\b`, 'gi'), exp: () => A.coreFiles, label: 'core-files' },
  { re: new RegExp(`${W}\\s+steps?\\s+with\\s+\\d+\\s+human`, 'gi'), exp: () => A.featureSteps, label: 'feature-steps' },
  { re: new RegExp(`${W}\\s+steps,\\s+\\d+\\s+human\\s+checkpoint`, 'gi'), exp: () => A.featureSteps, label: 'feature-steps' },
  { re: new RegExp(`all\\s+${W}\\s+steps`, 'gi'), exp: () => A.featureSteps, label: 'feature-steps' },
];
// Version footer: "(122 rules, 30 skills, 1 agent, 4 hooks, 13 steps …)" — verify all five at once.
// English only, like every framework doc (the english-only gate below enforces it).
const FOOTER = /\((\d+)\s+rules,\s*(\d+)\s+skills,\s*(\d+)\s+agents?,\s*(\d+)\s+hooks,\s*(\d+)\s+steps/gi;
const footerExp = [A.totalRules, A.skills, A.agents, A.hooks, A.featureSteps];
const footerLbl = ['rules', 'skills', 'agents', 'hooks', 'steps'];

const docs = [
  ...(existsSync('README.md') ? ['README.md'] : []),
  ...walk('docs'), ...walk('skills'), ...walk('skills-internal'), ...walk('agents'),
  ...(existsSync('hooks/README.md') ? ['hooks/README.md'] : []),
].filter((f) => !/Analisis-Comparativo/.test(f));

const block = [];
const warn = [];

for (const f of docs) {
  const rel = relative(ROOT, f);
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes(SUPPRESS)) return;
    const at = `${rel}:${i + 1}`;
    const snip = `"${line.trim().slice(0, 88)}"`;

    for (const m of line.matchAll(FOOTER))
      footerExp.forEach((exp, k) => { if (+m[k + 1] !== exp) block.push(`${at}  [${footerLbl[k]}] footer says ${m[k + 1]}, actual ${exp}`); });

    for (const c of claims) {
      if (c.only && !c.only(line)) continue;
      for (const m of line.matchAll(c.re)) {
        const got = num(m[1]); if (got == null) continue;
        const exp = c.exp(); if (got !== exp) block.push(`${at}  [${c.label}] says ${got}, actual ${exp}  ·  ${snip}`);
      }
    }

    for (const m of line.matchAll(/§(\d+)(-py)?\b/g)) {
      const key = m[1] + (m[2] || '');
      if (defined.has(key)) continue;
      if (m[2]) warn.push(`${at}  [rule-ref] §${key} cited, no such -py rule`);
      else if (+m[1] <= A.totalRules) block.push(`${at}  [rule-ref] §${m[1]} cited but not defined in core/ or capabilities/`);
      else warn.push(`${at}  [rule-ref] §${m[1]} exceeds max defined §${A.totalRules}`);
    }

    // phantom skills (WARN): markdown link  ](/slug)  or cheat-sheet row  ^ /slug␣␣text
    const refs = [...line.matchAll(/\]\(\/?([a-z][a-z0-9-]+)\)/g), ...line.matchAll(/^\s*\/([a-z][a-z0-9-]+)\s{2,}\S/g)];
    for (const m of refs) {
      const slug = m[1];
      if (slug.includes('/') || skillSet.has(slug)) continue;
      if (/SKILL\.md/.test(line)) continue;
      warn.push(`${at}  [phantom-skill?] "/${slug}" — no skills/${slug}/SKILL.md  ·  ${snip}`);
    }
  });
}

// --- flow consistency: /feature steps ↔ skills' "Step N of /feature" claims ---
{
  const feat = readFileSync('skills/feature/SKILL.md', 'utf8');
  const steps = new Set([...feat.matchAll(/^#{2,4}\s+Step\s+(\d+)\b/gm)].map((m) => +m[1]));
  for (const m of feat.matchAll(/^#{2,4}\s+Step\s+\d+\s+—\s+`?\/([a-z][a-z0-9-]+)`?/gm))
    if (!skillSet.has(m[1])) block.push(`skills/feature/SKILL.md  [flow] Step names /${m[1]} but no skills/${m[1]}/SKILL.md`);
  for (const s of skills) {
    for (const m of readFileSync(`skills/${s}/SKILL.md`, 'utf8').matchAll(/Step\s+(\d+)(\.\d+)?\s+of\s+`?\/feature`?/gi)) {
      if (m[2]) block.push(`skills/${s}/SKILL.md  [flow] fractional "Step ${m[1]}${m[2]} of /feature" — use an off-ramp, not a numbered step`);
      else if (!steps.has(+m[1])) block.push(`skills/${s}/SKILL.md  [flow] claims "Step ${m[1]} of /feature" but /feature has no Step ${m[1]}`);
    }
  }
}

// --- per-file consistency: each "**Rules in this file**" header lists exactly the §N defined in that file ---
for (const f of [...walk('docs/engineering/core'), ...walk('docs/engineering/capabilities')]) {
  const t = readFileSync(f, 'utf8');
  const decl = t.match(/\*\*Rules in this file\.?\*\*\s*(.+)/i);
  if (!decl) continue;
  const declared = new Set(decl[1].match(/§\d+(?:-py)?/g) || []);
  const defd = new Set([...t.matchAll(/^#{2,4}\s+(§\d+(?:-py)?)\b/gm)].map((m) => m[1]));
  const rel = relative(ROOT, f);
  for (const r of defd) if (!declared.has(r)) block.push(`${rel}  [rule-header] defines ${r} but "Rules in this file" omits it`);
  for (const r of declared) if (!defd.has(r)) block.push(`${rel}  [rule-header] header lists ${r} but no such rule is defined here`);
}

// --- hook-extension consistency (FOLLOW-UP 45): every shipped reference to a
// hook must use the extension the file actually has. A `.js` mention is how
// the type:module breakage regresses: /setup copies a glob, settings wire a
// path, and a stale `.js` resurrects a hook that silently never runs.
{
  const hookStems = ls('hooks', /\.cjs$/).map((h) => h.replace(/\.cjs$/, ''));
  if (hookStems.length) {
    const staleRe = new RegExp(`(?:${hookStems.join('|')})\\.js\\b|hooks/\\*\\.js\\b`, 'g');
    const SCAN_EXT = /\.(md|mjs|yml|yaml|json|sh|tmpl|cjs)$/;
    const walkAny = (dir, acc = []) => {
      if (!existsSync(dir)) return acc;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.git'].includes(e.name)) walkAny(p, acc); }
        else if (SCAN_EXT.test(e.name)) acc.push(p);
      }
      return acc;
    };
    const files = ['README.md', ...['docs', 'skills', 'agents', 'hooks', 'templates', 'scripts'].flatMap((d) => walkAny(d))];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(staleRe)) {
        block.push(`${relative(ROOT, f)}  [hook-ext] stale '.js' hook reference '${m[0]}' — shipped hooks are .cjs (FOLLOW-UP 45: .js dies under type:module consumers)`);
      }
    }
  }
}

// --- Tracked text files (shared by the two gates below) ----------------------
// One listing, so the English-only and project-agnostic gates see the same files:
// `git ls-files -z` (without -z git quotes a non-ASCII path, which then never
// resolves), regular files only (a tracked symlink is scanned where its target
// lives), text only (a NUL byte means binary). Outside a git checkout: none.
const trackedText = (() => {
  let tracked = [];
  try { tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean); } catch { /* not a git checkout */ }
  return tracked.flatMap((path) => {
    if (!existsSync(path) || !lstatSync(path).isFile()) return [];
    const buf = readFileSync(path);
    return buf.includes(0) ? [] : [{ path, lines: buf.toString('utf8').split('\n') }];
  });
})();

// --- English only (the maintainer's rule) --------------------------------------
// Everything the framework ships or keeps is English — its own text AND what it
// asks of consumers (English Gherkin, the ADR `Date:` field). A manual sweep missed
// Spanish twice, so the rule is executable: Spanish markers in any tracked text
// file fail here, named file:line — an accented letter or inverted punctuation,
// or TWO different common Spanish words on one line (lower-case, whole words: one
// alone collides with English — "make hay", "para. 3"). A line carrying `lang-ok`
// (say why) is exempt; proper names are allowed. Not shipped to consumers: this
// checks the framework repo itself.
{
  const SPANISH_CHARS = /[áéíóúñ¿¡]/; // lang-ok: the detector's own character list
  const SPANISH_WORDS = /\b(?:que|para|los|las|unas?|unos|por|pero|cuando|como|estos?|estas?|hay|nuevos?|nuevas?|internos?|archivos?|reglas|agentes?|tiene|además|también)\b/g; // lang-ok: the detector's own word list
  const NAMES = /Gutiérrez/g; // lang-ok: proper names
  for (const { path: f, lines } of trackedText) {
    lines.forEach((line, i) => {
      if (line.includes('lang-ok')) return;
      const text = line.replace(NAMES, '');
      const words = [...new Set(text.match(SPANISH_WORDS) ?? [])];
      const hit = text.match(SPANISH_CHARS)?.[0] ?? (words.length >= 2 ? words.join(' ') : null);
      if (hit) block.push(`${f}:${i + 1}  [english-only] Spanish text ("${hit}") — the framework is English only; translate it, or mark a deliberate exception with \`lang-ok\` and the reason`);
    });
  }
}

// --- FOLLOW-UP 95: scripts/ scope tags are the single source for vendoring ---
// Every scripts/*.mjs declares `// scope: consumer-runtime | framework-self`.
// The re-sync and `/setup` MUST vendor only the consumer-runtime set — a
// framework-self script (it hardcodes the framework repo-root layout) crashes
// in a consumer. This enforces (a) every script is tagged, and (b) the set
// `/setup` copies == the consumer-runtime-tagged set (FU-17: one source, no
// prose-to-grep drift between the tag, /setup, and the re-sync).
{
  const scriptFiles = ls('scripts', /\.mjs$/);
  const scopeOf = (f) => {
    const head = readFileSync(join('scripts', f), 'utf8').split('\n').slice(0, 6).join('\n');
    const m = head.match(/^\/\/\s*scope:\s*(consumer-runtime|framework-self)\b/m);
    return m ? m[1] : null;
  };
  const runtimeTagged = new Set();
  for (const f of scriptFiles) {
    const s = scopeOf(f);
    if (!s) block.push(`scripts/${f}  [script-scope] missing a '// scope: consumer-runtime|framework-self' header (FU-95) — the re-sync can't tell if it is vendorable`);
    else if (s === 'consumer-runtime') runtimeTagged.add(f);
  }
  // The set /setup copies: the `for s in … ; do  cp …` loop in skills/setup.
  if (existsSync('skills/setup/SKILL.md')) {
    const setup = readFileSync('skills/setup/SKILL.md', 'utf8');
    const loop = setup.match(/for\s+s\s+in\s+([\s\S]*?);\s*do/);
    if (loop) {
      const copied = new Set(loop[1].match(/[\w-]+\.mjs/g) || []);
      const missing = [...runtimeTagged].filter((f) => !copied.has(f));
      const extra = [...copied].filter((f) => !runtimeTagged.has(f));
      if (missing.length) block.push(`skills/setup/SKILL.md  [script-scope] /setup does NOT copy consumer-runtime script(s): ${missing.join(', ')} — add them to the copy loop (FU-95)`);
      if (extra.length) block.push(`skills/setup/SKILL.md  [script-scope] /setup copies ${extra.join(', ')} but it is not tagged 'consumer-runtime' — fix the tag or the loop (FU-95)`);
    }
  }
}

// --- Project-agnostic (the maintainer's rule) ----------------------------------
// The framework is copied into any project, so what it ships — skills/, agents/,
// hooks/, templates/, docs/engineering/, docs/WORKFLOWS-GUIDE.md, README.md and
// the consumer-runtime scripts — and its test suite must not cite a consumer:
// no consumer name, no consumer slice / scn / issue ids. Write the generic
// lesson; the evidence belongs in the PR body and the .planning/ handoff. Two
// manual scrubs each missed citations, so the common shapes fail here, named
// file:line — a backstop, not a proof (a reviewer still reads for dates and
// domain detail). The §1–§55 attribution credit is allowed; a line carrying
// `agnostic-ok` (say why) is exempt. Not shipped: framework-self files are out
// of scope, this script included.
{
  const SHAPES = [
    // The consumer's name — not the English verb ("where they belong", "these
    // checks belong to"): lower-case `belong` counts where only a name can stand —
    // after an article, a preposition or "(" ("the belong consumer", "(belong
    // 2026-07-16 …)"), or before an id, a date or a possessive ("belong #83",
    // "belong slice-41b", "belong's ADRs"); capitalized `Belong` unless it starts
    // a verb phrase.
    ['consumer name', /\bbelong-marketplace\b|\bBelong\b(?!\s+(?:to|in|into|before|after|there|here|with|on|at|under)\b)|(?<=(?:\b(?:the|a|in|into|from|for|of|by|at|on)\s+|\())belong\b|\bbelong(?='s\b|’s\b|\s+(?:#\d|\d{4}-\d\d-\d\d|PRs?\b|slices?\b|issues?\b|trunk\b|repo\b|consumer\b|campaigns?\b|features?\b|ADRs?\b))/],
    ['live-note id', /\blive\b[^\n]{0,80}?(?:\bscn-\d{3,}\b|\bslices? ?-?#?\d+[a-z]?\b|\bissue[- ]\d+\b)/i],
    ['live-note id', /(?:\bscn-\d{3,}|\bslices? ?-?\d+[a-z]?)\b[^\n]{0,40}\(live\)/i],
    ['slice id', /\bslice-\d+[a-z]?\b|\bslices? \d{2}[a-z]?\b/i],
  ];
  const ATTRIBUTION = /Belong A2A Marketplace team/;   // the §1–§55 credit (AGENTS.md, README.md)
  const SCOPE = /^(?:skills|agents|hooks|templates|docs\/engineering|scripts\/__tests__)\/|^docs\/WORKFLOWS-GUIDE\.md$|^README\.md$/;
  const isRuntimeScript = (path, lines) => /^scripts\/[^/]+\.mjs$/.test(path) && !lines.slice(0, 6).some((l) => /^\/\/\s*scope:\s*framework-self\b/.test(l));
  for (const { path: f, lines } of trackedText) {
    if (!SCOPE.test(f) && !isRuntimeScript(f, lines)) continue;
    lines.forEach((line, i) => {
      if (line.includes('agnostic-ok') || ATTRIBUTION.test(line)) return;
      for (const [kind, re] of SHAPES) {
        const m = line.match(re);
        if (!m) continue;
        block.push(`${f}:${i + 1}  [project-agnostic] cites a consumer (${kind}: "${m[0].slice(0, 60)}") — shipped files and tests stay project-agnostic: write the generic lesson (the evidence goes in the PR body / .planning/ handoff), or mark a deliberate exception with \`agnostic-ok\` and the reason`);
        break;
      }
    });
  }
}

const dump = (a) => a.forEach((x) => console.log('  ' + x));
if (warn.length) { console.log(`\n⚠️  ${warn.length} warning(s):`); dump(warn); }
if (block.length) {
  console.log(`\n❌ ${block.length} blocking mismatch(es):`);
  dump(block);
  console.log('\nFix the prose to match the filesystem, or add  <!-- metadata-ok -->  to an intentionally hypothetical line.');
  process.exit(1);
}
console.log('\n✅ Framework metadata is consistent with the filesystem.');
