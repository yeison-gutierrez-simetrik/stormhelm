// CI coverage for scripts/check-release-step-fidelity.mjs (FOLLOW-UP 103 round-2).
// The mechanical, stack-agnostic half of §127: a step definition that drives a
// use case via container.<x>.execute( bypasses the production input adapter —
// the exact live miss (slice-27c scn-482). This fails RED in CI on that pattern.
//
// Run: node --test scripts/__tests__/check-release-step-fidelity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-release-step-fidelity.mjs');

function run(setup) {
  const dir = mkdtempSync(join(tmpdir(), 'stepfid-'));
  try {
    setup(dir);
    const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const stepFile = (dir, rel, body) => {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
};

test('FU-103: a step driving the use case via container.<x>.execute( fails (§127)', () => {
  const { status, out } = run((dir) => stepFile(dir, 'features/settlement/steps/milestone.steps.ts',
    'When("funded", async () => {\n  await this.infra.container.fundMilestones.execute({ sowId });\n});\n'));
  assert.equal(status, 1, out);
  assert.match(out, /container\.<x>\.execute|container.*execute/);
  assert.match(out, /milestone\.steps\.ts:2/);
});

test('FU-103: a step driving the real route passes', () => {
  const { status, out } = run((dir) => stepFile(dir, 'features/settlement/steps/milestone.steps.ts',
    'When("funded", async () => {\n  await request(app).post(`/sows/${sowId}/fund-milestones`).expect(200);\n});\n'));
  assert.equal(status, 0, out);
  assert.match(out, /drive the production surface/);
});

test('FU-103: an audited // acceptance-driver-ok opt-out is allowed (legitimate Given-seed)', () => {
  const onSame = run((dir) => stepFile(dir, 'features/x/steps/seed.steps.ts',
    'Given("a sow exists", async () => {\n  await container.seedSow.execute({ id }); // acceptance-driver-ok: test fixture seed\n});\n'));
  assert.equal(onSame.status, 0, onSame.out);
  const onPrev = run((dir) => stepFile(dir, 'features/x/steps/seed.steps.ts',
    'Given("a sow exists", async () => {\n  // acceptance-driver-ok: test fixture seed\n  await container.seedSow.execute({ id });\n});\n'));
  assert.equal(onPrev.status, 0, onPrev.out);
});

test('FU-103: no step files → na (no-op for a slice without acceptance steps)', () => {
  const { status, out } = run(() => {});
  assert.equal(status, 0, out);
  assert.match(out, /na/);
});
