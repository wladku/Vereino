# One file per spec changelog entry, so parallel PRs stop conflicting

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5), side session started from the orchestration session
- **Trigger:** on 2026-11-05, 14 of 18 open PRs conflicted with `main`, almost all only on rows appended to spec Changelog tables and to `.ai/lessons.md`; the conflicts were resolved by hand.
- **Branch:** `chore/conflict-free-changelogs`, from `main` at d1a53b9
- **Status:** completed, PR open for review.

## Goal

Two PRs that each add a spec changelog entry and a lesson merge into `main` without conflict, and the convention is documented and enforced by `yarn verify`.

## Steps

1. Measured the conflicts. All 15 open PRs merged cleanly with `main` (they had just been fixed by hand), so each pair of open PR branches was merged with `git merge-tree --write-tree`: 70 of 105 pairs conflicted, 66 of them on `2026-10-20-vereino-club-management.md`. Of the 70 conflicts in spec files, 67 were inside the `## Changelog` section; in 49 pairs those rows were the only conflict. `.ai/lessons.md` conflicted in one pair (its rows are already kept in file-name order).
2. Checked whether `merge=union` would be enough. GitHub's merge button and its mergeability check do not run merge drivers ([community discussion #9288](https://github.com/orgs/community/discussions/9288)); a scratch merge with attributes ignored (`git --attr-source=<empty tree>`) still conflicts. Union only helps a local `git merge`.
3. Proposed the fix to the owner and got approval: one file per spec changelog entry, `merge=union` for `.ai/lessons.md`, a verify check, docs, a lesson and a PR.
4. Implemented:
   - `scripts/check-spec-changelogs.mjs` and the `spec-changelogs:check` step in `scripts/verify.mjs` (after `lessons:check`), with `packages/app/scripts/__tests__/check-spec-changelogs.test.mjs` at 100 % line, branch and function coverage, added to the `test:scripts` coverage scope and `coverage-scope.test.mjs`.
   - A pointer line under `## Changelog` in the 10 dated specs. It sits above the table, so it does not conflict with rows the open PRs append.
   - `.ai/specs/changelog/README.md` (format and reading order) and the first entry, for the standards spec (S2.1 lists the new step).
   - `.gitattributes`: `.ai/lessons.md merge=union`.
   - `AGENTS.md`, `CODE_REVIEW.md`, `.ai/specs/README.md`, `SPEC-000-template.md`, `.ai/lessons.md` header and the repo-local `om-implement-spec` skill. The pinned upstream skills in `.agents/skills/` are not edited; the AGENTS.md rule overrides their Changelog table.
   - Lesson `append-only-rows-conflict-one-file-per-entry.md`.

## Decisions

- One file per entry instead of a per-spec sidecar file with `merge=union`: only files never conflict on GitHub's merge button too.
- The existing rows stay in the specs, frozen. Moving them would rewrite the end of every spec and conflict with every open PR.
- Cutover 2026-11-05: the check rejects table rows dated after it, so rows the open PRs added today still pass.
- The folder name is the spec's file name, so it stays valid when a spec moves to `implemented/` or `archive/`; the pointer uses the repository path, not a relative link, for the same reason.
- `.ai/lessons.md` keeps its sorted rows; union is a local-merge aid only.

## Commands and results

- Scratch test (a clone of this branch; two branches each add `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-06-scratch-pr-<x>.md` and a lesson whose catalog row lands on the same line):
  - merging both into `main`, in either order: no conflict; `check-spec-changelogs` and `check-lessons` pass; `cat` of the folder lists both rows.
  - the same merge with `.gitattributes` ignored: `CONFLICT (content): Merge conflict in .ai/lessons.md` (the spec entries still merge).
  - the old convention, two rows appended to the spec table: `CONFLICT (content): Merge conflict in .ai/specs/2026-10-20-vereino-club-management.md`.
  - a duplicated row: `- .ai/lessons.md: duplicate link to lessons/scratch-a-lesson.md`; a removed row: `- .ai/lessons/scratch-b-lesson.md: record is missing from the catalog`.
  - a row appended to the spec table dated 2026-11-06: `Changelog row dated 2026-11-06 belongs in .ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-06-<slug>.md (one file per change; the table is frozen after 2026-11-05)`.
- `git merge-tree` of this branch with each of the 15 open PR branches: no conflicts; none adds a table row dated after 2026-11-05.
- `node --test` on the new test file with the 100 % thresholds: 10 tests pass, 100 / 100 / 100.
- `yarn verify`: the first run passed generate, typecheck, typecheck:packages, typecheck:qa and lint, then failed at `format:check`: `packages/app/scripts/__tests__/check-spec-changelogs.test.mjs is not formatted (run yarn format)`. Ran Prettier on that file only; `yarn verify --from format:check` passed the remaining 9 steps (including `spec-changelogs:check`; Jest 347 tests; `test:scripts` 121 tests at 100 % coverage; build).

## Lessons

- New: `.ai/lessons/append-only-rows-conflict-one-file-per-entry.md`.

## Next steps

- The open PRs still carry table rows dated 2026-11-05 and keep conflicting with each other on them until they merge. When one next merges `main`, move its row to an entry file.
- `.ai/lessons.md` can still show a conflict on GitHub when two PRs add rows next to each other; a local `git merge origin/main` resolves it.
