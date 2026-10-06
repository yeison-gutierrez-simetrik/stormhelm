// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/parse-feature-status.mjs
//
// The single reader of a .feature file's `# status:` (§58) — FOLLOW-UP 134.
// Imported by check-skipped-release-scn.mjs AND by the shipped cucumber.mjs
// template (`import … from './scripts/parse-feature-status.mjs'` — /setup vendors
// this file beside the config). One module, not a copy: a re-sync refreshes
// scripts/ but never the consumer-tuned cucumber.mjs, so an inline copy would
// drift from the lint on the first change to the reader.
//
// Before this, the lint and the runner each parsed the header their own way
// (keyword-specific break, a 10-line read window, column-0 only, `\w+` vs `\S+`),
// and every difference was a way for a feature to be skipped while a gate said
// green. One reader removes the class instead of patching each case.
//
// The contract it reads (core/12 §58):
//   - the HEADER is the file's leading block of comment / blank lines; it ends at
//     the first other line (a tag line or the Feature keyword line, whatever the
//     keyword);
//   - the STATUS is the first word of the header's first non-empty `# status:`
//     line, lower-cased; prose may follow it. No header status → null (legacy:
//     the runner treats the feature as implemented);
//   - the `# status:` key is RESERVED for that one line. Any other `# status:`
//     comment after the header — or trailing a tag line — is never read, so it
//     is reported whatever it says (`# status: done` and `# Status: flaky` alike;
//     prose uses another word). Docstring content (a fence right under a step)
//     is data; a fence anywhere else is plain description text.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const STATUS_COMMENT = /^\s*#\s*status:\s*(.*)$/i;
const TAG_TRAILING_STATUS = /^\s*@[^#]*#\s*status:\s*(.*)$/i;
const DOCSTRING_FENCE = /^\s*("""|```)/;
const STEP = /^\s*(Given|When|Then|And|But|\*)\s/;

// Every .feature under `dir`. An unreadable entry (a dangling symlink — an editor
// lock file like Emacs' `.#x.feature`) is skipped, not a crash; a missing dir is empty.
export function featureFiles(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
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
  let fence = null;
  let underStep = false;
  for (let i = headerEnd; i < lines.length; i++) {
    const line = lines[i];
    if (fence) { if (line.trim().startsWith(fence)) fence = null; continue; }
    const open = DOCSTRING_FENCE.exec(line);
    if (open && underStep) { fence = open[1]; continue; }
    const m = STATUS_COMMENT.exec(line) || TAG_TRAILING_STATUS.exec(line);
    if (m) problems.push({ line: i + 1, kind: 'mid-file', text: line.trim() });
    if (line.trim() && !/^\s*#/.test(line)) underStep = STEP.test(line);
  }
  return { status, statusLine, headerEnd, problems };
}
