---
title: "Never carry a sign-in notice in ?flash=; type into the login form only once it is hydrated"
modules: ["people", "auth"]
areas: ["testing", "backend-ui"]
topics: ["flash", "sign-in", "hydration", "flaky-test", "integration-tests"]
---

# Never carry a sign-in notice in ?flash=; type into the login form only once it is hydrated

**Context**: E02-S03 "an account linked to no person lands on the admin panel with a notice" failed intermittently in CI
(#352, runs 44063444937 and 43999253326). First attempt: the page never left `/login` — the form still held the typed
e-mail and password and no `POST /api/auth/login` was sent. Retry: the sign-in reached `/backend?flash=…&type=info`, but
the notice was never on the page.

**Problem**: (1) The platform login page (`@open-mercato/core/modules/auth/frontend/login.tsx`) disables its submit
button and ignores `onSubmit` until it is hydrated (`form[data-auth-ready="1"]`); `Enter` typed earlier submits nothing,
which happens under CI load. (2) `FlashMessages` is mounted twice — in `FrontendLayout` (via `AppProviders`, mounted on
`/login` already, so it is the rendering "primary" host) and in `AppShell`. After the client-side redirect to `/backend`,
whichever host's effect reads the URL first strips `flash`/`type` and keeps the message in its own state; when that is
the freshly mounted, non-primary `AppShell` host, nothing renders. The toast also hides itself after 3 seconds.

**Rule**: In browser tests, wait for `form[data-auth-ready="1"]` before typing into `/login` (the `signInThroughForm`
fixture does). Do not send a notice through a sign-in redirect's `?flash=`: redirect with an own query key and render the
text from the catalog in a `backend:layout:top` widget (`people.injection.not-linked-notice`, `?notice=person-not-linked`).
Assert such notices by `data-testid`, not by a text that may live in a transient toast.

**Applies to**: `packages/app/.ai/qa/tests/_fixtures/members.ts` (`signInThroughForm`), `people/services/member-landing.ts`,
`people/lib/member-rules.ts` (`withNotice`), any redirect that would carry `?flash=` across a layout change.
