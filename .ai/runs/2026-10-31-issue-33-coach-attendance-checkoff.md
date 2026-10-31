# Issue #33 — coach attendance list and session close (E03-S04)

- **Date:** 2026-10-31
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue 33` → feature route → `om-auto-implement-spec` → `om-auto-create-pr` (plain engine)
- **Trigger:** the product owner chose "story by story" for epic #22 (E03): #33 after #32 merged (PR #61)
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 step 5, the check-off half (REQ-007, REQ-008; R11, D-026; AC-007; TEST-009, TEST-011), the API row `GET`, `PUT /api/activities/occurrences/{id}/attendance` and the page `/club/occurrences/[id]/attendance`; issue #33; branch `feat/issue-33-coach-attendance-checkoff` from `main` (`1806847`) in the worktree `C:\Users\wkuc\vereino-issue-33`
- **Status:** in progress

Source doc: .ai/specs/2026-10-20-vereino-club-management.md

## Goal

Before a session the coach sees who is expected and who reported an absence (or, for a `confirm` session, who confirmed, declined and did not answer); after it starts, the coach checks off present, absent or late and closes the session; each row records who marked it and in which role. A stale save answers 409 and the list refreshes without losing the coach's selections; a coach of another group gets 403; a cancelled session refuses check-off with 409.

## Scope

- **In:** the command `activities.attendance.mark` (bulk check-off with the session version, optional close `planned → done`, undo); `GET` and `PUT /api/activities/occurrences/{id}/attendance`; events `activities.attendance.marked` and `activities.occurrence.completed`; the member page `/club/occurrences/[id]/attendance` and the links to it from the coach's calendar and the session pages; integration specs for the five acceptance criteria and the page.
- **Out (non-goals):** substitutions and coach absence ("Report absence" on the page sketch), the coach units report (A05); reopening a `done` session by an administrator command; the guardian contacts (#34); declaration links (REQ-017).

## Implementation Plan

1. Rules: the check-off vocabulary and the per-row expectation in `lib/policy.ts` (+ unit tests), error codes, validators, events.
2. The command `activities.attendance.mark` with its undo; the read service for the list.
3. The route `GET`, `PUT /api/activities/occurrences/{id}/attendance` with OpenAPI.
4. The page `/club/occurrences/[id]/attendance`, the links from `/club/calendar` (coach perspective), `/club/occurrences/[id]` and `/backend/activities/occurrences/[id]`; en + pl.
5. Integration specs (API and page), the full gate.
6. Documentation: the spec note under phase 2 step 5, the API row, Changelog, README, this log.

## Risks

- The list is the union of the roster on the session date and the persons with rows; a check-off for anyone else must be refused, or the route writes rows for arbitrary persons of the club.
- The session version is the lock for the whole list: every save moves it, so two coaches cannot overwrite each other silently.

## Decisions

(recorded as they are made)

## Progress

- [ ] 1. Rules, error codes, validators, events
- [ ] 2. Command and read service
- [ ] 3. Route
- [ ] 4. Page and links
- [ ] 5. Integration specs and the gate
- [ ] 6. Documentation
