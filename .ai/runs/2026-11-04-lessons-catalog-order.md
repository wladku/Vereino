# Lessons catalog order on main

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5), coordinator session
- **Trigger:** PR #149's `gate` failed at `lessons:check`; the owner asked to fix it.
- **Branch:** `fix/lessons-catalog-order`, from `main` at 01bb860
- **Status:** completed, PR open for review.

## Goal

Make `main`'s gate green again and unblock every open PR (#149, #150, #152).

## Steps

1. Found that `main`'s own CI `gate` fails at `lessons:check` since 01bb860 (#153): in the *ai-workflow* section, #153's row `db-generate-varchar-length-and-concurrent-index-migrations` sits above `claim-belongs-to-the-run-not-the-account`, added by #147. Each PR was sorted on its own branch; the squash merge of #153 kept its row at the top of the section.
2. Sorted the catalog rows by file name within each section (one row moved).

## Commands and results

- `node scripts/check-lessons.mjs` on `main`: 1 problem (row order); after the fix: valid.

## Open problems

- Two PRs that each add a lesson to the same section can still merge into a wrong order. `lessons:check` catches it on `main` only after the merge; rerun it after merging `main` into a branch.
