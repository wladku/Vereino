# Run log — #630 E22-S04 operator command and runbook to create a club

- **Trigger:** Cezar `om-auto-fix-issue 630` (label `cezar` added 2026-11-23T07:00Z); feature route, phase 2 of
  `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`.
- **Branch / worktree:** `feat/issue-630-operator-club-runbook`, Cezar worktree `0a39896f-…`.
- **Approval on record:** owner comment on #630 (2026-11-23): the migrations the phase needs are approved; anything
  beyond the spec is Ask First. This change adds **no migration**.

## Steps

1. Claimed #630 (assignee, `in-progress`, `🤖` claim comment). Phase 1 (#629, sweep jobs) is open and unbuilt.
2. Read the spec (DD-M01, DD-M08, J-M01, phase 2), the platform's `setupInitialTenant` and `auth setup` CLI,
   `mercato init`'s `seedDefaults` loop, the platform invite (`auth.users.create` / `resend-invite`), the people
   `bootstrap_admin` job command, the club settings command and the existing test fixtures.
3. Built: `club_core/lib/club-onboarding.ts` (reserved slugs, option parsing, club address; 100 % unit coverage),
   job command `club_core.clubs.provision`, `club_core/services/club-onboarding.ts` (orchestration), CLI
   `club_core create-club`, foundation `sendAccountInvitation`, error `slug_reserved` (also enforced by
   `club_core.settings.update`), event `club_core.club.created`, runbook `docs/ops/clubs.md`, TEST-M01.
4. First integration run failed: the CLI exited 0 for a reserved slug — the mercato runner drops `process.exitCode`
   (lesson `module-cli-exit-code-needs-a-thrown-error`). Fixed by throwing after printing the JSON line.
5. Added the `--tenant/--org` finish mode after writing the runbook showed a half-created club could not be finished
   by hand (the settings command needs a `club_admin`).
6. Gate fixes: deprecated `emitEvent` → `eventsConfig.emit`; `[internal]` prefix for operator-only errors.

## Decisions

- **Phase 2 before phase 1.** `create-club` runs every module's `seedDefaults`, which today register the per-club
  schedules; when phase 1 moves `setup.ts` to `initClub`, the command picks that up with no change. The issue's "gets
  its jobs run" is shown by the registered schedules plus one run of `people sync-role-expiry`.
- **`setupInitialTenant` with `failIfUserExists: true`.** Without it the platform reuses an existing user's tenant for
  the admin e-mail, i.e. the new club would land in another club's tenant. So an e-mail that has an account anywhere is
  refused before anything is written (documented in the runbook).
- **Platform `admin` role** for the club administrator, no `superadmin` role in the club's tenant
  (`includeSuperadminRole: false`); the `vereino_*` roles come from `bootstrap_admin`.
- **Invitation** = the platform's own 48-hour invite row (`PasswordReset` + `InviteUserEmail`), tied to the user id,
  with club-named copy; never a password on the command line.
- **Left out, needs its own approval:** the pre-deploy ACL-sync wrapper (DD-M11, REQ-M09, TEST-M10) — listed under the
  spec's *Ask First items* as a deploy contract and not part of the issue text. `--domain` is not a flag: the address
  comes from `VEREINO_CLUB_DOMAIN` (phase 3) or `APP_URL`.
- Spec status line left as is (phase list rule; phase 1 is still open).

## Files

`packages/app/src/modules/club_core/{cli.ts,events.ts,README.md,commands/clubs.ts,commands/settings.ts,
lib/club-onboarding.ts,lib/error-codes.ts,lib/__tests__/*,services/club-onboarding.ts,i18n/*}`,
`packages/app/src/modules/foundation/{index.ts,services/accounts.ts,i18n/*}`,
`packages/app/.ai/qa/tests/club_core/TEST-M01-create-club.spec.ts`, `docs/ops/clubs.md`, `docs/ops/deploy.md`,
`BACKWARD_COMPATIBILITY.md` (§7 operator CLI), spec changelog file, lesson.

## Commands and results

- `npx jest …/club-onboarding.test.ts --coverage` → 11 passed, 100 % lines/branches/functions.
- `yarn test:integration:vereino --filter TEST-M01-create-club` → first run failed (`Expected: 1, Received: 0` on the
  reserved-slug exit code); after the fix 1 passed (three runs, last after the gate fixes). `--filter TEST-M01` alone
  also matches the older `foundation/messaging/TEST-M01-audience` (passed too).
- `yarn verify` → all 21 steps pass (full run after the fixes).
- `yarn guard` → no blocking findings.

## Open problems / next steps

- Phase 1 (#629) should subscribe `initClub` to `club_core.club.created` and update the runbook's schedule check.
- DD-M11 ACL-sync wrapper: needs the owner's approval as a deploy contract, then its own PR (TEST-M10).
- Several older module CLIs set `process.exitCode = 1` on usage errors and so exit 0 (see the lesson).
