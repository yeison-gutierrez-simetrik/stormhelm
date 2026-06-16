# fix(ralph): batch-22 — double fidelity, CI-green gate, hang watchdog, SSRF (FOLLOW-UPs 90–93)

Processes belong auto-pilot slices 18–21 under the v2 STRICT rubric. All four claims reproduced against `main` first. None relaxes a core safety invariant, so all were decided under the rubric and documented here for veto. Docs-handoff ledger PR: #125.

Cumulative branch per §123; one commit per FU.

## FU-90 — external-provider double fidelity (§126) · IMPLEMENT

A double that fabricates a wire shape the real provider never emits certifies green against an invented contract (belong slice 18: a Stripe double attached `chargeId` to `checkout.session.completed`, which really carries `payment_intent` as an unexpanded string id; scn-321 passed, production recorded an empty `stripe_charge_id`). The framework can't run a consumer's doubles, so the general contribution is a reusable **structural** shape-diff `scripts/check-double-fidelity.mjs` (keys+types, not values) + the **§126** convention: port wire-type ⇒ `*.contract.json` golden ⇒ double. It fails a fabricated/missing/type-mismatched double at `/tdd`. **Reference:** Pact consumer-contract testing, local + deterministic. 5 tests reproduce the live miss.

## FU-91 — expected-checks gate · IMPLEMENT

`check-merge-safety.mjs pre` now asserts **green = every expected check present + concluded success, zero pending** — not "no failure seen". `mergeStateStatus=CLEAN` only reflects branch-protection *required* checks, so an unregistered/pending workflow is invisible to it (belong PR #156: `acceptance` never registered across 3 pushes while SonarCloud passed → false green). The expected set is a config point: `RALPH_EXPECTED_CHECKS` env or `.planning/expected-checks.json`. No manifest → loud advisory, not blocked (back-compat); the zero-pending assertion is universal. Documented in core/13. **Reference:** merge-queue "all required checks must conclude" (Bors/Mergify). 6 tests.

## FU-92 — per-call hang watchdog + a latent bug · IMPLEMENT (simpler than proposed)

The FU proposed an mtime watchdog gated on "no live worker child", but the failure is a **synchronous** hang — `claude -p` blocks forever on a half-open socket and the loop is stuck *inside* the call, so a concurrent watchdog can't run. A bounded per-call `timeout` (`RALPH_CALL_TIMEOUT`, default 1800s; graceful degrade when no GNU timeout) maps the kill to the FU-74 engine-outage code → existing `engine_failure` → clean `--resume`.

**Surfaced and fixed a pre-existing latent bug:** `local exit_code=$?` was taken after an unmatched `if` (no else), where bash reports the if's own status (always 0) — so every non-429 claude failure (and any timeout kill) was silently dropped into a phantom "returned 0 / empty output" success. Moved the capture into an `else`. 429 detection was unaffected (greps stderr). 2 tests (PATH-scoped faithful `timeout` shim for cross-platform determinism).

## FU-93 — outbound-adapter SSRF checklist · IMPLEMENT (docs)

`/security-hardening` Step 8b enumerates the six SSRF checks for any channel POSTing to an externally-supplied URL (resolve+validate every address, **pin the connection to the validated IP**, `redirect:error`, block loopback/RFC-1918/link-local/metadata/IPv6-ULA+link-local+v4-mapped, https-only, validate at registration **and** send). A string-only guard (the live DNS-rebind + `302→169.254.169.254` bypass, belong PR #159) is flagged BLOCKING. **Reference:** OWASP SSRF Prevention Cheat Sheet.

## Gates

- `check-framework-metadata.mjs` rc=0 ✅
- `check-invariants.mjs` rc=0 ✅
- `sync-closed-sets.mjs --check` rc=0 ✅
- `node --test scripts/__tests__/*.test.mjs` rc=0 ✅ (+ FU-90 ×5, FU-91 ×6, FU-92 ×2)

All rc values captured unpiped.

⚠️ Left open for maintainer review — not merging.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
