// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/parse-feature-status.mjs
//
// The single reader of a .feature file's `# status:` (§58) — FOLLOW-UP 134.
// check-skipped-release-scn.mjs imports it; templates/cucumber.mjs.tmpl carries a
// VERBATIM copy of the block between the BEGIN/END markers (the template is copied
// to the consumer root and must stay self-contained, and a named export in a
// cucumber config is read as a profile, so the copy drops `export`).
// scripts/__tests__/parse-feature-status.test.mjs fails if the two drift.
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
//   - the STATUS is the first token of the header's first `# status:` line,
//     lower-cased; prose may follow it. No header status → null (legacy: the
//     runner treats the feature as implemented);
//   - a status DECLARATION anywhere else — after the header, or trailing a tag
//     line — is never read, so it is reported. Docstring content is data, and a
//     comment declares a status only when its value starts with a §58 state word
//     (`# Status: flaky on CI` is prose).

// BEGIN parse-feature-status — verbatim copy in templates/cucumber.mjs.tmpl (keep identical)
export const STATES = ['draft', 'clarifying', 'approved', 'implemented', 'retired'];
const STATUS_COMMENT = /^\s*#\s*status:\s*(.*)$/i;
const TAG_TRAILING_STATUS = /^\s*@[^#]*#\s*status:\s*(.*)$/i;
const DECLARES_STATE = /^["'`]?(draft|clarifying|approved|implemented|retired)\b/i;
const DOCSTRING_FENCE = /^\s*("""|```)/;

export function parseFeatureStatus(text) {
  const lines = text.split(/\r?\n/);
  let headerEnd = 0;
  while (headerEnd < lines.length && /^\s*(#.*)?$/.test(lines[headerEnd])) headerEnd++;
  let status = null;
  let statusLine = 0;
  for (let i = 0; i < headerEnd && !statusLine; i++) {
    const m = STATUS_COMMENT.exec(lines[i]);
    const token = m ? m[1].trim().split(/\s+/)[0] : '';
    if (token) { status = token.toLowerCase(); statusLine = i + 1; }
  }
  const problems = [];
  let fence = null;
  for (let i = headerEnd; i < lines.length; i++) {
    const open = DOCSTRING_FENCE.exec(lines[i]);
    if (open && (fence === null || fence === open[1])) { fence = fence === null ? open[1] : null; continue; }
    if (fence) continue;
    const m = STATUS_COMMENT.exec(lines[i]) || TAG_TRAILING_STATUS.exec(lines[i]);
    if (m && DECLARES_STATE.test(m[1].trim())) problems.push({ line: i + 1, kind: 'mid-file', text: lines[i].trim() });
  }
  return { status, statusLine, headerEnd, problems };
}
// END parse-feature-status
