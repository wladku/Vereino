# Run: issue #302 — the administrator sees the online payment connection and chooses the offered methods (E12-S12)

- **Trigger:** cezar `om-auto-fix-issue 302` (label `cezar` added).
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-payments.md` phase 12 (REQ-C14, TEST-C15, AC-C14, DD-C11, V-C01) / #302 / `feat/issue-302-admin-online-payment-methods`
- **Date:** 2026-11-18

## Goal

On B-20 "Coaches and payments" show whether Stripe is connected and in which mode, let the club administrator choose the offered online methods (card, BLIK, Przelewy24), show the online fee mode read-only with a link to club settings, and have the checkout pass the chosen methods to the gateway.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment). Feature route: the spec is `Ready for implementation`; migration C and the contract change were approved by the owner on 2026-11-16 (#254, Q-C20), so the Ask First items are recorded.
2. Read the installed `integrations` services (`integrationCredentialsService.resolve`, `integrationStateService.isEnabled`), the `gateway_stripe` integration id and how its adapter maps `paymentTypes` to Stripe's `payment_method_types` (`card`, `blik`, `p24`).
3. Pure rules `payments/lib/online-payment.ts` (methods, validation, display order, connection mode from the publishable key prefix) with unit tests at 100 %.
4. Migration C (`yarn db:generate`): `alter table "payments_settings" add "online_methods" text[] not null default '{card}'`; snapshot updated. Not applied to any database outside the test containers.
5. `payments.settings.update` takes `onlineMethods` (422 `online_methods_invalid` for an empty, unknown or repeated selection, checked after authorization); its snapshot and undo carry the methods (an older snapshot without them leaves the row unchanged).
6. `services/online-connection.ts` resolves the two integration services from DI and returns only the mode; any read failure is `unknown` ("not verified").
7. `GET/PUT /api/payments/settings` adds `onlineMethods`, `onlineConnection` and `onlineFeeMode` (from `club_core` settings); OpenAPI documents the 422.
8. `payments.checkout.create` passes the club's methods as `paymentTypes` (was the constant `['card']`); the test adapter echoes `paymentTypes` in its session payload.
9. `PaymentsSettingsForm.tsx`: the "Online payment" group with the badge, the fee mode and its link to `/backend/club/settings`, and the three method checkboxes (an empty selection is refused in the form too). en/pl catalog keys.
10. TEST-C15 in two files: `TEST-C15-online-payment-methods.spec.ts` (API) and `TEST-C15-online-payment-tab-ui.spec.ts` (B-20 in the browser). `_fixtures/payments.ts` gains `connectStripe` (plays the technical administrator of DD-C11) and `PaymentsSettingsBody`.
11. Spec status line and changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-payments/2026-11-18-issue-302-phase-12.md`.

## Decisions

- The methods live in `lib/online-payment.ts`, not in `payments-rules.ts`: a separate vocabulary with its own tests.
- The checks run in the command after `authorizeScoped`, as a business error (422), because the Zod validation of the route answers 400.
- The stored methods are normalized to display order (`card`, `blik`, `p24`), so the response and the gateway see one order.
- `onlineFeeMode` is `null` when the club settings cannot be read, so the read of B-20 never fails on the fee fact alone.
- TEST-C15 was split into API and UI files so the API part can run where no browser starts (see Open problems).
- AC-C14 stays unticked until the UI part has passed in CI.

## Files changed

- `packages/app/src/modules/payments/lib/online-payment.ts`, `lib/__tests__/online-payment.test.ts`, `lib/__tests__/payments-rules.test.ts`, `lib/error-codes.ts`
- `packages/app/src/modules/payments/data/entities.ts`, `data/validators.ts`
- `packages/app/src/modules/payments/migrations/Migration20261118210514_payments.ts`, `migrations/.snapshot-open-mercato.json`
- `packages/app/src/modules/payments/commands/settings.ts`, `commands/checkout.ts`
- `packages/app/src/modules/payments/services/online-connection.ts`, `services/test-gateway.ts`
- `packages/app/src/modules/payments/api/settings/route.ts`
- `packages/app/src/modules/payments/components/PaymentsSettingsForm.tsx`
- `packages/app/src/modules/payments/i18n/en.json`, `i18n/pl.json`
- `packages/app/.ai/qa/tests/_fixtures/payments.ts`, `payments/TEST-C15-online-payment-methods.spec.ts`, `payments/TEST-C15-online-payment-tab-ui.spec.ts`
- `.ai/specs/implemented/2026-11-14-vereino-parity-payments.md`, `.ai/specs/changelog/2026-11-14-vereino-parity-payments/2026-11-18-issue-302-phase-12.md`
- `.ai/runs/2026-11-18-issue-302-online-payment-methods.md`
- `.ai/lessons/cezar-host-integration-tests-docker-group-no-browser.md`

## Commands and results

- `yarn db:generate` — `payments: generated Migration20261118210514_payments.ts`; every other module "no changes".
- `npx jest src/modules/payments/lib/__tests__/` — 14 suites, 300 tests passed.
- `yarn typecheck`, `yarn typecheck:qa` — exit 0.
- `yarn test:integration:vereino --filter TEST-C15` (first run) — `Could not find a working container runtime strategy`: the cezar process does not carry the `docker` group of its user. Re-run under `sg docker -c "…"`.
- Same, with the single-file TEST-C15 — the browser did not start: `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0`. The host lacks the browser's system libraries.
- After the split, first run of the API file — failed at `my-charges` (`Received: undefined`): an adult staff member without a guardianship has no payer grant. Fixed by paying a ward's charge as his primary payer, as TEST-019 does.
- `yarn test:integration:vereino --filter TEST-C15-online-payment-methods --no-build` — 1 passed (28.1s).
- `yarn verify` — all 17 steps passed.

## Open problems

- `TEST-C15-online-payment-tab-ui.spec.ts` was not run locally (no browser libraries on this host); CI runs it.
- The "not verified" badge is covered by the service's fallback and the unit-tested rule, not by an integration test: no test can make the installed integration services fail on demand.

## Next steps

- Review the PR; after merge, apply migration C with the usual deployment (`yarn db:migrate` by the owner).
- BLIK and Przelewy24 should be switched on in production only after the sandbox run of the base spec's step 1 (Q-C15).

## Run 2026-11-19 — om-auto-fix-pr: merge-train conflict

- Trigger: the merge train labeled PR #401 `merge-train-conflict`. Worked on a detached HEAD at `origin/feat/issue-302-admin-online-payment-methods`, no force-push.
- Merged `origin/main` twice (main advanced with #293 while the gate ran). Each time the only conflict was the parity spec's Status line; resolved by keeping main's phase list (phase 3 #293, phase 6 #296) and adding phase 12 #302. No migration, validator or i18n conflicts (`validators.ts`, `i18n/*.json` auto-merged; JSON parses).
- `yarn verify` — all 18 steps passed on both merge commits (f8cb8748, 69d2f04b).
- Removed the stale `merge-train-conflict` label; GitHub reports the PR `MERGEABLE`. CI on the new head is owned by the merge train.

## Run 2026-11-19 (2) — om-auto-fix-pr: merge-train conflict after #299

- Trigger: PR #401 labeled `merge-train-conflict` again after #299 (phase 9) landed on `main`. Worked on a detached HEAD at `origin/feat/issue-302-admin-online-payment-methods`, no force-push.
- Merged `origin/main` (5a180eb6). The only conflict was the parity spec's Status line; resolved by keeping main's list (now with phase 9 #299) and adding phase 12 #302. `payments/i18n/*.json` auto-merged and parse; main touched no payments migration, so migration C and its snapshot stand unchanged.
- `yarn verify` — all 18 steps passed on the merge commit.
- The PR's own diff is unchanged, so the earlier review disposition holds; migration C remains approved by the owner on #254 (Q-C20) and is not applied.
