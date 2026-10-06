// scope: consumer-runtime   (FU-95: re-sync/`/setup` vendor only consumer-runtime scripts)
// scripts/scenario-claims.mjs
//
// The single reader of an issue's `scenarios:` token (§63) — FOLLOW-UP 134.
// check-invariants.mjs (INV-3 / INV-5) and check-skipped-release-scn.mjs (§130b)
// both import it, so the offline auditor and the acceptance gate can never read a
// claim differently. templates/ralph-lib.sh's `ralph_expand_scns` is the engine's
// bash twin — the forms below are the ones it expands.
//
// Forms (all case-insensitive): the GitHub-compact `scenarios:scn-021+022`, the
// spelled `scn-021+scn-022`, the comma `scn-021,scn-022`, the range `scn-A..scn-B`
// (or `A..B`), and bare numbers. A range keeps its start's zero padding
// (`scn-001..scn-003` → scn-001, scn-002, scn-003); a backwards range expands to
// nothing. No whitespace after the colon — "Scenarios: scn-7 is deferred" is
// prose, not a claim — and a trailing period ends the token, it is not part of
// the last id ("Delivers scenarios:scn-7.").

export function expandScenarioClaims(text) {
  return [...text.matchAll(/scenarios:([a-z0-9+,.-]+)/gi)].flatMap((m) =>
    m[1].replace(/\.+$/, '').split(/[+,]/).flatMap((seg) => {
      const range = seg.match(/^(?:scn-)?(\d+)\.\.(?:scn-)?(\d+)$/i);
      if (range) {
        const [a, b, w] = [+range[1], +range[2], range[1].length];
        if (a > b) return [];
        return Array.from({ length: b - a + 1 }, (_, k) => `scn-${String(a + k).padStart(w, '0')}`);
      }
      const n = seg.match(/^(?:scn-)?(\d+)$/i);
      return n ? [`scn-${n[1]}`] : [];
    }),
  );
}
