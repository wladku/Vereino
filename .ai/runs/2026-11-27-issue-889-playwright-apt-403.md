# Run: issue #889 — Playwright install survives a 403 from the Microsoft apt source

- **Trigger**: Cezar run, `om-auto-fix-issue 889` (label `cezar`, issue by the owner).
- **Issue**: #889. **Branch**: `fix/issue-889-playwright-apt-403`. **Spec**: none (CI fix, `direct` route).

## Goal

`npx playwright install --with-deps chromium` sometimes failed an integration shard before any test ran: the runner image's `packages.microsoft.com` apt source answered 403, so `apt-get update` exited with code 100 (PR #883, runs 45898227810 and 45909162606).

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Found the two GitHub-hosted `--with-deps` installs in `.github/workflows/ci.yml`: job `integration-shard` (only on GitHub-hosted runners; `WITH_DEPS` is empty on self-hosted ones) and job `enterprise-overlay`. `browser-smoke` and `lighthouse` install without `--with-deps` and never call apt.
3. Both steps now run `sudo rm -f /etc/apt/sources.list.d/microsoft-prod.*` before the install. The glob catches both the `.list` file and the deb822 `.sources` form. On self-hosted runners (no sudo) the shard step skips it.
4. Added the new failure mode to lesson `ci-playwright-install-deps-fails-on-new-runner-image`.

## Decisions

- Removed the source rather than adding a retry. A 403 that lasts across both attempts would still fail with a retry, and Playwright needs no package from the Microsoft source. This weakens no check: the tests and the gate are unchanged.

## Files changed

- `.github/workflows/ci.yml`
- `.ai/lessons/ci-playwright-install-deps-fails-on-new-runner-image.md`
- `.ai/runs/2026-11-27-issue-889-playwright-apt-403.md`

## Commands and results

- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`: parses.
- `yarn ci-runners:check`: `6 workflow(s); self-hosted runners only for trusted events in ci.yml; runner instances isolated`.
- `yarn verify`: see the PR body.
- Integration tests: none added or edited. The change only affects the CI install step, so the PR's own CI run is the evidence.

## Open problems / next steps

- None. A runner image that drops the font packages (the lesson's first failure mode) still needs `runs-on: ubuntu-24.04` or a newer Playwright, as the lesson describes.
