# Run — move several children from a roster to another group (E13-S11, #383)

- **Trigger:** Cezar run d328a39a (`om-auto-fix-issue`), issue label `cezar` on #383.
- **Issue:** #383 — labels `feature`, `priority-medium`, `risk-high`. Depends on #312 (closed) and #274 (closed).
- **Spec:** `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md`, phase L11 (REQ-L15, DD-L16, J-L09,
  TEST-L21, TEST-L22, TEST-L20 for the new route, AC-L15). Ask First item 14 (the route, the command and
  `move_preview_stale`) approved by the owner on 2026-11-19 (PR #418); Q-L22…Q-L24 confirmed.
- **Branch:** `feat/issue-383-move-children-between-groups`.
- **Route:** `module-data` (groups, activities contract) + `backend-ui` (B-12 roster, phone roster) + `testing`;
  delivery `reuse-spec` (phase of an approved spec).

## Goal

A coordinator or the club administrator previews and applies a move of up to 100 participants of one roster to another
group on one day, in one transaction with one undo that also restores the dropped declarations; the roster suggests the
children whose age fits the target; the same on the phone.

## Steps and decisions

1. **Rules** (`groups/lib/groups-rules.ts`, 100 % unit coverage): `MOVE_MANY_LIMIT`, `moveManyProblem` (too many, same
   group, past day), `moveOutcome` (from the single move's `planMove` and an overlapping target membership) and
   `fitsAgeRange` (completed years on the move day within `age_from`–`age_to`; null without a range or a birth date).
2. **Command** `groups.memberships.move_many` in `commands/memberships.ts`: the source group is the scope target, the
   target group passes `assertInScope`; both groups row-locked in id order (as the single move). The preview runs in a
   transaction that writes nothing; its token reuses the season rollover's token (`lib/rollover-token.ts`), binding the
   scope, the actor, the request and per child the outcome, `validTo`, `updatedAt` and the declaration ids — any change
   answers 409 `move_preview_stale`. The apply re-reads with `FOR UPDATE` and writes every movable child or none.
3. **Declarations in the transaction:** the `activities` subscriber drops declarations after the commit, so an undo
   could not bring them back. Three additive methods on the `activities.groupUsage` contract (`pendingDeclarations`,
   `dropDeclarations`, `restoreDeclarations`) let the move drop them in its own transaction and record the ids in the
   log; the undo restores exactly those (skipping a session the person declared again since). The subscriber still runs
   and finds nothing more to drop.
4. **Undo for coordinators:** the platform undo route needs `audit_logs.undo_self`, which no Vereino club role holds, so
   a coordinator could not undo through the top bar. Rather than widening a role's features (Ask First) or adding a
   route, the approved route accepts `{ undoToken }` and undoes only the caller's own `move_many` of the same club
   that is still undoable; the command's `authorizeReplay` re-checks both groups' scope. No `x-om-operation` header, so
   no failing top-bar Undo appears for a coordinator.
5. **UI:** `MoveChildrenDialog` (panel dialog / phone full-screen sheet via `FormFrame`'s new `fullScreen`). The target
   is chosen inside the dialog, so the chip **Fits {group}** lives in the dialog's child list (the spec places it "on
   the roster once a target is chosen"). Two previews: one of every active participant (outcome and fit per child for
   the list and the chip) and, on **Move {n}**, one of the ticked children whose token the apply sends; a difference
   between them refreshes the list with the stale notice. The B-12 Active view gets row selection and the bulk action;
   the phone roster gets a "Move to another group" button. `MoveChildrenNotice` shows the result with Undo.
6. **Tests:** TEST-L21 (API: preview, every refusal incl. TEST-L20's missing feature and another club, stale apply,
   apply, rosters and the B-10 history, declarations, one fee per month, undo scope and undo) and TEST-L22 (UI: panel
   selection, chip, untick/tick, move, Undo; phone sheet with the disabled empty state; axe in en/pl, light/dark; no
   sideways scroll at 375 px).

## Files changed

- `packages/app/src/modules/groups/`: `lib/groups-rules.ts` (+ tests), `lib/error-codes.ts`, `data/validators.ts`,
  `commands/memberships.ts`, `api/memberships/move-many/route.ts` (new), `services/group-usage.ts`,
  `components/MoveChildrenDialog.tsx` (new), `components/MembershipDialogs.tsx`, `components/RosterPanel.tsx`,
  `components/club/ClubGroupPage.tsx`, `i18n/en.json`, `i18n/pl.json`, `README.md`.
- `packages/app/src/modules/activities/services/group-usage.ts`.
- `packages/app/.ai/qa/tests/groups/TEST-L21-move-children.spec.ts`, `TEST-L22-move-children-ui.spec.ts` (new).
- `.ai/specs/changelog/2026-11-14-vereino-people-life-cycle-and-data-entry/2026-11-19-issue-383-phase-l11.md`.

## Commands and results

- `npx jest src/modules/groups/lib/__tests__/groups-rules.test.ts` — 32 passed.
- `yarn generate`, `yarn typecheck` — clean.
- `yarn test:integration:vereino --filter TEST-L21` — first run failed on test data
  (`declaration_kind_absence_only`: a training takes only an absence; the test now declares `no`), then 1 passed.
- `yarn test:integration:vereino --filter TEST-L22 --no-build` — first run failed only on axe `color-contrast` of the
  AppShell sidebar headings (a listed platform baseline, not the dialog); with `platformBaseline: true` 1 passed.
- Regression: `--filter TEST-A04`, `TEST-A17`, `TEST-L17` (`--no-build`) — each 1 passed.
- `yarn verify` — first run failed at `ds:check` (`max-h-[60vh]`, an arbitrary Tailwind value; the long dialog now
  scrolls as a whole within `max-h-dvh`), then at `test` (the error-code table test lists every code; the five new
  codes added); the final full run: all 18 steps passed, coverage 100 %.
- `yarn test:integration:vereino --filter TEST-L22` on that build — 1 passed.

## Open problems / next steps

- The owner may prefer granting `audit_logs.undo_self` to club roles instead of the route's `{ undoToken }` variant;
  the variant is additive and can be retired then.
- REQ-L16 (#384) will switch the chip to birth years for a team with a ranged category.
