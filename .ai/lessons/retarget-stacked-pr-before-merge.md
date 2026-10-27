---
title: "Retarget a stacked pull request to main before merging it"
modules: ["platform"]
areas: ["spec-pr"]
topics: ["pull-requests", "stacked-branches", "github", "merge"]
---

# Retarget a stacked pull request to main before merging it

**Context**: PR #42 (foundation II spec) was opened against `docs/foundation-spec`, the branch of PR #40, because both changed the club spec. #40 was merged into `main` first, but #42's base was not switched, so #42 was merged into the already merged `docs/foundation-spec`. GitHub showed it as merged while `main` never received the spec. Meanwhile #41 split the club spec, so re-landing the commit needed a cherry-pick with six conflicts (PR #43).

**Problem**: GitHub retargets a stacked PR automatically only when the base branch is deleted after its own merge. When the base branch stays, the stacked PR keeps pointing at it and a merge looks successful. A PR body that says "GitHub then retargets this PR" is not a guarantee.

**Rule**: Before merging a PR, check that its base is `main` (`gh pr view <n> --json baseRefName`). After a stacked base merges, retarget the PR to `main` (`gh pr edit <n> --base main`) or delete the merged base branch. Prefer not to stack PRs: open a dependent PR against `main` (its branch may start from the other PR's head) and say "merge #N first" in the body; its diff shrinks to its own commits once #N merges.

**Applies to**: every pull request in this repository, especially spec PRs that touch the same spec; `om-approve-merge-pr`, `om-merge-buddy` and hand merges.
