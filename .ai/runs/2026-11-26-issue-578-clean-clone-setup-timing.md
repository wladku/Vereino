# Run: issue #578 — timed clean-clone setup on Linux (ENG-TEST-19)

- **Goal and trigger:** cezar task (om-auto-fix-issue) for #578. The owner decided on 2026-11-26 that Cezar runs the Linux half; the Windows 11 half stays with the owner and keeps #578 open.
- **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, ENG-AC-05 / ENG-TEST-19.
- **Branch:** `docs/issue-578-clean-clone-setup-timing`. The PR uses `Refs #578`, not `Closes`.

## Steps

1. Claimed #578 (assignee, `in-progress`, 🤖 claim comment naming this run).
2. Run 1: `git clone` from GitHub into an empty directory with empty Yarn and Corepack caches, then `corepack enable` and `yarn setup`, timestamping every line. The setup steps passed in 83 s. `yarn dev` fell back to webpack, because it could not raise the inotify limits without `sudo`, and exited with `createRequire is not a function` (`src/instrumentation.ts`, added in #733).
3. Patched the instrumentation hook (`process.getBuiltinModule`) and ran a second clean clone of that commit (run 2). The dev server started, but `/login` answered 500: `UnhandledSchemeError: Reading from "node:crypto"` (client `BankStatementPage` → `lib/bank-matching.ts`). Extended the `node:` rewrite in `next.config.ts` to the client compiler. The next 500 was a global-CSS parse error in `react-big-calendar` (platform `ScheduleCalendar`).
4. Concluded that webpack is not a working path for this app and reverted both patches. Filed #808 with the three failures and the owner's choice: stop instead of falling back, or support webpack.
5. On the run 2 clone, started `next dev --turbopack` directly: `/login` answered 200 after 14 s, and Playwright signed in as the superadmin from the *initialize* box, landing on `/backend` in 19 s with no page errors.
6. Recorded the result in `docs/ops/clean-clone-setup.md`. Fixed `CONTRIBUTING.md` *Local setup*: raise the inotify limits first on Linux/WSL2 (`node packages/app/scripts/fix-wsl-inotify.mjs` works before any install), where to sign in, and which ports must be free.
7. Removed both clones, their compose projects (containers, volumes, networks) and the caches; stopped every process this run had started.

## Decisions

- **No code change in this PR.** The webpack fallback needs more than two patches, and the choice between stopping and supporting webpack is the owner's (#808). The documentation fix is enough for a contributor to reach a running app.
- **The host's inotify limits were not raised.** That is a system setting, which this run may not change. Turbopack was started directly instead of through `yarn dev`, which would refuse it at these limits (`OM_DEV_BUNDLER=turbopack` fails its preflight).
- **Docker images were not deleted to simulate a cold machine,** because other environments on the host use them. Their size is in the record.

## Files changed

- `CONTRIBUTING.md`
- `docs/ops/clean-clone-setup.md` (new)
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-26-issue-578-eng-test-19-linux.md` (new)
- `.ai/runs/2026-11-26-issue-578-clean-clone-setup-timing.md` (this file)
- `.ai/lessons/dev-webpack-fallback-is-untested.md` (new)

## Commands and results

- Run 1 `yarn setup`: `done` for dependencies, env, database, generate, migrate and initialize; then `💥 Failed: [server] Next.js dev server exited unexpectedly with exit code 1` and `TypeError: An error occurred while loading instrumentation hook: createRequire is not a function`.
- Run 2 webpack: `❌ Warmup failed after 3 retries: /login returned HTTP 500`.
- Turbopack: `GET /login 200 in 14.0s`. Playwright sign-in: `{"url":"http://localhost:3000/backend?notice=person-not-linked","seconds":18.658,"pageErrors":[]}`.
- Gate: see the PR (docs-only change, no integration test added or edited).

## Open problems / next steps

- Windows 11 half of ENG-TEST-19 (owner, #578).
- #808: the webpack fallback of `yarn dev`.
- Observed, not investigated: after the superadmin signs in, the dashboard shows an *Access denied* toast and *Could not load the requests* in the departure-requests widget.
