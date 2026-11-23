# Run: #585 — the people import commit reports progress through ProgressService

- **Goal and trigger:** cezar task 320c3b27 (`om-auto-fix-issue 585`, the `cezar` label): AC-F08 of `.ai/specs/2026-10-27-vereino-foundation-primitives.md` — the import commit runs as a `ProgressService` job, the wizard shows its progress, and TEST-F08's stopped-service case leaves the import `previewed`.
- **Issue / branch:** #585 / `feat/issue-585-people-import-commit-progress`.
- **Started / finished:** 2026-11-22.

## Steps

1. Claimed #585 (assignee, `in-progress`, claim comment naming the worktree and branch). Feature route; the covering spec exists (REQ-F08, TEST-F08), and `progress` was already enabled in `src/modules.ts`, so no Ask First item was needed (no module, dependency, migration or breaking contract).
2. Read the platform `ProgressService` (`@open-mercato/core` `progress`). It writes through the request container's `em` with CAS `nativeUpdate`s, while the commit runs on a fork with its own `begin()`. So the job's progress is visible while the commit transaction is open, and a rollback does not roll back the job.
3. Built `people/services/import-progress.ts`: the job is created and started after authorization and the review check, advanced per row, completed after the transaction commits, and failed (with the error code only) when the transaction rolls back. A missing or failing service throws 503 `import_progress_unavailable` (new code). `findImportCommitProgress` reads the active or recent (120 s) job by `jobType` + `meta.importId`, without a cross-module ORM query.
4. The import view gets `commitProgress` (single import only; null in the list). The record page polls the import every 750 ms during the commit and shows a `Progress` bar with a polite live region (`people-import-commit-progress`).
5. TEST-F08 (`people/TEST-F08-import-commit-progress.spec.ts`) with a probe process (`_fixtures/progress-service-probe/probe.mjs`, the #590 occupancy-probe pattern) that swaps `progressService` for a stopped one or for one that breaks after the job started, and calls the real commit route.

## Decisions

- **Synchronous commit inside a job, not a queued worker:** the commit must stay one all-or-nothing transaction (#28, S5.2). A queue would add an outbox and a worker for a few hundred rows. The spec says "commit runs the `people` commands row by row inside a `ProgressService` job".
- **Progress on the import view instead of `ProgressTopBar`:** club administrators do not hold `progress.view`. Granting it would change the role catalogue and expose every tenant job, so the module reads its own job.
- **The membership re-run (#65) has no job:** it writes no rows; a stopped progress service does not block it.
- **The job is completed right after the transaction commits:** a completion failure is reported and left to the stale sweep. The import is committed by then.

## Results

- `yarn test:integration:vereino --filter TEST-F08`: first run 1 failed, 1 passed. The test's own expectation was wrong (`Expected new: 2, matched: 1 / Received new: 3, matched: 0`: without TEST-051's family seeded, row 3 is not matched). After seeding as TEST-051 does: `2 passed (49.8s)`.
- `--filter TEST-051`: `2 passed`; `--filter E02-S04`: `2 passed`; `--filter E03-S06`: `3 passed`.
- `people-rules.test.ts` (error-code table): 43 passed.
- `yarn verify`: the first run failed at `lint` with 2 errors (`no-unnecessary-type-assertion` on `job` in the commit's catch, `no-unnecessary-type-conversion` in `import-progress.ts`). After the fix, `yarn verify --from lint` passed, then a full `yarn verify`: `[verify] all 20 step(s) passed`.
- `yarn guard`: `No blocking findings.`
- TEST-F08 rerun on the final code: `2 passed (49.5s)`.

## Files changed

`people/services/import-progress.ts` (new), `people/commands/imports.ts`, `people/services/import-read.ts`, `people/api/imports-shared.ts`, `people/api/imports/[id]/commit/route.ts`, `people/lib/error-codes.ts` (+ its unit test), `people/components/imports/ImportRecord.tsx`, `import-client.ts`, `people/i18n/{en,pl}.json`, `people/README.md`, the TEST-F08 spec, the probe, `_fixtures/imports.ts`, the spec's AC-F08 tick and its changelog file, this log.

## Open problems / next steps

The spec's status line still lists "the import's progress job" and AC-F08 as left. Per AGENTS.md *Spec status line*, it is not edited by a phase PR; the next close-out rewrites it.
