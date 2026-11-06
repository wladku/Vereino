# Run — E06-S16 (#98): declare attendance straight from Today

- **Trigger:** cezar task `cez/98`, unattended `om-auto-fix-issue 98` (feature route → `om-auto-implement-spec` → `om-auto-create-pr`).
- **Issue:** [#98](https://github.com/wladku/Vereino/issues/98) — E06-S16, epic #82.
- **Source doc:** `.ai/specs/2026-10-20-vereino-club-management.md` (`/club` UI row and *Behavior*: "a session of an `absence_only` kind offers 'Report absence' only, a `confirm` kind offers 'Attending / Not attending'"; REQ-006, REQ-007, TEST-014). Design authority: `docs/ux-concept/README.md` M-02, F-02.
- **Branch:** `feat/issue-98-today-declarations`
- **Engine:** om-auto-create-pr (steps: 7, --loop: no)
- **Status:** complete

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

PR: #174

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Today declarations

- [x] 1.1 Pure Today helper with unit tests (`lib/club-today.ts`) — 7c67fe0, e0c7280
- [x] 1.2 Today cards: group, section, place, per-ward status, buttons and badges, named flash — 7c67fe0, e0c7280
- [x] 1.3 Per-tile Try again on the calendar and messages tiles — 7c67fe0, e0c7280
- [x] 1.4 Next-session empty state and the dated guardian decision alert — 7c67fe0, e0c7280
- [x] 1.5 i18n en + pl — 7c67fe0, e0c7280

### Phase 2: Verification

- [x] 2.1 Integration test E06-S16 and reruns of TEST-014, E06-S19, TEST-M10 — 7c67fe0, b8766a8
- [x] 2.2 Full `yarn verify`, review, PR — e0c7280

## Steps taken

1. Claimed #98 (assignee, `in-progress`, 🤖 claim comment). Classified it as a feature: the `feature` label, plus the `/club` row and *Behavior* of the club spec, which already covers the story. The FR triage found it unbuilt: the Today cards were links only. Branch renamed to `feat/issue-98-today-declarations`; plan committed; draft PR #174 opened.
2. Phase 1 (7c67fe0):
   - `lib/club-today.ts`: the soon / next split, card notices, button state, the saved-toast key and the weekday/time formatting, with unit tests.
   - Today widget rewrite: each card is a link plus per-ward rows with a `ButtonGroup` of declaration buttons.
   - The messages tile gets an error state with "Try again".
   - i18n en + pl.
   - The E06-S16 integration test.
3. Spec: the `/club` *Behavior* text and a Changelog row (b8766a8).
4. First E06-S16 run failed at one assertion: the test's Polish pending-badge regex was written from memory ("Oczekuje…"), while the catalog says "Czeka…". Fixed the regex, reran: passed. Lesson `locale-regexes-copied-from-catalogs`.
5. Reruns of the suites that read the Today tiles: TEST-014, E06-S19, TEST-M10, J-002.
6. Independent read-only review: nothing blocking. Fixed in e0c7280:
   - the ward's own pending-guardian hint and toast;
   - the chosen answer stays enabled with `aria-pressed`, and a second tap is a no-op (it no longer looks greyed out);
   - a next session more than 6 days away names its date;
   - the unread count uses `retry: 1`.
7. Reran E06-S16 and the full `yarn verify`.

## Decisions (added during the run)

- Toasts keep the issue's wording ("Saved: Jaś not attending") for an absence report, rather than the reviewer's "absence reported", because the acceptance criterion quotes it.
- The Polish "Odwołany: {reason}" keeps the existing singular status form for consistency with `activities.occurrences.status.cancelled`.
- The double announcement (flash + `aria-live`) matches the session page; kept for consistency.

## Files changed

- `packages/app/src/modules/activities/lib/club-today.ts`, `lib/__tests__/club-today.test.ts` (new)
- `packages/app/src/modules/activities/widgets/injection/club-today/widget.client.tsx`, `widget.ts`
- `packages/app/src/modules/communication/widgets/injection/club-messages/widget.client.tsx`, `widget.ts`
- `packages/app/src/modules/activities/i18n/{en,pl}.json`, `packages/app/src/modules/communication/i18n/{en,pl}.json`
- `packages/app/.ai/qa/tests/activities/E06-S16-today-declarations.spec.ts` (new)
- `.ai/specs/2026-10-20-vereino-club-management.md` (Behavior + Changelog)
- `.ai/lessons/locale-regexes-copied-from-catalogs.md` (new), `.ai/lessons.md`

## Commands and results

- `npx jest src/modules/activities/lib/__tests__/club-today.test.ts --coverage`: 12 passed, `club-today.ts` 100 % statements, branches, functions and lines.
- `yarn test:integration:vereino --filter E06-S16`, first run, failed:
  - `Expected pattern: /Awaiting guardian confirmation|Oczekuje na potwierdzenie opiekuna/ Received string: "Czeka na potwierdzenie opiekuna"`.
  - After the regex fix: 1 passed (1.2m).
  - After the review fixes: passed again.
- Reruns:
  - `--filter TEST-014`: 1 passed (2.3m)
  - `--filter E06-S19`: 1 passed (1.9m)
  - `--filter TEST-M10`: 1 passed (1.7m)
  - `--filter J-002`: 1 passed (2.3m)
- `yarn verify`: all 13 steps passed (after the review fixes).

## Open problems

- The "Cancelled: {reason}" badge is unit-tested (`todayEntryNotice`) but not exercised by the integration test.
- "Next session" looks only inside the 14 days the tile already reads; a session further away falls back to "No classes today or tomorrow."

## Next steps

- Human review and merge of PR #174.
