# Run: issue #89 — public footer, breadcrumb and section tiles (E06-S07)

- **Trigger:** cezar task, `om-auto-fix-issue 89` (unattended).
- **Issue:** [#89](https://github.com/wladku/Vereino/issues/89), epic #82; dependencies #85 and #91 closed. Follow-up: [#195](https://github.com/wladku/Vereino/issues/195).
- **Spec:** `.ai/specs/2026-10-20-vereino-club-management.md` (phase 2 step 9, REQ-025); design authority `docs/ux-concept/README.md` P-01, P-02, 3.1.
- **Branch:** `feat/issue-89-public-footer-breadcrumb`.
- **Outcome:** implemented without the footer's "Rules" and "Privacy policy" links, which moved to #195 (they need an Ask First decision).

## Steps

1. Classified the issue as a feature, so it took the feature route. The covering spec is the club management spec. Claimed the issue: assignee, `in-progress` label and the 🤖 comment.
2. Found that the two footer links have no source (below). Stopped, released the claim and asked the owner (commit 40f9b32).
3. The user told the session to continue autonomously without asking. Approval for Ask First items cannot be assumed, so the run took the option that needs none: ship everything else and file the links as #195. Re-claimed the issue.
4. Implemented:
   - `groups.publicCatalog.clubBlock`: the counts of public groups per public section. Pure `publicGroupCounts` in `groups/lib/public-catalog.ts`.
   - `club.contact` on the section page and on `clubFrame`, which feeds the `activities` session page.
   - A footer in `PublicFrame` and in the session page's frame.
   - The P-02 breadcrumb and the tile text "{n} groups — see classes", with pure `pluralForm` and `phoneHref` in `club_core/lib/public-page.ts`.
   - en and pl strings, the OpenAPI schemas, the module READMEs, a spec note under step 9 and a changelog entry.
5. Ran `yarn verify` and the integration tests.

## Findings and decisions

- **Privacy policy:** `@open-mercato/content` is installed but not enabled in `src/modules.ts`, so `/privacy` does not exist. Enabling it is Ask First. Its `/privacy` and `/terms` pages are static English text: Open Mercato sp. z o.o.'s own policy, not the club's.
- **Rules:** neither the club settings nor the publication settings hold rules. A club-owned source needs a migration (Ask First). Both options are listed on #195.
- **Footer on every `/p/...` page:** the `activities` session page has its own frame, so it got a small footer of its own. `activities` does not import `club_core` components. It reads `club.contact` from `clubFrame`.
- **Group counts:** they ride the existing `groups` provider key on the club page and are gated by `description_schedule`, like the group cards. Only live, active, public groups of public sections count.
- **Polish plurals:** the tile key is chosen by CLDR form through `Intl.PluralRules` (one, few, many, other), because the catalogs have no plural syntax.
- **API changes:** all additive (`club.contact` on two responses, the club page's `blocks.groups`). The phone stays gated by `contact` on every response.

## Files changed

- `packages/app/src/modules/groups/`:
  - `lib/public-catalog.ts` (+ test);
  - `services/public-catalog.ts`;
  - `README.md`.
- `packages/app/src/modules/club_core/`:
  - `lib/public-page.ts` (+ test);
  - `services/public-site.ts`;
  - `components/public/{PublicFrame,PublicClubView,PublicSectionView}.tsx` and `public-client.ts`;
  - `api/public/[clubSlug]/sections/[sectionSlug]/route.ts`;
  - `i18n/{en,pl}.json`;
  - `README.md`.
- `packages/app/src/modules/activities/`:
  - `components/public/PublicSessionView.tsx`;
  - `api/public/[clubSlug]/sessions/[occurrenceId]/route.ts`;
  - `i18n/{en,pl}.json`.
- `packages/app/.ai/qa/tests/club_core/E06-S07-public-footer-breadcrumb.spec.ts` (new).
- `.ai/specs/2026-10-20-vereino-club-management.md` and `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-06-issue-89-public-footer-breadcrumb.md`.

## Commands and results

- `yarn verify`, first run: `lint` failed with one error in the new test, `@typescript-eslint/no-unnecessary-type-parameters` ("Type parameter T is used only once in the function signature"). After the fix, `yarn verify --from typecheck:qa` passed all 11 steps; `generate` and `typecheck` had passed in the first run.
- `yarn test:integration:vereino --filter E06-S07`, three runs:
  - Run 1 failed: `POST /api/club_core/sections … "Unrecognized key: \"shortDescription\""`. The short description is set on the section's public endpoint.
  - Run 2 failed: `POST /api/activities/activities … path ["placeId"] … expected string, received undefined`. A session needs a place.
  - Run 3: **1 passed**.
- `yarn test:integration:vereino --filter TEST-037`: **2 passed** (`public-blocks` and `public-groups-schedule`).
- Lesson: `.ai/lessons/public-page-test-setup-section-public-fields-and-activity-place.md`.

## Open problems / next steps

- #195: choose the source of the rules and privacy-policy links (enable `content`, or club-owned links with a migration).
