# status: approved
# approved_by: approver@example.com

Feature: List
  @scn-002 @release
  Scenario: a caller lists items
    Given an authenticated caller
    When they request the list
    Then the items are returned
