---
title: "A page that works with or without a session probes with the 401 redirect turned off"
modules: ["payments", "platform"]
areas: ["backend-ui"]
topics: ["sessionless", "public-pages", "api-call", "redirect", "auth"]
---

# A page that works with or without a session probes with the 401 redirect turned off

**Context**: #116 (M-17) `/club/orders/[campaignId]` is the share link pasted into a Messenger chat. A signed-in guardian gets the order form; a guardian without a session gets the campaign card with "Sign in" and a personal link request. The page has `requireAuth: false` and decides from the first API read which view to show.

**Problem**: `apiCall` (`@open-mercato/ui/backend/utils/apiCall`) answers every 401 outside `/login` and the portal by sending the browser to `/api/auth/session/refresh?redirect=…` and throwing `UnauthorizedError`. A page that probes the session with a plain `apiCall` therefore never shows its signed-out view: the guardian lands on the login screen. The member frame (`PaymentsClubFrame`) reads `/api/people/me` with a plain `apiCall` too, so rendering it before the probe redirects as well. That is exactly how the first CI run of E07-S09 failed: the page rendered the frame while the probe was still loading, and the signed-out browser landed on `/login?redirect=/club/orders/…` instead of the campaign card.

**Rule**: On a page that serves both audiences, make the first read with the header `x-om-unauthorized-redirect: '0'` (the platform's override; `x-om-forbidden-redirect: '0'` does the same for 403), treat its 401 as "signed out", and render the member frame or any other component that calls `apiCall` only after the probe says the user is signed in. Keep `requireAuth: false` on that page alone; every read and write behind it stays guarded on its route.

**Applies to**: `packages/app/src/modules/*/frontend/**` pages with `requireAuth: false` that also have a signed-in view, `payments/components/club/orders/ClubOrderPage.tsx`.
