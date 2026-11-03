# Issue #76: an account with no linked club person gets its own 403, `scope_unlinked`

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, one implementation subagent, and the coordinator's review and gate
- **Trigger:** `/om-auto-fix-issue 76`
- **Branch:** `fix/issue-76-unlinked-account-message`, from `main` at 793fbcb
- **Status:** completed, PR open for review.

## Goal

A tenant administrator or superadmin who is not linked to a person of the club no longer gets the bare "You do not have access to this record." on every club record; the 403 says the account is not linked, who links it, and how a new club's first administrator is set up.

## Steps

1. Claimed #76 and created a worktree from `main`.
2. **Subagent:** the rule in `foundation/lib/scope-denial.ts`, `authorizeScoped` and `assertInScope`, the new code with en + pl messages, `errorCodeOf` in `@vereino/core`, the pages with their own 403 state, unit tests, TEST-076; read all 47 `scope_denied` assertions in 19 spec files and reran the 18 ids that hold them.
3. **Coordinator review:** the rule reads only the scope (no cross-module call, `people` stays the only scope provider); an unlinked session scope is refused before `loadTarget`, so a record that exists and one that does not get the same answer and no row is locked; marker and job scopes and a tenant or organization mismatch keep `scope_denied`; status stays 403 and no data is returned; no migration, module or dependency.
4. **Coordinator gate:** `yarn verify` and the whole integration suite; two lessons and this run log.

## Decisions

- **The CLI hint is in the API message**, not only in the UI: a `CrudForm` shows the server's message and drops the code, so a UI-only hint would need code in every form of every module; the API cannot tell a new club from an existing one without asking `people`. The hint is one clause with no secret.
- **"Not linked" means the scope holds grants and none beyond `self_user`**: a linked person always carries `self`.
- **TEST-F02 now asserts `scope_unlinked`** on the two detail routes where its user is unlinked: this adds a check; no assertion was removed.
- **Contract (`BACKWARD_COMPATIBILITY.md` §3):** a new error code, and an unlinked user's code changes from `scope_denied` to `scope_unlinked` at the same status. No shared environment exists, so it lands with every consumer in one PR; after the first deployment the same change would need the §3 path.

## Commands and results

- Subagent: `yarn verify` 13/13 (twice); TEST-076 1 passed (the first run failed on the test's own count baseline, fixed — see the lesson); the 18 ids asserting `scope_denied` all passed (E03-S01 with one unrelated flaky axe step that passed on retry).
- Coordinator: `yarn verify` 13/13; **whole suite: 102 passed (53.1 min)**, none failed or flaky.

## Lessons

- New: `crudform-403-keeps-message-drops-code`, `nothing-created-baseline-right-before-action`.

## Open problems

- Detail routes answer 404 for an unknown id before the scope check (existing order for every user), so an unlinked user can still tell an existing id from an unknown one on a detail GET.
- Hand-written `scope_denied` outside `assertInScope` still gives an unlinked user the old message: the thread read in `communication/services/threads.ts`, `communication` `composer.ts`, `activities/services/calendar.ts`.
- `EventForm` and `ThreadComposer` replace any 403 with their own text (unreachable for an unlinked user in practice: their pickers are empty).
- List pages show no banner for an unlinked user (the issue's open question); it would need a new list response field.
- `errorCode` in `activities` and `communication` and `codeOf` in `people` duplicate the new `errorCodeOf`.
