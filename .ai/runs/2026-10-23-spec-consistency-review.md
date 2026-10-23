# Spec consistency review: Vereino club management (second pass)

- **Date:** 2026-10-23
- **Agent / tool:** Claude Code (Fable 5.1) coordinating three read-only review subagents plus a scripted id and table audit
- **Trigger:** product owner — "verify the whole specification for consistency", then "fix everything that does not need my decision, show the diff before writing, and save the review log"
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` (Draft); branch `docs/product-discovery` (PR #8)
- **Status:** review completed; fixes applied after the owner approved the diff (see *Files changed*); three owner decisions pending

## Goal

Find contradictions and gaps in the specification after the discovery work of 2026-10-21…23: the brief, the interview notes, the 13-product benchmark, decisions D-013…D-018, REQ-022 raised to Must with the maintenance planner (Q-040…Q-043), and the engineering-standards amendment.

## Steps

1. Scripted audit of ids and tables: REQ/DD/Q/V/TEST/AC/J defined once, no gaps, every reference resolves; table cell counts; traceability vs phase lists.
2. Three subagents, one dimension each, with line evidence: (A) internal consistency, (B) spec vs research and the brief, (C) spec vs `AGENTS.md`, the engineering standards, `BACKWARD_COMPATIBILITY.md`, module facts and `src/modules.ts`.
3. The coordinator re-checked every Blocking and Major finding directly in the spec (lines 12, 18, 21, 22, 24, 26, 34, 167, 186, 517, 748, 753, 770, 808–820, 868, 938, 1132, 1151, 1199–1207) and the `auth` facts (`auth:user_acl`, `user_acls.features_json`, `rbacService`, `grantChecks`).
4. Fixes scripted on a scratch copy, re-audited (0 cell mismatches, all ids resolve), shown as a diff, written after approval.

## Results

| Dimension | Blocking | Major | Minor |
|---|---|---|---|
| Scripted audit | 1 (DD-36 row) | 0 | 4 |
| A. Internal consistency | 1 | 3 | 11 |
| B. Research and brief | 3 | 10 | 4 |
| C. Repository rules | 2 | 5 | 5 |
| **Deduplicated** | **7** | **12** | **~15** |

Consistent: all ids defined once without gaps; every reference resolves; the traceability table covers every REQ; validation lines name `yarn verify` and `yarn test:integration:vereino`; module enablement matches `src/modules.ts`; no cross-module ORM relations; effects post-commit; list shape and error-code conventions per S6.4/S6.7; the maintenance entity carries every field the vocabulary, events, jobs and tests use.

### Blocking (verified)

1. DD-36 row had one cell instead of four (the 2026-10-23 edit). **Fixed.**
2. A coordinator could not plan maintenance: the roles table gives coordinators a club-wide maintenance scope, but the write gates limit everyone to `maintenance_place_ids` and `club_wide` exists only for `club_admin`/`treasurer` → 403, against TEST-049. **Owner decision pending** (proposal: write scope = all club places for holders of `facilities.view`, `maintenance_place_ids` for others).
3. Phase 1 "Depends on: none" and the verdict contradicted D-015 (planning waits for the interviews). **Fixed.**
4. Problem Statement line 24 presented a belief contradicted by the coordinator (timetable collisions) under a `[DOCUMENT: Orlik rules]` tag. **Fixed** (restated from the interview; "no public schedule" kept as an assumption).
5. Problem Statement and Overview claimed ProTrainUp has no facility module and that multi-section support is unique; the 2026-10-23 benchmark lists a ProTrainUp facilities module and Vibeclass as a multi-section product; "no interview note exists" was stale. **Fixed.**
6. Sign-in redirect decided by the role name `vereino_member` (AGENTS.md *Never*: role-name guards). **Fixed** (person link + `people.self`).
7. DD-35 plans a system-scope lookup (`organizationId: null`) for sessionless routes as a "deliberate deviation"; AGENTS.md allows system scope only through an installed contract. **Owner decision pending** (accept the deviation explicitly, or make V-12 a blocking gate that keeps public pages out of phase 1 until an installed contract or approval exists).

### Major (verified)

- `maintenance_scheduled` missing from the Errors column of the event, rental and internal-booking routes — **fixed**; the public request route's code (`slot_unavailable` vs `maintenance_scheduled`) is an **owner decision pending**.
- `facilities_internal_bookings` lacked `needs_reschedule` although the events and TEST-049 set it — **fixed**, with the booker named as the notified party.
- `maintenance_place_ids` crossed from `people` (phase 1) to `facilities` (phase 5) without a named optional DI token — **fixed** (`facilities.maintainerScopeProvider`, `hasRegistration`, fail closed; extension-surface row updated).
- V-13 was answerable from the facts (`auth:user_acl.features_json` per user) — **resolved on the read side**; the write path stays a phase 5 step 1 check.
- No unit-test rule for `lib/**` and no `api/errors.ts` in the phase deliverables — **fixed** (sentence under Implementation Phases, deliverables of all five phases).
- `BACKWARD_COMPATIBILITY.md` not cited and the new protected surfaces unnamed — **fixed** (Compatibility paragraph, Changelog row lists them).
- Migration approval covered `db:migrate` only — **fixed** (approval before the migration is committed).
- REQ-021/DD-14 formula vs the coordinator's pay model — **marked open** (brief Q14) in REQ-021, DD-14 and the glossary; the requirement stays Should.
- Risk row cited H6/H7 only and timed interviews "before phase 3" — **fixed** (A01/A07, the two guardian notes, D-015 timing).
- Non-goals did not cite D-014, D-016, D-018 — **fixed**.
- Sources listed D-001…D-012; REQ-030…REQ-033 provenance ranges drifted from D-013; the Open Questions header said everything was resolved on 2026-10-20 — **fixed**.
- Final Compliance Report counted DD-01…35, Q-001…039, V-1…12, TEST-001…048 — **fixed**.

### Minor (fixed)

Traceability rows for REQ-011, REQ-022, REQ-023, REQ-024; extension-surface rows (`setup.ts`, scheduler targets, command routes, mutation guard); public calendar and cache invalidation mention maintenance; `note?` → `notes?`; closure reason `maintenance` clarified against maintenance tasks; move/cancel of a task defined as CRUD; TEST-049/050 moved after TEST-048; coordinator navigation gains `/club/places`; `guardian-decision` and `replies` routes name a feature; `{ error, code? }`; `--filter <path fragment>`; `yarn i18n:check-hardcoded --strict`; phase order sentence names the domain-model draft; Problem Statement lines on parents and coaches carry the interview evidence; the risk row on scope lists D-013's ordered candidates.

### Not fixed (owner decisions)

1. DD-35 system-scope lookup vs the AGENTS.md MUST.
2. Maintenance write scope for coordinators and administrators (Blocking 2).
3. Error code of the public request route on a maintenance window.

Also for the next brief refresh: Q-041/Q-043 ("no new role") have no decision record beyond D-017.

## Files changed

- `.ai/specs/2026-10-20-vereino-club-management.md` — 69 lines changed (listed above; Changelog row of 2026-10-23).
- `.ai/runs/2026-10-23-spec-consistency-review.md` — this log.

## Commands and results

- Scripted audit before and after the fixes: 35 REQ, 36 DD, 43 Q, 13 V, 50 TEST, 35 AC, 10 J; no duplicates, no gaps, no undefined references; table cell mismatches: 1 before (DD-36), 0 after.
- `yarn format:check` after the write: 31 Vereino files, 0 unformatted.
- `node packages/app/node_modules/...` not run; the `auth` facts were read from `.ai/guides/modules/auth/entities.md` and the installed `auth/data/entities.ts` (read only).

## Open problems

- The three owner decisions above.
- The findings of the previous review's "Decisions needed" (2026-10-20) were closed in `2026-10-20-spec-consistency-fixes.md`; nothing there is reopened.

## Next steps

- Decide the three open points; apply them (B2 touches lines 186, 753, 808, 809; B7 touches DD-35, line 868, V-12 and phase 1 step 6; M1 touches lines 63, 816, 912, 1177).
- Keep the spec `Draft` until V-1…V-12 run and the D-015 interviews are in.
