# Run: spec for many clubs on one instance (#627)

- **Goal and trigger:** cezar task 14bb8531 (`om-auto-fix-issue 627`, label `cezar`). The issue asks for a design-only spec PR through `om-auto-write-spec`, with the owner's choices left as Open Questions.
- **Issue / epic / branch:** #627 (E22-S01), epic #626, decision D-034 (recorded in PR #635, not yet on `main`); branch `docs/issue-627-many-clubs-one-instance`.
- **Started / finished:** 2026-11-22.

## Steps

1. Concurrency check: issue unassigned, no claim; PR #635 references #627 but is the D-034 decision record, not a spec. Claimed (assignee, `in-progress`, claim comment).
2. Route: feature route → `om-auto-write-spec` → `om-spec-writing`. The issue asked for the owner's choices as Open Questions, so the spec keeps an Open Questions table with recommendations instead of autonomous defaults.
3. Two read-only Explore subagents mapped the per-club scheduler (19 schedules per club, 100-schedule cap per tenant, no unregister, time-zone drift in `facilities` and `people`) and addressing, mail, tenancy, rate limits and offboarding.
4. Checked auth entities: roles are unique per `(tenantId, name)` and a role ACL with null `organizationsJson` sees every organization of the tenant, which decides the tenant-per-club recommendation.
5. Wrote `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`.
6. A fresh subagent reviewed the spec as a staff engineer (12 findings). All applied: no crypto-shredding with derived keys (Q-M07), every system-scope statement listed (job claim writes; dispatch sweep), host-derived club instead of a spoofable header, tenant-scoped sign-in and reset for one e-mail in two clubs, platform notification and reset base URLs, corrected poller baseline and valid SQL (CTE + `FOR UPDATE SKIP LOCKED`), worker-start lease + BullMQ `jobId`, non-null `next_due_at`, DST gap/repeat rules, explicit deletion targets, working rollbacks, Q-M08 on splitting, OAuth central callback host, core version in the ACL hash.
7. Club management spec: Non-goal "Multiple clubs on one instance" lifted; DD-02 marked for amendment (Q-M01). Changelog files for both specs.
8. Lesson `derived-tenant-keys-cannot-be-crypto-shredded`.

## Decisions

- Recommend one tenant per club (DD-M01), subdomain addresses from the existing public slug (DD-M02), one sweep per job type with a job-state table (DD-M04…M07).
- The business case section 5 entries are already changed by PR #635; this PR does not touch them.
- PR stays draft: Q-M01, Q-M02, Q-M05, Q-M06 and Q-M07 need the owner.

## Files changed

- `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` (new)
- `.ai/specs/2026-10-20-vereino-club-management.md` (Non-goals line, DD-02 pointer)
- `.ai/specs/changelog/2026-11-22-vereino-many-clubs-one-instance/2026-11-22-initial-draft.md`
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-22-issue-627-many-clubs.md`
- `.ai/lessons/derived-tenant-keys-cannot-be-crypto-shredded.md`
- this log

## Results

- `yarn verify`: `[verify] all 20 step(s) passed`.
- `yarn guard`: `No blocking findings.`
- `yarn lessons:check`, `yarn spec-changelogs:check`: valid.
- Integration tests: none; the change is documentation only.

## Open problems / next steps

- The owner answers Q-M01…Q-M08 on the PR; then E22-S03…S07 (#629–#633) can start, each Ask First.
- PR #635 (D-034 record) should merge first; this spec links to it.
