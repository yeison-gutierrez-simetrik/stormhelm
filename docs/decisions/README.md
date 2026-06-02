# `docs/decisions/` — durable rationale, always tracked

This directory holds the **rationale** behind design decisions: why an option was picked, what alternatives were considered, who decided, when, and what assumptions were active. Everything in here is version-controlled, no exceptions.

## Why this exists (and why `.planning/` doesn't replace it)

Stormhelm originally wrote rationale to `.planning/grilling/`, `.planning/open-questions/`, and `.planning/clarify-logs/` (the historical pre-PR-I paths). Real use surfaced a contradiction: the `reviewer` sub-agent (§114) and the audit trail (§62 traceability) need this rationale, but projects often add `.planning/` to `.gitignore` as a scratchpad pattern — losing the rationale on the next clean clone, machine swap, or contributor handoff. Auditors / new hires / future Claude sessions cannot reconstruct *why* without it.

`docs/decisions/` lives **inside `docs/`**, which projects always track. The rationale follows the code.

## Structure

```
docs/decisions/
├── README.md             — this file
├── grilling/             — transcripts from /grill-me sessions (MCQ + rationale)
│   └── <slug>-<YYYYMMDD>.md
├── open-questions/       — questions deferred to stakeholders, with status
│   └── <slug>-open.md
└── clarify-logs/         — /clarify pass outputs (focused interrogation of the spec)
    └── <slug>-<YYYYMMDD>.md
```

ADRs continue to live in `docs/adr/`; they're the **decisions**, while `docs/decisions/` is the **deliberation trail** that led to those decisions. The two complement each other.

## What goes where — quick reference

| Artifact | Path | Created by | Read by |
|---|---|---|---|
| Grilling transcript | `docs/decisions/grilling/<slug>-<date>.md` | `/grill-me` | `reviewer` agent, future `/grill-me` re-runs |
| Open questions log | `docs/decisions/open-questions/<slug>-open.md` | `/grill-me`, `/clarify` | Stakeholders, audit |
| Clarify log | `docs/decisions/clarify-logs/<slug>-<date>.md` | `/clarify` | `reviewer`, `/check-consistency` |
| ADR | `docs/adr/NNNN-<slug>.md` | Human / `/sad` | Everyone |
| Spec | `docs/specs/<feature>.md` | `/specify` | `/to-scenarios`, `/tdd`, audit |
| Threat model | `docs/threat-models/<scope>-<date>.md` | `/security-hardening` | `reviewer`, audit |

## What still lives in `.planning/`

Genuinely **ephemeral** artifacts — overnight Ralph session logs, prototype scratch code, partial dry-runs that nobody will read after the session ends:

```
.planning/
├── ralph-sessions/<YYYYMMDD>-<run-id>.ndjson    — overnight loop telemetry
├── prototypes/<slug>/                           — throwaway code (§99)
├── acceptance/                                  — /run-acceptance per-PR reports (kept until merge, then archived)
├── reviews/                                     — reviewer agent reports (kept until PR is merged)
└── traceability/                                — draft matrices pre-merge
```

The split is honest about lifecycle: `docs/decisions/` is **forever**, `.planning/` is **until the slice merges or the session ends**.

## `.gitignore` recommendation

When `/setup` scaffolds a new project, it writes a `.gitignore` that explicitly excludes `.planning/ralph-sessions/`, `.planning/prototypes/<slug>/` (scratch), and `.planning/reviews/`, but **does not** exclude `docs/decisions/` or any other `docs/` subdirectory. If you ever feel tempted to add `.planning/` blanket-style, prefer the specific paths above.

## §22-adjacent note

The terms in this README (Grilling, Open Question, Clarify Log, ADR) are part of the framework's ubiquitous language. They are referenced by skills and the `reviewer` agent. If you rename a section here, propagate the rename to those consumers (`/check-consistency` and `scripts/check-framework-metadata.mjs` will detect drift).
