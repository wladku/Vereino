# Run — issue #245 (E07-S11b): a treasurer works with a finance-only role, menu and dashboard

- **Goal and trigger**: Cezar run (`om-auto-fix-issue`, feature route) queued by the `cezar` label on #245, 2026-11-19.
- **Spec**: `.ai/specs/2026-10-27-vereino-club-payments.md` — REQ-034, DD-33, phase 4 step 10, TEST-046.
- **Approvals on the issue**: the product owner lifted A02/D-021 for this story (2026-11-19 19:02Z) and approved the Ask
  First "build the role exactly as DD-33" with the spec Status / step 10 update (2026-11-19 21:40Z). The earlier
  17:58Z comment ("the hold stays") is superseded by both. Dependency #118 is closed (PR #421).
- **Branch**: `feat/issue-245-treasurer-finance-only-role`; worktree `.ai/cezar/worktrees/d6fdf97b-…`.

## Steps

1. Claimed #245 (assignee, `in-progress`, `🤖` claim comment naming this run).
2. Mapped the authorization: every `payments` route and command checks the features plus the club-wide grant kinds
   `PAYMENTS_READ_KINDS` / `PAYMENTS_WRITE_KINDS` (`club_admin` only); the panel sidebar is feature-driven (navigation
   spec REQ-N04), so a role with only `payments.*` features and `dashboards.view` sees the dashboard and Finance.
3. `@vereino/core`: role `treasurer` (`vereino_treasurer`, DD-33 features plus `dashboards.view`, implies `member`, no
   scope record); grant kind and acting role `treasurer`, club-wide (`CLUB_WIDE_KINDS`) but only for calls that list it.
4. `people`: `treasurer` is assignable (validators, Roles tab, list filter and badge, en/pl); `personScope` adds the
   `treasurer` grant for an active assignment; `/api/people/me` contexts include it; the sign-in landing sends a
   treasurer without a member side to `/backend`. `@vereino/ui` `member-nav`: "Admin panel" offered to the treasurer.
5. `payments`: `PAYMENTS_READ_KINDS` and `PAYMENTS_WRITE_KINDS` = `['treasurer', 'club_admin']` (least privileged first).
   Found that four Finance form pickers called `groups`, `activities`, `club_core` and `people` lists, which the
   treasurer may not read; added `GET /api/payments/lookups?kind=groups|activities|sections|persons` (DI directories,
   `payments.view`, the club-wide payments grant) and switched the loaders (`client-helpers.ts`, `orders-client.ts`,
   `AddChargeDialog.tsx`, `DiscountRuleForm.tsx` with `resolveLabel`). Pure shaping in `lib/lookups.ts` with unit tests.
6. TEST-046: a second test for the treasurer (roles, 403 on people/groups/club settings/sections/facilities/activities
   APIs, fee + generation + lookups + settings as the treasurer, two partial handovers with `received_by_person_id`,
   409 on a repeat, own cash settled at once, sidebar hrefs only `/backend` and `/backend/payments/*`, "Access denied"
   on the four pages, B-33 at 375 px). `signedInStaff` accepts `treasurer`.
7. Spec: Status line, step 10, deliverables, requirements closed, traceability, compliance row and verdict now say
   REQ-034 is released and built with #245; changelog file `2026-11-20-issue-245-treasurer-role.md`.

## Decisions

- **`dashboards.view` on the treasurer**: DD-33 lists the payments features only, but the issue's acceptance criterion
  is "the finance dashboard"; the navigation spec gives the coordinator and the attendant the same feature (Q-N03).
- **Grant kind club-wide, not `clubWideKinds` per call**: every scope check names its allowed kinds, and only the
  `payments` calls name `treasurer`, so the grant opens nothing elsewhere (unit-tested in `scope.test.mjs`).
- **Lookups for persons**: a search of three letters or more uses the people directory's name index; without one the
  route offers the persons the club already charges (the names are encrypted, so there is no name-ordered list).
- **No migration**: `people_role_assignments.role` and `acting_role` are plain text.

## Files changed

`packages/core/src/{roles,scope}.ts` (+ tests), `packages/ui/src/member/member-nav.ts` (+ test),
`packages/app/src/modules/people/{data/validators,lib/people-rules,lib/member-rules,lib/person-list-filters,services/person-list,components/RolesPanel,api/me/route}.ts(x)`, `people/i18n/{en,pl}.json` (+ lib tests),
`packages/app/src/modules/payments/{acl,api/shared,commands/shared,data/validators,services/directory,lib/lookups,api/lookups/route}.ts`,
`payments/services/lookups.ts`, `payments/components/{client-helpers,orders/orders-client,AddChargeDialog,DiscountRuleForm,AssignPayerDialog,ChargeRecord,PaymentsSettingsForm,useRecordLinks,cash-custody/CashCustodyPage}`, `payments/api/cash-{custody,handovers}/route.ts` (comments),
`packages/app/.ai/qa/tests/payments/TEST-046-cash-handover.spec.ts`, `_fixtures/groups.ts`, `foundation/TEST-F03-role-sync.spec.ts`, the payments spec and its
changelog file, lesson `narrow-role-forms-read-names-through-own-module`.

## Commands and results

- `yarn workspace @vereino/core test` — pass, 100 % lines/branches/functions.
- `npx jest src/modules/payments/lib/__tests__/lookups.test.ts src/modules/people/lib/__tests__` — 16 suites, 278 tests pass.
- `yarn generate` — ok; `yarn typecheck` — ok.
- `yarn test:integration:vereino --filter TEST-046` — first run: treasurer test passed; the administrator test of
  #118 failed once then passed on retry (flaky): `Error: strict mode violation: getByText(/RG\/\d{4}\/\d{2}\/001/)
  resolved to 2 elements` (the toast and the refreshed history cell). Fixed by requiring words before the number.
  Second and third runs: 2 passed, no retry.
- One id per run, all pass: TEST-F03 (1, now counts `vereino_treasurer`), E07-S01 (2), TEST-C07 (1), TEST-C08 (1),
  TEST-C15 (2), E07-S08 (1) — the tests over the rewired pickers and links.
- `yarn verify` — first run failed at `lint`: `no-restricted-imports` (`@mikro-orm/*` in an API route) in
  `api/lookups/route.ts` and an unused `fetchCrudList` import; the read moved to `services/lookups.ts`. `yarn verify
  --from lint` then all 14 steps pass; a final full `yarn verify` passes.

## Later steps

- Links a treasurer could not follow: the B-33 history's collector link, the charge record's and the Assign payer
  dialog's guardianship links now need `people.view`, and the Payment settings link to Club settings needs
  `club_core.manage` (`components/useRecordLinks.ts`, the shared wildcard-aware `useGrantedFeatures`). TEST-046 checks
  B-33 and the settings page as the treasurer.

## Open problems / next steps

- A charge without a payer is fixed in the person record (guardianship); the treasurer cannot do it and leaves it to
  the administrator, as DD-33 intends (no people records).
- The person select without a typed name offers the persons the club already charges (at most 200); a new person
  appears after typing three letters.
