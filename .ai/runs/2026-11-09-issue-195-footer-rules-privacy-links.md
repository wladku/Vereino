# Run — issue #195: footer links to the club's rules and privacy policy (E06-S07b)

- **Goal and trigger:** cezar task 9ac0843b (`om-auto-fix-issue 195`), unattended. Re-run after the owner decision of 2026-11-08: option 2 — the club enters the URLs of its rules and privacy policy on B-03, and every public page footer (`/p/...`) shows each link only when it is filled.
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` (E06-S07 entry of phase 3 step 9); #195 (follow-up of #89, epic #82); `feat/issue-195-footer-rules-privacy-links`. The first run (2026-11-06, `.ai/runs/2026-11-06-issue-195-public-footer-rules-privacy-links.md` on the local branch `feat/issue-195-public-footer-rules-privacy-links`) stopped for this decision.
- **Approval:** the owner comment on #195 (2026-11-08) approves the migration on `club_core_club_settings` (generated offline, reviewed, `lock_timeout`, hand-written `down()`, never applied to a dev or real database). Nothing else is Ask First: no dependency, no module, no breaking contract (the public responses gain one field).

## Steps

1. Claimed #195 (assignee, `in-progress`, claim comment), renamed the task branch.
2. Pure logic: `isPublicLinkUrl` and `publicLinkUrlSchema` (`lib/publication.ts`: an absolute `http:`/`https:` URL, at most 2000 characters, no surrounding spaces) and `clubLinks` (`lib/public-page.ts`: each link only when set and valid), with unit tests.
3. Persistence and API: `ClubSettings.rulesUrl` and `privacyPolicyUrl` (`rules_url`, `privacy_policy_url`); `Migration20261109170140_club_core.ts` generated offline (`DATABASE_URL` unreachable), header, `lock_timeout` and a hand-written `down()` added; `PUT /api/club_core/settings` accepts both (blank or null clears, anything else 400) and the read returns them; the command snapshots, restores and undoes them.
4. Public frame: `club.links` (`{ rules, privacyPolicy }`) on the club, section and frame responses, so it reaches the `activities` session page and the `facilities` public routes through `PublicClubFrame`; OpenAPI schemas updated in all three modules.
5. UI: B-03 gets the two URL fields, checked before saving (a field error with "Enter a full address…"); the footers of `club_core` (`PublicFrame`), `activities` (`PublicSessionView`) and `facilities` (`PublicFacilitiesFrame`) show a "Club documents" list with "Rules" and "Privacy policy", each only when set; en + pl.
6. Integration test `packages/app/.ai/qa/tests/club_core/E06-S07b-public-footer-links.spec.ts`: refused URLs (400), B-03 at 375 px with the invalid-field path, all four public responses and pages (with an axe scan), the Polish labels, then one link and none.
7. Spec: the `ClubSettings` data-model row and the E06-S07 entry of phase 3 step 9 updated; changelog entry `2026-11-09-issue-195-footer-rules-privacy-links.md`.

## Decisions

- **URLs only, no upload field.** The owner's comment allows "URLs (or links to uploaded files)"; a file uploaded to the club's website or storage is linked by its URL. An upload would need its own attachment owner, a public file route and a removal flow for one link.
- **No block gates the links.** The owner's decision says "shown only when filled"; the club page itself must be published, as for every public response.
- **http(s) only, checked on write and on read.** The value goes into an `href` on an unauthenticated page; `javascript:`, `data:`, `mailto:` and relative paths are refused (400), and `clubLinks` drops any stored value that is not a valid URL.
- **The writes need `club_core.manage`, like the club phone**, not `club_core.publication.manage` (which only the `publication` key requires). Both belong to the club administrator today.
- **Each module keeps its own footer copy**, as #89 and #124 did: the ESLint module boundary forbids `activities` and `facilities` from importing the `club_core` frame at runtime.

## Files changed

`packages/app/src/modules/club_core/{data/entities.ts,data/validators.ts,lib/publication.ts,lib/public-page.ts,lib/__tests__/*,services/settings.ts,services/public-site.ts,commands/settings.ts,api/settings/route.ts,api/public-shared.ts,api/public/[clubSlug]/route.ts,api/public/[clubSlug]/sections/[sectionSlug]/route.ts,components/PublicationForm.tsx,components/public/{PublicFrame.tsx,public-client.ts},migrations/{Migration20261109170140_club_core.ts,.snapshot-open-mercato.json},i18n/*}`, `packages/app/src/modules/activities/{api/public/[clubSlug]/sessions/[occurrenceId]/route.ts,components/public/PublicSessionView.tsx,i18n/*}`, `packages/app/src/modules/facilities/{api/public-shared.ts,components/public/PublicFacilitiesFrame.tsx,i18n/*}`, the integration test, the club spec, its changelog entry and this log.

## Commands and results

- `npx jest …/publication.test.ts …/public-page.test.ts --coverage` — 27 tests pass; `publication.ts` and `public-page.ts` 100 % statements, branches, functions, lines.
- `DATABASE_URL=<unreachable> yarn db:generate` — only `club_core: generated Migration20261109170140_club_core.ts` (the two columns); the snapshot diff is the two columns after prettier.
- `yarn typecheck`, `yarn typecheck:qa` — ok.
- `yarn verify` run 1: generate, typecheck, typecheck:packages, typecheck:qa, lint (0 errors) passed; `format:check` failed: `packages/app/src/modules/club_core/components/public/PublicFrame.tsx is not formatted`. After prettier: `yarn verify --from format:check` — all 9 remaining steps passed (`test`: 70 suites, 876 tests; `build` ok).
- `yarn test:integration:vereino --filter E06-S07b` — not run locally: `docker info` → `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`, and the run rules forbid touching Docker Desktop. Left to CI.
- CI on PR #235 (run 42662744032): gate, browser-smoke, perf, dependency-review, pr-title and integration shards 1–3 pass; shard 1/3: `✓ … E06-S07b-public-footer-links.spec.ts:32:1 › E06-S07b footer links to the club rules and privacy policy, only when set (21.8s)`.

## Open problems

- None. UI QA evidence (`needs-qa`) is left to the review pipeline.

## Next steps

- Review and merge the PR; then #195 closes.
