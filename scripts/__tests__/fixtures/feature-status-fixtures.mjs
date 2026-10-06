// Shared fixtures for the `# status:` reader (scripts/parse-feature-status.mjs).
// Used by check-skipped-release-scn.test.mjs (lint ⇆ cucumber.mjs parity, and the
// reader checked against the real Gherkin parser's golden output) and by
// gen-gherkin-oracle.mjs, which regenerates that golden. Each fixture: `body`
// (lines), `expect` (the lines both parsers report), `reads` (the status the
// runner reads), optional `eol`.

export const notes = Array.from({ length: 10 }, (_, i) => `# note ${i + 1}`);
export const PARITY = [
  { name: 'header-only status', expect: [], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'status after Feature:', expect: [4], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'status after a tag line', expect: [3], reads: 'approved',
    body: ['# status: approved', '@release', '# status: implemented', 'Feature: X', '  @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'no status at all (legacy = implemented)', expect: [], reads: null,
    body: ['Feature: X', '', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // The header is the leading comment block, however long: a status on line 11
  // is still THE header status and is read (the old 10-line read window left
  // it unread, so the feature ran as legacy — FU-134 review).
  { name: 'status on line 11, still in the leading comment block', expect: [], reads: 'approved',
    body: [...notes, '# status: approved', 'Feature: X', '', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // FU-134 review: the header ends at the first non-comment line, whatever the
  // keyword (`Ability:` / `Business Need:` are English synonyms of `Feature:`).
  { name: 'Ability: keyword ends the header like Feature:', expect: [3], reads: 'approved',
    body: ['# status: approved', 'Ability: X', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'status trailing a tag line', expect: [3], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '  @release @scn-1 # status: implemented', '  Scenario: s', '    Given g'] },
  // A docstring (a fence right under a step) is data: a `# status:` inside one
  // is never a declaration.
  { name: 'docstring content is data, not a status', expect: [], reads: 'implemented',
    body: ['# status: implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given a payload',
      '      """', '      # status: approved', '      """', '    And a json payload', '      ```json', '      # status: draft', '      ```'] },
  // The `# status:` key is reserved for the header's status line: any other
  // `# status:` comment is reported, whatever it says (the FU-134 review: a
  // state-word filter let `# status: done` through, which main flagged).
  // Prose uses another word (`# Note: flaky on CI`).
  { name: 'a `# Status:` comment after the header is reported, whatever it says', expect: [3], reads: 'implemented',
    body: ['# status: implemented', 'Feature: X', '  # Status: flaky on CI, see #12', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'mid-file `# status: done` (not a state word) is still reported', expect: [4], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '', '  # status: done', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // A fence in a description is plain text — only a fence under a step opens a
  // docstring (the review: an unbalanced ``` in a description hid everything after it).
  { name: 'a fence in the Feature description is text, not a docstring', expect: [4], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '  ```', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'prose after the state word in the header', expect: [], reads: 'implemented',
    body: ['# status: implemented (scn-042 delivered — issue #12)', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'indented header status is read', expect: [], reads: 'approved',
    body: ['  # status: approved', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'a UTF-8 BOM before the header status', expect: [], reads: 'approved',
    body: ['﻿# status: approved', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // Review round 3: a Feature/Rule description line may start with a step word
  // ("But only within 30 days:") — it is prose there, so a fence after it is
  // text, not a docstring that would hide everything below it.
  { name: 'a step-like description line does not open a docstring', expect: [5], reads: 'approved',
    body: ['# status: approved', 'Feature: Refunds', '  But only within 30 days, e.g.:', '  ```', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // Review round 3: near-miss spellings of the key are status lines too.
  { name: 'near-miss keys after the header (`##`, `# status :`) are reported', expect: [3, 4], reads: 'approved',
    body: ['# status: approved', 'Feature: X', '  ## status: implemented', '  # Status : implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'a near-miss key in the header is read as the status', expect: [], reads: 'approved',
    body: ['## status: approved', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { name: 'CRLF line endings', expect: [4], reads: 'approved', eol: '\r\n',
    body: ['# status: approved', 'Feature: X', '', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // FU-134 review round 4: feature files are English Gherkin. A `# language:`
  // other than `en` is reported — the readers only know English keywords, so a
  // non-English feature would otherwise pass the §130b check unindexed.
  { name: 'a non-English `# language:` header is reported', expect: [1], reads: 'approved',
    body: ['# language: de', '# status: approved', 'Funktionalität: X', '  @release @scn-1', '  Szenario: s', '    Angenommen g'] },  // FU-135 — an EXTRA `# status:` line inside the header block. The runner
  // reads the first non-empty one only, so a flip written as a new line
  // (`approved` + `implemented`) leaves the feature skipped. The key is reserved:
  // every other `# status:` line in the header is flagged, whatever it says.
  { fu: 'FU-135', name: 'duplicate header status, conflicting (approved then implemented)', expect: [2], reads: 'approved',
    body: ['# status: approved', '# status: implemented', 'Feature: X', '', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'duplicate header status, same value (a latent flip trap)', expect: [3], reads: 'approved',
    body: ['# language: en', '# status: approved', '# status: approved', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'indented duplicate inside the header', expect: [2], reads: 'approved',
    body: ['# status: approved', '  # status: implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'the duplicate is anchored on the line the runner reads (indented first)', expect: [2], reads: 'implemented',
    body: ['  # status: implemented', '# status: approved', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'duplicate past the old 10-line window', expect: [11], reads: 'approved',
    body: [...notes.slice(0, 9), '# status: approved', '# status: implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'duplicate header status AND a mid-file one', expect: [2, 5], reads: 'approved',
    body: ['# status: approved', '# status: approved', 'Feature: X', '', '  # status: implemented', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'an empty status line next to a real one', expect: [1], reads: 'approved',
    body: ['# status:', '# status: approved', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'a second `# Status:` line in the header is an extra, whatever it says', expect: [2], reads: 'approved',
    body: ['# status: approved', '# Status: reviewed by legal on 2026-09-30', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // Prose ABOVE the real status line is what gets read — reported as an invalid
  // value, and the real line as the extra (the runner reads line 1).
  { fu: 'FU-135', name: 'a prose `# Status:` line above the real one is read (invalid) and the real one is the extra', expect: [1, 2], reads: 'reviewed',
    body: ['# Status: reviewed by legal', '# status: implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // A flip written INTO the line is read as its first word: an arrow of any shape
  // leading to a state word, `to`/`then` + a state, or a bare second state word.
  { fu: 'FU-135', name: 'a transition written into the status line (approved → implemented)', expect: [1], reads: 'approved',
    body: ['# status: approved → implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'a transition in another notation (approved --> implemented)', expect: [1], reads: 'approved',
    body: ['# status: approved --> implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'a transition with a word between the arrow and the state (approved → now implemented)', expect: [1], reads: 'approved',
    body: ['# status: approved → now implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'a bracketed transition (approved (→ implemented))', expect: [1], reads: 'approved',
    body: ['# status: approved (→ implemented)', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'a spelled transition (approved to implemented)', expect: [1], reads: 'approved',
    body: ['# status: approved to implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'a bare second state word (approved implemented)', expect: [1], reads: 'approved',
    body: ['# status: approved implemented', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // Prose after the state word stays legal, even when it names another state, as
  // long as no arrow leads to one (the review: each of these was a false failure).
  { fu: 'FU-135', name: 'prose after the state that mentions another state is legal', expect: [], reads: 'implemented',
    body: ['# status: implemented (approved by the operator, §58 ratified)', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'a dash before prose that names a state is legal (implemented — approved by ops)', expect: [], reads: 'implemented',
    body: ['# status: implemented — approved by ops', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'a bracketed note that names a state is legal (implemented [approved in #12])', expect: [], reads: 'implemented',
    body: ['# status: implemented [approved in #12]', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'prose that starts with a state-like word is legal (approved Draft-era scns removed)', expect: [], reads: 'approved',
    body: ['# status: approved Draft-era scns removed', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  // FU-135 — the header VALUE. The status is the first token of the line; the
  // readers agree only when it is exactly a §58 state word, so anything else is
  // flagged.
  { fu: 'FU-135', name: 'header value with trailing punctuation (implemented.)', expect: [1], reads: 'implemented.',
    body: ['# status: implemented.', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'header value outside the §58 states (in-progress)', expect: [2], reads: 'in-progress',
    body: ['# language: en', '# status: in-progress', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'quoted header value', expect: [1], reads: '"implemented"',
    body: ['# status: "implemented"', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'empty header value (not read: the feature would run as legacy)', expect: [1], reads: null,
    body: ['# status:', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'retired is a §58 state', expect: [], reads: 'retired',
    body: ['# status: retired', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
  { fu: 'FU-135', name: 'a duplicate with an invalid value is reported once', expect: [2], reads: 'approved',
    body: ['# status: approved', '# status: implemented.', 'Feature: X', '  @release @scn-1', '  Scenario: s', '    Given g'] },
];

// Scenario-tag fixtures for the §130b index (effective tags: Feature/Rule
// inheritance, Example:/Scenario Template:, an Examples block's own tags,
// comment-split tag blocks). `release` maps each scn to whether a @release run
// selects it — checked against the real Gherkin parser's pickles.
export const INDEX = [
  { name: 'Feature-level @release is inherited',
    body: ['# status: approved', '@release', 'Feature: X', '', '  @scn-1', '  Scenario: a', '    Given g'] },
  { name: 'Rule-level @release is inherited',
    body: ['# status: approved', 'Feature: X', '', '  @release', '  Rule: r', '', '    @scn-2', '    Example: b', '      Given g'] },
  { name: 'only the Examples block carries @release',
    body: ['# status: approved', 'Feature: X', '', '  @scn-3', '  Scenario Outline: c <n>', '    Given <n>', '', '    @release', '    Examples:', '      | n |', '      | 1 |'] },
  { name: 'a comment inside a tag block, and Scenario Template:',
    body: ['# status: approved', 'Feature: X', '', '  @release', '  # a note', '  @scn-4', '  Scenario Template: d <n>', '    Given <n>', '    Examples:', '      | n |', '      | 1 |', '', '  @smoke @scn-5', '  Scenario: e', '    Given g'] },
];
