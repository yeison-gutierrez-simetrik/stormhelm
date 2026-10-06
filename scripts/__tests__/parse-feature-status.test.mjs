// Coverage for scripts/parse-feature-status.mjs — the single `# status:` reader
// (§58) imported by check-skipped-release-scn.mjs and by the shipped cucumber.mjs
// template (FOLLOW-UP 134 review). Behavioral parity between the lint and the
// real config lives in check-skipped-release-scn.test.mjs; this file pins the
// import and the reader's own contract.
//
// Run: node --test scripts/__tests__/parse-feature-status.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const MODULE = join(here, '..', 'parse-feature-status.mjs');
const TEMPLATE = join(here, '..', '..', 'templates', 'cucumber.mjs.tmpl');
const load = () => import(pathToFileURL(MODULE).href);

// The template IMPORTS the reader (FU-134 review): /setup vendors
// scripts/parse-feature-status.mjs beside cucumber.mjs, and a re-sync refreshes
// the scripts but never the tuned config — an inline copy would drift from the
// lint on the first reader change. A named import is not a cucumber profile.
test('FU-134: cucumber.mjs.tmpl imports the shared reader instead of carrying a copy', () => {
  const tmpl = readFileSync(TEMPLATE, 'utf8');
  assert.match(tmpl, /^import \{ featureFiles, parseFeatureStatus \} from '\.\/scripts\/parse-feature-status\.mjs';$/m);
  assert.doesNotMatch(tmpl, /function parseFeatureStatus|function featureFiles/, 'no inline copy to drift');
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
  assert.deepEqual(r.problems.map(({ line, kind, text }) => ({ line, kind, text })), [{ line: 4, kind: 'mid-file', text: '# status: implemented' }]);
  // The explanation travels WITH the problem (review round 3): the lint and the
  // consumer's cucumber.mjs both print it, and a re-sync refreshes it in one place.
  assert.match(r.problems[0].message, /IGNORED/);
});

test('FU-134: featureFiles skips dotfiles (an editor lock symlink) but fails loudly on any other unreadable entry', async () => {
  const { featureFiles } = await load();
  const dir = mkdtempSync(join(tmpdir(), 'pfs-walk-'));
  try {
    mkdirSync(join(dir, 'a'), { recursive: true });
    writeFileSync(join(dir, 'a', 'x.feature'), 'Feature: X\n');
    writeFileSync(join(dir, 'notes.md'), '');
    symlinkSync(join(dir, 'nonexistent'), join(dir, '.#lock.feature'));
    assert.deepEqual(featureFiles(dir), [join(dir, 'a', 'x.feature')]);
    assert.deepEqual(featureFiles(join(dir, 'missing')), [], 'a missing dir is empty, not a crash');
    symlinkSync(join(dir, 'nonexistent'), join(dir, 'shared.feature'));
    assert.throws(() => featureFiles(dir), /ENOENT/, 'a broken feature must not vanish silently');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FU-134: scenarios carry their effective tags (Feature/Rule inheritance, Examples blocks)', async () => {
  const { parseFeatureStatus } = await load();
  const r = parseFeatureStatus([
    '# status: approved', '@release', 'Feature: X', '  But a description line, not a step:', '  ```',
    '  @scn-1', '  Scenario: a', '    Given g',
    '  @smoke', '  Rule: r', '    @scn-2', '    Example: b', '      Given g',
    '    @scn-3', '    Scenario Outline: c', '      Given <n>', '      @nightly', '      Examples:', '        | n |', '        | 1 |',
  ].join('\n'));
  assert.deepEqual(r.scenarios.map((x) => x.tags), [
    ['@release', '@scn-1'],
    ['@release', '@smoke', '@scn-2'],
    ['@release', '@smoke', '@scn-3'],
    ['@release', '@smoke', '@scn-3', '@nightly'],
  ]);
});

test('FU-134 review: any `# status:` line after the header is reported, whatever its value', async () => {
  const { parseFeatureStatus } = await load();
  const r = parseFeatureStatus('# status: approved\nFeature: X\n  # Status: flaky on CI\n  # status: done\n');
  assert.deepEqual(r.problems.map((p) => p.line), [3, 4]);
});
