# Lessons catalog without index rows, so merges cannot break lessons:check

- **Date:** 2026-11-07
- **Agent / tool:** Claude Code (Opus 5.5), side session started from the orchestration session
- **Trigger:** on 2026-11-06, merging `main` into PR branches broke `lessons:check` three times. The `merge=union` merge of `.ai/lessons.md` kept both the old and the edited row of `axe-after-color-scheme-and-react-query-error-refetch`, and once appended a row out of order. Each hand fix cost a CI cycle of about 45 minutes, and the `main` ruleset (up to date + green) made it block the merge queue.
- **Branch:** `fix/lessons-index-merge-safe`, from `main` at 9020d6d
- **Status:** completed, PR open for review.

## Goal

A merge of two branches that both add or edit lessons always produces a valid catalog, with no hand fixes.

## Steps

1. Read `scripts/check-lessons.mjs`, `.gitattributes`, `.ai/lessons.md`, the lesson `append-only-rows-conflict-one-file-per-entry.md` and the sibling session's scratch merge test from PR #181.
2. Weighed the three options (see Decisions) and chose to drop the rows: the records' front matter is the catalog.
3. Confirmed nothing is lost: the rows generated from the 77 records' front matter equal the 77 committed rows, line for line.
4. Implemented:
   - `scripts/check-lessons.mjs`: validates the records (front matter, kebab-case names, unique titles, as before) and rejects any catalog row or lesson prose in `.ai/lessons.md`; `--list [<term>...]` prints the catalog from the records, rows matching every term. The index checks (order, duplicates, drift, missing rows, byte budget) are gone with the rows.
   - `package.json`: `yarn lessons:list`.
   - `.ai/lessons.md`: the guide only, no rows; `.gitattributes`: no `merge=union`.
   - `AGENTS.md`, `CLAUDE.md`, `CODE_REVIEW.md`: no index row to add; `yarn lessons:list` to find lessons.
   - Lesson `append-only-rows-conflict-one-file-per-entry.md`: the 2026-11-06 evidence and the rule not to commit an index that repeats the entries.
   - `packages/app/scripts/__tests__/check-lessons.test.mjs`, with `check-lessons.mjs` added to the `test:scripts` coverage scope and `coverage-scope.test.mjs`.

## Decisions

- (c) drop the rows, not (a) a generated committed index or (b) a merge driver. A committed index is still one file every lesson PR edits: GitHub's merge button and "Update branch" do not run merge drivers, so it conflicts there; locally, union keeps stale rows until someone regenerates. A merge driver or post-merge hook needs per-clone `git config` that CI, worktrees and agents do not have. Without rows, lesson PRs share no file, so every merge is clean everywhere, and two edits of the same record still conflict as they should.
- `yarn lessons:list` keeps the cheap one-row-per-lesson overview the index gave, computed from the records, so it cannot drift.
- The check's error for a leftover row says how to fix it (`git checkout origin/main -- .ai/lessons.md`): 4 of the 7 open PRs (#204, #206, #208, #210) add a row and will hit it once when they next merge `main`.
- Pinned upstream copies (`.ai/guides/upstream/AGENTS.md`, `.ai/skills/om-evolve-harness/SKILL.md`) still mention an index row; they are not edited, and `AGENTS.md` overrides them. `.ai/harness/manifest.json` hashes are already stale for both files and nothing checks them.

## Commands and results

- `node scripts/check-lessons.mjs`: `Lessons catalog is valid`. `node scripts/check-lessons.mjs --list mercato-cli`: one row. `--list nothing-matches-this`: `No lesson matches nothing-matches-this`, exit 1.
- `yarn test:scripts`: 130 tests pass; `check-lessons.mjs` at 100 % lines, branches and functions. The merge test builds a real repository: branch A edits one lesson's title and topics and adds a lesson, branch B does the same to another lesson; `git merge-tree --write-tree` of the two is clean (what GitHub checks, without merge drivers), and merging both into `main` in either order leaves a clean tree, a valid catalog with the four expected rows and an unchanged guide.
- First `yarn format:check`: `packages/app/scripts/__tests__/check-lessons.test.mjs is not formatted`; ran Prettier on that file only, then 0 unformatted.
- `yarn verify`: all 14 steps passed (lessons:check 1 s, test:scripts 6 s, build 168 s).

## Lessons

- Updated: `.ai/lessons/append-only-rows-conflict-one-file-per-entry.md`.

## Next steps

- Each of PRs #204, #206, #208 and #210, when it next merges `main`: keep its lesson record, take `main`'s `.ai/lessons.md`.
