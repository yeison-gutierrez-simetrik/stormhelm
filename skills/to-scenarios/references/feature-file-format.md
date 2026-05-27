# `.feature` File Format

`/to-scenarios` writes one `.feature` file per bounded context the feature touches. Files live in `features/<context>/` (per §56). Each scenario carries a stable `scn-NNN` ID and a runtime tag that decides when it runs.

## Template

```gherkin
# language: en
# generated-by: /to-scenarios
# spec: docs/specs/<feature-slug>.md
# status: draft | approved

@feature:<feature-slug>
Feature: <Short feature title from the spec>

  As a <Actor>
  I want to <do X>
  So that <outcome>

  Background:
    Given <prerequisite shared by every scenario in this file>

  @release @scn-001 @actor:<role>
  Scenario: <one observable behavior in business language>
    Given <state precondition in domain vocabulary>
    When <single user-facing action>
    Then <single observable outcome>
    And <additional observable outcome>

  @release @scn-002 @actor:<role>
  Scenario Outline: <parameterized behavior>
    Given <prerequisite>
    When <action with <param>>
    Then <outcome with <expected>>

    Examples:
      | param   | expected     |
      | input-a | outcome-a    |
      | input-b | outcome-b    |
```

## Tag vocabulary (authoritative)

| Tag | Meaning |
|---|---|
| `@release` | Must pass for the release to ship. Default for feature scenarios. |
| `@smoke` | Subset that runs on every push for fast feedback. |
| `@manual` | Cannot be automated cost-effectively; requires human verification. Logged in `docs/audit/`. |
| `@scn-NNN` | Stable ID. Once assigned, never reused even if the scenario is deleted (treat as immutable). |
| `@actor:<role>` | The actor's role from the spec — used by `/security-hardening` to scope authorization checks. |
| `@feature:<slug>` | Top-of-file tag linking back to the spec; used by `/traceability-matrix`. |

## Rules (excerpts from §56-§62)

- **`scn-NNN` IDs are stable across versions.** Renaming or renumbering breaks `/traceability-matrix`.
- **One observable behavior per scenario.** If a scenario has multiple `When` lines or multiple distinct `Then` outcomes, split it.
- **Vocabulary matches `CONTEXT.md`.** No invented domain terms in `Given/When/Then` lines.
- **Drafts require human approval before they are authoritative.** `/to-scenarios` writes `status: draft`; a human flips it to `approved` after review (§58). Ralph never modifies an approved `.feature` file.
- **Scenarios are the AFK gate.** Ralph (`shift:afk`) only consumes issues that carry `scenarios:scn-NNN` labels (§63).

## Workflow position

- Input: `docs/specs/<feature-slug>.md` with `Status: Clarified`.
- Output: `features/<context>/<feature-slug>.feature` with `status: draft`.
- Next: human checkpoint #1 (`/feature` Step 7.5). Once approved, `/to-issues` consumes the scenarios as the per-issue acceptance gate.
- Downstream: `/run-acceptance` executes the scenarios; `/traceability-matrix` audits them at release.
