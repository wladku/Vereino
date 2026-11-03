# Issue #120: facilities verifications V-7, V-10, V-13 and the opening-hours source

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, one research subagent, and the coordinator's review
- **Trigger:** `/om-auto-fix-issue 120` (E08-T01, epic #119)
- **Branch:** `docs/issue-120-facilities-verifications`
- **Status:** completed, docs-only PR open for review.

## Goal

Resolve V-7, V-10 and V-13 of `.ai/specs/2026-10-27-vereino-facilities.md` against the installed `@open-mercato/*` 0.9.0 packages and record where opening hours live.

## Findings

- **V-7 refuted.** `planner` availability rules have no place subject, no season, validity period or priority; the merge reads a regex subset of RRULE without UNTIL, steps weekly rules by 7 × 24 h and ignores `timezone` (wall-clock hours drift at DST); a date-specific rule becomes a whole-day override; reading by subject needs the entity or the HTTP API; writes need the `staff` module; `planner` is disabled and imports `dictionaries`.
- **V-10 partly confirmed.** Route `metadata.rateLimit` limits per client IP only (no custom key; fails open; one shared bucket when `RATE_LIMIT_TRUST_PROXY_DEPTH` is 0). A per-e-mail limit is possible in the handler through the `rateLimiterService` with `failClosed`. `OM_INTEGRATION_TEST` switches every limit off, so a 429 cannot be integration-tested.
- **V-13 refuted as designed.** The write path exists (`auth.user-acl.update`, `PUT /api/auth/users/acl`), but `rbacService` uses a `user_acls` row *instead of* the role grants ("Per-user ACL - if exists, use it exclusively", checked by the coordinator), so a single-feature grant would strip a coordinator's role features.

## Decisions (autonomous defaults; the product owner may override)

- **DD-41:** opening hours live in `club_core_places.opening_hours` (jsonb: seasons with per-weekday windows in the club's time zone; inherited from the nearest ancestor; exceptions are closures). `club_core` owns it; `facilities` reads it through `clubCorePlaces`. Needs a `club_core` migration in phase 5 (approval before commit).
- **Maintenance planner:** a derived technical role `vereino_maintenance_planner` with only `facilities.maintenance.manage`, kept in step by the `people` role sync from the place-maintainer assignments, instead of a per-user ACL. The owner should confirm it fits D-024 ("no new role"), read as no new *business* role.
- **Public request routes:** per-IP limit in metadata, per-e-mail limit in the handler keyed by the hashed normalised e-mail, failing closed; redis strategy with more than one web instance.

## Files changed

- `.ai/specs/2026-10-27-vereino-facilities.md`: status line; DD-21, DD-36, new DD-41; *Opening hours* vocabulary row; the CRUD, public request and verify-token API rows; TEST-024, TEST-036; phase readiness, deliverables and steps 1, 2, 9; Final Compliance Report rows and verdict; Open Questions V-7, V-10, V-13; changelog.
- `.ai/specs/2026-10-20-vereino-club-management.md`: the three opening-hours mentions point at DD-41; changelog.
- This run log.

## Commands and results

- `yarn format:check`: passes. `yarn lessons:check`: passes. Documentation only; no code, no `yarn verify` needed.
- Nothing was executed against a database; DST drift and the ACL override are read from code, not run.

## Open problems

- Phase 5 stays blocked by Q18, Q04 and the architectural-review findings; the spec stays Draft.
- `yarn framework:context` from the worktree root writes `packages/app/.ai/framework-context/`, which `.gitignore` does not cover.
