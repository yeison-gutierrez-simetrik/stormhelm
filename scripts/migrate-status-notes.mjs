#!/usr/bin/env node
// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/migrate-status-notes.mjs
//
// One-time migration for FOLLOW-UP 135's strict status line (core/12 §58): the
// header's `# status:` line holds ONE state word and nothing else. A feature that
// still carries a note after the word — `# status: implemented — ratified in #12`
// — fails the skipped-release lint, the cucumber.mjs config and CONFIG §58 until
// the note moves to its own line:
//
//   # status: implemented
//   # status-note: ratified in #12
//
// Usage:
//   node scripts/migrate-status-notes.mjs <features-dir>           # dry run: list every change
//   node scripts/migrate-status-notes.mjs <features-dir> --write   # apply them
//
// Only the header status line is touched, through the shared reader
// (parse-feature-status.mjs), and only when its first word is a §58 state and the
// rest is a plain note. Anything else is listed as MANUAL and left alone, because
// only a human can say which state was meant:
//   - the first word is not a state (`implemented.`, a quoted value);
//   - the note names a state anywhere (`approved → implemented`, `approved (now
//     implemented)`, "implemented — approved by ops"): it may be a flip written
//     into the line, and moving it to a note would silently keep the old state.
// Leading separators of the note (dashes, colons, commas) are dropped; line
// endings and a leading BOM are kept. rc 0 = done (dry run or write) · rc 2 = a
// malformed call. Run the lint afterwards: `node scripts/check-skipped-release-scn.mjs features`.

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { featureFiles, parseFeatureStatus, STATES, STATUS_COMMENT } from './parse-feature-status.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const [dir] = args.filter((a) => a !== '--write');
if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error('usage: node scripts/migrate-status-notes.mjs <features-dir> [--write]  (rc 2: features dir not found)');
  process.exit(2);
}

const NAMES_A_STATE = new RegExp(`\\b(?:${STATES.join('|')})\\b`, 'i');
const changes = [];
const manual = [];
for (const f of featureFiles(dir)) {
  const text = readFileSync(f, 'utf8');
  const { statusLine, problems } = parseFeatureStatus(text);
  const invalid = problems.find((p) => p.kind === 'invalid' && p.line === statusLine);
  if (!invalid) continue;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const [, prefix, value] = STATUS_COMMENT.exec(lines[statusLine - 1]);
  const [word] = value.trim().split(/\s+/);
  const note = value.trim().slice(word.length).replace(/^[\s—–:;,-]+/, '');
  if (!STATES.includes(word.toLowerCase()) || !note || NAMES_A_STATE.test(note)) {
    manual.push(`${f}:${statusLine}  ${lines[statusLine - 1].trim()}`);
    continue;
  }
  const notePrefix = prefix.replace(/^\uFEFF/, '').replace(/status\s*:$/i, 'status-note:');
  const replaced = [`${prefix} ${word}`, `${notePrefix} ${note}`];
  changes.push(`${f}:${statusLine}\n    - ${lines[statusLine - 1].trim()}\n    + ${replaced[0].replace(/^\uFEFF/, '').trim()}\n    + ${replaced[1].trim()}`);
  if (write) {
    lines.splice(statusLine - 1, 1, ...replaced);
    writeFileSync(f, lines.join(eol));
  }
}

console.log(`${write ? 'Migrated' : 'Would migrate'} ${changes.length} status line(s)${write ? '' : ' (dry run — rerun with --write to apply)'}:`);
for (const c of changes) console.log(`  ${c}`);
if (manual.length) {
  console.log(`\nMANUAL — ${manual.length} status line(s) left alone: the first word is not a §58 state, or the note names a state (it may be a flip written into the line). Decide the state, write it alone, and move any note to a '# status-note:' line:`);
  for (const m of manual) console.log(`  ${m}`);
}
process.exit(0);
