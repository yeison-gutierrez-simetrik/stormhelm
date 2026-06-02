# status: approved
# approved_by: approver@example.com

Feature: Authentication
  @scn-001 @release
  Scenario: a user signs in
    Given a registered user
    When they authenticate
    Then a session is issued
