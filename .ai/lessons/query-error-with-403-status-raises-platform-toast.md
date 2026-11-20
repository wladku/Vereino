---
title: "A react-query error with a status of 403 raises the platform's English access-denied toast; keep the status off `status` and do not call routes the viewer may not use"
modules: ["payments", "activities", "platform"]
areas: ["backend-ui", "debugging"]
topics: ["api-client", "forbidden", "toast", "react-query", "i18n"]
---

# A react-query error with a status of 403 raises the platform's English access-denied toast; keep the status off `status` and do not call routes the viewer may not use

**Context**: The UX audit of 2026-11-20 (#483) found a yellow English toast "Access denied: this area requires the role "admin"" on a guardian's and an attendant's `/club`. The coach-payments tile already sent `x-om-forbidden-redirect: 0` (lesson `apifetch-403-throws-before-page-branch`), so `apiFetch` stayed quiet.

**Problem**: The tile's query threw its own `CoachTileLoadError` with a `status` property. The platform `QueryProvider` (`@open-mercato/ui/src/theme/QueryProvider.tsx`) installs a global `QueryCache.onError` that calls `notifyForbiddenAccess()` for any error whose `status` is 403 — without hints, so the text names the default role "admin" — and the text itself is hard-coded English. The header alone does not prevent the toast.

**Rule**: A widget or page that expects a refusal does not ask for it: check the feature first (`POST /api/auth/feature-check`, `grantsFeature` from `@vereino/ui`) or use a flag the page already has (the member profile's `paymentsVisible`, the session perspectives). When a query still has to throw on an HTTP error, keep the status in a field not named `status` (e.g. `httpStatus`) unless the toast is wanted. Platform toasts that do appear are translated by `PlatformFlashTranslator` (`packages/app/src/components/`); add a new English platform text to `src/lib/platform-flash.ts` and the `vereino.flash.*` keys rather than flashing English.

**Applies to**: injected widgets and member pages using `useQuery`/`useMutation` under the platform `QueryProvider`; integration tests asserting "no 4xx" with `page.on('response')` (`people/ISSUE-483-…spec.ts`).
