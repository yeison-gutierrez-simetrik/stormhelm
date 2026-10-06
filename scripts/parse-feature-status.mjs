// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/parse-feature-status.mjs
//
// The single reader of a .feature file's `# status:` (§58) — FOLLOW-UP 134.
// Imported by check-skipped-release-scn.mjs AND by the shipped cucumber.mjs
// template (`import … from './scripts/parse-feature-status.mjs'` — /setup vendors
// this file beside the config). One module, not a copy: a re-sync refreshes
// scripts/ but never the consumer-tuned cucumber.mjs, so a copy would drift from
// the lint on the first change to the reader. For the same reason each problem
// carries its own `message`: the lint and the config print it, and it is
// refreshed with the reader.
//
// Before this, the lint and the runner each parsed the header their own way
// (keyword-specific break, a 10-line read window, column-0 only, `\w+` vs `\S+`),
// and every difference was a way for a feature to be skipped while a gate said
// green. One reader removes the class instead of patching each case.
//
// The contract it reads (core/12 §58):
//   - feature files are ENGLISH Gherkin — the readers know English keywords
//     only, so a header `# language:` other than `en` is reported (a non-English
//     feature would otherwise be read without its scenarios, and the §130b
//     claimed-scn check would pass it unindexed);
//   - the HEADER is the file's leading block of comment / blank lines; it ends at
//     the first other line (a tag line or the Feature keyword line);
//   - the STATUS is the first word of the header's first non-empty `# status:`
//     line, lower-cased; prose may follow it. No header status → null (legacy:
//     the runner treats the feature as implemented);
//   - the `# status:` key is RESERVED for that one line. Any other `# status:`
//     comment after the header — or trailing a tag line — is never read, so it
//     is reported whatever it says (`# status: done` and `# Status: flaky` alike;
//     prose uses another word). Near-miss spellings (`## status:`,
//     `# status :`) are the same key.
//   - Docstring content is data. A fence opens a docstring only right under a
//     step, and steps exist only inside a Scenario / Background — in a Feature or
//     Rule description a line like "But only within 30 days:" is prose, and a
//     fence after it is plain text;
//   - FU-135: the header holds ONE status line, starting with a §58 state word.
//     Any other `# status:` line in the header is an EXTRA (`duplicate`) — a flip
//     written as a new line instead of an edit leaves the feature at the old
//     status. The read word must be a state (`invalid`: `implemented.` is read as
//     `implemented.` and skipped). A flip written into the line is a `transition`
//     (read as its first word): an arrow of any shape followed by a state word, a
//     `to`/`then` + state, or a bare second state word. Prose after the state word
//     stays legal, even when it mentions a state ("implemented — approved by ops"),
//     as long as it carries no arrow to one. An `empty` `# status:` with no other
//     status is not read at all.
//     Each problem carries a per-line `detail` and a per-kind `message` (the
//     explanation, printed once per kind by the lint and the config).
//
// It also returns `statusComments` — every `# status:` line it reads as a comment
// (header or body; docstring content excluded, a comment trailing a tag line
// excluded) — which the test suite checks against the real Gherkin parser's
// golden output (scripts/__tests__/fixtures/gherkin-oracle.json).
//
// The same line scan yields each scenario's EFFECTIVE tags (Feature and Rule tags
// inherited, an Examples block adding its own), which the §130b claimed-scn check
// in check-skipped-release-scn.mjs reads — one scanner for both.

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const STATES = ['draft', 'clarifying', 'approved', 'implemented', 'retired'];
// The problem kinds that make the HEADER status itself untrustworthy (FU-135) —
// the gates that read a status defer such a feature to the one failure that
// names it, instead of acting on a status the author did not mean.
export const HEADER_STATUS_KINDS = ['duplicate', 'invalid', 'transition', 'empty'];
const STATUS_COMMENT = /^\s*#+\s*status\s*:\s*(.*)$/i;
const S = STATES.join('|');
const TRANSITION = [
  new RegExp(`^\\S+.*(?:→|⇒|⟶|➔|➜|↦|-+>|=+>|>).*\\b(?:${S})\\b`, 'i'),   // an arrow, then (anywhere later) a state word
  new RegExp(`^\\S+\\s+(?:to|then)\\s+(?:${S})\\b`, 'i'),                // "approved to implemented"
  new RegExp(`^\\S+\\s+(?:${S})\\s*(?:$|\\(|#)`, 'i'),                   // a bare second state word, nothing after it
];
const WHY = {
  duplicate: "an extra '# status:' line in the header block is IGNORED — the runner reads one status line, so a flip written as a second line leaves the feature at the old status, skipped under IMPLEMENTED_ONLY unless the read line says 'implemented' (FU-135). Keep exactly ONE '# status:' line: flip it in place, never add a second.",
  invalid: `the word the runner reads is not a §58 state (${STATES.join(' | ')}), so it would SKIP the feature under IMPLEMENTED_ONLY — it runs only on exactly 'implemented' (FU-135). Start the line with one state word; prose may follow after a space.`,
  transition: "a flip written into the line is not a flip: the runner reads only its first word (FU-135). Replace the state word with the new state alone (§58: the owning skill edits the line in place); keep history out of the status line, or write it without an arrow.",
  empty: "an empty '# status:' is not read: the runner would treat the feature as having no status and RUN it under IMPLEMENTED_ONLY, whatever was meant (FU-135). Write one §58 state word.",
};
const TAG_TRAILING_STATUS = /^\s*@[^#]*#+\s*status\s*:\s*(.*)$/i;
const DOCSTRING_FENCE = /^\s*("""|```)/;
const KEYWORD = /^\s*(Feature|Business Need|Ability|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):/;
const STEP = /^\s*(Given|When|Then|And|But|\*)\s/;
const tagsOf = (line) => line.replace(/\s+#.*$/, '').trim().split(/\s+/).filter((t) => t.startsWith('@'));

const LANGUAGE = "feature files are English Gherkin: the framework's readers know English keywords only, so a feature in another language is read without its scenarios and the §130b claimed-scn check would pass it unindexed. Write the feature in English (`# language: en`, or no `# language:` line).";
const MIDFILE = "a '# status:' after the header block (the leading comment block) is IGNORED — the runner reads the header's status only, so the feature keeps that status and its @release scenarios can be skipped while the run reports green (ISSUE #141). Move the status into the header block, or split the feature so each file carries one header status.";

// Every .feature under `dir`, the way cucumber's `features/**/*.feature` glob sees
// them: dotfiles and dot-directories are skipped (editor lock files such as
// `.#x.feature` live there), and each REAL directory is walked once — a symlink
// that aliases another directory, or points back at an ancestor, neither lists a
// feature twice nor loops. Anything else that cannot be read is an error: it
// throws, or — given `onError(path, error)` — is reported there and skipped, so a
// caller can name every broken entry and still check the rest. Either way a
// broken feature is loud, never silently off the CI surface. A missing dir is
// empty.
export function featureFiles(dir, { onError } = {}) {
  const acc = [];
  const seen = new Set();
  const fail = (p, e) => { if (!onError) throw e; onError(p, e); };
  const walk = (d) => {
    if (!existsSync(d)) return;
    const real = realpathSync(d);
    if (seen.has(real)) return;
    seen.add(real);
    for (const e of readdirSync(d)) {
      if (e.startsWith('.')) continue;
      const p = join(d, e);
      let st;
      try { st = statSync(p); } catch (err) { fail(p, err); continue; }
      if (st.isDirectory()) walk(p);
      else if (e.endsWith('.feature')) acc.push(p);
    }
  };
  walk(dir);
  return acc;
}

export function parseFeatureStatus(text) {
  const lines = text.split(/\r?\n/);
  let headerEnd = 0;
  while (headerEnd < lines.length && /^\s*(#.*)?$/.test(lines[headerEnd])) headerEnd++;
  const problems = [];
  const statusComments = [];
  const declared = [];
  for (let i = 0; i < headerEnd; i++) {
    const m = STATUS_COMMENT.exec(lines[i]);
    if (m) { statusComments.push(i + 1); declared.push({ line: i + 1, value: m[1].trim(), text: lines[i].trim() }); }
    const lang = /^\s*#\s*language\s*:\s*(\S+)/i.exec(lines[i]);
    if (lang && lang[1].toLowerCase() !== 'en') problems.push({ line: i + 1, kind: 'language', text: lines[i].trim(), message: LANGUAGE });
  }
  const read = declared.find((d) => d.value);   // the first NON-EMPTY `# status:` line is the status
  const word = read ? read.value.split(/\s+/)[0] : '';
  const status = read ? word.toLowerCase() : null;
  const statusLine = read ? read.line : 0;
  for (const d of declared) {
    if (d === read) {
      if (!STATES.includes(status)) problems.push({ line: d.line, kind: 'invalid', text: d.text, value: word, detail: `reads the status as '${word}'`, message: WHY.invalid });
      else if (TRANSITION.some((r) => r.test(d.value))) problems.push({ line: d.line, kind: 'transition', text: d.text, value: word, detail: `the runner reads '${word}'`, message: WHY.transition });
    } else if (read) {
      problems.push({ line: d.line, kind: 'duplicate', text: d.text, readLine: read.line, detail: `the runner reads line ${read.line} ('${status}')`, message: WHY.duplicate });
    } else {
      problems.push({ line: d.line, kind: 'empty', text: d.text, message: WHY.empty });   // no line has a value: none is read
    }
  }

  const scenarios = [];
  let level = null;               // what the last keyword opened: feature | rule | scenario | examples
  let pending = [];               // tags waiting for the next keyword
  let featureTags = [], ruleTags = [], outlineTags = [];
  let fence = null;
  let underStep = false;
  for (let i = headerEnd; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (fence) { if (t.startsWith(fence)) fence = null; continue; }
    if (!t) continue;                                   // blank lines keep a tag block / step open
    if (t.startsWith('#')) {                            // comments never break a tag block either
      if (STATUS_COMMENT.test(line)) { statusComments.push(i + 1); problems.push({ line: i + 1, kind: 'mid-file', text: t, message: MIDFILE }); }
      continue;
    }
    if (t.startsWith('@')) {
      if (TAG_TRAILING_STATUS.test(line)) problems.push({ line: i + 1, kind: 'mid-file', text: t, message: MIDFILE });
      pending.push(...tagsOf(line));
      underStep = false;
      continue;
    }
    const open = DOCSTRING_FENCE.exec(line);
    if (open && underStep) { fence = open[1]; continue; }
    const kw = KEYWORD.exec(line);
    if (kw) {
      switch (kw[1]) {
        case 'Feature': case 'Business Need': case 'Ability':
          level = 'feature'; featureTags = pending; ruleTags = []; break;
        case 'Rule':
          level = 'rule'; ruleTags = pending; break;
        case 'Background':
          level = 'scenario'; break;
        case 'Examples': case 'Scenarios':
          level = 'examples'; scenarios.push({ line: i + 1, tags: [...outlineTags, ...pending] }); break;
        default:
          level = 'scenario'; outlineTags = [...featureTags, ...ruleTags, ...pending];
          scenarios.push({ line: i + 1, tags: outlineTags });
      }
      pending = [];
      underStep = false;
      continue;
    }
    underStep = level === 'scenario' && STEP.test(line);
    pending = [];
  }
  return { status, statusLine, headerEnd, problems, scenarios, statusComments };
}
