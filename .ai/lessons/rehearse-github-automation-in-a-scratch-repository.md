---
title: "A scratch-repository rehearsal of a GitHub automation needs its rule overrides, synced scripts and a lag allowance"
modules: ["platform"]
areas: ["integration", "testing"]
topics: ["merge-train", "rehearsal", "github-api"]
---

# A scratch-repository rehearsal of a GitHub automation needs its rule overrides, synced scripts and a lag allowance

**Context**: #451 rehearsed the batch merge train in the private repository `wladku/vereino-merge-train-rehearsal`. Three things went wrong on the way: `GET /repos/{repo}/rules/branches/main` answered 403 ("Upgrade to GitHub Pro or make this repository public") because the owner's account has no rulesets on private repositories; a `git pull` in the rehearsal clone replaced the patched train script with the older copy on the rehearsal `main`, and a stray local edit was committed into a rehearsal PR; an issue labelled `merge-train-paused` was not listed by `GET /issues?labels=…` in the seconds after it was created.

**Problem**: A rehearsal that silently runs other code than the branch under test, or that depends on a plan feature the scratch repository lacks, proves nothing; a check run right after a write can read stale API data and look like a bug.

**Rule**: Give the automation an explicit override for anything it reads from rulesets or branch protection (the train has `MERGE_TRAIN_REQUIRED_CHECKS`) and skip that API call when the override is set. Commit the scripts under test to the rehearsal repository's `main` before each scenario and create rehearsal PRs with `git add <only the scenario files>`, never `git add -A`. Run the automation locally with `GH_TOKEN=$(gh auth token)` rather than storing the owner's token as a secret in the scratch repository. Allow ~20 s after creating an issue or label before a run that filters by it. An override also hides the live configuration the rehearsal stands in for: rehearse with the target list too (the ruleset after the switch-on, statuses the automation sets itself included) and dry-run that list on the live queue before the switch-on. #698 found that once the ruleset required `merge-train/verified`, the train would have judged its own status as a CI check, left every head pending and merged nothing; the rehearsal never saw it because `MERGE_TRAIN_REQUIRED_CHECKS` listed only the three CI jobs.

**Applies to**: `scripts/merge-train*.mjs`, `.github/workflows/merge-train.yml`, any future rehearsal of a workflow that acts on pull requests.
