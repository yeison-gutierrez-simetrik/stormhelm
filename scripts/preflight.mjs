#!/usr/bin/env node
// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
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
//   node scripts/preflight.mjs scn-fresh                 # print current max + next free id
//   node scripts/preflight.mjs scn-fresh scn-042..scn-045  # verify ids are unclaimed (§59)
//
// Zero external dependencies. Exit 0 = precondition met, 1 = blocked.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
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
function findFeatures(slug, listFeatures) {
  // Escape the slug before interpolating into a RegExp: a '.' would
  // over-match (api.v2 ≈ apixv2) and a '(' would throw, crashing the
  // gate instead of failing with an actionable message. Built once —
  // not per file.
  const slugEscaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const featureTagRe = new RegExp(`^@feature:${slugEscaped}\\s*$`, 'm');
  // The runner's own listing (FU-135): dotfiles skipped, symlinked directories
  // followed, an unreadable feature loud — the walk the runner, the lint and
  // INV-8 share, so preflight can never see a different set of features.
  let all;
  try { all = listFeatures('features'); } catch (e) {
    fail(`a feature under features/ cannot be read: ${e.path ?? 'features'} (${e.code ?? e.message}).`,
      'fix or remove it (a symlink whose target is missing?) — the runner would fail on it too.');
  }
  return all.filter((p) => {
    if (basename(p) === `${slug}.feature`) return true;
    const text = readFileSync(p, 'utf8');
    const spec = text.match(/^#\s*spec:\s*(\S+)/im)?.[1];
    return spec === `docs/specs/${slug}.md` || featureTagRe.test(text);
  });
}
// approval status lives in a `# status: <state>` Gherkin comment (NOT YAML —
// Gherkin has no frontmatter). See §58. Read through the runner's own reader
// (FU-135): the first `# status:` ANYWHERE used to count, so a mid-file status
// passed as approved while the runner read no status at all. Imported only by
// the subcommand that reads a status, so a partial re-sync without the reader
// cannot break git-repo / gh-auth / scn-fresh. Only a MISSING reader gets the
// re-sync advice; any other import failure (a syntax error in a hand-patched
// copy, EACCES) is the real error and is rethrown as is.
const loadStatusReader = async () => {
  try {
    return await import('./parse-feature-status.mjs');
  } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    fail('scripts/parse-feature-status.mjs is missing — it reads every feature\'s `# status:` (FU-134/135).',
      're-sync the consumer-runtime scripts (the /setup copy loop) so the reader sits beside preflight.mjs.');
  }
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
    const { featureFiles, parseFeatureStatus } = await loadStatusReader();
    const files = findFeatures(arg, featureFiles);
    if (!files.length)
      fail(`no feature files for '${arg}' found (no features/**/${arg}.feature, no '# spec: docs/specs/${arg}.md' header, no '@feature:${arg}' tag).`,
        'run /to-scenarios for this feature first.');
    const read = files.map((f) => [f, parseFeatureStatus(readFileSync(f, 'utf8'))]);
    const listProblems = (r) => r.problems.map((p) => `line ${p.line}: ${p.kind}${p.detail ? ` — ${p.detail}` : ''}`).join(', ');
    // A `# status:` problem is named as what it is (FU-135) and routed by who may
    // fix it. While a file is draft/clarifying the agent may edit it, so it is
    // simply not approved yet (below, problems listed). Otherwise — approved, or
    // a status the reader cannot place — the file is read-only to the agent (§58)
    // and choosing which status line survives IS the approval decision: escalate.
    // `draft.` counts as draft here: its leading word decides who owns the fix.
    const editable = (r) => ['draft', 'clarifying'].includes((r.status ?? '').match(/^[a-z]+/)?.[0]);
    const locked = read.filter(([, r]) => r.problems.length && !editable(r));
    if (locked.length)
      fail(`feature '${arg}' has \`# status:\` line(s) the runner cannot honor in ${locked.length} file(s): ${locked.map(([f, r]) => `${f} (${listProblems(r)})`).join('; ')}.`,
        'stop and escalate to a human: the file is not agent-editable (§58). The header must hold exactly one `# status:` line starting with a §58 state word, and no `# status:` may follow it; `node scripts/check-skipped-release-scn.mjs features` explains each problem (FU-135).');
    // A multi-context feature is approved only when EVERY one of its files is.
    const offenders = read.filter(([, r]) => r.status !== 'approved');
    if (offenders.length)
      fail(`feature '${arg}' has ${offenders.length} non-approved file(s): ${offenders.map(([f, r]) => `${f} ('${r.status ?? 'unmarked'}'${r.problems.length ? `; fix while editable: ${listProblems(r)}` : ''})`).join(', ')}.`,
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
  case 'scn-fresh': {
    // §59 scn-id reservation gate (FU-121/FU-124): parallel slices racing the same range is a
    // check-then-reserve TOCTOU — three belong slices collided live (2026-07-16) even FOLLOWING
    // the "verify max before reserving" ritual. This gate makes the check executable at
    // authoring time and counts every place an id can be spoken for:
    //   1. `@scn-NNN` tags in features/**          — the §59 definition (what check-invariants reads)
    //   2. `Scenario: scn-NNN …` TITLES            — name-only ids are gate-invisible drift
    //      (FU-124's hidden-collision class) but a fresh allocation must not land on them
    //   3. `scenarios:` labels in issues/*.md      — claims, incl. compact/range forms
    // With no argument: prints the current max + the next free id (the allocation helper).
    // With ids: exit 1 if ANY is already taken, naming the owner.
    const taken = new Map(); // numeric id -> first owner (path)
    const claim = (n, owner) => { if (!taken.has(n)) taken.set(n, owner); };
    const walk = (root, fn) => {
      if (!existsSync(root)) return;
      const stack = [root];
      while (stack.length) {
        const d = stack.pop();
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) stack.push(p);
          else fn(p);
        }
      }
    };
    walk('features', (p) => {
      if (!p.endsWith('.feature')) return;
      const t = readFileSync(p, 'utf8');
      for (const m of t.matchAll(/@scn-(\d+)/g)) claim(Number(m[1]), p);
      for (const m of t.matchAll(/^\s*Scenario(?: Outline)?:\s*scn-(\d+)\b/gim)) claim(Number(m[1]), `${p} (title-only, no @scn tag — fix per §59)`);
    });
    // issues/*.md `scenarios:` labels — same compact forms check-invariants expands:
    // scn-A..scn-B / scn-A..B ranges, `+` and `,` joined singles.
    const expandSegs = (expr) => expr.split(/[+,]/).flatMap((seg) => {
      const r = seg.match(/^(?:scn-)?(\d+)\.\.(?:scn-)?(\d+)$/);
      if (r) { const [a, b] = [Number(r[1]), Number(r[2])]; return Array.from({ length: b - a + 1 }, (_, k) => a + k); }
      const n = seg.match(/^(?:scn-)?(\d+)$/);
      return n ? [Number(n[1])] : [];
    });
    walk('issues', (p) => {
      if (!p.endsWith('.md')) return;
      const t = readFileSync(p, 'utf8');
      for (const m of t.matchAll(/scenarios:([\w.,+-]+)/g)) for (const n of expandSegs(m[1])) claim(n, p);
    });
    const max = taken.size ? Math.max(...taken.keys()) : 0;
    if (!arg)
      ok(`no ids requested — ${taken.size} scn id(s) taken, current max is scn-${max}; next free contiguous range starts at scn-${max + 1}.`);
    const requested = expandSegs(arg);
    if (!requested.length)
      fail(`could not parse '${arg}' as scn id(s).`, "use scn-042, scn-042..scn-045, or scn-042+043 (the §59 compact forms).");
    const clashes = requested.filter((n) => taken.has(n));
    if (clashes.length)
      fail(`scn id(s) already taken: ${clashes.map((n) => `scn-${n} (${taken.get(n)})`).join('; ')}.`,
        `allocate ABOVE the current max: next free contiguous range starts at scn-${max + 1}. Re-run scn-fresh after re-allocating — a sibling branch may have claimed ids since (§59 reservation is racy across branches; the invariant gate in CI is the final arbiter).`);
    ok(`${requested.length} scn id(s) fresh (${requested.map((n) => `scn-${n}`).join(', ')}); current max is scn-${max}.`);
    break;
  }
  default:
    console.error('Usage: node scripts/preflight.mjs <git-repo|gh-auth|feature-approved|slice-implemented|scn-fresh> [slug|scn-ids]');
    process.exit(2);
}
