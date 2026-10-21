# Spec consistency fixes

- **Date:** 2026-10-20 (finished 2026-10-21)
- **Agent / tool:** Claude Code coordinating three subagents on disjoint files (spec; UX concept + root README + research; mockup)
- **Trigger:** product owner — "fix right away" after the consistency review (`2026-10-20-spec-consistency-review.md`)
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` (Draft); `main`
- **Status:** completed

## Goal

Resolve every blocking and major finding of the consistency review and the minor ones that the decisions file settles, so that the spec, the UX concept, the mockup, the research records and the root README agree.

## Decisions (coordinator defaults; the product owner may override)

- D1 Treasurer = finance only; coach settlement stays with the administrator.
- D2 Volunteer duty sign-up (`occurrence_supervisor`) leaves 1.0 (Non-goals, planned for 1.1).
- D3 A guardians' contact list for coaches is not in 1.0 (GDPR minimisation; announcements and direct threads remain the channel).
- D4 1.0 keeps all code in `packages/app/src/modules/<id>/`; `@vereino/core`, `db`, `ui` get content only when at least two modules reuse it (candidates named in the spec).
- D5 Declaration policy gains the `away_trip` scope so D-006's default (away trips → guardian confirmation) is expressible.
- Full list of fixed choices: scratch file `review/decisions.md` (content mirrored in the spec changelog row of 2026-10-20 and in D-013).

## Steps

1. Wrote the decisions file; launched three subagents with disjoint write scopes and the review file as input.
2. Spec: treasurer in the role enum and scope service, DD-35 (single read-only system-scope lookup for sessionless routes) + V-12, coach row features, facilities calendar scope rule, `GET /api/payments/cash/charges`, `/club/payments/return` (M-09), `GET /api/payments/order-campaigns?for=me`, `PUT /api/people/me`, `coach_person_id` everywhere, section lifecycle rule, TEST-029 split (TEST-048 in phase 4), J-009/J-010, scope provenance (D-013), Non-goals additions, naming drift, traceability/phase lists, extension-surface table rebuilt with a classification column, compliance report and verdict, Q-039, V-4 email transport.
3. UX concept: 40 edits (actors, tournament rule, routes as tabs/perspectives, M-10 language field, API lists, derived "overdue", note 12 on deferred items); root README aligned to REQ-001…REQ-035; research: new `decisions/D-013-scope-added-after-discovery.md`, MoSCoW addendum, D-009/D-010 confirmed.
4. Mockup: five routes renamed to the spec paths, feature gates fixed (B-29, B-18/B-19), attendant persona without `facilities.bookings.create`, `owner_transfer` removed, interface-language select on M-10, API lists completed, units report counts only matches/friendlies, labels aligned; artifacts rebuilt (fictional, real; ZIP; Downloads copy).
5. Coordinator verification (below).

## Files changed

`.ai/specs/2026-10-20-vereino-club-management.md`; `docs/ux-concept/README.md`; `README.md`; `.ai/specs/research/{README.md, 2026-10-20-moscow.md, 2026-10-20-domain-model-draft.md, decisions/D-009-…, decisions/D-010-…, decisions/D-013-scope-added-after-discovery.md (new)}`; `docs/ux-concept/mockups/{app.ts, app.js, i18n.js, i18n/en.json, i18n/pl.json}`; this log; the review log's status line.

## Commands and results

- Cross-check script (spec UI table vs UX route index vs mockup ROUTES/ROUTE_FEATURES): no screen missing on either side; route differences: none; feature differences: none. Only `/backend` (dashboard), `/login` and the external `/stripe` page have no own row in the spec UI table — pre-existing and intentional (dashboard is specified by its widgets; login is the `auth` module's page).
- `tblcheck.py` on spec and UX README: `done` (cell counts consistent); `pipecheck.py`: no unescaped pipes in code spans.
- `idcheck.py`: every REQ/DD/Q/V/TEST/AC/J id referenced is defined once (REQ 35, DD 36, Q 39, V 12, TEST 48, AC 35, J 10); traceability rows 35, none missing; forbidden terms (`coach_id`, `occurrence_supervisor`, `pl-PL`, `RRRR`, "N dni", bare `member`, place `is_public`, "given away", mode `add`) 0 hits; spec CRLF intact.
- Spot checks: `treasurer` in the role enum, DD-35, `away_trip`, M-09 row, `?for=me`, cash charges route, `PUT /api/people/me`, Non-goals lines, J-009/J-010, TEST-048, V-12, Q-039 present; coach row has `people.self` and `communication.view`.
- `node build.mjs`: catalogs en/pl 2017 keys each, parity OK. Subagent browser smoke: 58 screens × 2 languages, 0 JS errors, 0 raw keys; targeted flows F-03, F-09, F-12, B-05 edit route, M-10 language switch, B-29 as treasurer, B-18 as coordinator all pass.
- `node scripts/check-lessons.mjs`: valid.

## Open problems

- The five default decisions above await the product owner's confirmation.
- V-1…V-12 are now runnable against the installed packages but have not been executed; they open phase 1.

## Next steps

- Confirm or change D1–D5; then phase 1 can start from the spec.

## Lessons recorded

None new (the review itself produced no new durable rule beyond the existing ones).
