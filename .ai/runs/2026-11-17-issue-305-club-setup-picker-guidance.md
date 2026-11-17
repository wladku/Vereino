# Run: issue #305 — E13-S03 a new club is set up in the panel; every empty picker says what is missing

- **Goal and trigger:** cezar task (`om-auto-fix-issue 305`, label `cezar`): build phase L3 of `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (REQ-L13, REQ-L14; TEST-L14, TEST-L15, TEST-L20; AC-L14; J-L08).
- **Spec / issue / branch:** spec `Ready for implementation` (owner approval 2026-11-16 on #255: Ask First item 8 — both new routes — and item 13 — the "Kids (U4–U5)" seed — approved); issue #305; branch `feat/issue-305-club-setup-picker-guidance`.

## Steps

1. Claimed #305 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and Ready, no open PR for the issue.
2. V-L04 read in the installed platform (`@open-mercato/core` 0.9.0, `auth/setup.ts`): `defaultRoleFeatures.admin = ['auth.*']`, so `auth.users.create` gates the page, the banner and the route; no fallback.
3. Slice (a), `@vereino/ui`: `PickerEmptyHint` (+ model), `InlineCreateDialog` (+ model), `granted-features` + `useGrantedFeatures` (over the existing `featureCheckOver`). 100 % unit coverage.
4. Slice (b): `PickerSelect` + `pickerSelectField` in `@vereino/ui`; `GET /api/club_core/institutions/options` with `ClubCoreDirectory.institutionOptions`; `club_core/components/pickers.ts`; place form (owner in place), contract form (institution in place, person link); guardians tab (person in place, prefilled by `people/lib/person-name.ts`); roles tab (section and place links, lookup remounted on window focus); the people feature hook moved onto the shared hook.
5. Slice (c): `groups/components/pickers.ts`; group form (section link, age category in place through the platform `dictionaries` routes, season in place); external team form (names-only institutions, administrator link); "Kids (U4–U5)" first in `PZPN_AGE_CATEGORIES`; E03-S01 and E06-S10 pick the native selects.
6. Slice (d): `people.persons.bootstrap_admin` also accepts a session caller with `auth.users.create`; `GET`/`POST /api/people/first-administrator`; `services/first-administrator.ts`; error codes `club_admin_exists` (409, names the administrator), `user_not_in_organization` (404); page `/backend/people/first-administrator` (`navHidden`); banner widget on `backend:layout:top`; README note after `yarn setup`; integration spec `TEST-L15-first-administrator-and-empty-pickers.spec.ts` (TEST-L14, TEST-L15, TEST-L20).
7. J-001 and J-002 `chooseCrudOption` helpers learned the native selects (owner institution, group section).

## Decisions

- **`InlineCreateDialog` renders labelled native fields, not `CrudForm`:** at most four fields need none of its machinery, and importing `CrudForm` into `@vereino/ui` pulls the platform form source into the package typecheck (as `native-fields.tsx` already notes).
- **`PickerSelect` is a third shared component** (the spec names two): forms 1, 2, 5 and 6 are `CrudForm` selects; a native select with the hint, the dialog and the reload on focus lets all of them share one tested piece.
- **`useGrantedFeatures` takes the app's `apiCall`** (as the member frames do): importing `apiCall` in `@vereino/ui` broke the package typecheck on platform sources.
- **Session path in the existing command:** the technical administrator has no club grant, so `authorizeScoped` cannot authorize them; the command checks `auth.users.create` through `rbacService` in the session's tenant and organization (as `club_core/api/settings` does for publication), refuses once an administrator exists (inside its write transaction) and refuses a user outside the organization. The CLI path is unchanged.
- **`GET /api/people/first-administrator`** serves the banner and the page (same path and feature as the approved `POST`); no club route is readable without a club grant.
- **The route sets up the club roles** (`setUpClubPeople`, as the CLI) only after the 409 pre-check, so a second call changes nothing.
- **Age category in place** goes through the platform `dictionaries` routes (`dictionaries.manage`); no new groups route.
- **AC-L14's coordinator case** ("a club without sections") cannot occur — a coordinator always reads their own section — so TEST-L14 asserts "ask the club administrator" with no button on the team's age category (no `dictionaries.manage`) and the external team's institution.

## Files changed

See the PR diff: `packages/ui/src/admin/{picker-empty-hint*,inline-create-dialog*,picker-select*,granted-features.ts,use-granted-features.tsx}`, their tests, `packages/ui/src/index.ts`; `packages/app/src/modules/club_core/{api/institutions/options/route.ts,services/directory.ts,components/{pickers.ts,PlaceForm.tsx,ContractForm.tsx},i18n/*}`; `packages/app/src/modules/people/{api/first-administrator/route.ts,backend/people/first-administrator/*,commands/jobs.ts,components/{FirstAdministratorPage.tsx,GuardianshipsPanel.tsx,RolesPanel.tsx,useGrantedFeatures.ts},lib/{person-name.ts,error-codes.ts},lib/__tests__/*,services/first-administrator.ts,widgets/**,i18n/*}`; `packages/app/src/modules/groups/{components/{pickers.ts,GroupForm.tsx,ExternalTeamForm.tsx},lib/groups-rules.ts,lib/__tests__/groups-rules.test.ts,i18n/*}`; integration specs; README; spec (V-L04 answered) and its changelog entry.

## Commands and results

- `yarn workspace @vereino/ui test`: 200 passed, 100 % line/branch/function coverage. First runs failed on attribute order in regexes (fixed in the tests) and on `useT must be used within I18nProvider` when a view rendered the dialog (tests inspect the dialog element instead).
- `yarn workspace @vereino/ui lint` / `typecheck`: pass (first typecheck failed on platform sources pulled in by `apiCall` — removed).
- `jest people/lib/__tests__/person-name.test.ts`: 3 passed, 100 %. `jest groups/lib/__tests__/groups-rules.test.ts`: 18 passed.
- `yarn generate`: pass. `yarn typecheck`: pass. `yarn workspace @vereino/app lint`: 0 errors (warnings are pre-existing).
- Integration and the full gate: see *Validation* below.

## Validation

- `yarn test:integration:vereino --filter TEST-L15` (run 1): TEST-L20 and TEST-L14 passed; TEST-L15 failed `expect(locator).toHaveText(expected) failed … locator('[data-crud-field-id="ownerInstitutionId"] select option:checked') … element(s) not found` — the screenshot showed the place list: the dialog's submit had bubbled through the portal (React tree) into the place `CrudForm` and saved the place without its owner. Fixed in `InlineCreateDialog` (`stopPropagation`, unit-tested; aeeb3a3); lesson `dialog-form-inside-crudform-stops-submit`. Run 2: 3 passed (1.9m).
- `--filter E06-S10`: pass. `--filter E03-S01`: pass. `--filter J-001`: pass. `--filter J-002`: pass.
- `yarn verify`: all 17 steps passed.
- `origin/main` gained #344 meanwhile; both added keys at the end of the people catalogs (conflict). Merged `origin/main` into the branch (19c55c6), keeping every key of both sides; after it `yarn verify` passed all 17 steps again and `--filter TEST-L15` 3 passed.
- AC-L14 ticked in the spec (the TEST-L15 walk-through passes on a fresh tenant).
- No screenshots attached by this run: the UI is proven by the browser integration specs; the PR carries `needs-qa` for a visual pass (both locales, 375 px, light and dark).

## Open problems / next steps

- Rows 7–11 of the picker table belong to specs N, A, C and R (out of scope).
- Spec A also changes `GroupForm.tsx` (E10-S01); whichever lands second rebases.
- Spec stays `Ready for implementation`; phases L2, L4–L10 remain.
