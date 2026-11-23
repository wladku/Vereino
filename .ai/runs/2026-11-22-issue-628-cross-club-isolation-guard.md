# Run: issue #628 — cross-club isolation guard over every Vereino route (E22-S02)

- **Goal / trigger:** Cezar task (om-auto-fix-issue) for #628, labelled `cezar`: a guard proving one club never sees
  another club's data on a shared instance (D-034, epic #626), a check that fails when a route is missing from the
  inventory, and any leak fixed in the same PR or filed.
- **Branch / worktree:** `feat/issue-628-cross-club-isolation-guard`, Cezar worktree `e0759aec-…`.
- **Spec gate:** direct — the issue is a test guard plus the fixes it finds; no new capability, schema or route. The
  one behaviour change (403 → 404 for another club's record) is the issue's own acceptance criterion and updates
  AC-F01 of the foundation spec (changelog file added). Pre-deployment, so per `BACKWARD_COMPATIBILITY.md` the
  status change lands in one PR with every in-repo consumer (TEST-F01).

## Steps

1. Claimed #628 (assignee, `in-progress`, `🤖` claim comment naming this run).
2. Designed the guard: per-module route inventory (`_fixtures/isolation/inventory/<module>.json`, declarative probes
   with `$A:`/`$B:` refs), a probe engine (`probe.ts`), two seeded lookalike clubs (`seed.ts`; club B is a second
   organization of club A's tenant, so tenant-only narrowing is caught), module seeds (`seed-<module>.ts`), and the
   static check `scripts/check-route-isolation.mjs` (+ unit tests, 100 % coverage) as the `yarn verify` step
   `route-isolation:check`.
3. Probe semantics: reads as every club A role must hold no club B marker (ids, e-mails, slugs) and must not change
   after club B is seeded (ids + totals/counts); a request naming club B's record must answer exactly like the same
   request with ids that exist nowhere (existence-leak check), the administrator 404 (422 allowed for body refs), and
   never 2xx.
4. Wrote the people module myself and validated the engine end to end against a local ephemeral app; then delegated
   the other modules to seven subagents (club_core, groups, activities, communication, facilities, payments,
   payments-orders), each owning only its inventory file and seed, all running against the same local app. Merged
   their work, fixed two cross-seed key clashes (facilities reused club_core's `placeSlug` and activities'
   `calendarTo`; now `pitchSlug`, `facilityCalendarFrom/To`).
5. Findings and fixes:
   - **Existence leak in every write command** (about 300 probe lines across all modules): command loaders find a
     record by `id` + `tenantId`, and `authorizeScoped` answered 403 `scope_denied` for another organization's
     record, while an unknown id answered 404. Fixed centrally in
     `foundation/services/authorize-scoped.ts`: a loaded target of another organization answers 404. TEST-F01 and
     AC-F01 updated.
   - **Discount rules stored another club's persons** (`POST`/`PUT /api/payments/discount-rules` with
     `conditions.personIds` of club B answered 201/200). Fixed in `payments/commands/discount-rules.ts`: every
     newly named person must be a person of the club (`findPersons` with the trusted scope), else 422
     `discount_conditions_invalid`.
   - No read anywhere returned club B data or a changed count.
6. Rule and lesson: `AGENTS.md` *Always* gets one line (new routes get probes); lesson
   `foreign-club-record-answers-404-not-403`.

## Files changed

- `packages/app/.ai/qa/tests/foundation/ISSUE-628-cross-club-isolation.spec.ts` (new)
- `packages/app/.ai/qa/tests/_fixtures/isolation/` (new: `probe.ts`, `seed.ts`, `seeds.ts`, 8 module seeds, 8 inventory files)
- `packages/app/scripts/check-route-isolation.mjs` + `scripts/__tests__/check-route-isolation.test.mjs` (new)
- `scripts/verify.mjs`, `package.json`, `packages/app/package.json` (gate step `route-isolation:check`)
- `packages/app/src/modules/foundation/services/authorize-scoped.ts`, `packages/app/src/modules/payments/commands/discount-rules.ts`
- `packages/app/.ai/qa/tests/foundation/TEST-F01-authorize-scoped.spec.ts`
- `.ai/specs/2026-10-27-vereino-foundation-primitives.md` (AC-F01) + changelog entry
- `AGENTS.md`, `.ai/lessons/foreign-club-record-answers-404-not-403.md`, this run log

## Commands and results

- `node scripts/check-route-isolation.mjs`: `211 route(s), 554 probe(s), 0 problem(s)`
- `node --test … check-route-isolation.test.mjs`: 12 passed, coverage 100/100/100
- `yarn typecheck`, `tsc -p .ai/qa/tests/tsconfig.json`: clean; `vereino-format --check`: 0 unformatted
- `yarn test:integration:vereino --filter ISSUE-628` (with build, before the key-clash fix): failed in the seed —
  `{"error":"This address is already taken. Choose another one.","code":"public_slug_taken"}` at
  `seed-facilities.ts:83` (fixed: own slug key).
- Second full run (`--no-build`): `1 isolation problem(s) in 5659 calls` —
  `POST /api/people/me/departure-requests (foreign-ref) as member: expected 404/422, got 403 … scope_denied`; the
  same answer as for an unknown id (no existence leak), so the probe now expects 403 with the reason.
- Final runs (`--no-build`, same build): `ISSUE-628` 1 passed (1.9m, every probe of every module), `TEST-F01` 1 passed (38.9s), `TEST-048` 1 passed (35.5s).
- `yarn verify`: first run stopped at `lint` (errors in the new fixtures: non-null assertions, unnecessary conversions, an `any` return); fixed, `yarn verify --from lint` → `all 17 step(s) passed` (the first four steps passed in the first run). `ISSUE-628` rerun on the final code: 1 passed (2.0m).
- `yarn guard`: no blocking findings (warnings: `AGENTS.md`, `scripts/verify.mjs` changed — agent rule files).

## Decisions

- Club B shares club A's tenant (second organization): stricter than two tenants, and it is how the guard found the
  tenant-only loaders.
- The existence-leak check compares with a stand-in id rather than demanding 404 from every role: a role refused by
  feature before any lookup answers 403 for every id, which tells nothing.
- 14 exemptions, each with a reason: requests that name no record (creates from own fields, own settings, own
  profile, uploads into the caller's club).
- Loaders stay tenant-scoped; the central 404 makes them safe. Narrowing each loader by organization too is a
  possible follow-up hardening, not needed for the guarantee.

## Open problems / next steps

- Follow-up idea: let the engine send a CSV with substituted content, so the bank-statement import can be probed
  with club B's payer code (matching is organization-scoped in `payments/commands/bank.ts`, so it is exempt today).
