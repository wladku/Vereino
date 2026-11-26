---
title: "GitHub merge queue needs an organization-owned repository; Vereino batches in its own train"
modules: ["platform"]
areas: ["architecture"]
topics: ["ci", "merge-train", "merge-queue", "rulesets", "github"]
---

# GitHub merge queue needs an organization-owned repository; Vereino batches in its own train

**Context**: On 2026-11-18 nine PRs waited while the merge train landed one PR per 41 min CI run, because the `main` ruleset requires a PR to be up to date (`strict`) and every squash merge made the others `BEHIND`. The owner first chose GitHub's merge queue to test several PRs together. Checking the repository showed `owner.type = User`, and GitHub Docs state: "Pull request merge queues are available in any public repository owned by an organization, or in private repositories owned by organizations using GitHub Enterprise Cloud."

**Problem**: A plan that relies on the merge queue (a `merge_group` trigger, "Require merge queue" in the ruleset) cannot be switched on for `wladku/Vereino`, and the failure shows only when the owner tries to enable it. Speculative testing of one PR on top of another does not help either: under `strict`, the squash merge writes a new commit, so the second PR is `BEHIND` again.

**Rule**: Before proposing the merge queue, check `gh api repos/<owner>/<repo> --jq .owner.type`. For this repository, more than one PR per CI run comes from the own train testing a batch branch and from the ruleset changes in `.ai/specs/implemented/2026-11-18-batch-merge-train.md` (drop `strict`, require `merge-train/verified`). Moving the repository to an organization was rejected by the owner on 2026-11-18.

**Applies to**: `.github/workflows/merge-train.yml`, `scripts/merge-train*.mjs`, ruleset 26707580, `SDLC.md` "Validation gate", any proposal to change how PRs reach `main`.
