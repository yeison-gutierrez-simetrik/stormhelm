// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/scenario-claims.mjs
//
// The single reader of an issue's `scenarios:` token (§63) — FOLLOW-UP 134.
// check-invariants.mjs (INV-3 / INV-5 and the CONFIG §63 grammar check) and
// check-skipped-release-scn.mjs (§130b) all import it, so the offline auditor and
// the acceptance gate can never read a claim differently. templates/ralph-lib.sh's
// `ralph_expand_scns` is the engine's bash twin — it accepts and drops exactly the
// forms below.
//
// The grammar (lower-case): segments `scn-NNN`, a bare `NNN`, or a range
// `scn-A..scn-B` (or `A..B`), joined by `+` or `,` — the GitHub-compact
// `scenarios:scn-021+022`, the spelled `scn-021+scn-022`, the comma
// `scn-021,scn-022`. A range keeps its start's zero padding
// (`scn-001..scn-003` → scn-001, scn-002, scn-003). A trailing period ends the
// token — it is sentence punctuation, not part of the last id ("Delivers
// scenarios:scn-7."). No whitespace after the colon: "Scenarios: scn-7 is
// deferred" is prose, not a claim.
//
// A segment outside the grammar — an upper-case `SCN-`, a backwards range, a
// range spanning MAX_RANGE ids or more (a typo such as `scn-1..scn-200000000`
// would otherwise allocate one id per number) — is BAD: it expands to nothing,
// CONFIG §63 fails naming it, and the bash twin drops it with a warning.

export const MAX_RANGE = 1000;
const ONE = /^(?:scn-)?(\d+)$/;
const RANGE = /^(?:scn-)?(\d+)\.\.(?:scn-)?(\d+)$/;

// One token's value → { ids, bad }: the scn ids it claims, and the segments that
// are not in the grammar.
export function parseClaimToken(value) {
  const ids = [];
  const bad = [];
  for (const seg of value.replace(/\.+$/, '').split(/[+,]/)) {
    const range = RANGE.exec(seg);
    if (range) {
      const [a, b, w] = [+range[1], +range[2], range[1].length];
      if (a > b || b - a >= MAX_RANGE) { bad.push(seg); continue; }
      for (let k = a; k <= b; k++) ids.push(`scn-${String(k).padStart(w, '0')}`);
      continue;
    }
    const one = ONE.exec(seg);
    if (one) ids.push(`scn-${one[1]}`);
    else bad.push(seg);
  }
  return { ids, bad };
}

// Every `scenarios:` token in a text (an issue body, a spec) → the scn ids claimed.
export function expandScenarioClaims(text) {
  return [...text.matchAll(/scenarios:([a-z0-9+,.-]+)/gi)].flatMap((m) => parseClaimToken(m[1]).ids);
}
