# Run log — issue #842: spec close-out V (tick built criteria with evidence, file the real gaps)

- **Goal:** for every acceptance criterion of the 18 specs whose status was `In progress` or `Ready for implementation` on `main` (2026-11-26), tick it with a merged PR and a passing test, or link it to an issue; file one issue per real gap; move fully built specs to `implemented/`; list the epics whose stories are all closed.
- **Trigger:** Cezar automation on the `cezar` label of #842 (`om-auto-fix-issue`, run ceb61518).
- **Issue / branch:** #842, `docs/issue-842-spec-close-out-v` from `origin/main` 04be7daf.
- **Route:** `spec-pr` (docs only, `direct`); no code, no migration, no contract surface. Comment-only path updates in scripts and workflows (the moved spec's link).

## Steps

1. Claimed #842 (assignee, `in-progress`, `🤖` claim comment naming this run, worktree and branch).
2. Inventory: 18 specs; 8 use plain acceptance bullets (no checkboxes), which were converted to checkboxes as they were ticked or linked.
3. Four read-only subagents audited disjoint groups (A: club management, engineering standards, payments, foundation primitives, navigation, batch train, merge throughput, stall prevention, phase-level start, QA mail; B: social sign-in, many clubs, enterprise; C: training outlines, sign-up form; D: key store, password check, second factor). They read merged PRs, opened each cited test for its assertions, and checked live GitHub evidence (train runs, ruleset, variables).
4. Coordinator checks: every cited integration test exists and has no `test.fixme`/`test.skip` (`foundation/identity/TEST-S01…S05`, `club_core/TEST-M01/M03/M04/M07/M08/M11`, `ISSUE-485`, `foundation/ISSUE-629-*`, `TEST-M10`, `ENT-TEST-02`, `TEST-PW02`, `people|activities|training/TEST-O01…O14`, `groups/TEST-J01`); every cited unit test file exists; the batch train runs 45668573457 (merged #772 and #724, tree check passed), 45777316212 (`judge: bisect` of #803, #805, #804, #810) and 45869153312 (`#831 is red alone: marked on head 14ed923`; label added 18:06, removed 19:10 after new pushes); ruleset 26707580 active; `MERGE_TRAIN_BATCH_SIZE` = 4; the phase 4 changelog of many clubs records the BullMQ payload scan as not done while #681 clears cache entries and repeatables (the gap issue was narrowed accordingly); PR #706 lists the back-office outline pages and the part filter as "Not in this PR"; `SDLC.md` says three builds while the build server's Cezar config says `maxParallel: 5`.
5. Filed 14 gap issues and reopened #578 (below); edited the specs; one changelog file per changed spec.
6. Moved the batch merge train spec to `implemented/` and rewrote every `.ai/specs/2026-11-18-batch-merge-train.md` path (lessons, run logs, specs, `SDLC.md`, `BACKWARD_COMPATIBILITY.md`, `docs/ops/*`, comments in `scripts/merge-train*.mjs`, their tests and two workflows). Changelog rows that name the file without a path were left as written.

## Result per spec

| Spec | Ticked now | Open → issue |
|---|---|---|
| club management | — | AC-039 + two generic → #593 (parked by the owner until after the pilot, E05 #24) |
| engineering standards (Status → In progress) | — | AC-05 #578 (reopened), AC-08/09/10 #855, AC-11 #856, AC-12 #581, generic |
| club payments | — | AC-012 #594 |
| foundation primitives | (all ticked) | ConsentToggle / `vereino:club:header` decision #857 |
| parity navigation | — | AC-N11 #603 |
| batch merge train | BT-AC-01…03 | — → **Implemented**, moved |
| merge throughput | MT-AC-03 | MT-AC-01/04/05 #858 |
| Cezar stall prevention | ST-AC-04 | ST-AC-01 #859, ST-AC-02/03 #711 |
| phase-level story start (Status → In progress) | PS-AC-01 | PS-AC-02 #859 |
| QA request e-mail | QM-AC-01 | QM-AC-02 #859 |
| social sign-in | AC-S01…S03 | AC-S04 + two generic #848; exit gates #849 |
| many clubs on one instance | AC-M02, M03, M04, M05, M07 | AC-M01 #740, AC-M06 #850/#740, AC-M08/M09 #851, generic; leftovers #852 |
| enterprise package | AC-E03, AC-E07 | AC-E01/02/04/05/06 + generic #713; phase 2 #853 |
| training outlines (Status → In progress) | AC-O01…O05, O07…O13 | AC-O06 + generic #846; M-O5 back-office pages #847 |
| section sign-up form (Status → In progress) | AC-J01 | AC-J02…J12 + generic #799, #800, #801 |
| key store and key inventory | AC-K07 | AC-K01…K06 + generic #740 |
| password check | PW-AC-02 | PW-AC-01, PW-AC-03 #845 |
| staff second factor | — | all #736 (PR #831), #841 |

## Filed issues

- Labelled `cezar` (no owner decision; no money, law, production settings or real data): #845 (TEST-PW01 coverage + ASVS rows), #846 (TEST-O05 dark mode and axe), #848 (social sign-in 503 and admin section tests).
- Owner questions (`question`, no `cezar`): #847 (back-office outline pages: build or drop), #849 (real-provider exit gates — production settings), #850 (delete-club queued jobs — deleting data), #851 (1,000-club capacity — money), #852 (E22 leftovers — staging), #853 (Enterprise phase 2 — credentials), #855 (E4 exit gate live — production), #856 (compliance pack approval — law), #857 (ConsentToggle / header spot), #858 (merge throughput targets and build count), #859 (Cezar operations evidence).
- Reopened #578: PR #810 (`Refs #578`) closed it, but only the Linux half of ENG-TEST-19 ran; the Windows 11 row is "not run yet".

## Epics

- No open epic has all its stories closed after this run. **E22 #626** (#627–#634, #673, #676, #681) and **E24 #671** (#682–#685) had every story closed; the only open issues under them are this close-out's gaps (#850–#852 and #846–#847). The owner can close either epic and keep those gaps standalone, or keep it open until they land.
- E21 #565: open #581, #593, #594, #603 and the new #848, #849, #857. E23 #646: #648, #649, #713, #853. E25 #734, E26 #787, E27 #816, E28 #817: stories open. E05 #24 is the parked list.

## Decisions

- **Batch train Implemented:** all three criteria are live-proven on GitHub; the evidence is recorded here and on the spec.
- **AC-M03 ticked** within the owner's option (c) on #631 (the spec's *Risks* row): platform reset and invitation mail stay on `APP_URL`; the criterion's wording was not changed (design out of scope).
- **AC-M07 ticked** on TEST-M08 as the spec's TEST-M08 row defines it (200 e-mails under low per-club limits stand in for 5,000).
- **PS-AC-02 not ticked:** #798 was built from a Draft spec with `phase-ready`, but started by the owner's label, not the picker, and no skipped story is recorded.
- **Training outlines Ask First table** still says "open" for items approved on #683 and #685; left as is (design record, not a criterion) — noted for the next spec PR.
- `cezar` was set only on gaps that need no owner decision and touch none of money, law, production settings or real data (issue #842's rule).

## Files changed

- Specs: 16 of the 18 listed above (club payments and navigation unchanged), including `implemented/2026-11-18-batch-merge-train.md` (moved).
- 16 changelog files `.ai/specs/changelog/<spec>/2026-11-26-issue-842-close-out-v.md`.
- Path rewrites for the moved spec: `.ai/lessons/github-merge-queue-needs-an-organization-repo.md`, four run logs, `.ai/specs/2026-11-18-merge-throughput.md`, `SDLC.md`, `BACKWARD_COMPATIBILITY.md`, `docs/ops/batch-train-switch-on.md`, `docs/ops/github-settings.md`, `.github/workflows/{ci,merge-train}.yml`, `scripts/merge-train{,-guard,-plan,-trailers}.mjs`, `packages/app/scripts/__tests__/merge-train-{batch,guard,trailers}.test.mjs` (comments only).

## Commands and results

- `yarn spec-changelogs:check` → "Spec changelogs are valid".
- `yarn verify` → first run failed at `lint` with "JavaScript heap out of memory" (the server's default Node heap, unrelated to the change); `NODE_OPTIONS=--max-old-space-size=12288 yarn verify --from lint` → `all 19 step(s) passed` (generate, typecheck, typecheck:packages and typecheck:qa had passed in the first run).
- `yarn guard` → "No blocking findings"; two warnings (`.github/workflows/ci.yml`, `merge-train.yml` changed: the comment-only spec path rewrite).
- No integration test run: docs only, no test added or edited.

## Open problems / next steps

- Owner: the eleven `question` issues above, plus #593, #594, #603, #711.
- Queue-ready: #845, #846, #848.
