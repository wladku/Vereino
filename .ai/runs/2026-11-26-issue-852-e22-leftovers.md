# Run: issue #852 — E22 leftovers (release N+1 removal, per-sweep payments heartbeat, staging exit gates)

- **Trigger:** cezar run (task 069234c7), issue labelled `cezar`, 2026-11-26.
- **Issue:** #852 (epic E22 #626). **Spec:** `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` (*Rollout*, *Observability*, phase exit gates).
- **Branch:** `feat/issue-852-e22-leftovers` (worktree of the cezar run).
- **Owner decision (issue comment, 2026-11-26):** the agent builds the removal and the heartbeat; the owner runs the staging exit gates from a checklist; the removal ships only when SDLC.md "Expand, then contract" allows it.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment).
2. **Removal of the per-club registration code (release N+1).** Not allowed yet. Phase 1 (#629) merged as `8bb6e6d5` on 2026-11-23; the repository has no release tag or GitHub release yet, so release N (the first production release containing #629) has not served production for a week, and the spec additionally requires every job type to have run on its sweep for a full release (`club-jobs status`: `sweep: true`, `perClubSchedules: 0` for all 19 types on production; `retire-club-schedules` on production is itself an Ask First data change). The removal waits for **release N+1**, no earlier than one week after release N (the first production release containing #629) reached production. What it removes: the per-club branch of `setUpClubJob` (`registerModuleSchedule` while no sweep schedule exists), the unclaimed path of `clubJobWorker` (`verifyScheduledJobScope`), `restoreClubSchedules` and its CLI (the rollback of release N), and the per-club ping of `payments:verify-invariants`.
3. **Per-sweep payments invariants heartbeat.** Stopped before code. The spec's *Observability* asks for "one ping after all clubs, with the count of failing clubs". With the sweep, a night's clubs are claimed over several sweep ticks (a 20-minute spread, a sweep every 5 minutes, plus other time zones), so "after all clubs" and "failing clubs" need a count over every club's `foundation_club_jobs` row of the job type: a new system-scope read. The spec lists system scope exhaustively ("the D-024 slug lookup … and the two sweep statements of DD-M07 (Q-M05). Nothing else.", *Users, Permissions, and Scope*; DD-M07 "listed exhaustively"), and `AGENTS.md` lists the approved statements. A third statement is a security-rule change (Ask First), not covered by the owner's decision on #852. Within the approved statements only a per-tick ping over the clubs that tick claimed is possible, which keeps the "a later clean ping clears the check" weakness. Asked the owner on the issue.
4. Released the claim with the question.
5. The user (cezar) told the run to continue without asking. A chat instruction is not an approval recorded on the issue, so the run did not add a system-scope statement and built **option B**, which stays within DD-M07 (a): the spec's own words "per run of the sweep (one ping after all clubs …)". Re-claimed the issue with a comment saying so.
   - `foundation`: `ClubJobDeclaration.afterSweep` (optional round report) and `ClubJobRunResult.problem` (a code stored as `last_error` while the schedule goes on). A sweep run of such a job type queues a round check (`foundation:club-job-round`, delayed 60 s) with the clubs the claim returned; the check reads each club's own row in its scope (`clubJobRunState`) and re-queues itself until every run finished since the enqueue or the deadline (enqueue lease + run lease) passed, then reports `{ clubs, failing, unfinished }` once. Pure rules in `lib/club-job-round.ts`. CLI: `club-jobs sweep --round return` prints the round, `club-jobs check-round --round '<json>'` runs one step in the shell (no polling loop: the queue package forbids loops outside the worker contract; the test polls).
   - `payments`: a claimed `verify-invariants` run passes `sweepRun: true` to the command (no per-club ping) and returns `problem: payments.invariants.drift` on drift; `afterSweep` → `reportInvariantsSweep` logs the counts and pings `<url>` or `<url>/fail`. Runs without a claim (per-club schedules, `payments run-job`) ping per club as before.
   - Known limit, written into the monitoring doc and the spec: a night whose clubs fall into several 5-minute sweep ticks (the 20-minute spread, other time zones) pings once per tick, so a later clean tick can still clear the check. One ping per night needs the counts-only system-scope read (option A), left to the owner.
6. Docs: `docs/ops/monitoring.md` (heartbeat row, log filter), `payments/README.md`, spec *Observability* note and changelog file `2026-11-26-issue-852-sweep-heartbeat.md` (status line unchanged: `In progress`).

## Staging exit gates — checklist for the owner

Run on staging only; agents do not create or delete clubs there (owner decision on #852). Record each result with date and outcome in this run log (or the PR that closes #852).

1. **Phase 1 (sweep):** `yarn mercato foundation club-jobs status` → every job type `sweep: true`, `perClubSchedules: 0`, `failing: 0`. If not: `yarn mercato foundation retire-club-schedules --dry-run`, then without `--dry-run`.
2. **Phase 2 (second club):** create a synthetic club with one command (`docs/ops/clubs.md` §1–3): `yarn mercato club_core create-club --dry-run --slug <synthetic-slug> …`, then without `--dry-run`; check the isolation guard (#628, `ISSUE-628-cross-club-isolation`) is green on `main`.
3. **Phase 3 (subdomains):** with `VEREINO_CLUB_DOMAIN` set on staging and the wildcard record live, open `https://<club-a>.<domain>` and `https://<synthetic>.<domain>`: each shows its own club; sign in to each; send one invitation or reset from each and check the e-mail links open the right club and the sender names the club.
4. **Phase 4 (deletion):** for the synthetic club: `club_core offboard-club --slug <synthetic>`, `club_core export-club --slug <synthetic> --out <path>`, `club_core delete-club --slug <synthetic> --confirm <synthetic> --dry-run`, then without `--dry-run` (`docs/ops/clubs.md` → *A club leaves*). Confirm absence: the command's own table report, and `club-jobs status` shows the club gone from the counts.
5. **Restore drill:** run the single-club restore drill (`docs/ops/backups.md` → *Single-club restore drill*) from the export of step 4 into a scratch database; append the record to `docs/ops/restore-drills.md`.
6. **Phase 5:** the capacity report of #633 is attached (TEST-M09) or names the limit and the fix.

## Files changed

- `packages/app/src/modules/foundation/lib/club-job-round.ts` (new) + test; `lib/club-job-due.ts`, `lib/club-job-run.ts` + tests; `data/queries.ts` (`clubJobRunState`); `services/club-jobs.ts`; `workers/club-job-round.ts` (new); `cli.ts`; `index.ts`.
- `packages/app/src/modules/payments/lib/invariants.ts` + test; `lib/club-jobs.ts`; `services/invariants.ts`; `commands/invariants.ts`; `workers/verify-invariants.ts`; `di.ts`; `README.md`.
- `packages/app/.ai/qa/tests/payments/ISSUE-852-invariants-sweep-heartbeat.spec.ts` (new); `_fixtures/club.ts` (`mercatoAsync` takes extra env).
- `docs/ops/monitoring.md`; the spec and its changelog file; this log.

## Commands and results

- `git tag`, `gh release list` → empty (no release yet).
- `git log --grep '#629'` → `8bb6e6d5 refactor(foundation): one sweep job per job type … (#629) (#663)`.

## Open problems / next steps

- Owner, optional: approve a counts-only system-scope read of `foundation_club_jobs` for one job type (DD-M07 (c)) to turn the per-tick ping into one ping per night.
- Removal of the per-club registration code: release N+1, as in step 2.
- Staging exit gates: the owner, from the checklist above.
