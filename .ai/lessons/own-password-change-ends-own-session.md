---
title: "A user's own password change ends their own session: renew it, and read the auth before the platform handler"
modules: ["foundation", "people", "auth"]
areas: ["debugging", "backend-ui"]
topics: ["password-change", "sessions", "client-navigation", "search-params"]
---

# A user's own password change ends their own session: renew it, and read the auth before the platform handler

**Context**: #876 (2026-11-27) moved the member's password change to `/club/profile/password`. The first run of ISSUE-876 showed the member on `/login?redirect=%2Fclub%2Fprofile` right after a valid change. A later lint fix (no `setState` in an effect) read `?password=changed` from `window.location` in a lazy initial state and broke the "password changed" notice: the marker was never removed from the address.

**Problem**: The platform's `auth.users.update` deletes every `Session` of a user whose password changes, and `PUT /api/auth/profile` then signs a JWT that still names the deleted session, so the device that made the change is signed out at its next request (the panel page did the same). `getAuthFromRequest` after the platform handler may no longer see the session. Separately, after a client-side `router.push` the new page renders before `window.location` changes, so reading the address in render or in a state initializer sees the previous page.

**Rule**: After a successful own-password change, issue a fresh session for this device with `renewOwnSession` and `setSessionCookies` from `@/modules/foundation` (as `src/app/api/auth/profile/route.ts` does). Read the auth before you call the platform handler. To read a query marker on a page reached by client navigation, use `useSearchParams()`. Keep the value with the "adjust state during render" pattern, then drop the marker in an effect.

**Applies to**: `src/app/api/auth/profile/route.ts`, `foundation/services/own-password.ts`, any route that changes a password through `auth.users.update` for the signed-in user, and member pages that read a one-shot query marker (`people/components/club/ClubProfilePage.tsx`).
