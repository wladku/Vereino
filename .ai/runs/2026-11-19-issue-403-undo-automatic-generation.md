# Run: issue #403 — an administrator undoes an automatic charge generation

- **Goal and trigger:** cezar task (`om-auto-fix-issue 403`, label `cezar`): the payments parity spec's risk row *Automatic generation creates charges the club did not expect* names "the generation undo of #108" as the mitigation, but `payments.charges.generate_due` (the 06:00 job) is not undoable — no user owns its audit entry. Owner decision (a) of 2026-11-19 on the issue: an admin action on a generation list that runs the #108 undo for automatic runs; the new route and command contract is approved there (Ask First).
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-payments.md` (API rows, risk row, TEST-C17; changelog file `2026-11-19-issue-403-undo-automatic-generation.md`); issue #403; branch `feat/issue-403-undo-automatic-charge-generation`; cezar worktree `05ea1c30-…`.

## Steps

1. Claimed #403 (assignee, `in-progress`, 🤖 comment naming worktree, branch and start). Route: `module-data` + `backend-ui`; the issue and the owner's comment record the approval of the new route and command, so no new spec — the covering spec is updated (`reuse-spec`).
2. Read `payments/commands/generate.ts` (manual command with the #108 undo, the job command), the cancel route, the bank import history (list + row action + versioned delete) and `authorizeScoped`.
3. Extracted the #108 undo body into `undoGeneration(em, generation)` (already undone → 409, advisory lock tried → 409, open charges cancelled with `generation_undone`, run marked undone). The audit-log undo of `payments.charges.generate` now calls it; behaviour unchanged.
4. New command `payments.charge_generations.undo` (`authorizeScoped`, `club_admin`, generation row-locked, lock token required; not undoable; audited with the summary and the cancelled count; `payments.charge.cancelled` after commit).
5. New routes `GET /api/payments/charge-generations` (list `{ items, total, page, pageSize, totalPages }`, each run with `open` = what an undo would cancel) and `POST /api/payments/charge-generations/{id}/undo`, both `payments.manage`, with `metadata` and `openApi`.
6. New hidden page `/backend/payments/generations` (`ChargeGenerationsTable`: DataTable, row action Undo with a destructive confirmation naming the open charges, optimistic-lock header, conflict surfaced) and a "Generations" link on B-21. en/pl catalog keys.
7. Spec: API rows, risk row names the list, TEST-C17 row; spec changelog file. Module README updated.
8. New integration test `TEST-C17-undo-automatic-generation.spec.ts`.

## Decisions

- **Undo for every run, not only automatic ones.** A generation row does not record whether the job or a person wrote it (no column; adding one is a migration, which was not approved). The undo is the same #108 logic for both, so the list offers it for any run not undone; a manual run undone from the list answers 409 `generation_already_undone` if its audit-log undo is tried afterwards. Recorded in the PR body.
- **A page, not a dialog.** The list is a hidden backend page reached from B-21 (breadcrumb back to Charges), like the other B-21 secondary screens; a table inside a dialog would nest the row menu and the confirmation in a dialog.
- **`payments.manage` for the list too**, not `payments.view`: only an administrator can act on it, and generation itself is `payments.manage`.
- **Lock token required** (default `updated_at` lock of `authorizeScoped`): the list returns `updatedAt` per run, per the AGENTS.md rule that custom write clients send the version.

## Files changed

- `packages/app/src/modules/payments/commands/generate.ts`
- `packages/app/src/modules/payments/data/validators.ts`, `services/generation.ts`
- `packages/app/src/modules/payments/api/charge-generations/route.ts`, `api/charge-generations/[id]/undo/route.ts` (new)
- `packages/app/src/modules/payments/backend/payments/generations/page.tsx`, `page.meta.ts` (new)
- `packages/app/src/modules/payments/components/ChargeGenerationsTable.tsx` (new), `ChargesTable.tsx`, `client-helpers.ts`
- `packages/app/src/modules/payments/i18n/en.json`, `pl.json`, `README.md`
- `packages/app/.ai/qa/tests/payments/TEST-C17-undo-automatic-generation.spec.ts` (new)
- `.ai/specs/2026-11-14-vereino-parity-payments.md`, spec changelog file, this log

## Commands and results

- `yarn generate`: all generators completed.
- `yarn typecheck`: passed.
- `yarn spec-changelogs:check`: valid.
- `yarn test:integration:vereino --filter TEST-C17`: 1 passed (39.1s) on the first run. The log carries `QueryIndexScopeError` lines from the platform indexer during club cleanup (`directory:organization`, `auth:role`); unrelated to this change.
- `yarn format`, then `yarn verify`: all 18 steps passed.

## Open problems

- None. Follow-up idea only: a generation row could record whether the job or a person wrote it (needs a migration, Ask First) so the list can say "automatic".

## Next steps

- Review and merge the PR (merge train).
