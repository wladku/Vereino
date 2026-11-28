# Run: sanitize-html security override (P6), issue #741

- **Trigger:** Dependabot triage of #741 in a Claude Code session; the owner approved the P6 override on 2026-11-27 ("Tak, zatwierdzam").
- **Branch:** `fix/security-sanitize-html` (from `main`).
- **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` — P4, P6, S16.3.

## Goal

Close Dependabot alerts #25, #26, #35 and #36 (`sanitize-html` 2.17.5, four medium XSS advisories, fixed by 2.18.0). The vulnerable copy is pinned exactly by `@open-mercato/core` and `@open-mercato/shared` 0.9.0 (P1); the app's own `^2.17.5` already resolved to 2.18.1.

## Steps and decisions

1. Root `resolutions`: `sanitize-html: 2.18.1`. Chosen over 2.18.2 because the app already ran 2.18.1, so the platform copy joins the tested one and a single copy remains. 2.18.1 was published 2026-10-14, well past the 5-day release-age gate.
2. `yarn install --mode=update-lockfile`: the `sanitize-html@npm:2.17.5` entry is gone; every dependent resolves to 2.18.1.
3. `CONTRIBUTING.md` → *Root `resolutions` (P4)*: row with reason and removal condition (the platform pins ≥ 2.18.0, #498).

## Validation

Full gate, integration suite and browser smoke in CI on the pull request. No local install or test run.

## Follow-up run: gate failure after the merge train (om-auto-fix-pr, 2026-11-27)

- **Trigger:** the merge train labelled the PR `merge-train-failed`; the `gate` check of CI run 46063874669 failed.
- **Cause:** every one of the 24 `yarn verify` steps passed; the job failed in its `yarn guard` step with one blocking finding: `package.json:85` [new-dependency] `sanitize-html` added to `resolutions`. That finding is the intended effect of this PR. Only the owner clears it, by adding the label `guard-approved` (SDLC.md "Validation gate", `scripts/guard.mjs`); the approval quoted above is recorded in the PR body, not as an owner comment or label, so the run did not treat it as clearing the guard.
- **Base:** `origin/main` was already contained in the branch (0 commits behind), so no merge was needed.
- **Review of the diff:** the resolution, the `CONTRIBUTING.md` row and the lockfile agree (the `sanitize-html@npm:2.17.5` entry and its now-unused ranges are gone; one 2.18.1 copy remains). No code change was made.
- **Outcome:** a PR comment asks the owner to add `guard-approved` and rerun the `gate` job. The run did not add or remove the label and did not merge.
- **CI on `ca6d4213`:** every job passed except `gate` (guard finding only). Integration shard 2/6 was cancelled with no failing test and passed on a rerun. Because of the `ci-<ref>` concurrency group, that rerun of the old run cancelled the CI run on the owner's newer head `f2b403a4` (merge of `main`). The run on the new head was rerun, and the pitfall is recorded in `.ai/lessons/rerun-of-a-superseded-ci-run-cancels-the-current-one.md`.

## Follow-up run: gate still red on `5a67ec09` (om-auto-fix-pr, 2026-11-28)

- **Trigger:** `merge-train-failed` stays on the PR; `gate` of CI run 46089019974 failed.
- **Cause:** unchanged. All 24 `yarn verify` steps passed; `yarn guard` blocks only on `package.json:85` [new-dependency] `sanitize-html` added to `resolutions`, the intended P6 override. No `guard-approved` label is on the PR yet.
- **Base:** `origin/main` (`73f247fa`) is already in the branch; no merge needed, no conflicts.
- **CI on `5a67ec09`:** every other job passed, including all six integration shards, browser smoke, image smoke and perf.
- **Outcome:** no code change. The owner adds `guard-approved` and reruns `gate` (or lets this run-log commit's CI run pick the label up). The run did not touch the label and did not merge.
