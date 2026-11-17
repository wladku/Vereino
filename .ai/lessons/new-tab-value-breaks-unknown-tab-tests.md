---
title: "Adding a ?tab= value breaks tests that used it as the unknown tab: grep the tests and use ?tab=unknown"
modules: ["people", "payments"]
areas: ["testing", "backend-ui"]
topics: ["tabs", "url-state", "integration-tests"]
---

# Adding a ?tab= value breaks tests that used it as the unknown tab: grep the tests and use ?tab=unknown

**Context**: PR #344 (#295) added the person record's "Charges" tab (`PERSON_RECORD_TABS` gained `charges`). Integration shard 3/3 then failed in `E06-S02-person-record-tabs.spec.ts`: it opened `?tab=charges` to prove that an unknown tab falls back to Details, and the administrator now got the Charges tab instead.

**Problem**: A fallback test that picks a plausible future tab name as its "unknown" value turns red the day that tab ships, in a test the new PR never touched and a focused `--filter` run of the new tests does not cover.

**Rule**: A test for the unknown-tab fallback uses `?tab=unknown`, never a name a later feature could claim. When you add a value to a `?tab=` list, grep `.ai/qa/tests` for `tab=<value>` and fix every test that used it as the unknown value.

**Applies to**: every page with URL-backed tabs (`PERSON_RECORD_TABS` in `packages/app/src/modules/people/components/client-helpers.ts`, `club_core` tab pages) and their integration tests under `packages/app/.ai/qa/tests`.
