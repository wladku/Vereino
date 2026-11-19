# Run log — issue #312: staff setup checklist, group move with one fee, person photo and contract PDF

- **Goal and trigger:** implement E13-S10 (#312), phase L10 of `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md`; unattended Cezar run (`om-auto-fix-issue`, label `cezar`, 2026-11-19).
- **Spec / issue / branch:** spec phase L10 (REQ-L09, REQ-L11, REQ-L12 photo and contract attachment; TEST-L17, TEST-L18, TEST-L20); issue #312; branch `feat/issue-312-coach-setup-checklist`; worktree `.ai/cezar/worktrees/a5429987-…`.
- **Approvals relied on:** the spec is `Ready for implementation` for L1–L10; Ask First items 4 (migration D), 8 (new routes and error codes) and 10 (the skip rule in `payments`) approved by the owner on #255 (2026-11-16). The roster's "Move…" action was added to this story by the owner's comment on #312 (2026-11-18). No new module, dependency or feature id.

## Steps

1. Claimed the issue (assignee, `in-progress`, 🤖 comment naming the run, worktree and branch); checked that no other process worked in the worktree.
2. **Fee rule** (`payments/lib/charge-plan.ts`): `chargedElsewhere` lists debtors with a live charge of a monthly or per-session fee whose group no longer holds them on the reference day; `planCharges` counts the new group's fee of the same fee period as skipped. Unit tests at 100 %.
3. **Move** (`groups`): `planMove` and `moveDateBounds` in `lib/groups-rules.ts` (unit tests); `groups.memberships.move` in `commands/memberships.ts` (membership row-locked with its lock token, then both groups in id order, target checked with `assertInScope`, overlap check in the target, undo restores the old membership and removes the new one); `POST /api/groups/memberships/move`; "Move…" on active roster rows with `MoveMembershipDialog`.
4. **Files**: migration D generated with `yarn db:generate` against an unreachable database (never applied), house style added (comment, `lock_timeout`, `drop column if exists`), snapshots kept in their own formatting; `people.persons.photo.set|remove` and `POST/GET/DELETE /api/people/persons/{id}/photo`; `club_core.contracts.attachment.set|remove` and `POST/GET/DELETE /api/club_core/contracts/{id}/attachment`; `checkPersonPhoto` and `checkContractAttachment` (unit tests); `PersonPhotoPanel` on B-10 Details, `ContractAttachmentPanel` on the B-07 edit form; `hasPhoto` and `hasAttachment` in the reads.
5. **Checklist**: `@vereino/core` `staff-setup.ts` (`periodStep`, `accountStep`, `STAFF_STEP_VARIANT`; 100 % in `packages/core` tests); `StaffSetupChecklist` in `RolesPanel` with the spot `vereino:people:person-record:staff-setup`; widgets `groups.injection.staff-setup-groups` and `club_core.injection.staff-setup-contract` (new `club_core/widgets/injection-table.ts`); `?personId=` on the contract create form with a label resolver.
6. Integration tests `TEST-L17` (`groups/TEST-L17-group-move.spec.ts`) and `TEST-L18` (`people/TEST-L18-staff-setup-and-files.spec.ts`), spec changelog entry, lesson update.

## Decisions and reasons

- **No new error codes for the move**: L11's `move_*` codes are not approved yet (Ask First item 14), so the single move answers `groups_reference_invalid` (same, unknown or inactive target; membership over before `date`) and `membership_not_started`.
- **Skip rule keyed on "left the group of an existing charge"**, not on a stored move flag: it needs no schema change, a child in two groups still pays both fees, and the next period charges the new group only.
- **Photo `GET` added** (the spec lists POST/DELETE): the spec requires reading the photo only through a scoped route; a coordinator's basic read gets 403, as the spec gives coordinators nothing beyond `leftOn`.
- **File pointers need no lock token** (like place files) but move `updatedAt` (the entity's `onUpdate`), so the person and contract pages read the record again after a file change.
- **Contract row needs `club_core.contracts.manage`**: coordinators cannot read contracts, so they do not see the row (the spec's "without the Contract action").
- **Photo on anonymisation**: phase L6 (#308) owns `people.persons.anonymize` and has not landed; it must clear `photo_attachment_id`.

## Files changed

`payments/lib/charge-plan.ts` (+ test); `groups/{commands/memberships.ts, data/validators.ts, lib/groups-rules.ts (+ test), api/memberships/move/route.ts, components/{RosterPanel,MembershipDialogs}.tsx, widgets/injection-table.ts, widgets/injection/staff-setup-groups/*, i18n/*}`; `people/{data/entities.ts, migrations/*, lib/{person-photo.ts (+ test), error-codes.ts}, commands/photos.ts, api/persons/[id]/photo/route.ts, api/shared.ts, components/{PersonRecord,RolesPanel,StaffSetupChecklist,PersonPhotoPanel,client-helpers}.tsx, i18n/*}`; `club_core/{data/entities.ts, migrations/*, lib/{files.ts (+ test), error-codes.ts}, commands/{contracts,contract-files}.ts, api/{uploads.ts, shared.ts, contracts/route.ts, contracts/[id]/attachment/route.ts}, components/{ContractForm,ContractAttachmentPanel,contracts-shared}.tsx, widgets/*, i18n/*}`; `packages/core/src/{staff-setup.ts, index.ts, __tests__/staff-setup.test.mjs}`; the two integration tests; the spec changelog entry; lesson `integration-fixture-pitfalls-tokens-crudform-undo`.

## Commands and results

- `npx jest …charge-plan.test.ts` — 23 passed, `charge-plan.ts` 100 %.
- `npx jest …groups-rules.test.ts` — 29 passed, `groups-rules.ts` 100 %.
- `npx jest …person-photo.test.ts …files.test.ts` — 15 passed, both 100 %.
- `yarn workspace @vereino/core test` — 115 passed, all files 100 %.
- `yarn generate`, `yarn typecheck` — clean.
- `yarn qa-texts:check` — 0 problems.
- `yarn test:integration:vereino --filter TEST-L17` (first run) — failed only at the undo step: `expect(log?.undoToken).toBeTruthy()` received `undefined` (the actions list read with the administrator's token for a coordinator's move); the move, the dropped declaration, the undeclared row and both generations had passed. Fixed by letting the administrator make the undone move.
- `yarn test:integration:vereino --filter TEST-L17` (re-run) — `1 passed (31.5s)`.
- `yarn test:integration:vereino --filter TEST-L18` — the API test (photo and contract PDF) `✓ passed (7.2s)`; the browser test (checklist) cannot run on the Cezar host: `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0` (lesson `cezar-host-integration-runs-without-browser`). TEST-L18 is split into an API test and a browser test with its own setup; **the browser steps (checklist states, actions, contract prefill, roster deep link, coordinator view, axe in light and dark) run only in CI.**
- `yarn verify` — first run failed at `lint`: 162 errors in the local Playwright report `.ai/qa/test-results/html/**` (gitignored output of the local runs, deleted) and 3 in new code (`@mikro-orm/postgresql` imported in a route; an unnecessary type parameter; a missing `return await`), fixed by moving the contract read to `club_core/services/contract-files.ts`; then `test` failed in the two error-code table tests (`people-rules.test.ts`, `club_core/lib/__tests__/error-codes.test.ts`), updated with the new codes. Final run: `[verify] all 18 step(s) passed`.

## Open problems / next steps

- Phase L6 (#308) clears the photo on anonymisation.
- Phase L11 (#383) extends the move dialog to several children and adds its own codes.
