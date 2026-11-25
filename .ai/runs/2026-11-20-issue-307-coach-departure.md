# Run: issue #307 — a leaving coach's sessions handed over or freed (E13-S05, phase L5)

- **Trigger:** Cezar `vereino-issue` workflow, label `cezar` on #307 (2026-11-19T22:32Z); skill `om-auto-fix-issue` with the repo-local override.
- **Spec:** `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md`, phase L5 (REQ-L04, TEST-L06, AC-L05, J-L03). Ready; the four DI contracts approved on #255 (2026-11-16). Dependencies #306 and #118 merged.
- **Branch:** `feat/issue-307-coach-departure-handover` (worktree created by Cezar for this run). Claim: assignee, `in-progress`, 🤖 comment on #307.

## Steps

1. Read the spec sections (contributor table, *Hand-over choice*, phase L5, TEST-L06) and the L4 seam (`people/services/departure.ts`, `departure-plan.ts`, `commands/departures.ts`, the `groups` contributor).
2. Extended the contract additively: `DeparturePreviewPart.handOvers`, `DepartureChoices` (hand-over choices, deciding person, acting role) passed to `apply`, optional `DepartureChange.refs`, optional `retentionHoldUntil`.
3. `people`: `missingHandOvers` / `invalidHandOvers` rules (unit tests), `handOver` on the depart schema, 422 `departure_handover_required` / `departure_handover_invalid`, `handOvers` in the plan and the preview response, preview binding sorted (order-independent).
4. Contributors: `activities` (sessions after the last day in the club zone, default-coach activities, substitution entries, 422 `departure_handover_coach_invalid`, coach events after the commit), `payments` (cash held blocker by B-33's rule, open charges warning, `retentionHoldUntil`), `club_core` (contracts end / soft-delete), `facilities` (maintainer rows removed). Pure helpers in `activities/lib/departure-handover.ts` and `payments/lib/departure.ts` with 100 % unit tests.
5. Leaving tab: "Sessions and activities" table with a choice per group (coach lookup from `/api/activities/options/coaches` or "Leave unassigned"), cash blocker with amount and link to B-33, contract and maintainer rows, open-charges warning; en/pl texts.
6. TEST-L06 integration test.

## Decisions

- Substitution entries are append-only (foundation guard), so the undo writes a correcting `coach_restored` entry instead of deleting the departure's entries (spec said "deletes"); recorded in the spec changelog entry.
- Unassigned sessions get `absence_reported` entries (no new kind, no API enum change); handed-over ones `substitute_assigned`.
- The departure stays club-administrator only (L4); a coordinator gets 403 on the whole request.
- No overlap check for the new coach's other sessions (spec silent; the substitute dialog has one) — follow-up candidate.
- The facilities contributor does not call `people.roleSync` synchronously (see failures below); the `people.*` events start the role sync.

## Commands and results

- `yarn generate`, `yarn typecheck` — pass.
- `npx jest` on the three rule test files — 29 passed.
- `yarn test:integration:vereino --filter TEST-L06`:
  - run 1: failed — my assertion read `body.details`; the error body carries the details at the top level.
  - runs 2–3: failed — `{"code":"departure_preview_stale"}` on the confirm after 2 minutes; server log `terminating connection due to idle-in-transaction timeout`; a fresh preview showed the departure committed. Cause: the facilities `afterCommit` called `people.roleSync.syncPerson` synchronously and waited on the departure's row locks. Fixed by dropping the call (lesson `contributor-after-commit-never-writes-synchronously`).
  - run 4: **passed** (15.2 s).
- `yarn test:integration:vereino --filter TEST-L03` (regression of the L4 departure: TEST-L03, TEST-L04, TEST-L20) — 3 passed.
- `yarn verify`: first run failed at `test` — `people error codes › declares the people codes…` expected the code list without the two new codes; added them to `people-rules.test.ts`. Full rerun: all 18 steps passed.
- Lint note: a Playwright HTML report left in `packages/app/.ai/qa/test-results` (gitignored) makes `yarn lint` report ~160 errors in trace assets; delete it before the gate.

## Files

`people/services/departure.ts`, `departure-plan.ts`, `commands/departures.ts`, `lib/departure-rules.ts` (+test), `lib/error-codes.ts`, `data/validators.ts`, `api/departures/*`, `components/LeavingPanel.tsx`, `i18n/*`; `activities/services/departure-contribution.ts`, `lib/departure-handover.ts` (+test), `lib/error-codes.ts`, `di.ts`, `i18n/*`; `payments/services/departure-contribution.ts`, `lib/departure.ts` (+test), `di.ts`; `club_core/services/departure-contribution.ts`, `di.ts`; `facilities/services/departure-contribution.ts`, `di.ts`; `packages/app/.ai/qa/tests/people/TEST-L06-coach-departure.spec.ts`; spec changelog entry; lesson.

## Open problems / next steps

- Hand-over overlap check for the new coach (follow-up issue).
- Per-session notifications: a hand-over of N sessions sends N "coach assigned" notices to the new coach (the existing subscriber, one per entry).
