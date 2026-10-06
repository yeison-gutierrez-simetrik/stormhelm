// Coverage for scripts/parse-feature-status.mjs — the single `# status:` reader
// (§58) shared by check-skipped-release-scn.mjs and, as a verbatim copy, by the
// shipped cucumber.mjs template (FOLLOW-UP 134 review). Behavioral parity
// between the lint and the real config lives in check-skipped-release-scn.test.mjs;
// this file pins the copy and the reader's own contract.
//
// Run: node --test scripts/__tests__/parse-feature-status.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MODULE = join(here, '..', 'parse-feature-status.mjs');
const TEMPLATE = join(here, '..', '..', 'templates', 'cucumber.mjs.tmpl');
const load = () => import(pathToFileURL(MODULE).href);

// The template cannot import from scripts/ (consumers copy it to their root),
// so it carries the reader between BEGIN/END markers. `export` is the only
// allowed difference: a named export in a cucumber config is read as a profile.
const block = (text) => {
  const m = text.match(/\/\/ BEGIN parse-feature-status[^\n]*\n([\s\S]*?)\/\/ END parse-feature-status/);
  assert.ok(m, 'BEGIN/END parse-feature-status markers present');
  return m[1].replace(/^export /gm, '');
};

test('FU-134: cucumber.mjs.tmpl carries a verbatim copy of parse-feature-status.mjs', () => {
  assert.equal(block(readFileSync(TEMPLATE, 'utf8')), block(readFileSync(MODULE, 'utf8')),
    'the template copy drifted from scripts/parse-feature-status.mjs — re-copy the block');
});

test('FU-134: the template exports nothing but its config (named exports are cucumber profiles)', () => {
  const tmpl = readFileSync(TEMPLATE, 'utf8');
  assert.deepEqual(tmpl.match(/^export .*/gm), ['export default {']);
});

test('FU-134: reader contract — status, the line it came from, and where the header ends', async () => {
  const { parseFeatureStatus } = await load();
  const r = parseFeatureStatus('# language: en\n# status: Implemented (scn-1 delivered)\n\n@release\nFeature: X\n');
  assert.equal(r.status, 'implemented', 'first token, lower-cased; prose after it is ignored');
  assert.equal(r.statusLine, 2);
  assert.equal(r.headerEnd, 3, 'header = leading comment/blank block; ends before the first other line');
  assert.deepEqual(r.problems, []);
  const none = parseFeatureStatus('Feature: Legacy\n');
  assert.equal(none.status, null, 'no header status → null (legacy = implemented for the runner)');
  assert.equal(none.statusLine, 0);
});

test('FU-134: a mid-file status declaration is reported with its line and text', async () => {
  const { parseFeatureStatus } = await load();
  const r = parseFeatureStatus('# status: approved\nFeature: X\n\n  # status: implemented\n  @release @scn-1\n');
  assert.deepEqual(r.problems, [{ line: 4, kind: 'mid-file', text: '# status: implemented' }]);
});
