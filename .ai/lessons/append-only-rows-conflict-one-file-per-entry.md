---
title: "Parallel PRs must not append to one shared table: each spec change is its own file, and merge=union helps only local merges"
modules: ["platform"]
areas: ["spec-pr", "ai-workflow"]
topics: ["merge-conflicts", "parallel-agents", "spec-changelog", "lessons-catalog", "gitattributes", "merge-union"]
---

# Parallel PRs must not append to one shared table: each spec change is its own file, and merge=union helps only local merges

**Context**: On 2026-11-05, 14 of 18 open PRs conflicted with `main`. Merging each pair of the 15 still open showed 70 of 105 pairs in conflict; 67 of the 70 conflicts in spec files were only the rows each PR appended to the end of a spec's `## Changelog` table (49 pairs conflicted on nothing else, 66 pairs on `2026-10-20-vereino-club-management.md` alone). Every merge to `main` re-conflicted the rest, and the conflicts were resolved by hand by merging `main` into each PR. On 2026-11-06 the sorted, `merge=union` lessons index `.ai/lessons.md` then broke `lessons:check` three times after merging `main` into PR branches: union kept both the old and the edited row of a lesson a PR had changed, and once appended a row out of order; each fix cost a CI cycle of about 45 minutes and blocked the merge queue.

**Problem**: Git reports a conflict whenever two branches change the same or adjacent lines, and every append to the end of a file lands on the same place. `merge=union` in `.gitattributes` fixes this only for a local `git merge`: GitHub's merge button and its "has conflicts" status do not run merge drivers (a merge with attributes ignored still conflicts), so a union-only fix leaves the PRs blocked on GitHub. Union on a whole spec would also silently combine real, overlapping spec edits, and on an index it keeps the stale copy of every edited row.

**Rule**: Never append to a file that every PR touches. Record a spec change as its own file, `.ai/specs/changelog/<spec-file-name-without-.md>/YYYY-MM-DD-slug.md` with one `| date | change |` row; the spec's own table is frozen after 2026-11-05 and `yarn spec-changelogs:check` rejects new rows there. Do not commit an index that repeats data already in the entries: lessons are one file each and their front matter is the catalog (`yarn lessons:list` prints it; `.ai/lessons.md` holds no rows and `lessons:check` rejects any). Use `merge=union` only on files whose every line is an independent item that is never edited, as a local-merge aid. To find what really conflicts, run `git merge-tree --write-tree --name-only origin/<a> origin/<b>` on each pair of open PR branches.

**Applies to**: `.ai/specs/changelog/`, `scripts/check-spec-changelogs.mjs`, `.gitattributes`, `.ai/lessons.md`, `scripts/check-lessons.mjs`, any agent or orchestrator run that opens PRs in parallel.
