---
title: "Core auth ships a provider-neutral MFA-pending gate; gate sign-in in the login wrapper, not an after-interceptor"
modules: ["foundation", "platform"]
areas: ["architecture", "umes"]
topics: ["mfa", "second-factor", "auth-login", "api-interceptor", "mfa-pending"]
---

# Core auth ships a provider-neutral MFA-pending gate; gate sign-in in the login wrapper, not an after-interceptor

**Context**: Writing the staff second factor spec (#736, 2026-11-26). ENG-Q-09 and S8.2 assumed that MFA exists only in the commercial enterprise `security` module, so a second factor would need a licence or a login route of our own.

**Problem**: (1) The open-source core already ships the whole gate. `POST /api/auth/login` runs after-interceptors on `auth/login` (`@open-mercato/core/src/modules/auth/api/login.ts:205-258`). If an interceptor returns a different `token`, the route sets it as `auth_token` and clears `session_token`. A JWT with `mfa_pending: true` resolves to no auth on every page, and on every API route except those registered with `registerMfaPendingAccessRoutes` (`@open-mercato/shared/src/lib/auth/{jwt.ts,server.ts,mfaPendingAccess.ts}`). `session/refresh.ts` refuses it too. Missing this leads to a parallel login route that leaves the platform route open. (2) An after-interceptor result is only `{ merge | replace }` (`shared/src/lib/crud/api-interceptor.ts`), with no status. If the replaced body has no `token`, `login.ts` puts the **original full token** into the cookie. A "refusal" that only sets `ok: false` therefore signs the user in. A thrown error or timeout becomes 500/504 with no cookies (fail closed), but the session row the platform created stays.

**Rule**: Build any second factor or sign-in condition on the platform's `mfa_pending` gate, never on a separate login route. Put the gate in Vereino's existing login wrapper `src/app/api/auth/login/route.ts` (#738). It sees the platform's real `Response`, so it can set a status and drop the platform's `Set-Cookie` and `refreshToken`. Do not put the gate in an after-interceptor.

Rules for the provisional token and the completion routes:
- Keep the platform session's `sid` in the provisional token. The canonical session check on a registered route rejects a token without `sid` (`core/modules/auth/lib/sessionIntegrity.ts:56-66`).
- Delete that session on success, failure and expiry.
- Register the completion routes with `registerMfaPendingAccessRoutes` in the process that serves the API dispatcher.
- Never declare `features` on an `auth/login` interceptor. The login route passes no user features, so the runner skips it silently (`interceptor-runner.ts`).
- The "never throw" rule of `future-module-gates-and-auth-login-interceptors` covers only convenience interceptors such as the member landing. A security check fails closed.

**Applies to**: `src/app/api/auth/login/route.ts`; `api/interceptors.ts` on `auth/login` in any Vereino module; `.ai/specs/implemented/2026-11-26-vereino-staff-second-factor.md`; reviews of anything that issues or gates a staff session.
