# Run: epic #252 — spec A to Ready for implementation

- **Goal and trigger:** unattended cezar run (task 2fd95077) of `om-auto-create-pr`: record the owner's decisions of 2026-11-16 in spec A, fix the pre-implementation audit gaps (c1)–(c9), set the status to Ready. Docs only.
- **Spec:** `.ai/specs/implemented/2026-11-14-vereino-parity-groups-and-activities.md`. **Issue:** epic #252 ([audit](https://github.com/wladku/Vereino/issues/252#issuecomment-6899294590) 2026-11-15, [owner decisions](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411) 2026-11-16). **Branch:** `docs/issue-252-spec-a-ready`.

## Steps

1. Read the epic's audit and owner-decision comments.
2. Re-checked the audit's code facts before writing them into the spec: the schedules live in `activities/services/club-setup.ts` (`setUpClubActivities`), called by `setup.ts` `seedDefaults`, and the CLI `activities set-up-club` re-runs it for an existing club (`activities/cli.ts:99-109`); `payments` has subscribers only for `payment_gateways.*` and reads the roster on a date (`payments/services/group-charges.ts:112-120`); the readers of `ACTIVITIES_SCHEDULE_DIRECTORY`, `ACTIVITIES_PLACE_SESSIONS`, `ACTIVITIES_PUBLIC_SCHEDULE`, `ACTIVITIES_SHARE_TEXT` exist where the audit says; `place-sessions.ts` selects by `placeId $in`, so a typed-venue session never reaches the facility surfaces; D-031 §7 says "the same thread, as a cancellation"; N's staff context (DD-N08, `memberStaffScopes`, `as=coach`) and its More row for Groups shipped with `available: false` (`packages/ui/src/member/member-nav.ts:120`); L J-L07 step 2 opens A's roster with a person preselected.
3. Edited the spec: status, TLDR, Non-goals (Q-A05), REQ-A03 (`?personId=`, `?role=`), Proposed Solution (typed venue), DD-A04, DD-A07, Domain Vocabulary (typed venue, session without a club place), Reuse map (scheduler seam), Compatibility (approved contract changes, BC tier table, shared-environment check), new *Dependencies on the other parity specs*, UI rows (roster deep link, staff context), Data Models (four named check constraints and the score constraint), API (`venue_requires_one_off`), Events (scheduler registration), TEST-A04/A11/A20, phases (build order; 2, 4, 5, 6, 7, 8, 9), Extension surfaces, Rollout (every item approved with date and link, rows (a)8 and (a)10), Risks, Final Compliance, Resolved assumptions, Open Questions (Q-A25…Q-A27 new, V-A01/V-A02 answered).
4. Changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-groups-and-activities/2026-11-16-issue-252-ready.md`.

## Decisions

- **Changelog date:** the audit proposed `2026-11-15-issue-252-ready.md`; the change was made on 2026-11-16, so the file carries that date (the changelog README requires the day of the change).
- **New answers numbered Q-A25…Q-A27** (is_away default, delete on the phone, phase order), continuing after Q-A24.
- **Venue on a series:** refused by the validators with a new code `venue_requires_one_off` (audit (c6) asked for a validator restriction; the code name is this run's choice).
- **Coordinator view (c5):** no third context (N DD-N08). In N's staff context Today shows both tiles for a person with both scopes; the calendar gets a "My sessions / Section" switch kept in `?as=`; a coordinator-only person opens on "Section".
- **`?role=`** added next to `?personId=` for the roster deep link, because L's step is "Add to a group as coach".
- **Phase 9** flips N's Groups More row to `available: true` in the same PR (N V-N04).
- **Existing clubs** get the new schedule by the operator running `mercato activities set-up-club` once, named in phase 7's release note (no upgrade step exists for `seedDefaults`).
- Other parity specs (N, R, C, L) not edited; hooks stated in this spec only.

## Files changed

- `.ai/specs/implemented/2026-11-14-vereino-parity-groups-and-activities.md`
- `.ai/specs/changelog/2026-11-14-vereino-parity-groups-and-activities/2026-11-16-issue-252-ready.md` (new)
- `.ai/runs/2026-11-16-issue-252-spec-a-ready.md` (this log)

## Commands and results

- `yarn spec-changelogs:check` → "Spec changelogs are valid".
- `yarn verify` → `[verify] all 17 step(s) passed`, exit 0.
- No integration test: docs only.

## Open problems and next steps

- Spec R must state that its B-23 day axis and occupancy show nothing for a session without a club place (A's hook; R is made Ready in parallel).
- Spec L may cite `?personId=`/`?role=` for the J-L07 roster link.
- Phases 2 and 5 confirm before merging that no shared environment is deployed (BC gap).
- Implementation order: phases 1–3, 4, 6, 5, 7, 8 (after N phase 5), 9.
