# Run: issue #310 — the 18th birthday and the account age (people life-cycle phase L8)

- **Trigger:** Cezar run `add212b9` (`om-auto-fix-issue 310`, label `cezar` added 2026-11-19).
- **Issue / spec / branch:** [#310](https://github.com/wladku/Vereino/issues/310) (E13-S08); `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md` phase L8 (REQ-L06, REQ-L07; TEST-L09, TEST-L10, TEST-L19); branch `feat/issue-310-ward-guardianship-handover`.
- **Readiness:** the issue text still said "spec Draft", but the spec is `Ready for implementation` since 2026-11-16: Q-L02 answered, Q-L03/Q-L04/Q-L12/Q-L13 confirmed, the contract changes (event, CLI, schedule, routes) and item 11 (the first run on existing data) approved on #255. No migration in L8 (it uses migration C of L7). L4 (#306) and L7 (#309) have landed; L6 (#308) has not, so step 5 stays unregistered (gap c9).

## Steps

1. Claimed the issue (assignee, `in-progress`, 🤖 comment naming the worktree, branch and start).
2. Read the spec (L8, *Events, Jobs*, *Rollout*, DD-L08, DD-L09) and the code it names: `people/commands/jobs.ts` (role sync), `workers/sync-role-expiry.ts`, `services/club-setup.ts`, `services/departure-notices.ts`, `services/departure-accounts.ts`, `payments/lib/charge-plan.ts` (`payerOf`), `activities/commands/attendance.ts` (declaration expiry), `services/member-profile.ts`, `lib/person-list-filters.ts`, the foundation dispatch.
3. Rules: `people/lib/life-cycle-rules.ts` with unit tests (100 % lines, branches, functions); the B-09 attention values in `lib/person-list-filters.ts` (tests extended, 100 %).
4. Job: `services/life-cycle.ts`, command `people.persons.life_cycle` (`commands/jobs.ts`), worker `workers/life-cycle.ts`, schedule `registerLifeCycleSchedule` (setup of a new club only), CLI `people life-cycle`.
5. Notices: six templates (`emails/templates.ts`), six in-app types (`notifications.ts`), en/pl texts; event `people.person.came_of_age`; `activities/subscribers/finalize-declarations-on-came-of-age.ts` + `activities/services/came-of-age.ts`.
6. Surfaces: `GET /api/people/persons?attention=account_age|turns_18_soon|adult_without_contact`; widget `people.dashboard.peopleNeedingAttention`; `GET /api/people/me` `wards[].notices` + `notice`; `LifeCycleNotices.tsx` on the profile ward card, the ward page and the profile card.
7. Integration tests `TEST-L09-coming-of-age.spec.ts`, `TEST-L10-account-age.spec.ts`.
8. Docs: people README, `BACKWARD_COMPATIBILITY.md` (scheduler target), spec changelog entry.

## Decisions

- **Administrators get their own version of each notice** (`…_admin`, key suffix `:admins`): the in-app link and the e-mail link are fixed per template, and a family link (`/club/...`) is useless to an administrator. A family member who is also an administrator gets only the family version (excluded from the administrators' dispatch).
- **"Already told" without a marker table (DD-L09):** an additive read `DispatchService.existingKeys(keys, scope)` in the foundation (the foundation owns the dispatch tables). The account-age step checks every key from threshold 0 up to the child's age, so a lowered threshold tells only the newly eligible (TEST-L10).
- **The came-of-age notices are enqueued inside the ward's transaction** and published after the commit, so a ward whose guardianships ended always has its notice (otherwise a crash between commit and send would lose it: the ward is no longer a candidate).
- **The T−30 notice reaches a minor only with an account** (the foundation's minor rule in `resolveMembers`), not by a bare e-mail address: messaging never e-mails a minor directly.
- **Account closings of dated departures** run as step 4 of the life-cycle job and stay in the role sync, because an existing club gets the life-cycle schedule only after its confirmed first run (*Rollout*, item 11). Idempotent, so running in both is harmless.
- **Schedule:** daily 01:30 club time, before the role sync at 02:00 that re-derives the adult's payer role the same night. `bootstrap-admin` (which may run on an existing club) does not register it.
- **Account-age step is for minors only;** an adult's change is the 18th-birthday notice.
- **Every "Needs attention" value needs `people.manage`** (the administrator's list), as `missing_consents` already did.
- **The adult's carried-over consents name the former guardian** on `/club/profile`: the "family" of the own-consents view now includes past guardians, as it does for wards (#191).
- **Payer:** no change in `payments` (DD-L08: "PAY's Payer rule then needs no code change"); a charge generated on or after the birthday for a period that starts after it names the adult. Known edge left as the spec has it: a late generation of a period that ended before the birthday reads that period's day and names the guardian.

## Commands and results

- `yarn generate` — ok. `yarn typecheck` — ok. `yarn lint` — 0 errors (warnings pre-existing in style). `yarn contracts:check` — 0 problems. `yarn spec-changelogs:check` — valid.
- `npx jest life-cycle-rules person-list-filters --coverage` — 60 tests, 100 % on both files.
- `yarn test:integration:vereino --filter TEST-L09` — first run failed at setup: `Expected: "pending_guardian" Received: "final"` (the policy reads the age on the session's day; the ward turned 18 before the match). Fixed the fixture (birthday 10 days out). Results of the re-run: see below.

## Open problems / next steps

- First real run on existing clubs: `mercato people life-cycle --tenant --org --dry-run`, the owner confirms the counts, then `… --register-schedule` (spec *Rollout*, item 11). Not run by this autonomous run (no access to a real database).
- Phase L6 registers step 5 (erasure step two) and TEST-L07's job case.
- Spec N phase 6 places the widget on its dashboard frame.
