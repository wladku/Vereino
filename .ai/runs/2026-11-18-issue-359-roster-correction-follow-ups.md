# Run: roster correction follow-ups (#359)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` for issue #359 (label `cezar`): the non-blocking findings of the review of PR #355 (issue #267, roster correction).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-groups-and-activities.md` (REQ-A03, TEST-A03, TEST-A04); no spec change.
- **Branch:** `feat/issue-359-roster-correction-follow-ups`.
- **Route:** `direct` — follow-up fixes and tests inside an implemented requirement; no new contract, module, dependency or migration.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. `activities.groupUsage.membershipUsed` (`activities/services/group-usage.ts`): replaced "load every live attendance row of the person, then count the group's sessions in an `$in` list" with one Kysely query that joins `activities_attendances` to `activities_occurrences`, filtered by tenant, organization, person, group, period and `deleted_at`, `limit 1`. `em.getKysely()` uses the EntityManager's transaction context, so the read stays inside the delete command's transaction as the contract requires.
3. Roster order: moved the SQL `case` sort key into `lib/groups-rules.ts` as `rosterRoleRankSql(alias)`, built from `rosterRoleRank`, with a unit test that parses the SQL back into ranks and compares them with `rosterRoleRank` (so `rosterRoleOrder` and the server order cannot drift); `services/roster-list.ts` uses it.
4. `sortField=roster` ignores `ids` and `sortDir`: documented in the list `description` of the route's `openApi` and in the route comment. Rejecting them was not chosen: it would turn a request that answers 200 today into a 400 (a stricter contract), for no user benefit.
5. A11y in `components/MembershipDialogs.tsx`: the person search is wrapped in `role="group"` with `aria-labelledby` on its label; a dialog problem records the field it is about, so the date inputs get `aria-invalid` and `aria-describedby` pointing at the `role="alert"` text, and the person group gets `aria-describedby` (`aria-invalid` is not allowed on a group).
6. Integration oracles:
   - TEST-A03: the academy coordinator reads the same roster rows in the same order as the administrator; the pool coordinator reads none of Żaki's rows (with and without `groupId`) and is refused a Remove with 403 `scope_denied`; a second club (tenant) reads nothing and gets 404 on Remove; a stale version on Remove answers 409 `optimistic_lock_conflict`; the order check now covers the id tie-break of `rosterRoleOrder`.
   - TEST-A04: the person group has the label as its accessible name and is described by the "choose a person" alert; an empty From marks both date fields invalid and points them at the alert.

## Decisions

- Document instead of reject for `ids`/`sortDir` (BC: no stricter contract on a stable route).
- `limit 1` instead of `count(*)`: the contract answers a boolean, so the first matching row is enough.

## Commands and results

- `yarn generate` → ok; `yarn typecheck` → ok.
- `yarn test:integration:vereino --filter TEST-A03` → first attempt `Could not find a working container runtime strategy` (the session had no `docker` group; the user is a member); rerun under `sg docker -c …`.
- `sg docker -c "yarn test:integration:vereino --filter TEST-A03"` → `1 passed (33.8s)`; after the lint fix again `1 passed (34.2s)`.
- `sg docker -c "yarn test:integration:vereino --filter TEST-A04"` → not run locally: Chromium does not start on this host — `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file: No such file or directory`. Installing system libraries is outside this run; the CI `integration` job runs TEST-A04 on the PR.
- `yarn verify` → first failed at `lint` on the Playwright HTML report of the failed TEST-A04 run (`packages/app/.ai/qa/test-results/`, ignored; removed), then on 2 errors in TEST-A03 (`no-unnecessary-type-conversion`, `String(id)`; fixed); `format:check` fixed with `yarn format`. Final full run: `[verify] all 17 step(s) passed`.

## Open problems

- TEST-A04's new a11y assertions are verified only by CI (no browser libraries on this host).

## Next steps

- Watch the PR's CI `integration` shards for TEST-A04.
