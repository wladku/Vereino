---
title: "A response that gains a field breaks every exact key-list assertion, including tests main added after the branch was cut"
modules: ["activities", "communication"]
areas: ["testing", "spec-pr"]
topics: ["integration-tests", "public-api", "parallel-agents", "merge-main", "contract-tests"]
---

# A response that gains a field breaks every exact key-list assertion, including tests main added after the branch was cut

**Context**: PR #175 (#136) added `gatheringAt` to the public session API `GET /api/activities/public/{clubSlug}/sessions/{occurrenceId}` and updated TEST-M08's exact key list. Journey J-003, merged to `main` while the PR was open, asserts the same exact key list (`Object.keys(session).sort()` against the DD-17 fields). After `main` was merged into the branch, CI `integration` failed in J-003 only: `+ "gatheringAt"`.

**Problem**: An exact key-list assertion is deliberate (it proves the public page leaks nothing beyond the allowed fields), so every test that pins the shape must change with the contract. A grep run when the branch was cut cannot see tests that land on `main` later, and GitHub's mergeability check does not run them.

**Rule**: When a PR widens a response that tests pin by exact keys, grep the test tree for the old key list again after every merge of `main` (`rg "'occurrenceDate', 'startAt'" packages/app/.ai/qa/tests`) and update each hit to the new allowed set, adding an assertion on the new field's value for that test's data (for example `gatheringAt: null`). Never loosen the exact-keys check to `toMatchObject` to make it pass.

**Applies to**: public and sessionless routes (`activities/api/public/**`, `club_core` public blocks), journey tests under `packages/app/.ai/qa/tests/journeys/`, and any PR adding a field to a response with a DD-17-style allowed-fields rule.
