# Run: issue #187: ward filter attributes direct threads by group

- **Goal and trigger:** unattended `om-auto-fix-issue 187` (cezar task `29a13534`). Each direct thread should list under the ward it is about.
- **Issue / branch:** #187 / `fix/issue-187-ward-filter-direct-subject` (local only, not pushed)
- **Outcome:** stopped before claiming. The run needs an owner decision. No code changed.

## Steps

1. Read issue #187. It names two fixes: **A** (a new `subject_person_id` column, which is a migration) and **B** (a participant row for a subject without an account, which is a privacy/product decision). The issue doesn't approve either one, and no owner comment exists.
2. Read `communication/data/queries.ts` (`visibleThreadHeaders`, ward clause), `data/entities.ts` (`Thread.scopeId`: "null for `club` and `direct`") and `commands/threads.ts` (`start_direct` sets `scopeId: null`).
3. Found a no-migration option, **C**: store the subject person id in `scope_id` for member direct threads. The filter matches direct threads by `scope_id` and uses the participant match only when `scope_id` is null. The group clause applies to non-direct threads only. The existing index `communication_threads_org_scope_idx` covers this query.
4. Checked the spec. DD-M18 of `2026-10-27-vereino-foundation-messaging-primitives.md` explicitly says the direct thread has "`scope_id` null". `scopeId` is also returned by the thread API. So C reverses a recorded design decision and changes an API response value. Under `AGENTS.md` that is Ask First (architecture/contract), so it isn't approved for an unattended run.
5. Posted a decision request on the issue that lays out A, B and C and recommends C: https://github.com/wladku/Vereino/issues/187#issuecomment-6693689718. I didn't claim the issue (no assignee, `in-progress` label or claim comment), so there is no claim to release.

## Decisions

- Did not implement C on my own judgement: it contradicts the DD-M18 text in the spec.
- Did not implement A or B: neither has the owner approval required for Ask First changes.

## Commands and results

- `gh issue view 187`: no comments and no approval.
- `gh issue comment 187 --body-file …`: posted (an earlier attempt hung on a stray stdin read and was stopped before posting).
- No tests run: no code changed.

## Next steps

- Once the owner chooses A, B or C, rerun `om-auto-fix-issue 187`. Implement the choice, add a spec changelog file under `.ai/specs/changelog/2026-10-27-vereino-foundation-messaging-primitives/`, and add the TEST-008 assertion (Hania and Kuba in Żaki: a thread to the coaches about Kuba and a thread to the coordinator about Hania). Then run `yarn verify` and `yarn test:integration:vereino --filter <ID>`.
