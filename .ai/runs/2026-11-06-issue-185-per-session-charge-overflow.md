# Run: issue #185 — per-session charge overflow

- **Goal / trigger:** unattended cezar task (om-auto-fix-issue) for issue #185: a per-session fee's charge (`amount × sessionCount`) in `planCharges` could exceed the `int4` amount column and fail the whole generation with a 500.
- **Issue:** #185 (follow-up of the #183 review, issue #108). **Branch:** `fix/issue-185-per-session-charge-overflow`. **Spec:** `.ai/specs/2026-10-27-vereino-club-payments.md` (API table row for `/api/payments/charges/generate`).
- **Route:** `debugging` + `module-data`, delivery `direct` (bug fix).

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment); renamed the task branch.
2. Root cause: `charge-plan.ts` multiplied the per-session amount by the session count with no bound; the fee validator caps only the per-session amount (`MAX_AMOUNT` = 10 000 000 grosz), so 215+ sessions overflow `int4`.
3. Fix: `planCharges` now plans no charge above `MAX_AMOUNT` and reports the fee names in a new `ChargePlan.overLimitFees`; the generate command refuses with the new coded 422 `charge_amount_over_limit` (param `fee`) before persisting anything.
4. Added the error code (table, `en`/`pl` messages, route OpenAPI errors, README, spec API row + changelog file) and a unit test (over-limit fee refused, at-limit fee still charged, existing charge still skipped).

## Decisions

- Refuse at the plan (per charge) rather than cap the per-session amount at validation: the session count is only known at generation, and a charge total above `MAX_AMOUNT` is inconsistent with the manual-charge limit anyway.
- The whole generation is refused (not partially created), so the admin lowers the fee and re-runs; generation is idempotent.
- New error code on an existing route is an additive contract change (previously the case answered 500).

## Files changed

- `packages/app/src/modules/payments/lib/charge-plan.ts`, `lib/error-codes.ts`, `commands/generate.ts`, `api/charges/generate/route.ts`, `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/src/modules/payments/lib/__tests__/charge-plan.test.ts`, `lib/__tests__/payments-rules.test.ts`
- `.ai/specs/2026-10-27-vereino-club-payments.md`, `.ai/specs/changelog/2026-10-27-vereino-club-payments/2026-11-06-issue-185-per-session-overflow.md`

## Commands and results

- `npx jest src/modules/payments/lib` — 3 suites, 54 tests passed.
- `yarn verify` — first run failed at `typecheck` (an apostrophe in the new OpenAPI description closed the single-quoted string: `TS1005: ',' expected` in `route.ts(55,611)`); fixed the wording; resumed with `yarn verify --from typecheck`: all 13 steps passed (typecheck, lint, format, i18n, contracts, lessons, spec-changelogs, test with 100 % coverage, test:scripts, build).

## Open problems / next steps

- No integration test added: the overflow needs 215+ sessions in one month; the refusal is a single guarded throw covered by the pure-plan unit test.
