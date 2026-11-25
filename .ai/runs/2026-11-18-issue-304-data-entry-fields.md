# Run: issue #304 — E13-S02 role dates, guardianship start, external id, material title, own-message edit

- **Goal and trigger:** cezar task (`om-auto-fix-issue 304`, label `cezar`): build phase L2 of `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (REQ-L12 without the photo and the contract attachment; TEST-L13; AC-L13 in part).
- **Spec / issue / branch:** spec `Ready for implementation` (owner approval 2026-11-16 on #255); issue #304; branch `feat/issue-304-admin-role-dates-guardianship`.

## Steps

1. Claimed #304 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and Ready, no open PR for the issue.
2. Read the server side first: every route already accepts the fields (`PUT /api/people/role-assignments` checks an inverted period with 422 `validity_inverted`, `POST …/{id}/end` takes `validTo`, `PUT /api/people/guardianships` takes `validFrom`, `PUT /api/people/persons` takes `externalId`, `PUT …/materials/{materialId}` takes `title`, `PATCH …/messages/{messageId}` revises). No route, schema or migration change.
3. Slice `people`: `RolesPanel.tsx` (optional end date on assign; "Edit" and "End on…" per row through the new `RoleAssignmentDialog.tsx`; the one-click "End today" confirmation is gone), `GuardianshipsPanel.tsx` (start date in "Edit"; the add form has sent it since L3), `PersonForm.tsx` (external id on the details tab and the create page, 409 at the field), catalogs.
4. Slice `club_core`: `SectionMaterialsPanel.tsx` "Rename" in place (save, cancel, Escape), catalogs.
5. Slice `communication`: `mayEditMessage` in `lib/case-rules.ts` (+ unit tests); `MessageList` gains an inline editor (`isCase`, `onEdit`); `useEditMessage` in `ThreadRecord.tsx` serves B-19 and M-07 (`ClubThreadPage.tsx`); catalogs.
6. Integration spec `packages/app/.ai/qa/tests/people/TEST-L13-data-entry-fields.spec.ts` (two tests: administrator, message edit).
7. Spec drift corrected (spec rows B-10 Details and TEST-L13) with a changelog entry.

## Decisions

- **409 code `external_id_duplicate`, not the spec's `person_external_id_taken`:** the issue and the spec say the routes are reused unchanged; the code has existed since #28, so the spec text was corrected instead of renaming a contract code.
- **External id shown and sent only with `people.pesel.view`:** `GET /api/people/persons/{id}` returns it only with that feature (an identifier like the PESEL); a field shown without the value would clear the stored id on save. Changing the GET gate is a contract change outside this phase.
- **"End on…" replaces the confirmation "End today?"** with a dialog whose date defaults to today, so the old one-click path stays one more click; the key `people.roles.confirm.end` was removed (no other user).
- **Edit only for the author** (`mayEditMessage`): the route also lets the coordinator and the administrator revise, but the story offers the edit on one's own message; no new field in the read model (`own`, `system`, `deleted` and `isCase` already there).
- **A stale thread version keeps the message editor open** (conflict surfaced with a refresh), so the typed text is not lost; `case_immutable`, `message_deleted` and `message_not_editable` close it with the reason.
- **Escape handlers sit on the input/textarea and the focus moves through a ref**, not on the `<form>` and not with `autoFocus` (jsx-a11y rules of `yarn lint`).

## Files changed

`packages/app/src/modules/people/components/{RolesPanel,RoleAssignmentDialog,GuardianshipsPanel,PersonForm}.tsx`, `people/components/client-helpers.ts`, `people/i18n/{en,pl}.json`; `club_core/components/SectionMaterialsPanel.tsx`, `club_core/i18n/{en,pl}.json`; `communication/components/{ThreadMessages,ThreadRecord}.tsx`, `communication/components/club/ClubThreadPage.tsx`, `communication/lib/case-rules.ts`, `communication/lib/__tests__/case-rules.test.ts`, `communication/i18n/{en,pl}.json`; `packages/app/.ai/qa/tests/people/TEST-L13-data-entry-fields.spec.ts`; the spec and `.ai/specs/changelog/2026-11-14-vereino-people-life-cycle-and-data-entry/2026-11-18-issue-304-phase-l2.md`; this log.

## Commands and results

- `jest communication/lib/__tests__/case-rules.test.ts`: 12 passed.
- `yarn generate`: pass. `yarn typecheck`, `yarn typecheck:qa`: pass.
- `yarn lint` (run 1): 6 errors in the new code — `jsx-a11y/no-noninteractive-element-interactions` (Escape on `<form>`) and `jsx-a11y/no-autofocus` in `SectionMaterialsPanel.tsx` and `ThreadMessages.tsx`; `no-unnecessary-type-conversion` (`String()` on strings) in the test. Fixed as above.
- `yarn format:check`, `ds:check`, `i18n:check-hardcoded --strict`, `qa-texts:check`, `glossary:check`, `lessons:check`, `spec-changelogs:check`: pass.

## Validation

- `yarn test:integration:vereino --filter TEST-L13` run 1 (before the lint fixes): 2 passed (3.7m).
- `yarn verify` (after the lint fixes, slices committed): all 17 steps passed.
- `--filter TEST-L13` run 2 (final code): 2 passed (3.4m). Regressions on the changed screens: `--filter E02-S02` 6 passed (4.3m); `--filter E06-S20` 1 passed (2.9m).
- No screenshots attached: the TEST-L13 browser walk-throughs (panel, phone at 375 px in pl and en, light and dark, axe) are the UI evidence; the PR carries `needs-qa` for a visual pass.

## Open problems / next steps

- Phase L10 adds the person photo and the contract attachment (columns); AC-L13 stays unticked until then.
- Spec A adds "Delete" to the member thread page (E10-S09); whichever lands second rebases `ClubThreadPage.tsx`.
