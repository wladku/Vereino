---
title: "A pull request pushed with GITHUB_TOKEN has no CI and stalls the merge train unless it stays a draft"
modules: ["platform"]
areas: ["architecture", "testing"]
topics: ["merge-train", "github-token", "release-please", "workflows"]
---

# A pull request pushed with GITHUB_TOKEN has no CI and stalls the merge train unless it stays a draft

**Context**: #447 added release-please, which opens and rewrites the release pull request with the workflow's own `GITHUB_TOKEN`. GitHub starts no workflow for a push or pull request made with that token, so the release pull request never gets `gate`, `integration` or `browser-smoke`.

**Problem**: `scripts/merge-train-plan.mjs` counts a required check that never started as `pending`, and `planMergeTrain` waits on the first up-to-date `pending` pull request before it updates any other. A bot pull request that is rebased onto `main` after every merge is always up to date, so a non-draft one without CI holds the whole train indefinitely.

**Rule**: A pull request that a workflow writes with `GITHUB_TOKEN` must stay out of the train until its CI has run: open it as a draft (the train skips drafts) and turn it back into a draft whenever the bot rewrites it. A person starts its CI by closing and reopening it, then marks it ready. Use a personal token instead only with the owner's approval (it runs full CI after every bot push).

**Applies to**: `.github/workflows/release.yml`, any future workflow that opens pull requests (Renovate runs as an app and is not affected), `scripts/merge-train-plan.mjs`, `docs/ops/github-settings.md` section 7.
