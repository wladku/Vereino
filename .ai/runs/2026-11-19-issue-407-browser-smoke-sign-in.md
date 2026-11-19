# Run: issue #407 browser-smoke sign-in times out waiting for /backend

- **Goal and trigger:** cezar task (om-auto-fix-issue, label `cezar` on #407). The required check `browser-smoke` failed now and then: after `press Enter`, `agent-browser wait --url **/backend**` timed out after 25 000 ms. The screenshot showed the sign-in page with both fields still filled in.
- **Issue / branch:** #407 / `fix/issue-407-browser-smoke-sign-in-timeout`.

## Steps

1. Claimed #407 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Root cause: `@open-mercato/core/src/modules/auth/frontend/login.tsx` renders `<form data-auth-ready="0">` and a disabled submit button until it hydrates (`formReady = clientReady && !authOverridePending`), and `onSubmit` returns early before that point. A disabled default button also blocks implicit (`Enter`) submission. `login-smoke.mjs` waited only for `input[name="email"]`, which the server-rendered HTML already contains, so under CI load `Enter` could land before hydration and submit nothing. This matches the screenshot and is the same race as #352 (lesson `sign-in-redirect-flash-is-lost-and-login-form-needs-hydration`).
3. Fixed `packages/app/.ai/qa/agent-browser/login-smoke.mjs`:
   - waits for `form[data-auth-ready="1"] button[type="submit"]:not([disabled])`, fills the fields, then clicks that button instead of pressing `Enter`;
   - passes `AGENT_BROWSER_DEFAULT_TIMEOUT` (default 90 000 ms; `SMOKE_TIMEOUT_MS` overrides it) to every agent-browser call, so the URL wait has room for the first sign-in after a cold start. agent-browser documents this variable (`Default action timeout in ms (default: 25000)`). The spawn timeout is the wait timeout plus 60 s;
   - on failure, writes `login-smoke-diagnostics.md` next to the screenshot and prints it. It holds `get url`, `console`, `errors`, `network requests` and `network requests --filter /api/auth/`. The CI step already uploads that directory as the `browser-smoke` artifact.
   - The check is not weakened: it still waits for `**/backend**` and asserts that `get url` contains `/backend`.
4. Lesson: added the #407 evidence and the agent-browser rule to `sign-in-redirect-flash-is-lost-and-login-form-needs-hydration`. This is the second time the same race was fixed (#352, #407), so per AGENTS.md ("the same mistake corrected twice … promote it to a rule") I added one sentence to AGENTS.md → Validation.

## Decisions

- Click the hydrated submit button rather than wait and then press `Enter`. A disabled button can never be clicked, so the selector wait is the hydration gate and the click is the submit.
- 90 s rather than a retry loop. A retry could hide a real sign-in regression. A longer bound still fails when `/backend` is never reached.
- No CI workflow change: the artifact upload already covers the diagnostics file, and the script path and invocation stay the same (BACKWARD_COMPATIBILITY.md lists the script as relied on by CI; the change only adds an optional variable and an output file).

## Files changed

- `packages/app/.ai/qa/agent-browser/login-smoke.mjs`
- `.ai/lessons/sign-in-redirect-flash-is-lost-and-login-form-needs-hydration.md`
- `AGENTS.md` (one sentence under Validation)
- this log

## Commands and results

- Downloaded agent-browser v0.38.2 with the CI checksum (`agent-browser: OK`) to read `wait --help` and find `AGENT_BROWSER_DEFAULT_TIMEOUT`.
- `yarn test:integration:vereino:start --port 5393` (free port; 5001 left to others): `[ephemeral] ready`.
- `node .ai/qa/agent-browser/login-smoke.mjs` against it: the browser cannot start on this machine — `chrome: error while loading shared libraries: libatk-1.0.so.0` (agent-browser Chrome 158, Playwright chromium-1248 and chrome-headless-shell all lack system libraries; installing them would change system settings, which this run may not do). The failure path did run: the diagnostics file was written and printed with all five sections. The successful sign-in path is verified by the PR's `browser-smoke` CI job.
- `yarn verify`: `[verify] all 18 step(s) passed`.

## Open problems / next steps

- Watch `browser-smoke` on the next PRs. If it still fails, `login-smoke-diagnostics.md` in the artifact shows whether `POST /api/auth/login` was sent and how it was answered.
