# Run: #265 — E09-S11 the UX concept README describes the navigation of D-029, D-030 and D-031

- **Goal and trigger:** unattended cezar run (task 5f19c690) of `om-auto-fix-issue` on #265, queued by the `cezar` label. Docs-only route: spec N phase 11 (REQ-N16, AC-N16).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (Ready for implementation, approved by the owner on 2026-11-15 on #251). **Issue:** #265, epic #251. **Branch:** `docs/issue-265-ux-concept-readme-navigation`.

## Steps

1. Readiness: spec N is `Ready for implementation`; the dependencies #246, #256, #258 and #259 are closed (merged). Claimed the issue (assignee, `in-progress`, `🤖` comment).
2. Read spec N *Menu structure*, phase 11, the B-02/B-03 leftovers, spec C's B-21 row (REQ-C03, DD-C02, DD-C10), D-029 and D-030, and checked the built routes (`club_core` settings and publication forms, `PaymentsNav`, the facilities tab routes including `/maintenance` and `/reports/rented-hours`).
3. Edited `docs/ux-concept/README.md`:
   - §1: coordinator — phone for daily work (staff context), desktop for configuration; treasurer — role held back, the administrator does the work (D-030); attendant — phone (`/club/facility`).
   - §3 diagram: member bottom bar and More, sign-in landing, panel groups with the menu-item names (Zones and rates, Log and incidents), public header with Events and Sign in, cross-links (Admin panel, "Interfejs członkowski").
   - §3.1: the panel sidebar table (six groups, items, features, tabs, counts), the member bottom bar and More table, the landing table, the public header, and the phone-first paragraph linking D-029 and D-030.
   - §3.2: B-07, B-18, B-26, B-27, B-28 rows name their tabs; the folded-surface paragraph lists the pages with tabs and drops the "cases only" perspective and the deferred maintenance screen.
   - §4: tab lines on B-07, B-18, B-26, B-27, B-28 (headings renamed to the menu names); B-02 lists its real fields and points slug, description and phone to B-03; B-03 carries them and their validation; B-21 lists spec C's perspective order, filters and sort; M-01 has the club branding and the landing.
4. Spec changelog entry and this log.

## Decisions

- **Menu tables in English with the spec's routes and features,** not the Polish labels: the README is English and points to the spec as the source that wins.
- **B-20 tabs include Settings** (`/backend/payments/settings`): the built `PaymentsNav` has it; the spec says "existing `PaymentsNav`".
- **Treasurer flows in §2 (F-07, F-13, F-14) and the mockup persona stay:** the issue limits the treasurer change to the §1 device column, and D-031 §2 leaves the mockup as the model.
- **AC-N16 not ticked in the spec:** no other phase ticks its AC box; the changelog file records the delivery.

## Files changed

- `docs/ux-concept/README.md`
- `.ai/specs/changelog/2026-11-14-vereino-parity-navigation-and-naming/2026-11-16-issue-265-readme-navigation.md`
- `.ai/runs/2026-11-16-issue-265-ux-concept-readme-navigation.md`

## Commands and results

- Negative search `grep -n -i "Institutions, Contracts\|Threads, Cases\|cases only\|D29\|desktop + phone\|pageContext"` on the README: only the B-07 tab list (tabs, not menu items) matches.
- `yarn format:check`: 1420 Vereino file(s), 0 unformatted.
- `yarn verify`: all 17 step(s) passed (exit 0).

## Open problems and next steps

- None for this phase. Phases 6–8 and 10 of spec N are still open; when they land, the README needs no further navigation change.
