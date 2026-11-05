# Run — E06-S16 (#98): declare attendance straight from Today

- **Trigger:** cezar task `cez/98`, unattended `om-auto-fix-issue 98` (feature route → `om-auto-implement-spec` → `om-auto-create-pr`).
- **Issue:** [#98](https://github.com/wladku/Vereino/issues/98) — E06-S16, epic #82.
- **Source doc:** `.ai/specs/2026-10-20-vereino-club-management.md` (`/club` UI row and *Behavior*: "a session of an `absence_only` kind offers 'Report absence' only, a `confirm` kind offers 'Attending / Not attending'"; REQ-006, REQ-007, TEST-014). Design authority: `docs/ux-concept/README.md` M-02, F-02.
- **Branch:** `feat/issue-98-today-declarations`
- **Engine:** om-auto-create-pr (steps: 7, --loop: no)
- **Status:** in-progress

## Goal

A guardian (or a participant with an account) declares on `/club` Today without opening the session: per ward the
buttons the session's declaration kind offers, the status and the closed / awaiting-guardian / cancelled badges, a
named success message, a retry per tile, and a "next session" empty state.

## Scope

- `activities` Today widget (`widgets/injection/club-today/widget.client.tsx`) and a new pure helper `lib/club-today.ts`.
- `communication` messages tile (`widgets/injection/club-messages/widget.client.tsx`): an error state with "Try again".
- i18n `en` + `pl` of both modules.
- Integration test `.ai/qa/tests/activities/E06-S16-today-declarations.spec.ts`.

Non-goals: gathering time and the "confirm by" deadline (no spec field); the payments tile (E07); the session page;
any API, schema or command change — the declare endpoint and its 403 / 409 rules stay as they are.

## Decisions

- The card stays a link to the session (the `club-today-session` link keeps the names, title and place so TEST-014 and
  E06-S19 still find it); the declaration buttons sit below the link, never inside it.
- The buttons are a `ButtonGroup` of `Button`s with `aria-pressed`, not `SegmentedControl`: the latter is a radio group
  whose arrow keys change the value, which here would send a declaration on every arrow press.
- Buttons follow the existing `declarationChoices` (training `absence_only` → "Report absence" / "Withdraw the
  absence"; confirm kinds → "Attending / Not attending", per #137). A started planned session keeps them visible but
  disabled under the "Declarations closed" badge; a cancelled session shows "Cancelled: {reason}" and no buttons; a
  `guardian_only` ward signed in sees no buttons and "Your guardian declares".
- "Next session" looks in the 14 days the tile already reads (no extra request); beyond that the old empty text stays.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Today declarations

- [ ] 1.1 Pure Today helper with unit tests (`lib/club-today.ts`)
- [ ] 1.2 Today cards: group, section, place, per-ward status, buttons and badges, named flash
- [ ] 1.3 Per-tile Try again on the calendar and messages tiles
- [ ] 1.4 Next-session empty state and the dated guardian decision alert
- [ ] 1.5 i18n en + pl

### Phase 2: Verification

- [ ] 2.1 Integration test E06-S16 and reruns of TEST-014, E06-S19, TEST-M10
- [ ] 2.2 Full `yarn verify`, review, PR

## Steps taken

## Files changed

## Commands and results

## Open problems

## Next steps
