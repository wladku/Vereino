# Issue #38 — staff accounts and roles (foundation I phase A1)

- **Date:** 2026-10-27 – 2026-10-28
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (feature route) with two implementation subagents (slice 1: kernel; slice 2: `club_core`, `people`, wiring) and the coordinator's own review and gate
- **Trigger:** product owner — "/om-auto-fix-issue 38"; Ask First answers: enable `scheduler`, pin MikroORM exactly, generate migrations; scope "Minimum w tym PR"; roles "Tylko role fazy 1"
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-foundation-primitives.md` phase A1 (club spec phase 1 for `club_core` / `people`); issue #38; branch `feat/issue-38-staff-accounts-roles`
- **Status:** completed — PR open for review

## Goal

Give staff (club administrator, coordinator, coach) accounts and scoped roles on top of the foundation I kernel, with #38 as its first consumer: scope grants, scoped command authorization, role sync to `auth`, account creation with the age policy, and the daily role-expiry job.

## Steps

1. Claimed #38 (assignee, `in-progress`, 🤖 comment); asked the Ask First items and the #25 / #26 dependency question (Q17); marked phase A1 ready in the spec (commit 16ac36e).
2. Slice 1 (subagent): `@vereino/core` scope, validity, consent, roles, account policy, error codes, module schedule, calendar date with 100 % tests; `@vereino/db` scoped entity base and columns; exact MikroORM 7.2.5 pins; module `foundation` (`authorizeScoped`, scope contract, role sync, `createAccount`, encrypted and localized fields, `registerModuleSchedule`); `scheduler` and `foundation` enabled. Coordinator ran `yarn verify` (13/13) and committed c6be8b5.
3. Slice 2 (subagent): minimal `club_core` (settings, undoable update, API) and `people` (persons with an encrypted PESEL, role assignments, guardianships, `create_account`, scope provider, setup, `people:sync-auth-roles`, `people:sync-role-expiry`, CLI `bootstrap-admin`); migrations from `yarn db:generate` against a throwaway Postgres with hand-written `down()`; the `AGENTS.md` extraction-rule amendment, the review-checklist line, the boundaries lint and TEST-F14 fixtures, the BC §1 row; integration tests TEST-F01…F06, F09, F10 and club TEST-005 (positive and negative).
4. Coordinator review of the slice 2 diff (scope narrowing, role sync under the per-user lock, `create_account` in three steps with the orphan-user report); `yarn verify` 13/13 and the integration tests rerun; spec implementation status, AC-F04 deviation and Q18 recorded.

## Decisions

- The first club administrator is created by `people bootstrap-admin` (roles, role features, schedule, person with a `club_admin` assignment): tenants created through the API skip the platform setup.
- Coach grants wait for memberships (#30); a coordinator reads only their own person until #26 defines club-wide reads.
- The PESEL is never listed, shown in the detail only with `people.pesel.view`, and kept out of audit snapshots (an undo does not restore it).
- `create_account` checks under the row lock, creates the platform account, then links it; a lost race reports `people.account.orphan_user`.
- The role-sync subscriber also reacts to guardianship events (payer rule).

## Installed behaviour that differed from the spec

- An empty `$in` compiles to `in ()` (`shared/src/lib/query/engine.ts`), so `scopeWhere` fails closed with `id IS NULL`; spec P-03 updated.
- `makeCrudRoute` enables export by default and a full export skips `buildFilters`; scoped lists disable export and wrap filters as `{ $and: [scope, business] }`.
- The command bus runs `execute` outside a transaction; `people` opens one for `authorizeScoped` and reuses `ctx.transactionalEm` on replay.
- Event wildcards match one segment (`shared/src/lib/events/patterns.ts`); the subscriber listens on `people.*.*` with an allowlist.
- Subscribers receive only `resolve`, so the subscriber and worker build a request container.
- `ensureCustomRoleAcls` without modules finds no features from the CLI; `getCliModules()` is passed.
- `auth.users.create` takes no locale (AC-F04 deviation); the resend route requires `auth.users.create` (Q18).

## Files changed

- `packages/core/src/**`, `packages/db/src/**` — kernel and tests
- `packages/app/src/modules/foundation/**`, `club_core/**`, `people/**` — modules, migrations, i18n, READMEs
- `packages/app/src/modules.ts`, `packages/app/vereino-modules.json` — `scheduler`, `foundation`, `club_core`, `people` enabled
- `packages/app/.ai/qa/tests/{_fixtures,foundation,people}/**` — integration tests
- `eslint.vereino.mjs`, `packages/app/scripts/__tests__/*` — boundaries rule, TEST-F14
- `AGENTS.md`, `.ai/review-checklist.md`, `BACKWARD_COMPATIBILITY.md`, `.ai/lessons.md`, `.ai/lessons/*` — rule amendment, checklist, BC row, two lessons
- `.ai/specs/2026-10-27-vereino-foundation-primitives.md` — status, implementation status, P-03, AC-F04, Q17, Q18
- `.ai/runs/2026-10-27-issue-38-staff-accounts.md` — this log

## Commands and results

- `yarn verify` — 13/13 passed (slice 1 and slice 2, run by the coordinator).
- `yarn test:integration:vereino` for TEST-F01…F06, F09, F10, TEST-005 — passed; one earlier failure (TEST-F03, a custom role named `admin` refused in an API tenant) fixed in the test.
- `yarn db:generate` against a throwaway Postgres only; no `yarn db:migrate` on a real database.

## Open problems

- The role-context switcher criterion of #38 needs the `/club` shell (phase A2, E02-S03).
- The invitation follows the request locale, not the person's (platform limitation).
- Q18: the club administrator's resend of a failed invitation.
- A request without the optimistic-lock token is not rejected (the platform lock is a no-op without it).
- TEST-F05 consents and P-16 wait for their consumers (#26).

## Next steps

- Owner review of the PR; answer Q18; then #26, #27, #31.

## Lessons recorded

- `.ai/lessons/shared-packages-subpath-imports-and-app-decorators.md`
- `.ai/lessons/scoped-crud-lists-and-api-created-tenants.md`
