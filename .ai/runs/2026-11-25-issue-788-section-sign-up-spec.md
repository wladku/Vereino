# Run log — issue #788: spec "Sign-up form for a section" (E26-S01, D-041)

- **Goal:** write the design-only spec for D-041 (public sign-up form per section, coordinator decisions, age check, places, waiting list, trial session), with the owner's choices as Open Questions with recommended defaults and every migration and the new module as Ask First items; amend CM Q-027.
- **Trigger:** Cezar automation on the `cezar` label of #788 (`om-auto-fix-issue` → feature route → `om-auto-write-spec`, autonomous), task 378b3946.
- **Issue / branch:** #788 (epic #787), `docs/issue-788-section-sign-up-form` from `origin/main` 824a2ca8.
- **Route:** `spec-pr` (docs only); no code, no migration.

## Steps

1. Claimed #788 (assignee, `in-progress`, `🤖` claim comment naming this run, worktree and branch).
2. Read D-041 from PR #786's branch `docs/d-041-section-sign-up` (not merged yet) and the epic #787.
3. Two read-only subagents collected code facts: `groups` (groups, memberships, the #601 fit rule in `groups/lib/groups-rules.ts`), `club_core` (sections, settings, public page P-02, `clubCorePublicSite`), `people` (persons, guardianships, accounts, departure and data-export contributors, no existing duplicate check), `activities` (attendance list from `rosterOn`, `activities.occurrenceFacts`, spots), `facilities` request pattern (token link service, honeypot `website`, rate limits, expiry job), `foundation` helpers, payments generation (no pro-rata), the isolation inventory format and the compliance pack numbering (A16, R21, D-14).
4. Wrote `.ai/specs/2026-11-25-vereino-section-sign-up-form.md` (Draft) after the structure of the training outlines spec; checked the nested-command pattern of the people import (`people/commands/imports.ts` `nestedContext`) before citing it in DD-J10.
5. Amended CM Q-027 (resolution cell) and added changelog files for both specs.
6. `yarn verify` on the first draft: all 22 steps passed.
7. A staff-engineer review subagent (read-only) checked the draft against the code and returned 15 findings (1 blocker). All were applied: confirmation tokens moved to a dedicated `enrolment_confirmation_links` table because `createTokenLinkService.issue()` always creates a row (the blocker: "send again" and BR-J3 re-sends were impossible); token routes carry `[clubSlug]` and pass the club scope to the lookup, so no new system-scope exception is needed; accept locks the group and re-counts (DD-J10a), emits the nested commands' events itself (the import's `nestedContext` sets `skipEvents`) and is not undoable; waiting numbers rank by `waiting_since`; season rollover and reference-date season handled (DD-J15a); anonymised columns listed, keyed hashes instead of plain SHA-256, no names in stored notifications; the information text gets its own settings column (consent texts are a closed list capped at 1000 characters); a per-kind field matrix; coaches added as trial recipients with `auditedRead`; `activities.occurrenceFacts.upcomingSessionsOfGroup` added; phase 2 now holds DD-J09 and the switch stays hidden until phase 3.
8. `yarn verify` re-run after the fixes (see Commands).

## Decisions

- **Prefix `J`** for REQ/DD/TEST/AC/Q ids: unused by other specs.
- **New module `enrolment`** recommended (Q-J01), as in the training spec's DD-O05 reasoning; persons created only on acceptance (DD-J02) for minimisation.
- **Trial participants stay in `enrolment`** with a spot on the attendance page (DD-J12) instead of changing `activities_attendances`: no change to attendance data, the units report or the PZPN export; no fee because no membership.
- **No pro-rata** (Q-J06): payments has no part-month logic; the accept sheet names the existing rule.
- **Duplicate detection without a new hash column** (DD-J11): names, e-mail and phone are encrypted without a hash; compare in memory once per application.
- **Two helpers move to shared code** (fit rule → `@vereino/core`, e-mail limit → `foundation`), each now with two consumers (REQ-F16).
- **People life-cycle spec not edited:** PR #786 already marks Q-L06 and the non-goal superseded; editing the same lines would conflict.
- **D-041 file not copied** into this branch: it lands with #786; the spec links to its path.
- **PR opened ready, not draft**, following the precedent of the E24 spec PR #674: the spec's status is Draft, so the owner's answers gate *Ready for implementation*, not merging the design document. The only ⚠ item is the lawyer check, which blocks a production release, not building.

## Files changed

- `.ai/specs/2026-11-25-vereino-section-sign-up-form.md` (new)
- `.ai/specs/2026-10-20-vereino-club-management.md` (Q-027 row)
- `.ai/specs/changelog/2026-11-25-vereino-section-sign-up-form/2026-11-25-issue-788-spec-created.md`
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-25-issue-788-q-027-sign-up-form.md`
- this run log

## Commands and results

- `yarn verify` → `all 22 step(s) passed` on the first draft and again after the review fixes; `yarn spec-changelogs:check` → valid.
- No integration test run: docs only, no test added or edited.

## Open problems / next steps

- Owner: answer Q-J01…Q-J10 and the Ask First items on #788 or the PR; then mark the spec Ready and file the build stories E26-S02…S05.
- Lawyer: Q-J09 (legal basis, information text) before the production release of phase 2.
- Merge #786 (D-041) so the spec's source link resolves.
