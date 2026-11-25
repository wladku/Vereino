# Run log — #708: the merge train retargets a stacked PR when its base PR merged

- **Goal / trigger:** Cezar run c6c99a7d (`om-auto-fix-issue 708`, label `cezar`), unattended.
- **Spec:** `.ai/specs/2026-11-24-cezar-stall-prevention.md`, Phase 3 (ST-D04, REQ-ST01, ST-TEST-01, ST-TEST-02, ST-AC-04).
- **Issue / branch:** #708, `feat/issue-708-train-retargets-stacked-prs`.

## Steps

1. Claimed #708 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch). Feature route: the spec exists and is Ready, so the phase was built directly on one PR.
2. `planRetargets(stacked, basePrs)` added to `scripts/merge-train-plan.mjs` (pure): base merged → `retarget`, closed unmerged → `block`, open → `none`, no PR with that head → `none`.
3. `scripts/merge-train-stacked.mjs` (new, injected GitHub client): reads open same-repository PRs whose base is not `main`, looks up closed PRs with `head=<owner>:<branch>` only for bases without an open PR, applies the plan (PATCH base, `blocked` label, one comment per PR with a hidden marker), logs one line per stacked PR, writes nothing in a dry run; a failed write is a warning, a failed read throws.
4. `scripts/merge-train.mjs` calls it in `main()` before the one-PR/batch split; an error there is logged as a warning and never stops the train.
5. Tests: ST-TEST-01 in `packages/app/scripts/__tests__/merge-train-plan.test.mjs`; ST-TEST-02 in `merge-train-stacked.test.mjs` with GitHub-shaped API fixtures in `__tests__/fixtures/merge-train-stacked.json`.
6. `SDLC.md` "Validation gate": the stacked-PR rule (step 3.4). Spec status → In progress; changelog file `2026-11-25-issue-708-phase-3.md`.

## Decisions

- **An open PR on the base branch wins over a merged one.** A branch can be the head of several PRs over time; while one is open, retargeting could bring its unmerged commits to `main`, so nothing moves (conservative reading of "base open → nothing").
- **Retargets run before the queue is read**, so a retargeted PR joins the queue in the same run (the spec allows "the next run"; this is earlier, not different).
- **Separate I/O module** (`merge-train-stacked.mjs`) instead of code inside `merge-train.mjs`: the latter runs `main()` on import and is excluded from coverage, so ST-TEST-02 could not drive it; the new module is under the 100 % coverage rule.
- **No `blocked` mirroring onto the linked issue** and no automatic removal of `blocked` later: the spec asks for neither, and the owner decides a closed-base PR.
- Fixtures are hand-written in the GitHub REST response shape (not recorded from live traffic); the PR numbers follow the 2026-11-24 stall, the branches are illustrative.

## Commands and results

- `node --test … merge-train-*.test.mjs` with coverage: 103 pass, `merge-train-plan.mjs` and `merge-train-stacked.mjs` at 100 % lines/branches/functions (a `for (;;)` pagination loop first left one V8 branch uncovered; rewritten as `do … while`).
- Read-only dry run of `applyRetargets` against `wladku/Vereino` with a GET-only client: 0 stacked PRs open today, no write attempted.
- `yarn verify`: first run failed at `format:check` (3 new/changed files unformatted) → `yarn format` → `yarn verify --from format:check` passed all 16 steps; a final full `yarn verify` and `yarn guard` ran before the push (see PR).
- Integration tests: none added or changed (tooling-only change).

## Open problems / next steps

- Step 3.1 is the owner's: *Settings → General → Pull Requests → Automatically delete head branches*.
- ST-AC-04's live part (a PR stacked on a merged PR targets `main` after the next train run) is observable only after merge.
- Phase 2 (phone alerts) is ops on cezar-ws and out of scope.
