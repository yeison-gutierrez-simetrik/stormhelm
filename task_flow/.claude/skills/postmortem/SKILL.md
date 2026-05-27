---
name: postmortem
description: |
  Generates a postmortem document from incident artifacts: Ralph session logs,
  PR history, monitoring outputs, response timeline. Produces a draft following
  .claude/skills/postmortem/references/postmortem-template.md that the human reviewer finalizes. Required by
  §95 for P0 and user-facing P1 incidents within 5 / 10 business days.
  Use when: P0 incident resolved, P1 incident with user impact resolved, or a
  near-miss the team agreed to learn from.
---

# /postmortem — Incident Postmortem Draft

## Purpose

§95 requires a postmortem for P0 and user-facing P1 incidents within 5 / 10 business days. Writing them by hand is repetitive, lossy (responders forget the timeline), and often skipped under post-incident exhaustion. `/postmortem` produces a **structured draft** from the artifacts the system already has — Ralph session logs, PR descriptions, monitoring data, support tickets — leaving the human to fill in judgment (blameless framing, lessons learned, action items).

The draft is **never the final document**. A human reviewer always closes it out.

## When to invoke

The trigger is **production impact**, not severity nominal. Specifically:

- The issue carries the label `incident:production` (set by `/triage`).
- AND severity is P0 → mandatory within 5 business days per §95.
- OR severity is P1 with user-facing impact → mandatory within 10 business days per §95.
- For a near-miss the team explicitly agrees to learn from → optional but encouraged.

**Critical distinction:** a P0 bug **detected in staging** before reaching production does NOT need a postmortem. The framework rewards catching things early — not punishing the catch with paperwork. §95 enforcement is gated on `incident:production`, not on severity alone.

## When NOT to invoke

- For internal P2 bugs (§95 says optional; usually not worth the ceremony).
- Mid-incident (write postmortem after, not during).
- Without artifacts (if there are no Ralph logs, no PR, no monitoring — the postmortem will be hollow).

## Inputs

- Incident identifier (issue number, ticket, or date).
- `.planning/ralph-sessions/issue-NNN-*.log` (structured logs per §69 if Ralph was involved).
- Fix PR(s) and their descriptions.
- Monitoring / alerting timestamps (if available).
- Support tickets related to the incident.

## Outputs

- A draft file at `docs/postmortems/<YYYY-MM-DD>-<incident-slug>.md` following `.claude/skills/postmortem/references/postmortem-template.md` structure.
- A signoff section explicitly marked as **incomplete** (humans fill it).
- Optionally: a comment on the original incident issue with a link to the draft.

## Workflow

### Step 1 — Gather artifacts

For the incident identifier, locate:

- The original issue / ticket.
- All Ralph session logs that touched the affected paths around the incident time.
- All PRs merged in the affected window (use `gh pr list --search "merged:>=DATE"`).
- Monitoring dumps (Datadog, NewRelic, or wherever — manual collection by human if no MCP).
- Support tickets (Zendesk, JIRA Service Desk).

If any critical artifact is missing → flag, ask the human, do not fabricate.

### Step 2 — Reconstruct the timeline

From the artifacts, build the timeline:

- **First user impact:** earliest 5xx error in monitoring, or earliest support ticket.
- **Detection:** first internal alert OR first support escalation reaching engineering.
- **Mitigation:** when traffic was shed, feature flag flipped, or rollback initiated.
- **Resolution:** when the real fix landed in production.
- **All-clear:** when monitoring returned to baseline.

Each event in the timeline cites its source artifact (log file, ticket ID, PR number).

### Step 3 — Identify root cause (from `/debug` output)

If the incident already had a `/debug` invocation, its report contains the root cause section. Lift verbatim into the postmortem.

If `/debug` was not used (manual fix), prompt the human to summarize root cause in 2-3 sentences. The draft inserts a TODO marker until filled.

### Step 4 — Identify contributing factors

From the timeline and artifacts, infer contributing factors:

- **Code:** was a rule violated that ESLint should have caught?
- **Process:** was a PR merged without `/run-acceptance`?
- **Tooling:** did monitoring fire too late?
- **Observability:** were logs missing data needed to diagnose?
- **Training:** was a rule unknown to the responder?

The draft proposes these; the human refines.

### Step 5 — Quantify impact

From artifacts:

- Users affected (count from monitoring or DB query).
- Requests affected (count).
- Data integrity (was data lost / corrupted? Inferred from PRs and incident summary).
- Financial impact (refunds, lost revenue — flag for human if unknown).

### Step 6 — Write the draft using TEMPLATE.md

Copy `.claude/skills/postmortem/references/postmortem-template.md` to `docs/postmortems/<YYYY-MM-DD>-<slug>.md`. Fill every section the agent can fill from artifacts. Leave TODOs in sections requiring human judgment:

- **Lessons learned** (TODO: human).
- **Action items** (TODO: human — agent suggests but does not commit).
- **Blameless framing review** (TODO: human reviewer outside response team).

### Step 7 — Suggest action items (but do not assign)

From contributing factors, suggest candidate action items:

```markdown
## Action items (DRAFT — human to confirm, assign, and date)

| # | Action | Owner (TBD) | Due (TBD) | Issue (TBD) |
|---|---|---|---|---|
| 1 | Add ESLint rule banning `new Date()` outside infrastructure/adapters/clock | _team_ | _YYYY-MM-DD_ | _#TBD_ |
| 2 | Improve boundary logging for time comparisons | _team_ | _YYYY-MM-DD_ | _#TBD_ |
| 3 | Update support routing for "billing" tickets that are actually quote bugs | _team_ | _YYYY-MM-DD_ | _#TBD_ |
```

The agent never assigns owners or dates — those are human decisions.

### Step 8 — Save with signoff section incomplete

The draft is saved with the signoff section explicitly marked **incomplete**:

```markdown
## Signoff

- [ ] Authors agree this captures the incident accurately.
- [ ] At least one reviewer outside the immediate response team has approved.
- [ ] All action items are created as GitHub issues with owners.
- [ ] Linked from `docs/audit/incidents.md`.
- [ ] Retention period set (minimum 7 years for production incidents per C.8).

**STATUS: DRAFT — pending human review and finalization.**
```

### Step 9 — Return path

```markdown
## /postmortem output

**Incident:** #142 — Quote expiry bypass
**Draft path:** docs/postmortems/2026-05-20-quote-expiry-bypass.md
**Sections filled by agent:** Metadata, Summary, Impact, Timeline, Detection, Response, Recovery
**Sections requiring human:** Lessons learned, Action items (suggestions provided), Blameless review

Next: human reviewer reads, refines, assigns action items, signs off. Once signed,
add to docs/audit/incidents.md.
```

## Integration with the framework

- **Required by §95** for P0 and user-facing P1 incidents.
- **Reads `.planning/ralph-sessions/` (§69 structured logs)**.
- **Output retained per C.8** (constitution — typically 7 years for compliance).
- **Linked from traceability matrix (§62)** so future audits can find incident → scenarios that now prevent recurrence.
- **Future**: when §115 is implemented, this skill is replaced by the `postmortem-writer` agent (deeper context freshness, separate session). Until then, this skill is the operational fallback.

## What this skill never does

- Assign owners to action items (humans do).
- Skip the blameless framing pass (the TEMPLATE enforces it).
- Mark the postmortem as complete (only signed-off humans do).
- Invent timeline events (every event cites an artifact).
- Modify the underlying code (read-only analysis).
