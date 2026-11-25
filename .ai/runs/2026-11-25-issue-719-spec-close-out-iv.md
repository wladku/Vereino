# Run log — issue #719: spec close-out IV, Status lines of specs whose work is built

- **Goal:** update the Status lines (and acceptance checkboxes where the evidence is on `main`) of the ten specs named by the 2026-11-25 coverage audit; never tick without evidence.
- **Trigger:** Cezar automation on the `cezar` label of #719 (`om-auto-fix-issue`, run 63d9ae73).
- **Issue / branch:** #719, `docs/issue-719-spec-status-closeout` from `origin/main` 616577df.
- **Route:** `spec-pr` (docs only, `direct`); no code, no migration, no contract surface.

## Steps

1. Claimed #719 (assignee, `in-progress`, `🤖` claim comment naming this run and worktree).
2. Listed every unticked criterion of the ten specs and its "gap"/"open until" issues; read each issue's state and closing PR with `gh issue view` / `gh pr view`. Every closing PR named below is `MERGED`; #564 (PR #643), #567, #593, #594, #603 and #715 (PR #718) are open.
3. Checked that every test named as evidence exists on `main` and has no `test.fixme`/`test.skip` (TEST-F08, F11, G03, G04, G06, ISSUE-588, TEST-086, TEST-S01/S02/S04, TEST-L06, L09, L21, L22, L23, L24, ISSUE-606, ISSUE-607, TEST-N01, TEST-T03, TEST-T13). Read the header of each test whose oracle a criterion depends on (TEST-S01, S02, TEST-086, TEST-T03, TEST-T13, ISSUE-606, ISSUE-607, PR #612's run log for the "Fits" rule).
4. Edited the specs (below), moved four to `implemented/` with `git mv`, rewrote every `.ai/specs/<name>.md` path to `.ai/specs/implemented/<name>.md` (run logs, specs, D-032, `docs/ux-concept/README.md`, two module READMEs).
5. One changelog file per changed spec (`.ai/specs/changelog/<spec>/2026-11-25-issue-719-close-out-iv.md`).

## Decisions

- **Foundation primitives stays In progress** although every criterion is now ticked: phase A2's shared `ConsentToggle` (the consent switch is module-owned in `people` `ClubProfilePage`) and the `vereino:club:header` spot were neither built nor amended away (#586 and #587 amended the other phase A2/B pieces). Building or amending them is the owner's call; the Status line names both.
- **Club management AC-040 ticked** on #610's Google tests: the criterion's text describes the Google flow only; Facebook (#567) is AC-S03 of the social sign-in spec, which this issue does not cover (its own AC-S01…S04 stay unticked there).
- **Club management AC-041 ticked** on #563's `TEST-086-retention-sweep`; #564's review follow-ups (open erasure request, `--today`, overlapping runs) are not part of the criterion's text.
- **Q-053…Q-055 not edited:** PR #718 (#715) records the owner's answers in those rows; editing them here would conflict. The club spec's status line points to #715. The two PRs touch different lines.
- **Shipped migrations untouched:** two `activities` migration comments name the club events spec by its old path; the link rewrite touched them and was reverted (AGENTS.md: never edit shipped migrations). Those comments keep the old path.
- **Merge throughput:** Status moved from `Ready for implementation` to `In progress` (phases 1–3 built by PR #399, PR #402, PR #458); REQ-MT05 and the fix-run half of REQ-MT06 are Cezar picker/configuration work outside the repository, said so; MT-AC-01 and MT-AC-04 have no recorded evidence, so the spec does not move.
- `2026-08-06-reference-module-activation.md` left unchanged (fixture of harness case OMH-227, out of scope).

## Files changed

- Specs: `2026-10-27-vereino-foundation-primitives.md`, `2026-10-20-vereino-club-management.md`, `2026-11-14-vereino-parity-navigation-and-naming.md`, `2026-10-27-vereino-club-payments.md`, `2026-11-18-batch-merge-train.md`, `2026-11-18-merge-throughput.md`; moved to `implemented/` and set Implemented: `2026-10-27-vereino-foundation-scheduling-primitives.md`, `2026-11-14-vereino-parity-facilities.md`, `2026-11-14-vereino-people-life-cycle-and-data-entry.md`, `2026-11-18-vereino-club-events-with-parts.md`.
- Ten changelog files; link updates in `.ai/runs/*`, `.ai/specs/research/decisions/D-032-club-events-with-parts.md`, `docs/ux-concept/README.md`, `packages/app/src/modules/{activities,foundation}/README.md`.

## Commands and results

- `yarn spec-changelogs:check` → "Spec changelogs are valid"; `yarn lessons:check` → "Lessons catalog is valid".
- `yarn verify` → `all 22 step(s) passed` (exit 0).
- No integration test run: docs only, no test added or edited.

## Open problems / next steps

- Owner: decide `ConsentToggle` and `vereino:club:header` (foundation primitives); #593 (fixture import); #603 (native-reader review); #594 (Stripe test account); the batch train switch-on; the Cezar picker/automation evidence for merge throughput.
