# UX concept and mockup follow the declaration kinds of D-022/D-026 (#137)

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5), unattended cezar run (`om-auto-fix-issue`)
- **Trigger:** issue #137: the UX concept offered "Attending / Not attending" on every session. The spec (REQ-007, D-026) and #32 make a training absence-only.
- **Branch:** `docs/issue-137-ux-concept-declaration-kinds`, from `main` at 07ced5f
- **Status:** completed, PR open for review.

## Goal

The README and the mockup show the control that the club setting `declaration_kinds` gives each activity type: "Report absence" and its undo on trainings, "Attending / Not attending" on matches and the other confirm kinds. This covers M-02, M-03, M-04 and M-14, and F-02 and F-06. Section 6 notes that the concept follows D-022.

## Steps

1. Claimed #137 (assignee, `in-progress`, 🤖 comment). Read REQ-007, DD-37, the `/club` Today wireframe and AC-007 in `.ai/specs/2026-10-20-vereino-club-management.md`. Read `activities/lib/policy.ts`, where `unknown` withdraws a declaration, to model the undo.
2. Mockup (`docs/ux-concept/mockups/app.ts`):
   - `settings.declarationKinds` holds the spec defaults and `declKind(o)` reads them.
   - A shared `declControls` renders the control of the kind. M-02, M-03 and M-04 use it through `occCard`, and M-14 uses it through `screenTokenDeclare`.
   - `declare` and `token-declare` refuse `yes` on an `absence_only` session, the mockup's version of the 422. They take `unknown` as the undo, with their own toasts.
   - M-05 shows the summary of AC-007 for the kind (expected / absences reported). Its quick fill marks everyone without a reported absence.
   - Seed data: today's training keeps only Lena's reported absence. Finished trainings store `unknown` instead of `yes`.
3. Catalogs: 17 new keys in `i18n/en.json` and `pl.json`. The F-02 guide step now says "Report absence". Rebuilt with `build.mjs`.
4. README: section 1 (guardian needs), F-02, F-06, M-02, M-03, M-04, M-05, M-14, and section 6 item 12 (the D-022/D-026 note). The old item 12 is now 13.

## Decisions

- M-05 (the coach's list) is updated too. The issue lists only the guardian screens, but "expected / absent" (AC-007) follows from the same rule. Without it, the mockup would count every training member as "no answer".
- The kind is not editable in the mockup's club settings screen. The issue puts changing the kinds out of scope.

## Commands and results

- `node docs/ux-concept/mockups/build.mjs`: `i18n.js: en (English) 2058 keys, pl (Polski) 2058 keys`, `app.js` written.
- Headless Chromium (Playwright from `packages/app`) at 375 px, en and pl, Kasia: M-02 shows "Report absence" on Jaś's training. A tap gives "absence reported" + "Undo" and the toast "Absence reported: Jaś will not come.". Undo gives the toast "Absence withdrawn: Jaś is expected.". M-04 for Ola's match shows "Attending / Not attending". M-04 for Jaś's training shows "Report absence". M-03 shows "Report absence" on trainings. M-05 as Wojtek shows "4 expected · 1 absence reported". Console errors: none.
- `yarn verify`: all 13 steps passed (Jest 30 suites, 334 tests; build green).

## Lessons

- None new.

## Next steps

- #98 (Today) and #105 (links) link #137 as their design reference (comments posted by this run).
