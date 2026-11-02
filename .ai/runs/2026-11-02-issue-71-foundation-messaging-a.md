# Issue #71: foundation III phase A — audience, dispatch and e-mail templates

- **Date:** 2026-11-02
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, one implementation subagent, and the coordinator's own review and gate
- **Trigger:**
  - Epic #22 closed on 2026-11-02 after #70 merged.
  - The product owner had approved epic #23 on 2026-11-01, to start after epic #22: enabling `communication_channels`, `progress`, `integrations`, `messages` and `channel_resend`, the new `communication` module and their migrations.
  - Phase A of the foundation III spec had no issue, so it was filed as #71 through `om-prepare-issue`.
- **Spec / issue / branch:**
  - Spec: `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md`, *Implementation Phases → Phase A* (REQ-M01…REQ-M04, P-29…P-31, TEST-M01…TEST-M04, AC-M01…AC-M04).
  - Issue: #71, consumer #35, epic #23.
  - Branch: `feat/issue-71-foundation-messaging-a`.
- **Status:** completed, PR open for review.

## Goal

Any Vereino module can address an audience and deliver an e-mail and an in-app notification with a per-recipient status, in each recipient's language, with link secrets kept out of events, jobs and logs. Phase B (the `communication` module for #35) builds on it.

## Steps

1. Filed #71, claimed it (assignee, `in-progress`, 🤖 comment), and created a worktree from `main` at c885f3f.
2. **Subagent:** enabled the modules, built P-29 audience, P-30 dispatch with its migration, P-31 templates and `EmailLayout`, wrote TEST-M01…TEST-M04, and ran `yarn verify` and each new test.
3. **Coordinator review:**
   - module list and the `messages` decision;
   - the migration;
   - the worker's lease, retry, final-state wipe and tenant narrowing;
   - no dependency added; nothing from phases B or C.
4. **Coordinator gate:** reran `yarn verify` and the whole integration suite.

## Decisions

- **`messages` stays disabled** (DD-M15 allows it only if required). The app generates, initializes, builds and starts without it, and the four tests pass. `communication_channels` only extends `messages:message` and references its entity in subscribers on `messages.*` events, which never fire. No `messages.*` feature exists to grant to a `vereino_*` role.
- **Enabled:** `progress`, `integrations`, `communication_channels` (`@open-mercato/core`) and `channel_resend` (`@open-mercato/channel-resend`). They bring 11 platform migrations (progress 2, integrations 3, communication_channels 6), applied by `yarn initialize`. Their setup grants `integrations.*`, `communication_channels.*` and `channel_resend.*` to the platform roles `superadmin`, `admin` and `employee`; the `vereino_*` roles are unchanged.
- **`foundation` migration** `Migration20261102074140_foundation`: two new tables, `foundation_dispatches` (unique per organization and idempotency key) and `foundation_deliveries` (unique per dispatch, person and channel; lease and retry columns; `secret_params` encrypted). `down()` written by hand. No `lock_timeout`: no DDL on existing tables. Generated against a throwaway Postgres; up → down → up there only; never applied to a dev or real database.
- **Audience:** `club` = participants and coaches of active groups plus active `coach` role holders. A coordinator may address persons in their sections; a coach the members of the groups they coach. The minor rule applies to participants and directly addressed persons, not to coaches; an unknown birth date counts as adult. An unreachable recipient gets one `skipped` e-mail row.
- **Dispatch:** `publish` takes the trusted scope that the job carries. The send rate is a sliding window of 8 per 1.1 s. Failure codes: transient or missing transport → `transport_unavailable`; an address error → `address_invalid`; otherwise `provider_rejected`. The sweeper runs every 2 minutes per organization, registered from `foundation/setup.ts`.
- **Templates:** the e-mail footer names only the primary reason, never a ward's name. Probe templates and the probe module live under `.ai/qa/tests/_fixtures/messaging-probe/`, not in a shipped module.

## Installed behaviour that differed from the spec

- **`OM_TEST_MODE` counts as delivery disabled** (`shared/src/lib/email/config.ts`), while `sendEmail` still captures. "Disabled" therefore reads `OM_DISABLE_EMAIL_DELIVERY` explicitly.
- **The capture does not render components** (`collectEmailText` in `send.ts`). The worker expands function components first (`expandEmailTree`).
- **Notification delivery strategies exist only in the web runtime** (`bootstrap-common.ts`). The tests register them as the web runtime does, the worst case, and check that no platform e-mail is sent.
- **`.tsx` cannot load in workers.** `EmailLayout` is `EmailLayout.ts` behind the `@vereino/ui/emails` subpath, not the `.tsx` the spec names.
- **An encrypted lookup hash needs its property present at insert** (`tenantDataEncryptionService.ts`), so enqueue sets `emailHash: null`.

## Files changed

- `packages/core/src/audience.ts` with its unit test; `packages/ui/src/emails/*` with its unit test and the `./emails` export.
- `packages/app/src/modules/foundation/`: entities, migration, encryption, events, setup, rules, services (audience, dispatch, worker, sender seam, templates, render), workers, error codes, i18n, README.
- Audience providers in `people`, `groups` and `activities` (`services/audience.ts`, `di.ts`, READMEs).
- `packages/app/src/modules.ts`, `.env.example`, `scripts/vereino-ephemeral.mjs` with its test.
- `packages/app/.ai/qa/tests/_fixtures/messaging.ts`, `_fixtures/messaging-probe/*`, `foundation/messaging/TEST-M01…M04`.
- `.ai/lessons.md` and two lessons; this run log.

## Commands and results

- **`yarn verify`:**
  - subagent's run: 13/13 passed; package unit tests core 79/79, ui 27/27, db 8/8 at 100 % coverage;
  - coordinator's rerun: 13/13 passed (231 s).
- **`yarn test:integration:vereino --filter TEST-M0n`**, subagent's runs, one id each: TEST-M01 22.6 s, TEST-M02 52.1 s, TEST-M03 24.2 s, TEST-M04 21.4 s, all passed without retries.
- **`yarn test:integration:vereino`**, whole suite, coordinator's rerun: **88 passed, 1 flaky** (45.6 min), TEST-M01…M04 included. The flaky test is J-001: one `page.goto` of the public club page `/p/{slug}` ended in `net::ERR_ABORTED` and passed on retry; this change does not touch that page.
- No dependency added. No `db:migrate` against a dev or real database.

## Open problems

- The Redis (async) queue strategy is not exercised; the test runner has no Redis.
- `deliveriesOf` has no route consumer yet; phase B's `DeliveryStatusList` will cover it.
- Existing organizations get the sweeper schedule only when their setup reruns; there is no production tenant yet.
- Q13 (retention) stays open.

## Next steps

- Owner review of this PR.
- Then phase B: the `communication` module for #35, with its migration, approved on 2026-11-01.
