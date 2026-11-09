# Run: issue #126 (E08-S06) — facility log, incidents, bans (attendant role left open)

- **Goal and trigger:** cezar task 504668e1 (`om-auto-fix-issue 126`), unattended. Build facilities spec phase 5 step 7: the attendant's day (open/close, today's use, no-show), incidents, the log and entry bans (REQ-016, TEST-026; M-12, B-27).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (In progress, phase 5); #126 (epic #119, depends on #122 — merged as #210); `feat/issue-126-attendant-log-incidents-bans`.
- **Approval:** the owner's comment on #119 (2026-11-05) approves the `facilities_*` migrations of E08. Not approved: a `people` migration, any dependency, `yarn db:migrate` against a real database.

## Steps

1. Read #126 (feature; Q1 on the no-show gate), the spec (step 7, *Data Models*, TEST-026) and the #119 approval.
2. Found that the attendant (`facility_operator` role, `people_role_assignments.place_id`, the `place_ids` grant) does not exist and needs a `people` migration the approval does not cover. First session: stopped before claiming and commented on #126 (issuecomment-6724637922).
3. The owner then told the session to continue autonomously. Under the recorded approval only, claimed #126 (assignee, `in-progress`, comment issuecomment-6724684577) and built everything except the attendant role; incident photos were also left out.
4. Backend (commit e25bb61): `lib/logs.ts`, `lib/incidents.ts` with unit tests (100 %); error codes; `FacilityLog`/`Incident` entities and `Migration20261108173422_facilities` (offline `yarn db:generate`, header and `down()` added — two new tables); encryption of remarks, description and people involved; events; ACL `facilities.log.write`; commands `facilities.logs.create|update`, `facilities.incidents.create|update`, `facilities.entry_bans.revoke` and the ban's incident link and issuer; routes `/api/facilities/logs`, `/incidents`, `/entry-bans/{id}/revoke`, `/today`; list names via `afterList`.
5. TEST-026 (commit d1a914b) and the spec/changelog update.
6. UI delegated to one subagent with disjoint files: `/club/facility` (M-12), `/backend/facilities/logs|incidents|bans` (B-27), en + pl keys, `E08-S06-facility-day.spec.ts`. The coordinator fixed the lint/ds findings in its own files (`lib/logs.ts` template, `api/records.ts` Set spreads, TEST-026), reviewed and committed.

## Decisions

- Q1: no owner decision needed — the club spec's roles table gives the attendant `facilities.rentals.manage`, so `/rentals/{id}/no-show` keeps its gate.
- The log and incidents are written with the `club_admin` grant only (`LOG_KINDS`) until the attendant grant exists; the "editable until the end of the next day" rule is in `logEditable` and unit-tested, and only bites non-administrators.
- `involved` is encrypted free text, not the spec's jsonb list (the M-12 field is free text); recorded in the spec changelog.
- `thread_id` is a scalar link without a check: `communication` has no read service and `facilities` does not require it.
- Incident kinds name no health category (M-12 "no health data").
- `GET /api/facilities/today` uses `facilities.view` per the spec row.
- The subagent was told not to run the integration runner: it builds into the shared `packages/app/.next`.

## Files changed

- `packages/app/src/modules/facilities/**` (lib, data, commands, api, services/today.ts, migrations, acl, events, encryption, i18n, components, backend and frontend pages).
- `packages/app/.ai/qa/tests/facilities/TEST-026-log-incidents-bans.spec.ts`, `E08-S06-facility-day.spec.ts`.
- `.ai/specs/2026-10-27-vereino-facilities.md`, `.ai/specs/changelog/2026-10-27-vereino-facilities/2026-11-08-issue-126-log-incidents-bans.md`, this log.

## Commands and results

- `npx jest src/modules/facilities/lib --coverage` → 63 passed; `logs.ts`, `incidents.ts`, `error-codes.ts` 100 %.
- `yarn db:generate` → `facilities: generated Migration20261108173422_facilities.ts`, other modules "no changes".
- `yarn typecheck`, `yarn typecheck:qa` → clean.
- `yarn test:integration:vereino --filter TEST-026` → `1 passed (1.6m)`.
- `yarn ds:check` → `1072 files passed`; eslint on facilities + its tests → 0 errors.
- `yarn test:integration:vereino --filter E08-S06` → `1 passed (1.7m)`; `yarn verify` → all 14 steps passed (before the review).
- After the review fixes (2646ec3): `yarn verify` → all 14 steps passed again. The reruns of `--filter TEST-026` and `--filter E08-S06` failed to start: `[ephemeral] starting PostgreSQL … Could not find a working container runtime strategy` (Docker was down; the run may not touch Docker Desktop). TEST-026 gained a coach `/today` assertion (`log: null`) that has therefore not run locally; CI runs it on the PR.

## Review

A fresh-eyes subagent reviewed `git diff origin/main...HEAD` (read-only): request changes. Fixed in 2646ec3: (M1) `GET /api/facilities/today` returned the log (conditions, decrypted remarks) to anyone with `facilities.view` — now only to callers with `facilities.log.write` and a log grant, others get `log: null`; (M2) saving one card on `/club/facility` reset the other cards' unsaved input — cards keep a stable key and follow the log only while clean; (L1) a concurrent first log of the day answered 500 — the unique violation now answers 409 `log_exists`; (L2) every update overwrote the operator — set on create only; (L5) a ban could link an incident of another place — the check includes the place; (L3, part) a closing time before the opening time rolls to the next day; (L4) an unknown `?place=` offers the club's first place. Left as follow-ups: the admin log edit dialog uses the browser time zone; a page left open over midnight keeps writing yesterday's log; the ban list shows "Linked" without an incident summary.

## Open problems / next steps

- Owner: approve the `people` migration (`people_role_assignments.place_id`) and the seeded `vereino_facility_operator` role; then a follow-up builds the attendant grant (`place_ids`), lets it write the log and incidents of its places, and integration-tests the 403 `log_edit_closed`. #126 stays open for it.
- Incident photos through `attachments` (upload checks, private partition, a serving route).
- The ban list shows "Linked" for its incident (no incident summary in the list).
