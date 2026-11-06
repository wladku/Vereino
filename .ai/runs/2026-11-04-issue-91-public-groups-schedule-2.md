# Issue #91: public groups, schedule, instructors and club events on the public pages (run 2)

- **Date:** 2026-11-04 – 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run unattended by cezar
- **Trigger:** `/om-auto-fix-issue 91` (E06-S09, epic #82), after the product owner approved both migrations on #91 (2026-11-04)
- **Previous run:** [`2026-11-04-issue-91-public-groups-schedule.md`](2026-11-04-issue-91-public-groups-schedule.md) stopped for that approval; its log is carried on this branch.
- **Branch:** `feat/issue-91-public-catalog`, from `main` at 07ced5f. The first run's branch name `feat/issue-91-public-groups-schedule` is still held by that run's worktree, so this run uses a new name.
- **Spec:** `.ai/specs/2026-10-20-vereino-club-management.md`, phase 2 step 9 (TEST-037, REQ-025, AC-025, DD-28, DD-29)
- **Status:** implemented and verified locally; PR opened by this run.

## Goal

A guest sees, on a public section page (P-02), a card for each public group: its age, level, description, weekdays and times, place, next three sessions (a cancelled one struck through), requirements and instructor ("First L." only with that person's consent, otherwise "Section coach"). The club page (P-01) lists upcoming one-off events. A block the club switched off in B-03 is absent from the API response. Out of scope: fees on the card (E07-S05) and the facilities block (E08).

## Steps

1. Read the issue, the owner's approval comment and the previous run's log. The issue had no assignee, label or claim comment from another actor, and no open PR referenced it. Claimed it with the assignee, the `in-progress` label and a claim comment.
2. Classified it as a feature with a covering spec (phase 2 step 9). Read the DD-28 provider contract (`club_core/services/public-blocks.ts`, `public-site.ts`), the section page, the group record, the profile consent pattern and the activities model.
3. `people`: added `publish_name_consent_at` (entity, `SELF_CONSENT_KINDS`, `selfUpdateSchema.publishNameConsent`, `people.persons.update_self` with snapshot and undo, the `/me` view and OpenAPI), `publicPersonName` ("Anna K."), and `people.personDirectory.publicNames` (consenting persons only). `/club/profile` shows the switch to a member with the `coach` context.
4. `groups`: added the public fields and `group_age_range_inverted` (422 on `ageTo`, checked on the merged values of an update), the list, detail and OpenAPI fields, the B-12 "Public page" tab (`GroupPublicForm`), `groups.directory.publicGroups`, and the `groups.publicCatalog` provider (pure `lib/public-catalog.ts`).
5. `activities`: added the `activities.publicSchedule` provider (pure `lib/public-schedule.ts`). On a section page it returns the series weekdays, times and place and the next three sessions per public group. On the club page it returns the upcoming one-off events of public groups in public sections.
6. `club_core`: the club page's provider context now names the public sections (`PublicClubBlockContext`). The section page renders the group cards and the club page renders the events (`PublicClasses.tsx`). Updated the block help texts. Added en and pl strings everywhere.
7. Migrations: started a throwaway `postgres:17-alpine` container (`vereino-91-gen`, port 55491), ran `yarn db:generate` against it, rewrote both migrations in the repository style (comment, `lock_timeout`, `drop column if exists` in `down()`), proved up → down → down (idempotent) → up as raw SQL on stub tables, confirmed a second `db:generate` reports no changes, then stopped the container. No dev or real database was touched.
8. Tests: unit tests for the new pure functions, and the integration spec `TEST-037-public-groups-schedule.spec.ts` (API, public pages in the browser at 375 px, en and pl, axe, the B-12 tab's field error).
9. Spec step 9 note and changelog row; module READMEs (`groups`, `activities`, `club_core`, `people`); lesson `db-generate-snapshot-style-and-public-block-scope`.

## Decisions

- **Instructors:** active `coach` and `assistant` memberships of the group, coaches first. The API sends `{ name: null }` without consent, so the full last name and the person id never leave the server. The page says "Section coach" for a team and "Section instructor" for a class group (mock-up `screenSectionPage`).
- **Gating:** both providers hang on `description_schedule`. Requirements need `conditions` and instructors need `coaches`, decided inside the `groups` provider from `publishedBlocks`. A switched-off block is absent from the response, not just hidden.
- **Public sections come from `club_core`.** Instead of letting `activities` read section publication, the club page's context lists the public sections, and `groups.directory.publicGroups` names the public groups among them.
- **Events:** every one-off activity (no RRULE) of a public group, upcoming, at most ten, cancelled ones flagged. The schedule's "next sessions" come from the group's series only, so a tournament does not take a training slot on the card.
- **Group id in the public response:** the cards and the schedule are joined by the group id on the client. It identifies a public record and carries no personal data.
- **Age:** 0–99 whole years, either bound optional. The order is checked in the command (422 with `fieldErrors.ageTo`), not by a DB constraint, the same way as the section rules.

## Files changed

- `people`: `data/entities.ts`, `data/validators.ts`, `lib/member-rules.ts` (+ test), `commands/self.ts`, `services/member-profile.ts`, `services/person-directory.ts`, `di.ts`, `api/me/route.ts`, `components/club/ClubProfilePage.tsx`, `components/club/member-client.ts`, `i18n/*.json`, `migrations/Migration20261104222405_people.ts`, snapshot, `README.md`.
- `groups`: `data/entities.ts`, `data/validators.ts`, `lib/groups-rules.ts` (+ test), `lib/error-codes.ts`, `lib/public-catalog.ts` (+ test), `commands/groups.ts`, `api/shared.ts`, `api/groups/route.ts`, `api/groups/[id]/route.ts`, `services/directory.ts`, `services/group-directory.ts`, `services/public-catalog.ts`, `di.ts`, `components/GroupRecord.tsx`, `components/GroupPublicForm.tsx`, `components/client-helpers.ts`, `i18n/*.json`, `migrations/Migration20261104222405_groups.ts`, snapshot, `README.md`.
- `activities`: `lib/public-schedule.ts` (+ test), `services/public-schedule.ts`, `services/directory.ts`, `di.ts`, `README.md`.
- `club_core`: `services/public-blocks.ts`, `services/public-site.ts`, `components/public/PublicClasses.tsx`, `PublicSectionView.tsx`, `PublicClubView.tsx`, `public-client.ts`, `i18n/*.json`, `README.md`.
- Tests: `.ai/qa/tests/club_core/TEST-037-public-groups-schedule.spec.ts`, `people/E02-S03-member-accounts.spec.ts` (third consent), fixtures `members.ts` and `groups.ts`.
- `.ai/specs/2026-10-20-vereino-club-management.md`, `.ai/lessons/db-generate-snapshot-style-and-public-block-scope.md`, `.ai/lessons.md`, this log.

## Commands and results

- `yarn generate`: done (the new worktree had no `.mercato/generated`; the first `yarn typecheck` failed only on those missing files).
- `yarn typecheck`: one error, `Promise<Loaded<Occurrence…>[]>` not assignable to `Promise<Occurrence[]>` in `activities/services/public-schedule.ts`. Fixed by mapping to `PublicSessionRow`, then clean. An earlier syntax error (an apostrophe in a single-quoted OpenAPI description) was fixed the same way.
- `yarn db:generate` (throwaway DB): `groups: generated Migration20261104222405_groups.ts`, `people: generated Migration20261104222405_people.ts`; the second run reported no changes in all modules.
- `yarn test`: 354 tests passed; `public-schedule.ts`, `public-catalog.ts`, `groups-rules.ts`, `member-rules.ts` at 100 % statements, branches, functions and lines.
- `yarn typecheck:qa`, `yarn lint` (0 errors; no warning in changed files), `yarn format:check`, `yarn ds:check`, `yarn i18n:check-hardcoded --strict`, `yarn contracts:check` (92 error codes, 0 problems), `node scripts/check-lessons.mjs`: pass.
- `yarn test:integration:vereino --filter TEST-037`: 2 passed (the existing `club_core` blocks spec and the new spec).
- `yarn test:integration:vereino --filter E02-S05`: 3 passed. `--filter E03-S01`: 5 passed, 1 flaky (the create form's async section option did not appear within 30 s on the first try; passed on retry; that form was not changed). `--filter TEST-030`: 2 passed.
- `yarn test:integration:vereino --filter E02-S03`: first run 1 failed, 6 passed — `expect(initial.body?.person.consents).toEqual({...})` received the new `publishNameConsent` key (line 230 of `E02-S03-member-accounts.spec.ts`). The test now expects the third consent; the re-run passed 7 of 7.
- `yarn verify`: all 13 steps passed.

## Open problems

- None blocking. The age category dictionary (`age_category_entry_id`) still waits for the `dictionaries` module; fees on the card wait for E07-S05.

## Next steps

- Review and merge the PR; the operator applies both migrations on deploy.
