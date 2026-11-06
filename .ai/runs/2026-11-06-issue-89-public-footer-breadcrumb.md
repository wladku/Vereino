# Run: issue #89 — public footer, breadcrumb and section tiles (E06-S07)

- **Trigger:** cezar task, `om-auto-fix-issue 89` (unattended).
- **Issue:** [#89](https://github.com/wladku/Vereino/issues/89), epic #82; dependencies #85 and #91 closed.
- **Spec:** `.ai/specs/2026-10-20-vereino-club-management.md` (public pages, REQ-025); design authority `docs/ux-concept/README.md` P-01, P-02, 3.1.
- **Branch:** `feat/issue-89-public-footer-breadcrumb` (local only, not pushed).
- **Outcome:** stopped before implementation. The issue needs an Ask First decision that is not recorded on it.

## Steps

1. Classified the issue as a feature (`feature` label), so it took the feature route. Covering spec: the club management spec. The dependencies are closed and no open PR references the issue.
2. Claimed the issue: assignee `wladku`, `in-progress` label and the 🤖 comment.
3. Read `club_core/services/public-site.ts`, `components/public/PublicFrame.tsx`, `PublicClubView.tsx`, `PublicSectionView.tsx`, `src/modules.ts`, the `ClubSettings` entity and the `groups` public catalog provider.
4. Found that the two footer links have no source (below), then released the claim with a comment.

## Findings

- **Privacy policy:** the issue links `/privacy` of the `content` module. `@open-mercato/content` is a dependency of `packages/app` but is **not enabled** in `src/modules.ts`, so `/privacy` does not exist. Enabling a module is an Ask First item, and no approval is recorded on the issue, in the spec or in an owner comment. The module's `/privacy` (and `/terms`) page is also static English text: the privacy policy of Open Mercato sp. z o.o., not of the club or of the Vereino operator.
- **Rules:** neither `ClubSettings` nor the publication settings hold rules (a document, URL or text). The only candidate without a schema change is `/terms` of the same `content` module. A club-owned source would need a migration, which is also Ask First.
- **Buildable without a decision:**
  - the footer with the club name and the published contact phone (`clubContact`, `contact` block);
  - the P-02 breadcrumb;
  - "{n} groups" on the section tiles, through a `clubBlock` on `groups.publicCatalog` under `description_schedule`. The short description already shipped with #85.

## Decisions

- Stopped rather than shipping without the links: acceptance criterion 1 requires both links, and the run rules forbid assuming Ask First approval.

## Files changed

- This run log only.

## Commands and results

- `gh issue view 85|91` → both `CLOSED`.
- `grep content packages/app/src/modules.ts` → no match (module not enabled).

## Open problems / next steps

The owner chooses one of these:

- (a) enable `content` and link its `/privacy` and `/terms`;
- (b) add club-owned rules and privacy-policy links to the club settings, with a migration;
- (c) ship the footer (name and phone), the breadcrumb and the group counts now, and move the links to a follow-up issue.

Then re-run `om-auto-fix-issue 89`.
