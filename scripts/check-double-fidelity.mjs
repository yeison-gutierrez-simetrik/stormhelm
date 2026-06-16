#!/usr/bin/env node
// scripts/check-double-fidelity.mjs
//
// FOLLOW-UP 90 — external-provider test-doubles can fabricate a wire shape the
// real provider never emits, so a money/IO slice ships green against an INVENTED
// contract (the double IS the contract the acceptance gate certifies). Live:
// belong slice 18 — a Stripe-webhook double attached `chargeId` to
// `checkout.session.completed`, but the real event carries `payment_intent` as
// an UNEXPANDED string id (no charge); scn-321 passed against the fabrication,
// production recorded an empty `stripe_charge_id`. Only the §114 reviewer caught
// it, by hand.
//
// This pins a double against a RECORDED REAL-SHAPE GOLDEN (a `*.contract.json`
// captured from the provider's documented payload / a sandbox capture). It is a
// STRUCTURAL diff — keys + types, not values — so it survives ids/timestamps
// changing but fails the moment a double's shape diverges from the real wire:
//   - a FABRICATED key the golden lacks (the `chargeId` case),
//   - a MISSING key the golden requires,
//   - a TYPE mismatch (golden `payment_intent` is a string; double made it an
//     object — the expanded-vs-id divergence).
//
// The contract is named in three places (FU-17 anti-drift): the port's wire
// TYPE ⇒ the `*.contract.json` GOLDEN ⇒ the DOUBLE. Consumer-runtime: a port
// test captures the double's emitted payload to a file and runs this against the
// golden, so a divergent double fails at /tdd — before acceptance certifies it.
//
// Usage:
//   node scripts/check-double-fidelity.mjs <golden.contract.json> <double-sample.json>
//
// Both files are JSON. With `--optional <dotted.path,...>` the named golden
// paths may be absent in the sample without failing (genuinely-optional wire
// fields); every OTHER divergence still fails.
//
// Exit: 0 = shapes match ; 1 = divergence (path named) ; 2 = usage / read error.

import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
let optional = new Set();
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--optional') { optional = new Set((argv[++i] || '').split(',').filter(Boolean)); }
  else files.push(argv[i]);
}
const [goldenFile, sampleFile] = files;
if (!goldenFile || !sampleFile) {
  console.error('Usage: node scripts/check-double-fidelity.mjs <golden.contract.json> <double-sample.json> [--optional a.b,c]');
  process.exit(2);
}

const load = (f) => {
  try { return JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { console.error(`❌ cannot read/parse ${f}: ${e.message}`); process.exit(2); }
};

// Structural type of a value: object | array | string | number | boolean | null.
const shapeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

const divergences = [];
function compare(golden, sample, path) {
  const gt = shapeOf(golden);
  const st = shapeOf(sample);
  if (gt !== st) {
    // null in the golden is a wildcard for "present, type not pinned" (a field
    // the provider documents as nullable/variable) — only require presence.
    if (gt === 'null') return;
    divergences.push(`${path || '<root>'}: golden is ${gt}, double is ${st}`);
    return;
  }
  if (gt === 'object') {
    const gk = Object.keys(golden);
    const sk = new Set(Object.keys(sample));
    for (const k of gk) {
      const p = path ? `${path}.${k}` : k;
      if (!sk.has(k)) {
        if (!optional.has(p)) divergences.push(`${p}: MISSING in the double (the real provider emits it)`);
        continue;
      }
      compare(golden[k], sample[k], p);
    }
    // FABRICATED keys: present in the double, absent from the real golden.
    for (const k of sk) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in golden)) divergences.push(`${p}: FABRICATED — the double emits it but the real provider does not`);
    }
  } else if (gt === 'array') {
    // Compare the element shape against golden[0] (the documented element shape).
    if (golden.length && sample.length) compare(golden[0], sample[0], `${path}[]`);
  }
}

compare(load(goldenFile), load(sampleFile), '');

if (divergences.length) {
  console.error(`❌ DOUBLE FIDELITY: the double's shape diverges from the real-provider golden (${goldenFile}):`);
  for (const d of divergences) console.error(`   - ${d}`);
  console.error('   A double that does not match the real wire shape certifies a contract production never honors. Rebuild it from the golden.');
  process.exit(1);
}
console.log(`✅ DOUBLE FIDELITY: the double matches the real-provider golden (${goldenFile}).`);
process.exit(0);
