# Run — issue #125: online facility requests (E08-S05)

- **Goal and trigger:** cezar task 7e3a3515 (`om-auto-fix-issue 125`), unattended. Build facilities spec phase 5 step 6 — the public request form (P-04), the e-mail confirmation (P-05), the 48-hour hold, the approval queue (B-25) with approval, rejection, expiry and supersession e-mails, and the B-01 widget (REQ-024, TEST-035, TEST-036, TEST-039).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (Ready for implementation, phase 5 in progress); #125 (epic #119); `feat/issue-125-online-facility-requests`.
- **Approval:** the owner's E08 approval on #119 (2026-11-05) covers `facilities_*` migrations; the issue's open questions are answered in the spec (DD-44 for the request-link e-mails, #167; the public categories `municipal_club`/`external_commercial` in the `RentalRate` row).

## Steps

1. Checked the prerequisites (#157, #71, #122, #124 closed; the #167 review findings resolved), claimed #125 (assignee, `in-progress`, claim comment), renamed the task branch.
2. Foundation `dispatch`: bare-address recipients (`addresses`, secrets keyed by `bareAddressKey`), the foundation messaging spec's *Recipient* glossary row ("or, for phase 5 requesters, a bare address") and P-30 `recipientKey`.
3. Facilities backend (commit `0c4ecf2`): `lib/requests.ts` (pure: hold, holds overlap, per-e-mail limit key, ban name hint, approval amount, e-mail formatting; 100 % coverage); the rental row as the P-10 link (`tokenHash`/`expiresAt`/`usedAt` mapped onto the verification columns), `contact_locale` column (`Migration20261109164114_facilities.ts`, generated offline against an unreachable database); commands `submit_request`, `verify_request`, `approve`, `reject`, `expire_requests`; routes (public request and verify, approve, reject, the B-25 queue `GET /api/facilities/rentals/requests`); five e-mail templates; four decision-mail subscribers and the approver notice; worker + 15-minute schedule + CLI `facilities expire-requests`; `club_core` directory `placePayee`; `next.config.ts` `no-referrer` + `no-store` for P-05.
4. UI delegated to one subagent with disjoint files (P-04 dialog, P-05 page, B-25 page and dialogs, B-01 widget, en/pl strings, TEST-039, client-safe `lib/request-form.ts`). The coordinator fixed three lint errors in `commands/requests.ts` it reported and added `facilities.view` to the widget's features (the queue route needs it).
5. Integration tests by the coordinator: `TEST-035-online-requests.spec.ts`, `TEST-036-request-security.spec.ts`, fixture `_fixtures/facility-requests.ts`; the QA request probe's renamed property (`emailVerifiedAt` → `usedAt`).
6. Spec: step 6 built note, the queue route row, `contact_locale`; changelog entries for the facilities and the foundation messaging specs; lesson `feature-notifications-are-tenant-wide`.

## Decisions

- **The request is its own token link** (DD-44 as written): no new table; the foundation service reads fixed property names, so the entity maps them onto the existing verification columns.
- **Bare-address recipients in `dispatch`** as a separate `addresses` field (secrets keyed by `bareAddressKey`), not a person-less `Recipient`, so no audience consumer changes.
- **Public commands without `authorizeScoped`:** no person and no session; the slug lookup (submit) or the token's hash (verify) names the club inside the command; acting role `system`, `actor: guest` in the log; logs keep no payload.
- **Error mapping of a guest request:** a closure, opening hours or any occupancy → 409 `slot_unavailable` (no detail about what holds the slot); outside the bookable zone → 422 `request_zone_invalid` (the spec's 422).
- **Approver notice to the club's `club_admin` role holders**, not `createForFeature` (tenant-wide, lesson).
- **`contact_locale`** (one nullable column): the decision e-mails go out days later and must use the guest's language.
- **Decision e-mails link to the club's public places list** (no place slug in the directory read).
- **Approval sets `renter_display_name` to the registered renter's name**, as a staff entry stores it.
- **No charge asserted:** `payments` registers no `chargeService` yet (DD-19 no-op); the approval calls it like the staff entry.

## Commands and results

- Unit: `npx jest src/modules` — 68 suites, 877 tests pass (before the UI); facilities/foundation `lib` 100 % lines/branches/functions; after the UI the subagent reported `facilities/lib` 94 tests, `request-form.ts` and `requests.ts` 100 %.
- `yarn typecheck`, `yarn typecheck:qa` exit 0; `yarn contracts:check` 0 problems; `yarn spec-changelogs:check`, `yarn lessons:check` valid; eslint clean (2 existing warnings in TEST-024).
- CLI smoke without a database: `yarn mercato facilities expire-requests …` → `connect ECONNREFUSED` (no duplicate command registration).
- Integration: **not run locally** — `docker info` fails (the Docker Desktop engine is down; the run rules forbid touching it). TEST-035, TEST-036, TEST-039 (and TEST-028/TEST-033, whose pages and probe changed) are left to CI.
- `yarn verify` run 1: generate … lint passed; `format:check` failed on TEST-035/TEST-036 (unformatted); after `prettier --write`, `yarn verify --from format:check` — format:check, ds:check, i18n:check-hardcoded, contracts:check, lessons:check, spec-changelogs:check, test (70 suites, 885 tests), test:scripts, build all passed.

## Open problems

- TEST-035, TEST-036 and TEST-039 have not run (no container runtime here); CI runs the integration shards. TEST-028 (its P-04 axe scan now includes the request buttons) and TEST-033 (the probe's renamed property) re-run there too.
- The 429 / 503 of the request limits are not integration-tested (`OM_INTEGRATION_TEST` disables limits); the key and `failClosed` are unit-tested.
- No charge on approval until `payments` registers `payments.chargeService` (DD-19).
- The `facilities:expire-requests` schedule is registered by `seedDefaults` (new organizations); existing organizations get it from a setup re-run, like `rental-lifecycle`.
- P-05 keeps the spent token in the address bar (not rewritten); it is single-use and the page is `no-referrer` + `no-store`.

## Next steps

- E08-S06 (#126) incidents and entry-ban pages; the maintenance windows (step 9) add the 409 `maintenance_scheduled` to the public request.
- `git merge origin/main` (PR #236 conflicted with #126/#233): resolved the facilities spec (step 6 and step 7 notes, phase status), `data/validators.ts` (both blocks) and the en/pl catalogs (key union, 879 keys each); offline `db:generate` shows no change; `yarn verify` all 14 steps passed.
