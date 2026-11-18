# Run: issue #301 — E12-S11 charges generated, overdue payers reminded, checkouts reconciled and campaigns closed on a schedule

- **Goal and trigger:** cezar task (`om-auto-fix-issue 301`, label `cezar`): build phase 11 of `.ai/specs/2026-11-14-vereino-parity-payments.md` (REQ-C13; DD-C08, DD-C09; TEST-C14, TEST-C16 due rules; AC-C13).
- **Spec / issue / branch:** spec `In progress`, Ready for implementation since the owner's approval of 2026-11-16 on #254 (Q-C20: migration B and Contracts 4 and 5 approved; Q-C06 confirmed, Q-C07 confirmed with the first-automatic-month amendment); issue #301; branch `feat/issue-301-charges-reminders-scheduled`; worktree `.ai/cezar/worktrees/08215b38-…`.

## Steps

1. Claimed #301 (assignee, `in-progress`, 🤖 comment naming the worktree, branch and start). Feature route: spec found and approved, no open PR for the issue.
2. Read the spec (phase 11, DD-C08, DD-C09, *Domain Vocabulary* → Automatic generation, Overdue reminder; TEST-C14, TEST-C16), the facilities and activities precedents (`facilities/setup.ts`, `facilities/workers/*`, `facilities.maintenance.send_reminders`, `activities/services/club-setup.ts`, `activities set-up-club`), the foundation `registerModuleSchedule`, `jobCommandContext` and dispatch, and lessons `notification-type-registry-in-worker-runtime`, `worker-runtime-imports-and-notification-strategies`, `crudform-required-preempts-domain-message`, `dispatch-source-id-is-a-uuid`.
3. Slice (a) sweeps: `commands/shared.ts` `authorizePaymentsJob` (grant `system_job`, `scopeSource: { job: true }`, input `paymentsJobSchema` `{ now? }`) and `paymentsJobLog`; job commands `payments.checkouts.reconcile` (`commands/checkout.ts`) and `payments.order_campaigns.close_due` (`commands/order-campaigns.ts`; `closeOrderCampaigns` takes an optional `now`); four workers in `workers/`; `services/club-setup.ts` `setUpClubPayments` + `setup.ts`; CLI `set-up-club` and `run-job` (the two operator commands unchanged).
4. Slice (b) generation: migration B `Migration20261118201338_payments` from `yarn db:generate` (offline, from the snapshot); entities `Charge.lastRemindedAt/reminderCount`, `PaymentsSettings.autoGenerateCharges/generationDay/overdueReminders`; `lib/payments-rules.ts` `firstAutomaticPeriod`, `generationDue`; `commands/generate.ts` extracts `writeGeneration` (shared by the manual command, unchanged behaviour) and adds `payments.charges.generate_due`; `data/queries.ts` `automaticGenerationSince` reads migration B's `executed_at`.
5. Slice (c) reminders: `lib/payments-rules.ts` `reminderDue`, `reminderBatches`; `services/overdue-reminders.ts` `sendOverdueReminders`; `payments.charges.remind_overdue` in `commands/ledger.ts`; template `payments.charge_reminder` gains the optional `payerCode` and declares the in-app type `payments.charge_overdue` (`notifications.ts`, registered in `di.ts` for the worker runtime).
6. Settings: `paymentsSettingsUpdateSchema`, `payments.settings.update` (snapshot + undo), `GET/PUT /api/payments/settings` and `PaymentsSettingsForm` group "Automatic charges and reminders"; i18n en/pl.
7. Tests: unit `lib/__tests__/payments-scheduled-rules.test.ts`; integration `payments/TEST-C14-scheduled-jobs.spec.ts`.
8. Docs: module README "Scheduled jobs", spec status line, spec changelog file `2026-11-18-issue-301-phase-11.md`.

## Decisions

- **One message lists every overdue charge of the payer** (below the cap), triggered when at least one of them is due a reminder; every listed charge's marker moves, so they share one 7-day cadence afterwards. This keeps "one message per payer listing all overdue charges" and "at most 4 per charge" both literally true without a daily trickle.
- **Marker by conditional UPDATE** (`reminder_count = <read value>`) inside the enqueueing transaction, without touching `updated_at`, so a reminder never invalidates an administrator's lock token and a concurrent run rolls back instead of reminding twice.
- **Reused the e-mail template `payments.charge_reminder`** (the coach's reminder, #117) and changed its declared in-app type to `payments.charge_overdue`; the coach's dispatch is e-mail only, so its behaviour is unchanged, and `payments.charge_reminder` was never a registered notification type.
- **An automatic generation is audited but not undoable**: the job has no user to own the undo token; a wrong charge is cancelled. A manual generation of the month that was undone still blocks the automatic one (DD-C08).
- **A fee over its limit or a held lock** makes the daily run generate nothing (logged / counted) instead of failing the job; the next daily run looks again.
- **A generation day outside 1–28 answers 400** (input validation, like every other settings field), not the 422 the spec's API row names; recorded in the spec changelog.
- **CLI `run-job` and `set-up-club`** (additive): the integration test drives the four job commands with `--now`, and existing clubs get their schedules by `set-up-club` (an API-created tenant runs no `seedDefaults`).
- **Integration test and Docker:** this cezar session's process did not carry the `docker` group of `wkuc` (added after login), so `yarn test:integration:vereino` failed with "Could not find a working container runtime strategy"; it ran under `sg docker -c '…'` (no configuration changed).

## Commands and results

- `yarn db:generate`: payments generated `Migration20261118201338_payments.ts`; every other module "no changes" (encryption backfill check skipped: no local DB).
- `yarn generate`: pass. `yarn typecheck`: pass.
- `npx jest …/payments-scheduled-rules.test.ts …/payments-rules.test.ts --coverage`: 37 passed, `payments-rules.ts` 100 % statements/branches/functions/lines.
- `yarn test:integration:vereino --filter TEST-C14`:
  - run 1: `Could not find a working container runtime strategy` (process without the `docker` group; re-run under `sg docker`);
  - run 2: failed — `POST /api/payments/checkout {"error":"Forbidden","requiredFeatures":["payments.pay_online"]}` (the test's payer was not a guardian; fixed in the test);
  - run 3: failed — `expect(reconciled.summary.completed).toBeGreaterThanOrEqual(1) … Received: 0` (the test gateway's sessions live in the server process; the test now asserts the sweep's `checked` and the booking through the refresh);
  - run 4: failed — `Command handler not registered for id payments.order_campaigns.close_due` (**real defect**: the missing `registerCommand`; fixed);
  - run 5: 1 passed (1.2m).
- Lesson `cli-job-runs-cannot-see-the-test-gateway` added.
- `yarn verify`: failed at `lint` with 4 errors (an unused type parameter in TEST-C14, `no-base-to-string` in `PaymentsSettingsForm` `dayOf`, a number in a template literal in `overdue-reminders.ts`); fixed; `yarn verify --from lint` passed; a full `yarn verify` then passed all 17 steps.
- `yarn test:integration:vereino --filter TEST-C14` (fresh production build): 1 passed (1.2m).

## Open problems / next steps

- UI QA of the B-20 group "Automatic charges and reminders" in both locales at 375 px (the integration test covers the API, not the form).
- Existing clubs need `yarn mercato payments set-up-club --tenant <id> --org <id>` once after deploy (API-created and existing tenants run no `seedDefaults`); the example club gets them from `seedDefaults`.
- The checkout booking by the scheduled sweep is not observable from a CLI run with the test gateway (lesson `cli-job-runs-cannot-see-the-test-gateway`); TEST-057 covers the fulfilment.
- REQ-L11 (E13-S10) changes the same generation; whichever lands second rebases (`writeGeneration` is the shared seam).
