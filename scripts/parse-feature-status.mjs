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
// The contract it reads (core/12 §58; feature files are English Gherkin):
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
//     fence after it is plain text.
//
// The same line scan yields each scenario's EFFECTIVE tags (Feature and Rule tags
// inherited, an Examples block adding its own), which the §130b claimed-scn check
// in check-skipped-release-scn.mjs reads — one scanner for both.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const STATUS_COMMENT = /^\s*#+\s*status\s*:\s*(.*)$/i;
const TAG_TRAILING_STATUS = /^\s*@[^#]*#+\s*status\s*:\s*(.*)$/i;
const DOCSTRING_FENCE = /^\s*("""|```)/;
const KEYWORD = /^\s*(Feature|Business Need|Ability|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):/;
const STEP = /^\s*(Given|When|Then|And|But|\*)\s/;
const tagsOf = (line) => line.replace(/\s+#.*$/, '').trim().split(/\s+/).filter((t) => t.startsWith('@'));

const MIDFILE = "a '# status:' after the header block (the leading comment block) is IGNORED — the runner reads the header's status only, so the feature keeps that status and its @release scenarios can be skipped while the run reports green (ISSUE #141). Move the status into the header block, or split the feature so each file carries one header status.";

// Every .feature under `dir`, the way cucumber's `features/**/*.feature` glob sees
// them: dotfiles and dot-directories are skipped (editor lock files such as
// `.#x.feature` live there). Anything else that cannot be read throws — a broken
// feature must fail loudly, never silently leave the CI surface. A missing dir
// is empty.
export function featureFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) featureFiles(p, acc);
    else if (e.endsWith('.feature')) acc.push(p);
  }
  return acc;
}

export function parseFeatureStatus(text) {
  const lines = text.split(/\r?\n/);
  let headerEnd = 0;
  while (headerEnd < lines.length && /^\s*(#.*)?$/.test(lines[headerEnd])) headerEnd++;
  let status = null;
  let statusLine = 0;
  for (let i = 0; i < headerEnd && !statusLine; i++) {
    const m = STATUS_COMMENT.exec(lines[i]);
    const word = m ? m[1].trim().split(/\s+/)[0] : '';
    if (word) { status = word.toLowerCase(); statusLine = i + 1; }
  }

  const problems = [];
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
      if (STATUS_COMMENT.test(line)) problems.push({ line: i + 1, kind: 'mid-file', text: t, message: MIDFILE });
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
  return { status, statusLine, headerEnd, problems, scenarios };
}
