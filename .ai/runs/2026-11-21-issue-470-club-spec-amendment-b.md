# Run: club spec amendment B — the engineering standards' domain hand-over (E19-S04, #470)

- **Goal and trigger:** cezar run (workflow `vereino-issue-v2`, step 1 "Build", `om-auto-fix-issue`) on issue #470, queued by the `cezar` label. Spec-only PR, opened as a draft for an independent reviewer (owner decision 2026-11-20).
- **Spec / issue / branch:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` phase E5 (ENG-14, ENG-TEST-15, ENG-Q-07); `.ai/specs/2026-10-20-vereino-club-management.md` Q-019; epic #461; branch `docs/issue-470-club-spec-takes-over-domain-requirements`.

## Steps

1. Claimed #470 (assignee, `in-progress`, `🤖` claim comment naming the worktree and branch).
2. Read the hand-over list: engineering standards *Data Models* (9 tables), S9.5/S10.6 jobs, research C Appendices A and C (TEST-C01…C19), ENG-Q-07.
3. Two read-only Explore subagents gathered evidence in parallel: (a) which proposed tables and jobs exist under any name, with PRs and tests; (b) which existing tests cover each research TEST-Cxx and the highest TEST id in use. Key claims re-checked by hand: `KP` numbering (`payments/data/queries.ts`, advisory lock + last number), `RETENTION_YEARS = 5`, every cited test file and its PR (`git log`).
4. Wrote amendment B into the club spec: REQ-041 (retention sweep, Q-019), REQ-042 (link-token purge), REQ-043 (invariant check); the club setting `former_participant_retention_months`; three job rows; TEST-077…TEST-088; traceability rows; AC-041…AC-043; Q-053…Q-055; Q-019 resolved; the decision tables under *Requirement Traceability → Amendment B*.
5. Ticked ENG-AC-06 in the engineering standards with the evidence; one changelog file per spec.
6. Filed follow-ups #531 (build `payments:verify-invariants`) and #532 (build TEST-077…TEST-085).

## Decisions

- **Where:** one amendment section in the club spec covers payments and facilities items too, because the ids are club-wide (DD-01) and the issue asks for one amendment; the module specs are not edited.
- **New ids** start at TEST-077 (highest in use TEST-076) and are plain `TEST-0xx`: the payments parity spec already uses `TEST-C01…C17`, so research cases are written "research TEST-Cxx".
- **Built only with evidence:** an item is called built only where a merged PR and a test file exist (both checked); everything else is accepted as a requirement, rejected with a reason, or deferred with a question id.
- **Deferrals:** accounting retention sweep → Q-053 (depends on #475, #526); bank profiles → Q-054 (needs real bank files, research C B4); per-org keys → Q-055; e-mail status and bounce/unsubscribe → foundation III Q14 (DD-M17); iCal → Q-048.
- **Finding:** `KP`/`RG` numbers are issued under a transaction-scoped advisory lock reading the last number, not a sequence row `FOR UPDATE` as S10.5 words it; payments are never deleted, so the intent (no gaps, no duplicates) holds. Recorded as "rejected — built differently" with TEST-080 (concurrency) and REQ-043 (nightly check) as proof to build; S10.5 left unchanged.
- **REQ-041 has no "off" value:** the owner decided automatic anonymisation (ENG-Q-07); range 1–120 months.
- **Scope kept:** no code, no migration (the setting column is Ask First on #471).

## Files changed

- `.ai/specs/2026-10-20-vereino-club-management.md`
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (ENG-AC-06 only)
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-21-issue-470-amendment-b.md`
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-21-issue-470-amendment-b.md`
- `.ai/runs/2026-11-21-issue-470-club-spec-amendment-b.md`

## Commands and results

- `yarn verify` — all 18 steps passed (including `spec-changelogs:check`, `format:check`, `glossary:check`), 2026-11-21.
- Integration tests: not run — no code or test file changed.

## Open problems / next steps

- #471 builds REQ-041 (needs the migration approved on that issue); #525 builds REQ-042; #531 builds REQ-043; #532 builds TEST-077…TEST-085.
- Q-053, Q-054, Q-055 wait for the owner.
- Integration tests: none run — the change touches no code and no test file.
