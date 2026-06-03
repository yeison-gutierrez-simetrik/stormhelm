#!/usr/bin/env node
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

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

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
  hooks: ls('hooks', /\.js$/).length,
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
  { re: new RegExp(`(?:las|the)\\s+${W}\\s+(?:reglas|rules)\\b`, 'gi'), exp: () => A.totalRules, label: 'rules(total)' },
  { re: new RegExp(`(?:currently\\s+)?${W}\\s+rules?\\b`, 'gi'), exp: () => A.coreRules, label: 'rules(core)', only: (l) => /core/i.test(l) },
  { re: /Active rule count:\s*§1\s*[–-]\s*§(\d+)/g, exp: () => A.totalRules, label: 'rules(total)' },
  { re: new RegExp(`${W}\\s+(?:Claude Code\\s+)?hooks?\\s+(?:are\\s+shipped|that\\b)`, 'gi'), exp: () => A.hooks, label: 'hooks' },
  { re: new RegExp(`all\\s+${W}\\s+files\\b`, 'gi'), exp: () => A.coreFiles, label: 'core-files' },
  { re: new RegExp(`${W}\\s+archivos de reglas`, 'gi'), exp: () => A.coreFiles, label: 'core-files' },
  { re: new RegExp(`${W}\\s+steps?\\s+with\\s+\\d+\\s+human`, 'gi'), exp: () => A.featureSteps, label: 'feature-steps' },
  { re: new RegExp(`${W}\\s+steps,\\s+\\d+\\s+human\\s+checkpoint`, 'gi'), exp: () => A.featureSteps, label: 'feature-steps' },
  { re: new RegExp(`all\\s+${W}\\s+steps`, 'gi'), exp: () => A.featureSteps, label: 'feature-steps' },
];
// Version footer: "(122 rules|reglas, 30 skills, 1 agent|agente, 4 hooks, 13 steps …)" — verify all five at once.
// Bilingual (ES/EN): WORKFLOWS-GUIDE may be either language; do not let a translation silently disable this check.
const FOOTER = /\((\d+)\s+(?:reglas|rules),\s*(\d+)\s+skills,\s*(\d+)\s+(?:agente\w*|agents?),\s*(\d+)\s+hooks,\s*(\d+)\s+steps/gi;
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

const dump = (a) => a.forEach((x) => console.log('  ' + x));
if (warn.length) { console.log(`\n⚠️  ${warn.length} warning(s):`); dump(warn); }
if (block.length) {
  console.log(`\n❌ ${block.length} blocking mismatch(es):`);
  dump(block);
  console.log('\nFix the prose to match the filesystem, or add  <!-- metadata-ok -->  to an intentionally hypothetical line.');
  process.exit(1);
}
console.log('\n✅ Framework metadata is consistent with the filesystem.');
