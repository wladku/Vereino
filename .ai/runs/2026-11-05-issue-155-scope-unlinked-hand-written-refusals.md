# Issue #155: hand-written "no linked person" refusals answer 403 `scope_unlinked`

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (run 59ca21e2), `om-auto-fix-issue` with the repo-local override applied; no subagents
- **Trigger:** `/om-auto-fix-issue 155`
- **Branch:** `fix/issue-155-scope-unlinked-hand-written-refusals`, from `main` at 07ced5f
- **Status:** completed, PR open for review.

## Goal

Follow-up to #76: every refusal caused by "the caller has no linked person of this club" answers 403 `scope_unlinked`; a linked user outside their grants keeps 403 `scope_denied`; the duplicate client helpers `errorCode` / `codeOf` give way to `errorCodeOf` from `@vereino/core`.

## Steps

1. Triage: the sites listed in the issue are present on `main` (07ced5f); classified as a bug; claimed #155 (assignee, `in-progress`, claim comment) and renamed the task branch.
2. Foundation: re-exported `scopeDenialCode` and `isUnlinkedScope` from `@/modules/foundation`, so business modules do not import its `lib/`.
3. Server sites changed to `scopeDenialCode(<session scope>)`: `activities/services/calendar.ts` (`as=self` without a `self` grant); `communication/commands/threads.ts` (create, reply, mark case, mark read); `communication/services/threads.ts` (thread read, deliveries); `communication/services/composer.ts` (`previewAudience`); `people/commands/imports.ts` (upload, commit).
4. `communication/services/composer.ts`, `authorizeAudience`: an unlinked account is refused with `scope_unlinked` before the target is looked up, so an unknown target and an existing one answer alike (it used to answer `scope_denied` for an unknown target from `targets.ts` `denied()`).
5. `people/services/payments-gate.ts`: `no_person` answers `scope_unlinked`; `no_feature` keeps `scope_denied`.
6. Client: removed `errorCode` (activities, communication) and `codeOf` (people imports); call sites in `ActivityRecord`, `OccurrenceRecord`, `ThreadRecord`, `ImportRecord`, `ImportUpload` and the activities helpers use `errorCodeOf`.
7. OpenAPI: the 403 descriptions of the calendar, the communication thread, reply, read, case, deliveries, preview and share-text routes, and every `people` imports route list `scope_unlinked`.
8. TEST-155 (`packages/app/.ai/qa/tests/foundation/TEST-155-unlinked-hand-written-refusals.spec.ts`).

## Decisions

- **`targets.ts` `denied()` stays `scope_denied`.** Its two callers are the post command, where `authorizeScoped` already refuses an unlinked account before `loadTarget`, and the composer, which now refuses before resolving the target. For a linked user an unknown target and a foreign one must keep answering alike.
- **The payments gate's `no_person` is this case.** The gate reads the `Person` linked to the user directly, so "no person" means exactly "not linked to a person of this club". A linked adult without the payer feature keeps `scope_denied` (E02-S03).
- **The command sites were already unreachable for an unlinked account** (their `allowedKinds` exclude `self_user`, so `authorizeScoped` refuses first since #76). They are changed anyway, so the code does not depend on that ordering.
- **Contract (`BACKWARD_COMPATIBILITY.md` §3):** the machine code an unlinked caller gets changes from `scope_denied` to `scope_unlinked` at the same status on the calendar `as=self`, the thread read, the composer preview and share text and the payments gate. No shared environment exists, so it lands in one PR with every consumer.

## Files changed

See the PR diff: foundation `index.ts` and README; activities calendar service and route, client helpers and two record pages; communication commands, services, routes, client helpers and thread page; people imports command, routes, client helpers and two pages, and the payments gate; TEST-155; this log.

## Commands and results

- `yarn typecheck` green after `yarn generate` (the fresh worktree had no `.mercato/generated`); `yarn format` reformatted the changed files; `yarn lint` 0 errors (20 existing warnings in `example/`); `yarn test` 334 passed, coverage 100 %.
- `yarn verify`: all 13 steps passed (before the payments-gate simplification), and again on the committed tree before the PR.
- `yarn test:integration:vereino --filter <id>`, one id per run: TEST-155 1 passed (twice), TEST-076 1, TEST-M06 1, TEST-M08 1, TEST-M09 2, E03-S02 4, TEST-008 1, TEST-009 4, TEST-011 1, TEST-034 1, TEST-052 2, E02-S02 6, E02-S03 7, E02-S04 2, TEST-002 1 — all passed. These are the ids asserting `scope_denied` in `communication`, `activities` and `people`, plus TEST-076 and the share-text test.
- The first E02-S02 attempt did not run: the background runner hit its 2-hour limit while the production build stalled ("Compiled successfully in 345.8min", then "Failed to type check." when killed). Rerun on its own: 6 passed.
- The whole suite was not run in one invocation: the run's instructions allow one id per run. Acceptance criterion 4 (whole suite) is covered by the 15 related ids above; CI runs the rest.

## Open problems

- None known.

## Next steps

- Review the PR.
