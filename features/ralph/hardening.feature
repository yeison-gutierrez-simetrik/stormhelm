Feature: Ralph hardening — operational discipline

  As a developer running the Night Shift,
  I need Ralph to refuse unsafe operations, log every action in structured form,
  invoke the reviewer agent before opening PRs, manage its own blocked state,
  and survive transient API failures
  So that I can trust an overnight session to either ship a draft PR or
  leave the issue cleanly blocked with enough information to diagnose.

  Background:
    Given Stormhelm is installed in the project
    And the .claude/settings.json file is configured per /setup
    And the templates/ralph-local.sh script is present and executable

  @release
  Scenario: scn-r01 Ralph rejects an issue without all required labels
    Given a GitHub issue #500 with labels "ralph-ready" and "budget:50k"
    And the issue lacks any label matching "scenarios:scn-*"
    When I run "./templates/ralph-local.sh 500"
    Then the script exits with code 1
    And no branch named "agent/feature-*" is created locally or on origin
    And no commit is written to the repository
    And the stderr contains a message referencing the missing scenarios label

  @release
  Scenario: scn-r02 Successful iteration produces a draft PR with reviewer report
    Given a GitHub issue #501 with valid labels and a passing /run-acceptance result
    And the reviewer agent reports no blocking findings on the diff
    When I run "./templates/ralph-local.sh 501 30" and the loop completes successfully
    Then a draft pull request is opened referencing issue #501
    And the PR body contains a section titled "Reviewer report"
    And the PR body contains the count of iterations consumed
    And the PR body contains the path to the session log file
    And the PR is in draft state (not ready-for-review)

  @release
  Scenario: scn-r03 Exceeded max-iterations applies ralph-blocked label
    Given a GitHub issue #502 with valid labels
    And a scenario that the agent cannot satisfy in 2 iterations
    When I run "./templates/ralph-local.sh 502 2" and iterations are exhausted
    Then the issue gains the label "ralph-blocked"
    And the issue loses the label "ralph-ready"
    And a comment is posted on the issue containing the substring "Ralph blocked"
    And the comment contains the iterations count
    And the comment contains the last 5 actions extracted from the session log
    And the comment contains the path to the session log file
    And the branch "agent/feature-*-502" still exists locally (not deleted)

  @release
  Scenario: scn-r04 Destructive git operations are blocked at the hook layer
    Given the git-guardrails hook is installed via .claude/settings.json
    When the agent attempts the Bash command "git push --force-with-lease origin agent/feature-test"
    Then the hook returns exit code 2
    And the hook's stderr explains that destructive git operations are blocked per §68
    And the actual git command is not executed
    And a "ralph.git.action" event with status "blocked" is appended to the session log

  @release
  Scenario: scn-r05 Session log is structured NDJSON with one event per line
    Given a completed Ralph session for issue #503
    Then a file exists at ".planning/ralph-sessions/503-*.log"
    And every non-empty line of the file parses as JSON via "jq -c '.'"
    And every line contains the required fields "timestamp", "level", "event", "sessionId", "issueNumber"
    And the file contains at least one event of type "ralph.session.started"
    And the file contains at least one event of type "ralph.session.ended"

  @release
  Scenario: scn-r06 HTTP 429 triggers exponential backoff and the session survives
    Given a stubbed claude CLI that returns HTTP 429 on the first 3 invocations
    And returns success on the 4th invocation
    When the script reaches a call site that invokes claude
    Then the script sleeps for approximately 1 second after the first 429
    And approximately 2 seconds after the second 429
    And approximately 4 seconds after the third 429
    And the 4th invocation succeeds
    And the session log contains exactly 3 events of type "ralph.api.rate_limited"
    And the session continues without applying "ralph-blocked"

  @nice-to-have
  Scenario: scn-r07 Session log is consumable by /postmortem
    Given a session log at ".planning/ralph-sessions/504-*.log"
    When I invoke "/postmortem" against issue #504
    Then the postmortem skill ingests the log without errors
    And the resulting postmortem draft includes the budget consumed
    And the resulting postmortem draft includes the failing scenario IDs
