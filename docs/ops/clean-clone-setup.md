# Clean-clone setup timing (ENG-TEST-19)

How long a new contributor takes from a clean clone to a running app by following
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) → *Local setup*, and which steps went wrong. This is ENG-TEST-19 of the
engineering standards spec ([`2026-10-21-engineering-standards-and-patterns.md`](../../.ai/specs/2026-10-21-engineering-standards-and-patterns.md),
ENG-AC-05; issue #578). The target is **at most 30 minutes** on Linux or WSL2 and on Windows 11.

| Platform | Date | Commit | Result | Time to a running app |
|---|---|---|---|---|
| Linux (cezar-ws, agent run) | 2026-11-26 | `main` @ `1e45a949` | **Failed as documented**, passes with the inotify step now in `CONTRIBUTING.md` | about 2.5 min (setup steps 97 s; see below) |
| Windows 11 | — | — | not run yet: needs a person on a Windows 11 machine (owner, #578) | — |

## Linux run, 2026-11-26

**Host.** cezar-ws: Linux 7.0 x86-64, 32 cores, 121 GB RAM, NVMe disk. Node.js 24.22.3 through fnm and Docker were
already installed (the guide lists them as requirements). Inotify limits at the distribution default
(`max_user_watches=1003690`, `max_user_instances=128`), and no password-less `sudo`.

**Method.** `git clone` from GitHub into an empty directory, then the two commands of *Local setup*: `corepack enable`
and `yarn setup`. Yarn and Corepack ran with **empty caches** (`YARN_ENABLE_GLOBAL_CACHE=false` with a new
`YARN_CACHE_FOLDER`, and a new `COREPACK_HOME`), so every package was downloaded. The Docker images
`pgvector/pgvector:pg17-trixie` (673 MB) and `redis:7-alpine` (58.5 MB) were **already pulled** on the host and
were not deleted (other environments on the host use them); on a fresh machine add their download. The compose project was
named after the clone directory, so its containers and volumes were the run's own; they were removed afterwards.
Every output line was timestamped.

### Run 1 — the guide as written (`main` @ `1e45a949`)

| Step | Duration | Result |
|---|---|---|
| `git clone` (GitHub, SSH) | 14 s | ok |
| `corepack enable` | < 1 s | ok (Yarn 4.17.1) |
| `yarn setup` → dependencies (`yarn install`, cold cache: fetch 1.6 GB 38 s, link 10 s) | 49 s | ok |
| → env (copy `.env.example`) | < 1 s | ok |
| → database (`docker compose up --wait postgres redis`) | 11 s | ok |
| → generate | 8 s | ok |
| → migrate | 3 s | ok |
| → initialize (prints the superadmin e-mail and password) | 11 s | ok |
| → `yarn dev` | 11 s | **FAIL** |
| **Total until the failure** | **108 s** | |

`yarn dev` could not raise the inotify limits, printed *"Linux inotify limits could not be raised; continuing with
Next.js Webpack"* and exited:
`TypeError: An error occurred while loading instrumentation hook: createRequire is not a function`
(`src/instrumentation.ts:20`).

### Run 2 — finding out how far webpack gets

A second clean clone (same commit, empty caches again) repeated the setup steps in 84 s (dependencies 48 s, database
11 s, generate 9 s, migrate 2 s, initialize 12 s). With the instrumentation hook patched in a throwaway commit, the
dev server started, but `GET /login` answered **500** (`node:crypto` reached a client bundle through
`payments/lib/bank-matching.ts`). With that patched too, the next 500 came from global CSS in
`react-big-calendar`, imported by the platform's `ScheduleCalendar`. The webpack fallback does not run this app;
the patches were dropped and the defect is #808.

On the same clone, Turbopack (`next dev --turbopack`, which `yarn dev` starts once the limits are high enough):

| Step | Duration | Result |
|---|---|---|
| dev server ready | 0.1 s | ok |
| first `GET /login` (compile) | 14 s | **200** |
| sign in as the superadmin from the *initialize* box, land on `/backend` (Playwright) | 19 s | ok, no page errors |

`yarn dev` itself adds about 10 s before the server starts (migrations check, generated artifacts), as measured in
both runs.

### Result

- **Time to a running app on Linux: about 2.5 minutes** (clone 14 s + setup steps 84–97 s + `yarn dev` start about
  10 s + first `/login` 14 s + sign-in 19 s), well inside 30 minutes. A slower link and disk add the 1.6 GB Yarn
  download and the 0.7 GB of Docker images. The time assumes raised inotify limits: raising them was not done on
  this run, because the agent may not change host settings. Turbopack was therefore started directly, without the
  `yarn dev` limit check.
- **Deviation, fixed in `CONTRIBUTING.md`:** the guide did not say that Linux and WSL2 need higher inotify limits.
  Without them `yarn dev` falls back to webpack and the app never runs. *Local setup* now asks to run
  `node packages/app/scripts/fix-wsl-inotify.mjs` before `yarn setup`, and says what to do after the webpack warning.
- **Also added to `CONTRIBUTING.md`:** where to sign in (`http://localhost:3000/login`, the superadmin from the
  *initialize* box), and that the ports 3000, 5432 and 6379 must be free.
- **Follow-up:** #808: the webpack fallback of `yarn dev` (three failures listed there).
- **Observed, not investigated:** right after the superadmin signs in, the dashboard shows an *Access denied* toast
  and the *Departure requests* widget says *Could not load the requests*. The banner *The club has no
  administrator yet* is expected (README → *Getting started*).

Logs, the screenshot after sign-in and the raw webpack output are in the run's cockpit artifacts (cezar task
374c9a71); the run log is [`.ai/runs/2026-11-26-issue-578-clean-clone-setup-timing.md`](../../.ai/runs/2026-11-26-issue-578-clean-clone-setup-timing.md).
