// CI coverage for scripts/check-double-fidelity.mjs (FOLLOW-UP 90).
//
// Reproduces belong slice-18's live miss as a fixture: a Stripe-webhook double
// that attaches `chargeId` to `checkout.session.completed` (which the real event
// never carries — it has `payment_intent` as an unexpanded string id). The
// structural diff against the recorded golden fails the fabricated/typed-wrong
// double; a faithful double passes.
//
// Run: node --test scripts/__tests__/check-double-fidelity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'check-double-fidelity.mjs');

// The real `checkout.session.completed` shape (captured from Stripe's docs):
// payment_intent is an UNEXPANDED string id; there is no charge on this event.
const GOLDEN = {
  id: 'evt_x', type: 'checkout.session.completed',
  data: { object: { id: 'cs_x', payment_intent: 'pi_x', amount_total: 1000, status: 'complete' } },
};

function run(golden, sample, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'fidelity-'));
  try {
    const g = join(dir, 'golden.json'); const s = join(dir, 'sample.json');
    writeFileSync(g, JSON.stringify(golden));
    writeFileSync(s, JSON.stringify(sample));
    const r = spawnSync('node', [SCRIPT, g, s, ...extra], { encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('FU-90: a faithful double (matching the golden shape) passes', () => {
  const faithful = {
    id: 'evt_2', type: 'checkout.session.completed',
    data: { object: { id: 'cs_2', payment_intent: 'pi_2', amount_total: 2000, status: 'complete' } },
  };
  const { status, out } = run(GOLDEN, faithful);
  assert.equal(status, 0, out);
  assert.match(out, /matches the real-provider golden/);
});

test('FU-90: the live miss — a FABRICATED chargeId the real event never carries → fail', () => {
  const fabricated = {
    id: 'evt_3', type: 'checkout.session.completed',
    data: { object: { id: 'cs_3', payment_intent: 'pi_3', amount_total: 3000, status: 'complete', chargeId: 'ch_3' } },
  };
  const { status, out } = run(GOLDEN, fabricated);
  assert.equal(status, 1, out);
  assert.match(out, /data\.object\.chargeId: FABRICATED/);
});

test('FU-90: a MISSING required field (omitted payment_intent) → fail', () => {
  const missing = {
    id: 'evt_4', type: 'checkout.session.completed',
    data: { object: { id: 'cs_4', amount_total: 4000, status: 'complete' } },
  };
  const { status, out } = run(GOLDEN, missing);
  assert.equal(status, 1, out);
  assert.match(out, /data\.object\.payment_intent: MISSING/);
});

test('FU-90: a TYPE mismatch (payment_intent expanded to an object) → fail', () => {
  const expanded = {
    id: 'evt_5', type: 'checkout.session.completed',
    data: { object: { id: 'cs_5', payment_intent: { id: 'pi_5', latest_charge: 'ch_5' }, amount_total: 5000, status: 'complete' } },
  };
  const { status, out } = run(GOLDEN, expanded);
  assert.equal(status, 1, out);
  assert.match(out, /data\.object\.payment_intent: golden is string, double is object/);
});

test('FU-90: --optional whitelists a genuinely-optional field that may be absent', () => {
  const missingOptional = {
    id: 'evt_6', type: 'checkout.session.completed',
    data: { object: { id: 'cs_6', payment_intent: 'pi_6', status: 'complete' } },   // amount_total absent
  };
  assert.equal(run(GOLDEN, missingOptional).status, 1, 'fails without the whitelist');
  assert.equal(run(GOLDEN, missingOptional, ['--optional', 'data.object.amount_total']).status, 0, 'passes when whitelisted');
});
