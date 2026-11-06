# Issue #104: wards with their groups on the profile; a ward with an account sees their guardians

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (task ddc613e0), `om-auto-fix-issue` with the repo-local override applied; no subagents
- **Trigger:** `/om-auto-fix-issue 104` (E06-S22, epic #82)
- **Branch:** `feat/issue-104-profile-wards-guardians`, from `main` at 26bda24
- **Status:** completed, PR open for review.

## Goal

README M-10: the profile `/club/profile` lists a guardian's wards with age, account state, groups with sections and the three consents with date and author; the ward page shows the groups and sections; a ward with an account sees "My guardians: {names} — consents and payments are handled by your guardian" and the consents read-only; the phone is validated as Polish or E.164 (422 with a field message); a "Change password" link opens the `auth` page.

## Steps

1. Classified #104 as a feature (label `feature`). FR triage: open, unclaimed, no PR referencing it; `/api/people/me` returned no guardians, ages or consent authors and the phone schema accepted any text. Covering spec: the club management spec (UI row `/club/profile`, API rows of `/api/people/me`) — reused and updated, as for #90 and #93. No migration, new module, dependency or breaking contract, so no Ask First item.
2. Claimed #104 (assignee, `in-progress`, 🤖 comment naming the worktree and branch) and renamed the cezar branch to `feat/issue-104-profile-wards-guardians`.
3. `people` pure logic: `isValidPhone` (`lib/people-rules.ts`), `consentAuthorIds` and `withConsentAuthors` (`lib/member-rules.ts`); error code `phone_invalid` 422. Unit tests at 100 %.
4. `people.persons.update_self` refuses a changed phone that is neither Polish nor E.164 with 422 `phone_invalid` and `fieldErrors.phone` (the `club_core` section-name pattern).
5. `services/member-profile.ts`: one family read — the ward links (`guardian` grant), the member's own guardian links (`self`: links naming the member as the ward), the persons involved and the consent authors in one decrypted read; adds `wards[].age`, `byName` on every consent and `guardians[]`. OpenAPI extended (additive).
6. `groups`: pure `lib/member-groups.ts` (persons of the `self` and `guardian` grants, the active rows) with tests; `memberGroups` in `services/groups-read.ts`; route `GET /api/groups/member-groups` (`people.self`); injection widget `groups.injection.club-ward-groups` on the spot `vereino:club:ward:groups`.
7. UI: `ConsentList` (read-only consents with date and author); `/club/profile` gets the phone field error and help, "Wards and consents", "My guardians" and "Change password"; `/club/wards/[personId]` gets the age, the groups section and the consents' authors. en + pl strings.
8. Docs: club spec UI and API rows plus Changelog; `people` and `groups` READMEs.
9. Integration test `people/E06-S22-profile-wards-guardians.spec.ts` (API + UI, both families, axe in light and dark, 375 px).

## Decisions

- **Phone checked only when it changes, and only on `/me`.** A number stored before this change (or by an import) does not block a member's other edits; the admin person form and the import keep their current rules, because tightening them would turn existing import files into commit errors — a separate decision for the product owner, not part of M-10.
- **Phone format:** nine digits not starting with 0 (optionally after `0048`) or E.164 (`+`, country code, 7–15 digits); spaces, hyphens, dots and parentheses between digits are allowed and stored as typed.
- **Groups through a `groups` route and widget**, as the issue notes: `people` renders the spot `vereino:club:ward:groups` with `{ personId, variant }`; `groups` answers from the caller's own grants, so a member never reads another family's groups. One shared query per page, filtered per ward.
- **Guardians under the `self` grant:** the member's own guardianship links (the member is the ward), active on the club day, one per guardian. Each guardian is listed with the consents of their own link, read-only; the ward's consent change stays 403 `scope_denied` (unchanged command rule).
- **Consent author by name:** the names of `byPersonId` are resolved in the same read as the wards and guardians; an author the reader cannot resolve gets `byName: null`, never an id-only label.
- **Change password** links to the platform page `/backend/profile/change-password` (auth only, no feature).

## Commands and results

- `npx jest src/modules/people/lib --coverage …`: 134 passed; `member-rules.ts`, `people-rules.ts` 100 %.
- `npx jest src/modules/groups/lib --coverage …`: 25 passed; `member-groups.ts` 100 % (first run 93.75 % branches on the sort comparator; fixed with a `sectionKey` helper).
- `yarn generate`, `yarn typecheck`: passed (a first typecheck failed on an apostrophe inside a single-quoted OpenAPI description; fixed).
- `yarn test:integration:vereino --filter E06-S22`: 1 passed (1.9 min), first run.
- `yarn verify`: all 13 steps passed.
- Regression over the changed member pages: `--filter TEST-006` 2 passed (2.1 min); `--filter E02-S03` 7 passed (4.1 min).

## Open problems

- None known.

## Follow-up run 2026-11-06: `om-auto-fix-pr 166` (red integration)

- **Agent / tool:** Claude Code (Opus 5.5) under cezar (task 6b91add0), `om-auto-fix-pr`; one read-only review subagent. Worked on a detached HEAD at `origin/feat/issue-104-profile-wards-guardians` (dd25de2, `main` already merged in, no conflicts) and pushed with `git push origin HEAD:feat/issue-104-profile-wards-guardians`.
- **CI failure (run 42101675559, `integration`):** only `E06-S22` failed, both attempts, at `page.goto('/club/profile')` after the switch to Ola: `net::ERR_ABORTED`, then "Navigation … is interrupted by another navigation to /login?redirect=%2Fbackend%2Fprofile%2Fchange-password". Cause: the test cleared the cookies while `/backend/profile/change-password` was open, and that page's redirect to `/login` raced with the next navigation. Test bug, not a product bug. Fix: `page.goto('about:blank')` before `clearCookies()`. Lesson `leave-backend-page-before-clearing-cookies`.
- **Review (subagent, read-only):** no blocking findings. Fixed in this run: a blank phone (`"phone": ""`) sent to `PUT /api/people/me` hit the new check and got a 422, where before it was accepted. `people.persons.update_self` now stores a blank phone as `null`, and the E06-S22 API part asserts that. Non-blocking items went to a follow-up issue (see the PR comment).
- **Commands:** `yarn test:integration:vereino --filter E06-S22`, race fix only: 1 passed (59 s). With the blank-phone fix: 1 passed (58.5 s). `yarn verify`: all 14 steps passed.
- **Follow-up:** #191 (phone rule on the admin and import paths, unused catalog keys, spec API row, product check on consent author names).
