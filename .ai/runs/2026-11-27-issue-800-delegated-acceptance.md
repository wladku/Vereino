# Run: issue #800 — delegated acceptance (the applied default on PR #891)

- **Trigger:** cezar task 2ab2aabe (2026-11-27): "defaults applied on the issue; build per them and put `needs-qa` on
  the PR so the owner reviews the defaults". Skill `om-auto-fix-issue` with the repo-local override.
- **Decision source:** the `## Default applied` comment on #800 (2026-11-27 10:00, Cezar, owner's rule of
  2026-11-26): option 1, delegated acceptance. Override: a `## Owner decision` comment before the PR merges.
- **Spec:** `.ai/specs/2026-11-25-vereino-section-sign-up-form.md` (J-J03, J-J05, BR-J5, DD-J10).
- **Branch:** commits pushed to `feat/issue-800-accepting-applications-freed-places` (PR #891) from the local branch
  `feat/issue-800-defaults` of worktree `.ai/cezar/worktrees/2ab2aabe-…`.
- **Claim:** run 6fca424f (ended, no live process in its worktree) handed over with a `🤖` hand-over comment on #800.

## Steps

1. Read the default, the accept command, `authorizeScoped` (`scopeSource: { job: true }`, `jobCommandContext`) and the
   three nested `people` commands; the established pattern for "session or job" is `foundation.second_factor.reset`.
2. `people/commands/shared.ts`: `isJobContext(ctx)` and `sessionOrJob(ctx, kinds)` — the session's kinds, or the one
   `system_job` grant with the job scope source when the context has no session and the system-actor flag.
3. `people.persons.create`, `people.guardianships.create`, `people.persons.create_account` use `sessionOrJob`
   (create_account also loads its target in the job's tenant).
4. `enrolment.applications.accept`: after `authorizeDecision` (BR-J5) the person and guardianship writes run in
   `jobCommandContext(container, application scope)` with the accept's `transactionalEm` and `bulkImport`; the
   membership keeps the decider's context (`groups.memberships.create` already allows coordinators); the invitation
   after the commit runs in the job context. The admin-only refusal and its error code `accept_requires_admin` are
   removed (unreleased, added in the same PR).
5. UI: the Accept action is offered to every decider (`enrolment.applications.decide`); the detail read returns the
   duplicate candidates' names to coordinators too (spec: the coordinator sees duplicates and can reuse them, J-J05).
6. Tests: TEST-J07 — the coordinator accepts the new family (persons, guardianship, membership, invitation, the
   application's `decided_by_user_id` is the coordinator) and still gets 403 on `POST /api/people/persons`; TEST-J05 —
   the coordinator's detail lists the duplicate's name and the page shows Accept.
7. README, spec changelog file, lesson `nested-commands-in-one-transaction` updated.

## Decisions

- **Job context only for the `people` writes.** The decider's own context stays for the `groups` membership and the
  accept's audit entry, so the action log names the coordinator; only the three writes a coordinator may not run
  directly go through `system_job`. A context with a session never counts as a job (`isJobContext`), and no route can
  build a job context, so no user gains the right outside the accept.
- **The platform account creation in a job context** (`auth.users.create` via `foundation.createAccount`): checked in
  the installed source — a system actor has no tenant restriction and the organization comes from the job context's
  `selectedOrganizationId`, the application's club.

## Commands and results

- `yarn typecheck` — exit 0.
- `yarn test:integration:vereino --filter TEST-J07` — 1 passed (54.9 s).
- `yarn test:integration:vereino --filter TEST-J05` — 1 passed (1.1 m); the `QueryIndexScopeError` lines in the log
  come from the platform's club cleanup and appear in every run.
- `yarn lessons:check`, `yarn spec-changelogs:check` — valid.
- `yarn verify` — all 24 steps passed.
- `yarn guard` — no blocking findings.

## Open problems / next steps

- The owner reviews the default (`needs-qa` on #891); an `## Owner decision` with option 2 or 3 would revert this
  commit.
