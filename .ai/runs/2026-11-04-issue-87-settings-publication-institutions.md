# Issue #87: E06-S05, club settings, publication and institutions

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run by cezar; no subagents
- **Trigger:** `/om-auto-fix-issue 87` (E06-S05, epic #82)
- **Branch:** `feat/issue-87-settings-publication-institutions`
- **Status:** implemented; PR for review

## Goal

B-02: a time zone select (IANA), the account age threshold range, an editable club name. B-03: the public address `/p/{slug}` always shown with a Preview link that says why it is disabled. B-07: a bank account column, NRB validation and a type filter.

## Steps

1. Read the issue, its comments and #135. No open PR referenced #87.
2. First pass: stopped before claiming, because Q1 and Q2 were blocking and unanswered (Definition of Ready). Posted a not-ready comment (issuecomment-6639859760) and committed this log.
3. The owner told the session to continue autonomously with reasonable assumptions. Took the issue's own proposals as autonomous defaults and recorded them on the issue: Q1 = 13–18; Q2 = edit the platform organization's name, so no migration is needed (the migration route is an Ask First item and was not approved).
4. Implemented the pure logic in `lib/`, then commands, routes, UI and i18n, then unit and integration tests. Ran `yarn generate`, `yarn typecheck`, `yarn format` and `yarn verify`, plus the focused integration tests.

## Decisions

- **Q1 → 13–18** (README B-02). Request validation keeps only the shape; the rule is checked in the command and answers 422 `account_age_threshold_out_of_range` with a field error. A stored value below 13 now reads as the default 16 and is listed in `defaultsApplied` (the fixtures use 13 or 16).
- **Q2 → the platform organization's name.** `GET /api/club_core/settings` returns `clubName`; `PUT` accepts it and, after the settings command has authorized the club administrator, runs the installed `directory.organizations.update` command for the caller's own organization. No new column and no migration. The two commands are not atomic: a failed rename after a saved settings change answers the rename's error, and the settings change stays. `shortName` remains the club-owned display name.
- **Time zone:** the select lists `Intl.supportedValuesOf('timeZone')` plus the stored zone. The API answers 422 `timezone_unknown` (it was 400 before; this is pre-release and the code is new, `BACKWARD_COMPATIBILITY.md` §3).
- **NRB:** 26 digits, spaces and a leading `PL` accepted, stored as the 26 digits, printed as 2 + 6 × 4. No checksum, because the README asks only for 26 digits. An update that resends an unchanged legacy value is not rejected, so old records stay editable.
- **B-03:** `clubPagePreview` returns the path and either the link or a reason (`slug_missing`, `page_off`). The disabled Preview is an `aria-disabled` element described by the reason text.

## Files changed

- `packages/app/src/modules/club_core/lib/settings.ts`, `lib/institutions.ts` (new), `lib/publication.ts`, `lib/error-codes.ts`, plus their `__tests__`
- `packages/app/src/modules/club_core/data/validators.ts`, `commands/settings.ts`, `commands/institutions.ts`, `commands/shared.ts`
- `packages/app/src/modules/club_core/api/settings/route.ts`, `api/institutions/route.ts`
- `packages/app/src/modules/club_core/components/ClubSettingsForm.tsx`, `PublicationForm.tsx`, `InstitutionsTable.tsx`, `InstitutionForm.tsx`
- `packages/app/src/modules/club_core/i18n/en.json`, `pl.json`, `README.md`
- `packages/app/.ai/qa/tests/club_core/E06-S05-settings-publication-institutions.spec.ts` (new), `TEST-001-club-structure.spec.ts`, `foundation/TEST-F09-club-settings.spec.ts`
- `.ai/specs/2026-10-20-vereino-club-management.md` (Changelog row)
- `.ai/lessons/business-rule-422-not-in-zod-schema.md` + catalog row; also fixed a row order in `.ai/lessons.md` that was already wrong on `main` and made `lessons:check` fail

## Commands and results

- `npx jest src/modules/club_core/lib --coverage=false`: 8 suites, 64 tests passed.
- `yarn generate`, then `yarn typecheck`: clean.
- `yarn verify`, first run: failed at `lint` with 2 errors: `'@mikro-orm/postgresql' import is restricted` (the settings route read the organization itself) and `Invalid type ""slug_missing" | "page_off" | null" of template literal expression` (PublicationForm). Fixed by moving the read into `clubCoreSettings.organizationName` and adding a fallback in the template.
- `yarn verify --from typecheck`: all 12 steps passed (`generate` passed in the first run).
- `yarn test:integration:vereino --filter E06-S05`, first run: 2 passed, 1 failed with `Expected: 200 Received: 401`. `signInBrowser` resets the admin's password, which revokes the fixture's token, so the test now takes a fresh token with `getAuthToken`. Second run: 3 passed.
- `--filter TEST-F09`: 1 passed. `--filter TEST-001`: 4 passed.
- `yarn typecheck:qa` after the test fix: passed.
- During organization cleanup, the log shows a platform `QueryIndexScopeError` ("Query index event for a global entity must explicitly provide tenantId and organizationId as null") from `query_index.delete_one` for `directory:organization`. It comes from the installed indexer when a fixture deletes the organization, not from this change.

## Open problems / next steps

- The owner may override Q1 or Q2 on the issue. A club-owned display name with its own column would need an approved migration.
