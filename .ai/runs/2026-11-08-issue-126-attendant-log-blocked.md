# Run: issue #126 (E08-S06) — attendant log, incidents, bans; stopped on an unapproved migration

- **Goal and trigger:** cezar task 504668e1 (`om-auto-fix-issue 126`), unattended. Build facilities spec phase 5 step 7 — the attendant's day (open/close, today's use, no-show), incidents, the log and entry bans (REQ-016, TEST-026).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (In progress, phase 5 steps 2–4 built); #126 (epic #119, depends on #122 — merged as #210); `feat/issue-126-attendant-log-incidents-bans`.

## Steps

1. Read #126: `feature`, open question Q1 (no-show gate for the attendant). Dependency #122 closed. No assignee, no claim, no open PR.
2. Read the facilities spec (step 7, `facilities_logs`, `facilities_incidents`, `facilities_entry_bans`, TEST-026) and the owner approval on #119 (2026-11-05): `facilities_*` migration, `club_core` migration, derived role `vereino_maintenance_planner`; "Not covered: … any other module".
3. Checked the attendant in code: `@vereino/core` `roleCatalogue` has no `facility_operator` (comment: "arrives with phase 5"); `people_role_assignments` has `section_id` but no `place_id`. No other E08 story builds the attendant role.
4. Stopped before claiming; posted the blocker comment on #126 (issuecomment-6724637922).

## Decisions

- The attendant's place scope needs `people_role_assignments.place_id` (club spec *Data Models*, *Record scope*), i.e. a `people` migration — Ask First, not covered by the #119 approval. Stopped rather than modelling the attendant's place elsewhere (a `facilities`-owned table would contradict the club spec's design).
- Q1 needs no owner decision: the club spec's roles table already gives the facility attendant `facilities.rentals.manage`, so the no-show route keeps its gate. Stated on the issue for the owner to override.
- No claim taken, so none to release; no push, no PR.

## Files changed

- this run log only.

## Commands and results

- `gh issue view 126 / 119 / 121–129`; `grep` of `packages/core/src/roles.ts`, `people/data/entities.ts`, the club and facilities specs.
- No code changed, so no `yarn verify`.

## Open problems / next steps

- Owner: approve the `people` migration (`people_role_assignments.place_id`) and the seeded `vereino_facility_operator` role for E08-S06, then re-run `om-auto-fix-issue 126`.
- The facilities spec's *Ask First items for the build* should list that `people` change once approved.
