# Default privacy notice in Polish and English with a children's version (E19-S03)

- **Date:** 2026-11-21
- **Agent / tool:** Claude Code (Opus 5.5), om-auto-fix-issue (feature route), Cezar run 1f466539 (step 1 of 3: build, draft PR)
- **Trigger:** `cezar` label on #469
- **Spec / issue / branch:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` S9.2, S9.3, S9.7, phase E5 slice (a); #469 (epic #461, depends on #468, merged); branch `feat/issue-469-privacy-notice-pl-en-children`
- **Status:** completed (draft PR for the independent reviewer)

## Goal

Give every club a default privacy notice in Polish and English, generated from `docs/compliance/ropa.md` and
`processors.md`, with the club's name filled in and a short version for children; show it from the public pages
until the club sets its own; leave a club's own text unchanged.

## Steps

1. Claimed #469 (assignee, `in-progress`, 🤖 comment naming this worktree and branch). No open PR, no other claim.
2. Read the issue, epic #461 owner decisions, S9 of the standards spec, `docs/compliance/{ropa,processors,retention,legal-verification}.md`.
3. Found how the club "edits" its privacy policy today: B-03 stores a URL (`club_core_club_settings.privacy_policy_url`, #195) and three public footers (club_core `PublicFrame`, facilities `PublicFacilitiesFrame`, activities `PublicSessionView`) link to it only while it is set.
4. Built: `privacyPolicyHref`/`publicPrivacyHref` in `@vereino/ui` (`public-nav.ts`, unit-tested); the three footers always show the privacy link, the club URL when set, else `/p/<slug>/privacy` (`data-source` = `club` | `default`); new page `/p/[clubSlug]/privacy` (`PublicPrivacyView`, server-loaded through the public club API like P-01, title "{club} — Privacy policy"); section structure in `club_core/lib/privacy-notice.ts` with a unit test that checks both catalogs hold every key with the same placeholders; 65 catalog keys `club_core.privacy.*` in `en.json` and `pl.json`; B-03 help text of the privacy URL field now says what happens while it is empty.
5. Integration: new `E19-S03-privacy-notice.spec.ts`; updated `E06-S07b-public-footer-links.spec.ts`, whose "no privacy link while unset" assertions changed by design (AGENTS.md rule on changed `data-testid` visibility).
6. Compliance README row and retention open item R-G point at the notice; spec changelog file added.

## Decisions

- **No migration, no API change.** The default lives in the catalogs, so it follows the page language and needs no stored row (the issue made a migration an Ask First). The public API keeps sending `privacyPolicy: null` while unset (a protected response field after first deploy, `BACKWARD_COMPATIBILITY.md`); the fallback is decided in the browser from the slug.
- **A club URL wins everywhere**, including on `/p/<slug>/privacy`, which then only points to the club's text: showing the default next to the club's own policy could contradict it.
- **Shared helper in `@vereino/ui`** next to `publicClubHref`, because three modules render the footer and S4.3 forbids importing club_core's frame at runtime.
- **Text facts** come from the compliance pack: bases A1–A14, recipients P-1…P-4 and the accountant, retention R1, R3, R6, R9, R17 (including R-G: erased data persist in backups ~13 months). Transfer mechanisms are worded as "safeguards of chapter V, such as DPF or SCCs" because `processors.md` still lists them as to confirm (P-1a, P-2a). Digital-consent age 16 per legal-verification B1. The `trips` consent basis (ropa O-3) is not named; the optional-consent list names image, published coach name and shared contacts.
- **Draft status:** the notice is part of the compliance pack the owner approves (ENG-TEST-14); legal approval is out of scope (issue).

## Files changed

- `packages/ui/src/public/public-nav.ts`, `packages/ui/src/__tests__/public-nav.test.mjs`
- `packages/app/src/modules/club_core/components/public/{PublicFrame,PublicPrivacyView}.tsx`, `public-server.ts`
- `packages/app/src/modules/club_core/frontend/p/[clubSlug]/privacy/{page.tsx,page.meta.ts}`
- `packages/app/src/modules/club_core/lib/privacy-notice.ts`, `lib/__tests__/privacy-notice.test.ts`
- `packages/app/src/modules/club_core/i18n/{en,pl}.json`
- `packages/app/src/modules/facilities/components/public/PublicFacilitiesFrame.tsx`
- `packages/app/src/modules/activities/components/public/PublicSessionView.tsx`
- `packages/app/.ai/qa/tests/club_core/E19-S03-privacy-notice.spec.ts`, `E06-S07b-public-footer-links.spec.ts`
- `docs/compliance/README.md`, `docs/compliance/retention.md`
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-21-issue-469-privacy-notice.md`

## Commands and results

- `yarn generate` — ok (route registered in `frontend-routes.generated.ts`).
- `yarn typecheck` — exit 0.
- `packages/ui`: `yarn test` — all pass, 100 % lines/branches/functions.
- `yarn workspace @vereino/app jest src/modules/club_core/lib/__tests__/privacy-notice.test.ts` — 6 passed.
- `yarn test:integration:vereino --filter E19-S03` — first run failed verbatim: `expect(locator).toBeInViewport() failed … getByTestId('privacy-section-kids') … Received: viewport ratio 0` (the full notice's "children" section also had `id="privacy-children"`, so the jump link landed there). Renamed the anchor to `privacy-for-children`; rerun: `1 passed (40.3s)`.
- `yarn test:integration:vereino --filter E06-S07b` — `1 passed (41.5s)`.
- `yarn verify` — failed at `lint` (`restrict-template-expressions`, number in a template literal in `privacy-notice.ts`), fixed; failed at `glossary:check` (`club_core.privacy.data.item3` used "zajęcia" where English says "sessions"; glossary D-031 wants "termin"), reworded (and "zdarzeń" → "incydentów" for consistency); final full run: all 18 steps passed.
- Screenshots (desktop EN light/dark, 375 px PL light/dark, club with its own policy) from the E19-S03 run are attached to the PR.

## Open problems

- The notice states the target periods of S9.5; two are not enforced yet: the 12-month anonymisation (#471) and the 30-day token deletion (#525).
- The controller's address and registration number are not stored in Vereino; the notice tells readers to ask the board. A club that wants them on the page sets its own policy URL.

## Next steps

- Independent review of the draft PR (step 2 of the Cezar run).
- Owner approval of the notice wording together with the compliance pack.
