# Run: issue #352 — E02-S03 unlinked-account sign-in is flaky in CI

- **Goal and trigger:** cezar task (`om-auto-fix-issue 352`, label `cezar`): make
  `people/E02-S03-member-accounts.spec.ts:410` deterministic by fixing the cause, not by longer timeouts or retries.
- **Spec / issue / branch:** club spec *UI architecture* → redirect after sign-in (#27); #352;
  `fix/issue-352-unlinked-account-sign-in-flaky`.

## Steps

1. Claimed #352 (assignee, `in-progress`, `🤖` comment).
2. Read CI run 44063444937 (shard 3/3) and downloaded its Playwright report (error contexts, trace of the retry).
   - First attempt: the page snapshot still shows the typed e-mail and password on `/login`, with an empty alert —
     the form was never submitted.
   - Retry: the trace shows `POST /api/auth/login` 200, then the client navigation to
     `/backend?flash=Your+account+is+not+linked…&type=info`, then `/backend` without the parameters; the snapshot of
     `/backend` has no notice.
3. Root cause 1 (first attempt): the platform login page disables its submit button and returns early from `onSubmit`
   until it is hydrated (`form[data-auth-ready="1"]`). `signInThroughForm` pressed `Enter` right after `page.goto`,
   so on a loaded CI runner the sign-in could do nothing.
4. Root cause 2 (retry): the notice travelled as the platform `?flash=`. `FlashMessages` is mounted by
   `FrontendLayout` (already mounted on `/login`, so it is the rendering primary host) and by `AppShell` (mounted fresh
   on `/backend`). Whichever host reads the URL first strips `flash`/`type` and keeps the message in its own state; when
   that is the non-primary `AppShell` host, nothing renders. The toast also auto-hides after 3 s.
5. Fix:
   - `signInThroughForm` waits for `form[data-auth-ready="1"]` and types into that form.
   - `withNotice` now adds `?notice=person-not-linked` (a Vereino key) instead of `?flash=`; `member-landing` no longer
     translates the text server-side.
   - New widget `people.injection.not-linked-notice` on `backend:layout:top` renders the catalog text
     `people.club.notLinked.notice` (dismissible) while the URL carries the key — deterministic, and the copy can no
     longer come from the URL.
   - The test asserts the URL key and the banner by `data-testid` with `uiText`.
6. Unit tests for `withNotice` and the new `hasNotLinkedNotice`; lesson
   `sign-in-redirect-flash-is-lost-and-login-form-needs-hydration`.

## Decisions

- Not patched in the platform (`node_modules` is read-only); the two-host flash race is an upstream defect. A Vereino
  banner is the smaller and more robust fix than retrying for a 3-second toast.
- Additive contract change only: a new widget id on an existing spot; the login answer's `redirect` value for an
  unlinked account changes its query string (nobody parses it but the browser).

## Files changed

- `packages/app/.ai/qa/tests/_fixtures/members.ts`, `packages/app/.ai/qa/tests/people/E02-S03-member-accounts.spec.ts`
- `packages/app/scripts/vereino-ui-texts.baseline.json` (E02-S03 entry 3 → 2)
- `packages/app/src/modules/people/lib/member-rules.ts`, `lib/__tests__/member-rules.test.ts`,
  `services/member-landing.ts`, `widgets/injection-table.ts`, `widgets/injection/not-linked-notice/*`
- `.ai/lessons/sign-in-redirect-flash-is-lost-and-login-form-needs-hydration.md`, this log

## Commands and results

- `yarn generate` — pass (widget registered in `injection-widgets.generated.ts`).
- `npx jest src/modules/people/lib/__tests__/member-rules.test.ts` — 30 passed.
- `yarn test:integration:vereino --filter E02-S03` — 7 passed (8.7m), including the unlinked-account test.
- `yarn verify` — first run failed at `lint`:
  `widget.client.tsx 20:24 error Returning a void expression from an arrow function shorthand is forbidden
  (@typescript-eslint/no-confusing-void-expression)` → braces added. `--from lint` then failed at `qa-texts:check`:
  `"…/E02-S03-member-accounts.spec.ts" has 2 hardcoded UI text(s) now; lower its entry to 2` → baseline lowered.
  `--from qa-texts:check` passed (qa-texts, lessons, spec-changelogs, test, test:scripts, build); a final full
  `yarn verify` run passed before the PR.

## Open problems

- Upstream: `FlashMessages` loses a URL flash when the non-primary host reads it first (report to Open Mercato).

## Next steps

- Review and merge the PR through the merge train.
