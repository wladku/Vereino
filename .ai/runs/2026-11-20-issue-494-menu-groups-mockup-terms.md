# Run: issue #494 — menu groups, page titles and terms match the mockup and glossary D-031

- **Trigger:** Cezar run, `om-auto-fix-issue 494` (label `cezar`, 2026-11-20).
- **Issue:** [#494](https://github.com/wladku/Vereino/issues/494) (E20-S15, epic #479), `bug`, `priority-medium`, `risk-low`.
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (REQ-N01, REQ-N11; phases 1 and 3; V-N02, V-N03).
- **Branch / worktree:** `fix/issue-494-menu-groups-mockup-terms`, Cezar worktree `69c8f100-…`.

## Goal

The panel's sidebar groups, menu items and page titles, and the member page titles, read as in the mockup
(`docs/ux-concept/mockups/i18n/*.json`, D-031) in both locales; the glossary check also covers `en.json` and the term
pairs "zajęcia → termin" and "trener → prowadzący", so a reintroduced case fails `yarn verify` naming the key.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree).
2. Mapped the mockup: `route.*` names (the mockup's member shell renders them as page titles), `b.screen*.title`, the
   spec's *Menu structure* table and *Glossary (D-031 §2)*. Most panel titles already matched (phase 3 of the spec);
   the gaps were the four group names, the split "Grupy" + "Harmonogram" groups, the group order, four menu labels,
   five member titles, the session edit page, and the cases the issue lists.
3. Page metadata: the activities pages moved to the shared `groups.nav.group` ("Zajęcia" / "Classes") with orders
   20–50 after Grupy (10); English `pageGroup` fallbacks follow the catalogs; Cash to settle moved after Order
   campaigns (spec order). Settings, Publication, Facility calendar and Requests got short menu labels through new keys
   (`club_core.nav.settings`, `club_core.nav.publication`, `facilities.nav.calendar`, `facilities.nav.requests`) as
   `pageTitleKey`; the breadcrumb and the page heading keep the long title (V-N03 fallback).
4. `src/modules.ts`: `overrides.nav.groupOrder` on the `club_core` entry with the six group ids (V-N02, approved in
   the spec on 2026-11-15); the local `ModuleEntry` type accepts `overrides`.
5. Catalogs (pl/en of activities, club_core, communication, facilities, groups, payments, people): group names,
   member titles (M-07 "Wątek", M-09 "Wynik płatności", M-10 "Profil i podopieczni", M-14 "Deklaracja z linku", M-16
   "Zamówienia", the session edit page "Edycja terminu"), "zajęcia" → "termin" where English says session, "trener" →
   "prowadzący" on the labels of the person running a session, "Cenniki i zniżki", English "Sparring" → "Friendly".
   `activities.nav.group` retired (no other reference).
6. `scripts/check-glossary.mjs`: rules carry a locale; the English catalogs are checked; term pairs apply only where
   the English value of the same key names the thing; new retired group names in both locales. Allow-list: the stale
   `activities.nav.group` entry removed; four rule-1 exceptions (Today phrases, calendar legend) added with reasons.
   Unit tests extended (15 tests, 100 % coverage), including the issue's cases as negatives.
7. TEST-N01 gained a second case: the six groups in the mockup's order, each group's items (href order and exact
   label).
8. Spec: "Retired term" rule, the *Names* paragraph, TEST-N10 and AC-N11 describe the extended check; changelog file
   `2026-11-20-issue-494-menu-groups-and-term-pairs.md`.

## Decisions

- **Group order in this PR.** The acceptance criterion "groups match the mockup" includes the order; the spec's phase 1
  deliverable (`overrides.nav.groupOrder`, V-N02) was not built yet, and it is one config entry the spec approved.
- **Term pairs by key scope.** "trener" stays right for the role, contract kind and member context (rule 2), so the
  "prowadzący" pair is limited to the key shapes that label the person running a session; "zajęcia" is checked only
  where English says "session", so the activity type and "grupa zajęciowa" pass, and the rule-1 everyday phrases are
  allow-listed with reasons.
- **M-14 title** follows the mockup's route name "Deklaracja z linku" / "Declaration from link".
- **Zones and Logs page headings** keep the menu label ("Strefy i cennik", "Dziennik i incydenty"); the mockup's longer
  page titles ("Strefy, zamknięcia, cennik") would need a separate heading key per page and are outside the issue's
  list.

## Files changed

See the PR diff: page metadata of activities, groups, communication, payments, facilities, club_core and member pages;
seven module catalog pairs; `src/modules.ts`; `scripts/check-glossary.mjs`, its allow-list and tests;
`.ai/qa/tests/club_core/TEST-N01-club-sidebar-group.spec.ts`; the navigation spec and its changelog file.

## Commands and results

- `node scripts/check-glossary.mjs` → `24 Polish and English catalog(s), 0 problem(s)`.
- New check against the `origin/main` catalogs → 58 findings, among them every case the issue names.
- `node --test scripts/__tests__/check-glossary.test.mjs` → 15 pass, `check-glossary.mjs` 100 % lines/branches/functions.
- `yarn verify`: first run failed at `format:check` (`TEST-N01-club-sidebar-group.spec.ts`,
  `check-glossary.test.mjs` "is not formatted"); after `yarn format`, `yarn verify --from format:check` passed all 13
  remaining steps, and a final full `yarn verify` ran before the push (result in the PR body).
- `yarn test:integration:vereino --filter <ID>`, one id per run: TEST-N01 2 passed (the new groups-and-items case
  included); TEST-A12 1 passed; TEST-L06 1 passed; TEST-N04 2 passed; TEST-A08 1 passed; TEST-N03 failed first:
  `locator.click: Timeout 30000ms exceeded … sidebar-scroll-chevron … subtree intercepts pointer events` on "Municipality
  report". With the mockup order the Facility group is last, and its last item sits under the platform's
  "scroll to bottom" chevron. Scrolling the item to the middle did not help, because it is the last item. The test
  now opens the menu item from the keyboard (focus + Enter) and passes (1 passed).
- Browser evidence: a temporary, uncommitted Playwright spec through the same runner captured the panel (1440 px and
  375 px, drawer) and M-10 in pl and en, light and dark, with no console errors. The club's default language decides
  the panel's language for a person on "club default"; the `locale` cookie and `/api/auth/locale` do not override it.

## Open problems / next steps

- Native-reader review of the reworded Polish values (spec phase 3 exit gate).
- Platform: when the Facility group is last, its last item ("Raport dla gminy") sits under the sidebar's "scroll to
  bottom" chevron. Worth a follow-up issue if it bothers users with a short screen.

## Follow-up run 2026-11-20: CI failure on PR #513 (om-auto-fix-pr)

- Trigger: required checks `integration (shard 5/6)` and `integration` failed on PR #513.
- Cause (test bug, not a flake: the same assertion failed on the retry): TEST-046 "treasurer: a finance-only role, menu
  and dashboard" still expected the old Finance order (`…/bank`, `…/cash-custody`, `…/orders`). The PR moves Cash to
  settle after Order campaigns, as TEST-N01 already asserts.
- Steps: detached HEAD at `origin/fix/issue-494-menu-groups-mockup-terms`; merged `origin/main` (no conflicts, signed
  off); updated TEST-046 to the mockup order; grepped `packages/app/.ai/qa/tests` for other assertions on the moved
  hrefs (TEST-C10 and TEST-N04 do not depend on the order and passed).
- Lesson `changed-ui-contract-search-older-tests-for-testid` updated with this second occurrence and promoted to an
  `AGENTS.md` rule, as the project memory rules require.
- Results: `yarn test:integration:vereino --filter TEST-046` 2 passed; `--filter TEST-N01` 2 passed; `--filter ISSUE-481`
  (new on main, checks sidebar group headings) 1 passed; `yarn lessons:check` valid; `yarn verify` all 18 steps passed.

## Follow-up run 2026-11-21: merge-train conflict on PR #513 (om-auto-fix-pr)

- Trigger: PR #513 was `CONFLICTING` and labelled `merge-train-conflict` after #508 (E20-S10) landed on `main`.
- Steps: detached HEAD at `origin/fix/issue-494-menu-groups-mockup-terms`; merged `origin/main` (signed off). One
  conflict in `activities/i18n/pl.json`: the branch reworded the session-edit texts to "termin", `main` replaced
  `activities.club.edit.denied` with five `activities.club.edit.refusal.*` keys written with "zajęcia".
- Decision: keep the branch's wording, take `main`'s keys (dropping `denied`, which `main` removed) and reword them to
  glossary rule 1 ("termin" where English says session) and rule 2 ("prowadzący" for "its coach", the person running
  the session). "Trener" stays in `refusal.coach_series`, where it names the role.
- Results: `node scripts/check-glossary.mjs` 0 problems; `yarn verify` all 18 steps passed;
  `yarn test:integration:vereino --filter TEST-489` 1 passed; `--filter TEST-A16` 1 passed.
