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

// Review round 4: a symlinked directory that aliases another one (or points at an
// ancestor) was walked again — double-counted features, or ELOOP.
test('FU-134: featureFiles visits each real directory once (aliases, loops)', async () => {
  const { featureFiles } = await load();
  const dir = mkdtempSync(join(tmpdir(), 'pfs-alias-'));
  try {
    mkdirSync(join(dir, 'v2'), { recursive: true });
    writeFileSync(join(dir, 'v2', 'p.feature'), 'Feature: P\n');
    symlinkSync(join(dir, 'v2'), join(dir, 'current'));          // an alias
    symlinkSync(dir, join(dir, 'v2', 'up'));                        // a loop to an ancestor
    const found = featureFiles(dir);
    assert.equal(found.length, 1, `listed once: ${found.join(', ')}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FU-134: a `# language:` other than en is reported; en is not', async () => {
  const { parseFeatureStatus } = await load();
  assert.deepEqual(parseFeatureStatus('# language: de\n# status: approved\nFunktionalität: X\n').problems.map((p) => [p.line, p.kind]), [[1, 'language']]);
  assert.deepEqual(parseFeatureStatus('# language: en\n# status: approved\nFeature: X\n').problems, []);
});

// ── FOLLOW-UP 135 — the header must hold ONE status line, starting with a state ──
test('FU-135: a second header status declaration is a duplicate anchored on the read line', async () => {
  const { parseFeatureStatus } = await load();
  const r = parseFeatureStatus('# status: approved\n# status: implemented\nFeature: X\n');
  assert.equal(r.status, 'approved');
  assert.deepEqual(r.problems.map(({ message, ...rest }) => rest),
    [{ line: 2, kind: 'duplicate', text: '# status: implemented', readLine: 1, detail: "the runner reads line 1 ('approved')" }]);
  assert.match(r.problems[0].message, /exactly ONE '# status:' line/, 'the per-kind explanation travels with the problem');
});

test('FU-135: a read value outside the §58 states is invalid; an empty one is not read', async () => {
  const { parseFeatureStatus, STATES, HEADER_STATUS_KINDS } = await load();
  assert.deepEqual(STATES, ['draft', 'clarifying', 'approved', 'implemented', 'retired']);
  assert.deepEqual(HEADER_STATUS_KINDS, ['duplicate', 'invalid', 'transition', 'empty']);
  const bad = parseFeatureStatus('# status: implemented.\nFeature: X\n');
  assert.equal(bad.status, 'implemented.');
  assert.deepEqual(bad.problems.map(({ message, ...rest }) => rest),
    [{ line: 1, kind: 'invalid', text: '# status: implemented.', value: 'implemented.', detail: "reads the status as 'implemented.'" }]);
  const empty = parseFeatureStatus('# status:\nFeature: X\n');
  assert.equal(empty.status, null, 'an empty status is not read');
  assert.deepEqual(empty.problems.map(({ message, ...rest }) => rest), [{ line: 1, kind: 'empty', text: '# status:' }]);
});

test('FU-135 review: an extra header line counts whatever it says; a written-in transition is reported', async () => {
  const { parseFeatureStatus } = await load();
  const prose = parseFeatureStatus('# Status: reviewed by legal\n# status: implemented\nFeature: X\n');
  assert.equal(prose.status, 'reviewed', 'the first non-empty status line IS read — prose there is a misread status');
  assert.deepEqual(prose.problems.map((p) => [p.line, p.kind]), [[1, 'invalid'], [2, 'duplicate']]);
  const arrow = parseFeatureStatus('# status: approved → implemented\nFeature: X\n');
  assert.equal(arrow.status, 'approved');
  assert.deepEqual(arrow.problems.map((p) => [p.line, p.kind, p.value]), [[1, 'transition', 'approved']]);
});

// Review round 4: the transition rule is "an arrow (any shape) leading to a state
// word, `to`/`then` + a state, or a bare second state word". The first version
// matched any separator after the state (a false failure on legal prose) and
// missed an arrow with a word or a bracket before the new state (a false green).
test('FU-135 review: a transition is caught in any notation, with words or brackets before the new state', async () => {
  const { parseFeatureStatus } = await load();
  for (const v of ['approved → implemented', 'approved --> implemented', 'approved ⇒ implemented', 'approved > implemented',
    'approved → now implemented', 'approved → → implemented', 'approved (→ implemented)', 'approved -> (implemented)',
    'approved to implemented', 'approved then implemented', 'approved implemented', 'approved implemented # flipped']) {
    const r = parseFeatureStatus(`# status: ${v}\nFeature: X\n`);
    assert.equal(r.status, 'approved', v);
    assert.deepEqual(r.problems.map((p) => p.kind), ['transition'], v);
  }
});

test('FU-135 review: prose after the state stays legal, even when it names another state', async () => {
  const { parseFeatureStatus } = await load();
  for (const v of ['implemented (scn-1 — approved by ops)', 'implemented (approved by operator, §58 ratified)',
    'implemented — approved by ops', 'implemented - approved by ops', 'implemented [approved in #12]',
    "implemented 'approved by ops'", 'approved Draft-era scns removed', 'approved by the operator on 2026-10-01']) {
    assert.deepEqual(parseFeatureStatus(`# status: ${v}\nFeature: X\n`).problems, [], v);
  }
});
