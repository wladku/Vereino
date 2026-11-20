---
title: "Stage every resolved conflict file and check the merge commit's tree before pushing"
modules: ["platform"]
areas: ["delivery"]
topics: ["git-merge", "conflicts", "ci"]
---

# Stage every resolved conflict file and check the merge commit's tree before pushing

**Context**: PR #506 (2026-11-20). After `git merge origin/main` an agent resolved two conflicts by editing the files
(`packages/ui/src/index.ts`, `activities/components/public/PublicSessionView.tsx`) but never ran `git add` on them. The
merge commit in a `git commit … && yarn verify` chain failed on the unmerged paths, and the failure scrolled past. A
later `git add <run log> && git commit` closed the pending merge with only the run log staged, so the pushed merge commit
left both resolved files out (they showed as ` A` in `git status`). Local `yarn verify` passed because it reads the
working tree; CI's clean checkout failed typecheck with hundreds of `Cannot find module '@vereino/ui'` errors.

**Problem**: A green local gate proves the working tree, not the commit. Any file left unstaged after a conflict
resolution is invisible to the gate and missing from what CI and reviewers see.

**Rule**: After resolving conflicts, `git add` each resolved file, confirm `git diff --name-only --diff-filter=U` is
empty, and commit the merge as its own command (not inside an `&&` chain whose failure is hidden). Before pushing, run
`git status --short` and require it to be clean (nothing staged, modified or ` A`), so the gate's tree equals HEAD.

**Applies to**: every base merge into a PR branch (`om-auto-fix-pr`, `om-auto-review-pr`, manual conflict resolution).
