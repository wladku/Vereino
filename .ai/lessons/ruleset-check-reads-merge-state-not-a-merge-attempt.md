---
title: "Prove a branch ruleset from its API and a non-draft probe PR's merge state, never by trying to merge"
modules: ["platform"]
areas: ["testing"]
topics: ["ruleset", "eng-test-02", "merge-state"]
---

# Prove a branch ruleset from its API and a non-draft probe PR's merge state, never by trying to merge

**Context**: ENG-TEST-02 (#576) asked for proof that nobody, administrators included, can merge to `main` with a red required check. The original test said "try to merge as an administrator", but agents never merge, and if a merge attempt went through it would land a failing commit on `main`.

**Problem**: A draft pull request reports `mergeStateStatus: DRAFT`, which hides whether the checks would block it. Open pull requests are usually green or still pending, so none of them shows a red check being refused.

**Rule**: Read `gh api repos/<owner>/<repo>/rulesets/<id>` as the administrator: `enforcement: active`, the required check list, `bypass_actors: []` and `current_user_can_bypass: never`. Then open a throwaway **non-draft, unlabelled** pull request (the merge train skips it) with one deliberate failure in a fast check, such as a type error that fails `gate`. Once that check is red, read `gh pr view <n> --json mergeStateStatus,mergeable`: `BLOCKED` with `MERGEABLE` means only the checks block it. Then cancel its CI run, close it unmerged and delete its branch. Record the JSON in the run log.

**Applies to**: `docs/ops/github-settings.md` section 8, ENG-TEST-02, any change to the `main` ruleset.
