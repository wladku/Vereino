# Run: issue #187: ward filter attributes direct threads by group

- **Goal and trigger:** unattended `om-auto-fix-issue 187` (cezar task `29a13534`). Each direct thread should list under the ward it is about.
- **Issue / branch:** #187 / `fix/issue-187-ward-filter-direct-subject`
- **Outcome:** fixed with option C (no migration).

## Steps

1. Read issue #187. It names two fixes: **A** (a new `subject_person_id` column, which is a migration) and **B** (a participant row for a subject without an account, which is a privacy/product decision). The issue doesn't approve either one.
2. Read `communication/data/queries.ts` (`visibleThreadHeaders`, ward clause), `data/entities.ts` and `commands/threads.ts` (`start_direct` set `scopeId: null`).
3. Found a no-migration option, **C**: store the subject person in `scope_id` for member direct threads. It reverses the "`scope_id` null" text of DD-M18 (`2026-10-27-vereino-foundation-messaging-primitives.md`), so the run first stopped and asked on the issue (https://github.com/wladku/Vereino/issues/187#issuecomment-6693689718), without claiming it.
4. The owner told the run to continue without asking. Claimed the issue (assignee, `in-progress`, claim comment https://github.com/wladku/Vereino/issues/187#issuecomment-6693745792) and implemented C.
5. Implementation:
   - `commands/threads.ts`: `start_direct` writes `scopeId: parsed.personId`.
   - `data/queries.ts`: the ward clause matches `direct` threads by `t.scope_id = :ward`. When `scope_id` is null (staff-started threads, and member threads created before this change), it keeps the old match: the ward takes part, or the thread carries one of the ward's groups. The group clause now applies to non-direct threads only. The section clause is unchanged.
   - `data/entities.ts`, module `README.md`: `scope_id` documentation.
   - Spec DD-M18 text, plus the changelog file `.ai/specs/changelog/2026-10-27-vereino-foundation-messaging-primitives/2026-11-06-issue-187-direct-thread-subject.md`.
   - TEST-M12: on the TEST-008 family, Hania's ward filter lists exactly her coaches thread and her coordinator thread (Hania has no account). Kuba's lists exactly his own coaches thread (Kuba has an account), although both are in Żaki. The subject comes back as `scopeId`.
   - Lesson `record-the-subject-do-not-infer-it-from-participants`.

## Decisions

- C over A: no migration. The existing `communication_threads_org_scope_idx` index (organization, scope_type, scope_id) already covers the lookup. Pre-deployment tier (BACKWARD_COMPATIBILITY.md), so a response value that was null becoming a person id lands in one PR with the spec changelog entry. The id is the thread's subject, which every reader of the thread already sees.
- C over B: no change to who receives or later sees a thread.
- Kept the legacy fallback for null `scope_id`, so threads written before this change still list as they did.

## Commands and results

- `node scripts/check-lessons.mjs`: valid. `node scripts/check-spec-changelogs.mjs`: valid.
- `yarn verify`: `[verify] all 14 step(s) passed`, exit 0.
- `yarn test:integration:vereino --filter TEST-M12`: `1 passed (1.7m)`, exit 0.

## Next steps

- None beyond review and merge.
