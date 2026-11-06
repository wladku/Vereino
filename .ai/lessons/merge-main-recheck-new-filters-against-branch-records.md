---
title: "After merging main, re-check main's new filters against the records your branch starts writing"
modules: ["communication"]
areas: ["module-data", "testing"]
topics: ["merge-main", "parallel-agents", "query-filters", "data-scoping"]
---

# After merging main, re-check main's new filters against the records your branch starts writing

**Context**: PR #177 (#138) adds member direct threads that carry the group's `section_id` and `group_id` (DD-M18). In parallel, #168 (#102) landed on `main` a guardian's ward filter (`wardId`) that matched every thread with `t.group_id` in the ward's groups. Both PRs were green on their own and the merge had no textual conflict in `data/queries.ts`, yet after the merge a direct thread about one sibling lists under the other sibling's filter whenever both are in the same group. Narrowing the filter to participants in the merge failed TEST-M12: a ward without an account is not a participant of a thread about them, and the thread stores no subject, so the filter cannot tell the siblings apart without a schema or product decision.

**Problem**: A filter written on `main` assumes the record shapes `main` knows. A branch that starts writing a new kind of record (here a `direct` thread with a `group_id`) silently falls into it. Git merges such files cleanly, and neither branch's tests cover the combination.

**Rule**: When merging `main` into a branch that adds a new record kind or fills a column for a new case, list the queries and filters `main` added since the branch was cut (`git diff <merge-base> origin/main -- '**/data/queries.ts' '**/api/**'`) and check each one against the new records. Fix the filter in the merge only when the records already carry what it needs, and prove it with the combined case in the branch's own integration test; when they do not (a column, a migration or a visibility change would be needed), keep `main`'s behaviour and file a follow-up issue instead of guessing.

**Applies to**: `packages/app/src/modules/*/data/queries.ts`, list filters on `GET` routes, every `merge main` step of `om-auto-fix-pr` and `om-auto-continue-pr`.
