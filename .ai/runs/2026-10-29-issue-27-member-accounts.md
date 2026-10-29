# Issue #27 — member accounts, locale and the `/club` profile (club spec phase 1 steps 4, 4a and 5)

- **Date:** 2026-10-29
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (installed from `open-mercato/skills`, repo-local override applied; feature route) with one implementation subagent and the coordinator's own review and gate
- **Trigger:** product owner — "/om-auto-fix-issue 21"; #21 is the E02 epic with #27, #28 and #29 left, so the owner chose #27 and approved migrations ("Tak, generuj")
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 1 steps 4, 4a and 5, the #27 part after the 2026-10-26 ownership split (TEST-003, TEST-006, TEST-047, TEST-055 settings part); issue #27 (epic #21); branch `feat/issue-27-member-accounts`
- **Status:** completed — PR open for review

## Goal

A guardian, a ward from the club's threshold and an adult participant sign in to `/club` in their own language and see their profile, wards and consents; a minor never sees payments.

## Steps

1. Read #21 and its open stories; #26 (#52) and #30 (#54) had merged, so #27 starts from `main`. Owner chose #27 and approved migrations.
2. Claimed #27 (assignee, `in-progress`, 🤖 comment naming the scope split with #38); worktree from `main`.
3. Subagent: FR triage against #38 / #26 (account creation, the threshold 422, the 409 on a second account and the role sync were already built — covered by new tests only), then the gaps: the two guardian consents, `GET/PUT /api/people/me`, member locale resolution and 422 for an unknown locale, the payments gate, the sign-in landing, the `/club` pages, integration tests.
4. Coordinator review: the sign-in interceptor (never blocks a sign-in), the payments gate (age before feature), the `/me` scope (session only, `self` grant), the migration (two nullable columns, `lock_timeout`, hand-written `down()`), the locale narrowing; `yarn verify` and the full integration suite rerun by the coordinator.

## Decisions

- The payments gate is the DI service `people.paymentsGate` (`check`, `assert`): phase 4 routes require `payments.view_own` and then call `assert`, which checks the club-day age first, so a minor gets 403 `payments_minor` even with a hand-granted feature. Tested through the `people check-own-payments` CLI, as no payments route exists yet.
- The sign-in landing is an API interceptor on `auth/login` that only replaces the platform's default `/backend`: a user linked to a person with `people.self` goes to `/club`; a user linked to no person stays on `/backend` with a notice. Any error keeps the platform answer.
- Member locale: person `preferred_locale` → club `default_locale` → request → `en` (DD-34), applied through the platform's `locale` cookie (`POST /api/auth/locale`). An unsupported locale is now 422 `locale_unsupported` on person create/update, `/me` and club settings, as the glossary row *Language* states.
- The two consents live on the guardian's own person (`share_contact_with_coaches_at`, `share_presence_with_guardians_at`), given with the instant and withdrawable; undoable through `people.persons.update_self`.
- The profile and ward pages use design-system primitives with bound labels instead of `CrudForm`, whose labels are not bound and which cannot show each consent's date.

## Installed behaviour that differed from the spec

- `auth.users.create` renders the invitation in the request's locale and takes no locale input (`@open-mercato/core` `auth/commands/users.ts`), so the invitation does not follow the recipient's language yet.
- The platform's user locale comes only from the `locale` cookie and `Accept-Language` (`shared/src/lib/i18n/server.ts`); there is no per-user preference.
- Features of a module that is not enabled are never granted (`shared/src/security/featurePolicy.ts`), so `payments.view_own` is held by nobody until phase 4.
- An error or timeout in an `auth/login` interceptor turns the sign-in into a 500 / 504 (`shared/src/lib/crud/interceptor-runner.ts`).
- The sign-in page's "already signed in" redirect is fixed to `/backend` (`auth/frontend/login.tsx`).
- A superadmin's `PUT /api/auth/users/acl` without `tenantId` writes into the superadmin's own tenant, and a per-user ACL replaces the role ACL.

## Files changed

- `packages/app/src/modules/people/{data,migrations,commands/self.ts,commands/persons.ts,api/me,api/interceptors.ts,api/shared.ts,services,lib,cli.ts,di.ts,frontend,components/club,i18n,README.md}` — consents, `/me`, payments gate, sign-in landing, `/club` pages
- `packages/app/src/modules/foundation/{services/localized.ts,lib/error-codes.ts,index.ts,di.ts,i18n,README.md}` — `assertSupportedLocale`, `locale_unsupported`
- `packages/app/src/modules/club_core/{commands/settings.ts,README.md}` — locale check on club settings
- `packages/app/.ai/qa/tests/{_fixtures/members.ts,people/**}` — tests
- `.ai/specs/2026-10-20-vereino-club-management.md` — step 5 note, changelog
- `.ai/lessons.md`, two lessons; `.ai/runs/2026-10-29-issue-27-member-accounts.md` — this log

## Commands and results

- `yarn verify` — 13/13 passed (subagent's final run and the coordinator's rerun).
- `yarn test:integration:vereino` (whole suite) — 49/49 passed in the subagent's run; coordinator's rerun: 49/49 passed (9.5 min).
- `yarn db:generate` offline from the snapshot; up, down, up as raw SQL on a throwaway pgvector container, then a second `db:generate` with no changes. No `yarn db:migrate`.

## Open problems

- The invitation e-mail is in the inviting administrator's language, not the recipient's (criterion 4, the e-mail half). It needs a locale input on `auth.users.create` upstream, or the owner's OK for a Vereino-owned invitation.
- Deferred: the role-context switcher UI, the public page language switcher (step 6), the payments tile (phase 4), `publish_name_consent_at` (#29), the coach-side contact list (TEST-052), redirecting an already signed-in member from the sign-in page to `/club`.
- Phase 1 exit gate: #28 and #29 remain.

## Next steps

- Owner review of the PR; the recipient-locale invitation decision; then #28 or #29.

## Lessons recorded

- `.ai/lessons/future-module-gates-and-auth-login-interceptors.md`
- `.ai/lessons/axe-after-color-scheme-and-react-query-error-refetch.md`
