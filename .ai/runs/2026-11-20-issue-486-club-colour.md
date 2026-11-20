# Run: issue #486 — each club has its own colour (E20-S07)

- **Trigger:** Cezar queued `om-auto-fix-issue 486` after the `cezar` label (2026-11-20T10:50Z), task f475ea6b.
- **Issue:** #486 (epic #479), feature route; migration approved by the owner on 2026-11-20 (decision 3 of #479).
- **Spec:** reused `.ai/specs/2026-10-20-vereino-club-management.md` (club settings data model, REQ-028), like #195 did for the footer links; changelog `2026-11-20-issue-486-club-colour.md`.
- **Branch:** `feat/issue-486-club-colour-theme` (Cezar worktree).

## Goal

The club sets its colour on B-02; it paints the member header bar on `/club`, the hero and header strip on `/p/...` and the fallback logo, with text that reaches 4.5:1 in light and dark; without a colour the pages use `--primary`; a section without any logo shows its own initial.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the run, worktree and branch).
2. Routed: no covering spec of its own; the club management spec owns the club settings, so the route is `reuse-spec` (one PR, no separate spec PR), as #195 did.
3. `@vereino/core` `club-accent.ts`: `normalizeHexColor`, `relativeLuminance`, `contrastRatio`, `accentForeground`, `clubAccent`; unit tests reproduce the tokens.md table exactly and check every grey reaches 4.58:1; 100 % coverage.
4. `club_core`: `accent_color` column (migration from `yarn db:generate` offline, `lock_timeout` and `down()` by hand), settings command (422 `accent_color_invalid`, undo restores it), settings read/write (`accentColor`, computed `accentForeground`), `club.accent` in every public club frame (and the response schemas of `club_core`, `activities` and `facilities`).
5. `people`: `club.accent` in the member profile (`GET /api/people/me`), passed by all six `/club` frames.
6. `packages/app/src/app/vereino-tokens.css` (closes C4): `--club-accent`, `--club-accent-foreground` with Tailwind colours, default the primary pair; imported from `globals.css`.
7. `@vereino/ui`: `clubAccentStyle` and `ClubAccentRoot` (the root `div` of a frame, so app code needs no inline style); `MemberShell` brand bar in the accent (switchers move under it); `PublicHeader` accent strip and accent fallback logo.
8. Public frames set the style on their root; club and section heroes in the accent (logo inverted inside); `LogoMark` fallback in the accent.
9. Section initial: a section with neither its own nor a club logo shows its own initial (public API and the staff Sections list / section form).
10. B-02 field "Club colour" (en/pl).
11. Integration test `E20-S07-club-colour.spec.ts`.

## Decisions

- **Validation in the command, not zod:** like the bank account, a bad colour is a localized 422 `accent_color_invalid` on the field; three-digit and upper-case hex are accepted and stored as `#rrggbb`.
- **Same pair in light and dark** (tokens.md *Club accent*: "same"): the computed foreground is fixed, so the contrast holds in both schemes.
- **Header:** the public header gets a 4 px strip in the accent (no text on it); the member header's brand row becomes the accent bar. Navigation links stay on the card colour, so their contrast is unchanged.
- **Hero logo:** inside the accent hero the fallback initial is inverted (foreground box, accent letter), so it never vanishes into the hero.
- **Panel not themed** (out of scope): the staff section list only switches to the section's own initial; its box stays `bg-muted`.
- **tokens.md left as is:** PR #499 (E20-S01) rewrites the `--club-accent` rows and C4; editing them here would conflict.

## Files changed

`packages/core/src/{club-accent.ts,index.ts,__tests__/club-accent.test.mjs}`; `packages/ui/src/{theme/club-accent-style.ts,index.ts,member/member-shell.tsx,public/public-header.tsx,__tests__/{club-accent-style,member-shell,public-header}.test.mjs}`; `packages/app/src/app/{globals.css,vereino-tokens.css}`; `packages/app/src/modules/club_core/{data/entities.ts,data/validators.ts,commands/settings.ts,services/settings.ts,services/public-site.ts,lib/error-codes.ts,lib/__tests__/error-codes.test.ts,api/settings/route.ts,api/public-shared.ts,api/public/**/route.ts,components/{ClubSettingsForm,SectionsTable,SectionForm}.tsx,components/public/{PublicFrame,PublicClubView,PublicSectionView}.tsx,components/public/public-client.ts,i18n/{en,pl}.json,migrations/{Migration20261120112910_club_core.ts,.snapshot-open-mercato.json}}`; `people/{services/club-clock.ts,services/member-profile.ts,api/me/route.ts,components/club/{member-client.ts,ClubFrame.tsx}}`; the `/club` frames of `activities`, `facilities`, `payments`, `communication`, `groups`; `activities/api/public/…/sessions/…/route.ts`, `activities/components/public/PublicSessionView.tsx`, `activities/components/club/club-client.ts`; `facilities/api/public-shared.ts`, `facilities/components/public/PublicFacilitiesFrame.tsx`; the club management spec and its changelog file; `packages/app/.ai/qa/tests/club_core/E20-S07-club-colour.spec.ts`.

## Commands and results

- `yarn workspace @vereino/core test` — 123 passed, 100 % lines/branches/functions (`club-accent.ts` 100 %).
- `yarn workspace @vereino/ui test` — 215 passed, 100 %; two member-shell assertions and one public-header assertion updated to the new markup.
- `jest src/modules/club_core/lib` — 125 passed (error-code table test gained `accent_color_invalid`).
- `yarn db:generate` — `club_core: generated Migration20261120112910_club_core.ts`; a second run reports no changes.
- `yarn typecheck` — passed.
- `yarn test:integration:vereino --filter E20-S07` — run 1 failed: "Expected: >= 4.5, Received: 1.507" (the test parsed Chrome's `oklch(...)` computed colours as RGB; the test now paints each colour on a canvas to read it as RGB); run 2 failed: "Expected: rgb(11, 42, 91), Received: rgb(23, 23, 23)" on the `/club` bar right after a reload (the bar shows the default until the profile loads; now polled); run 3 passed; after the `ClubAccentRoot` change and with screenshots, passed again (rebuild), and once more with the toast hidden for the evidence shot.
- Regressions `--no-build`: TEST-040 2 passed, E06-S19 1 passed, TEST-N09 1 passed.
- `yarn verify`: failed at `typecheck:packages` (`noUncheckedIndexedAccess` in `club-accent.ts`), then `lint` (spread on a string), then `format:check`, then `ds:check` (`inline-style` in `PublicFrame.tsx`: the frames now use the shared `ClubAccentRoot` of `@vereino/ui`); after the fixes a full run passed all 18 steps.

## Open problems / next steps

- The `/club` screenshot hides the platform's English "Access denied" flash toast, which sits over the header on Today (E20 audit; its own story).
- tokens.md still marks `--club-accent` as *new*/*to be built* (owned by PR #499); a later docs change can mark it built.
