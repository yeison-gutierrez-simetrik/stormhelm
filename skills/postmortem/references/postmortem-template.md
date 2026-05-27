# Postmortem — &lt;YYYY-MM-DD&gt; — &lt;short-incident-slug&gt;

> **Instructions:** Copy this file to `docs/postmortems/<YYYY-MM-DD>-<slug>.md`, fill in every section, and link from the issue. Delete this instruction block and any italicized prompts before submitting.
>
> **Blameless principle (read §95):** describe systems, not people. *"The deployment process did not require a smoke test"* — not *"Engineer X pushed without testing."* The goal is to find and fix gaps in the system, not assign individual fault.

---

## Metadata

| Field | Value |
|---|---|
| Postmortem date | _YYYY-MM-DD (date this document was written)_ |
| Incident detected | _YYYY-MM-DD HH:MM TZ_ |
| Incident resolved | _YYYY-MM-DD HH:MM TZ_ |
| Duration of impact | _e.g., 2h 14m_ |
| Severity | _P0 / P1_ |
| Issue | _#NNN_ |
| Fix PR(s) | _#NNN, #NNN_ |
| Authors | _names or handles_ |
| Reviewers | _names or handles (someone outside the immediate response team)_ |
| Status | _Draft / Approved / Action items in progress / Complete_ |

---

## Summary

_One paragraph that a non-engineer can read in 30 seconds and understand: what broke, who was affected, how it was fixed, what we learned. This is the only section many stakeholders will read; make it count._

Example:
> Between 14:30 and 16:44 on 2026-05-20, the quote acceptance endpoint accepted expired quotes for approximately 47 customers, generating 12 SOWs that should not have existed. Root cause: a March refactor removed the injected clock from the expiry check, allowing UTC drift between server and clients to bypass the validation. Resolved by restoring the clock injection and adding a regression test. Twelve SOWs were manually voided; affected customers were notified.

---

## Impact

_Be specific. Quantify when possible._

- **Users affected:** _count + percentage of total active users_
- **Requests affected:** _count + percentage of total_
- **Data integrity:** _was data lost, corrupted, exposed? What was the scope?_
- **Financial impact:** _refunds, lost revenue, chargebacks_
- **Compliance / regulatory impact:** _did the incident trigger any reporting obligations?_
- **External communications:** _what was said to customers, when, by whom?_

---

## Timeline

_Every meaningful event from the first symptom to the all-clear. Use UTC or a single consistent timezone. Include detection, escalation, mitigation, and resolution steps._

| Time | Event |
|---|---|
| 14:30 | First quote acceptance with expired `expiresAt` recorded in production logs. _(Not detected yet.)_ |
| 14:47 | Customer support receives first ticket: "I accepted a quote yesterday, it's already expired today." |
| 15:12 | Support tags the ticket as "billing" and routes to billing team. _(Misroute — should have been engineering.)_ |
| 15:34 | Billing engineer notices three similar tickets, escalates to engineering. |
| 15:41 | On-call engineer reproduces the bug in staging using the customer's quote data. |
| 15:58 | Decision: disable the acceptance endpoint via feature flag (`quote.accept` → off). |
| 16:01 | Feature flag toggled. Endpoint returns `503 Service Unavailable` with retry-after header. |
| 16:18 | Root cause identified: missing clock injection in `accept-quote.use-case.ts`. |
| 16:35 | Hotfix branch created, regression test added (§92), fix applied. |
| 16:44 | Hotfix merged and deployed; feature flag re-enabled. |
| 17:30 | Manual cleanup begins: 12 SOWs created from expired quotes are voided. |
| 18:15 | All affected customers notified via email. |
| 18:42 | All-clear declared. |

---

## Root cause

_The mechanical chain of events from cause to symptom. Refer to §93. Be specific about layers, files, and decisions._

Example:
> The `isExpired` function in `src/application/use-cases/accept-quote.use-case.ts:34` called `new Date()` directly instead of the injected `clock.now()` port (§25 violation). In production, the server timezone (UTC) and the client-sent `expiresAt` timestamps could drift by 0-5 minutes due to NTP behavior under load. Quotes within that drift window passed the expiry check incorrectly, allowing acceptance.
>
> The drift was non-deterministic but persistent: it accumulated over the lifetime of the Node process and was reset by deployment. Because deploys had been frequent enough during the testing window, the bug never surfaced in pre-production environments.

---

## Contributing factors

_What else made this possible? Code, process, organization, tooling, training. Multiple contributors usually exist; surface them all without blame._

- **Code:** The test suite for `accept-quote.use-case.ts` used `new Date()` directly instead of a fake clock, so removing the clock injection passed CI.
- **Process:** PR #88 (the introducing change) was reviewed as a "cleanup" without explicit attention to test fixture realism.
- **Tooling:** No linter or rule enforced §25 ("Do not hide time") at PR time. The rule existed in `AGENTS.md` but had no automated guard.
- **Observability:** Logs did not record the values of `expiresAt` and `clock.now()` at the moment of comparison, slowing diagnosis.
- **Training:** Newer team members were unaware of §25 as a hard rule.

---

## Detection

- **How did we detect it?** _Customer ticket / automated alert / proactive monitoring / chance_
- **How long after the first impact?** _Time between first user impact and team awareness_
- **How could detection have been faster?** _Be specific — what signal would have caught it earlier?_
- **What alerts existed but didn't fire?** _List relevant monitors and why they didn't catch it_

---

## Response

- **Who responded?** _Roles only (on-call engineer, support lead, etc.). Not blame; just composition._
- **Was the response coordinated effectively?** _What worked, what didn't?_
- **Were escalations timely?** _Was the right severity attached, were the right people brought in?_
- **What slowed us down?** _Tooling gaps, missing access, unclear ownership, etc._

---

## Recovery

- **What was the mitigation?** _Feature flag, rollback, throttle, manual intervention_
- **What was the fix?** _PR(s) that landed the actual remediation_
- **Was data cleanup needed?** _What was done, by whom, with what verification_
- **Were customers contacted?** _Who, when, by what channel, with what message_

---

## What went well

_At least three things. The blameless review acknowledges good response patterns that should be reinforced._

- _Example: Feature flag was in place and toggled in under 20 minutes._
- _Example: The on-call engineer found the staging reproduction within 17 minutes._
- _Example: Customer communication template was ready and personalized quickly._

---

## What went badly

_At least three things. Focus on systems and patterns. No names._

- _Example: Misroute through billing delayed engineering escalation by 22 minutes._
- _Example: No automated linter enforced §25; the bug shipped on the basis of human review alone._
- _Example: Logs at the comparison site did not capture the values needed to diagnose. Required local reproduction with synthetic data._

---

## Lessons learned

_The "so what?" of the postmortem. Pattern-level insights that should change how the team operates, beyond just fixing this one bug._

- _Example: Rules in `AGENTS.md` that affect runtime behavior need a mechanical guard (linter, custom ESLint rule, AST check). Documentation alone is not sufficient._
- _Example: When a refactor removes a dependency injection, the corresponding test fixture should be updated to match. We need a checklist or skill for this._
- _Example: Logs at boundary comparisons (time, identity, authorization) should always include both compared values, even when the comparison passes. Asymmetric logging is the diagnostic dark matter._

---

## Action items

_Concrete, owned, dated. Each action item is a separate GitHub issue. Closing the postmortem requires all action items to be created and assigned; closing each action item requires its issue to be resolved._

| # | Action | Owner | Due | Issue | Status |
|---|---|---|---|---|---|
| 1 | Add ESLint rule banning `new Date()` outside `infrastructure/adapters/clock` | _team or person_ | _YYYY-MM-DD_ | _#NNN_ | _Open_ |
| 2 | Add boundary logging for time comparisons in `accept-quote`, `expire-listing`, `cancel-sow` | _team or person_ | _YYYY-MM-DD_ | _#NNN_ | _Open_ |
| 3 | Fix the four other §25 violations identified during /debug Step 2b | _team or person_ | _YYYY-MM-DD_ | _#NNN_ | _Open_ |
| 4 | Update support routing playbook to detect "billing" tickets that are actually quote-acceptance bugs | _team or person_ | _YYYY-MM-DD_ | _#NNN_ | _Open_ |
| 5 | Add §25 to the new-hire onboarding checklist and code review training | _team or person_ | _YYYY-MM-DD_ | _#NNN_ | _Open_ |

---

## Related artifacts

- **Regression test:** _path/to/test.ts_
- **Bisect log (§96):** _link to PR description with the bisect output_
- **Original PR that introduced the bug:** _#NNN_
- **Fix PR:** _#NNN_
- **Customer communications:** _link to the email/status-page entry_
- **Compliance reports filed:** _if applicable_

---

## Signoff

- [ ] Authors agree this captures the incident accurately.
- [ ] At least one reviewer outside the immediate response team has approved.
- [ ] All action items are created as GitHub issues with owners.
- [ ] Linked from `docs/audit/incidents.md` (the auto-generated index).
- [ ] Retention period set (minimum 7 years for production incidents).

_Approved by: _____________________ on _______________

---

> **Reminder of the blameless principle:** This document exists so we improve as a system. If at any point during writing or reading you feel the urge to assign individual blame, rewrite that sentence to describe the system gap that allowed any reasonable engineer to make the same choice. That is the postmortem we want to keep.
