# Run — #873 E31-S01 installable web app with the club's name and logo

- **Goal and trigger:** Cezar run (task 9010f510) of `om-auto-fix-issue 873`, queued by the `cezar` label. Make Vereino installable per club address: web app manifest, icons, a minimal service worker with an offline page, an "Install" entry and the iPhone hint (D-045).
- **Issue / spec / branch:** #873 (epic #867), opened by the owner. The design authority is the issue body and D-045 of the brief refresh (PR #864, open at run time; it narrows N12). There is no per-story spec, as with other `om-backlog` stories. Branch `feat/issue-873-installable-web-app`.

## Steps

1. Claimed the issue: assignee, `in-progress`, and a `🤖` claim comment naming the worktree and branch. No earlier claim and no PR existed.
2. Classified as a feature (label `feature`) and took the feature route without a separate spec PR (precedent #818): the issue carries ticket-level acceptance criteria, and D-045 records the owner's decision.
3. An Explore subagent mapped the existing pieces: host-to-club resolution, logo and colour storage, the public logo route, the root layout, the CSP, `ClientBootstrap`, the club-domain test fixture and the browser smoke.
4. Wrote the pure rules in `club_core/lib/web-app.ts`: identities, manifest, icon sizes, iPhone hint, offline HTML. Unit tests reach 100 %.
5. Added `club_core/services/web-app.ts`, which reads the request's address through `clubCorePublicSite.clubFrame` and `clubLogo` and the logo bytes through `attachmentService.readScoped`.
6. Added the app routes `src/app/manifest.ts` (`/manifest.webmanifest`, linked by Next.js), `src/app/app-icon/[size]/route.tsx` (PNG via `next/og`) and `src/app/offline/route.ts`, plus `public/sw.js` and a `Cache-Control: no-cache` header for `/sw.js`. The root metadata gets the Apple touch icon and `appleWebApp`.
7. Added `installPromptStore`, `promptInstall`, `useInstallAvailable` and `MemberInstallLabelContext` to `@vereino/ui`. `MemberShell` shows "Install" in More while the browser offers installation (UI package tests at 100 %).
8. Added `club_core/components/WebAppClient.tsx`, mounted in `AppProviders`: it registers the worker, captures the install offer, provides the menu label and shows the iPhone hint once per device.
9. Added en/pl catalog keys `club_core.webApp.*`, documented the feature in the module README and added a §10 entry to `BACKWARD_COMPATIBILITY.md`.
10. Wrote the integration test `club_core/E31-S01-installable-web-app.spec.ts`. It runs on a second app process with `VEREINO_CLUB_DOMAIN`, as TEST-M03 does.

## Decisions

- **The club's name and logo only while the club publishes its page.** The manifest and icons are fetched without cookies, so they follow the sessionless rule of every public club read (D-024/D-026): an unpublished club's address installs as "Vereino" with the mark. Reason: a club that keeps its page private shows nothing about itself to guests today (its logo route answers 404), and the manifest should not be a side door.
- **No new dependency.** The icons are drawn with Next.js's own `ImageResponse` (`next/og`), not `sharp`, because adding a dependency is Ask First. `next/og` draws PNG and JPEG and leaves WebP blank (checked in a local experiment), so a WebP logo shows the club's initial on its colour. A drawn icon is kept in memory per host, size and version (at most 200), so repeated fetches do not redraw.
- **The worker handles navigations only.** It answers from the network first, falls back to the offline page only, and keeps one cache (`vereino-offline-v1` with `/offline`). It fetches the offline page without credentials, so the page cannot hold anything personal, and it ignores API calls and assets. It has no push handler.
- **"Install" through a React context.** The context, provided at the app root, keeps the seven club frames and their 14 catalogs unchanged. The store captures `beforeinstallprompt` at the root because the browser fires it once, early.
- **Lighthouse.** Lighthouse 12 removed the PWA category. The integration test asks Chromium itself (`Page.getInstallabilityErrors`, `Page.getAppManifest`), which is the check that audit ran. The agent-browser smoke (`login-smoke.mjs`) runs on the one-club app without a club address and exposes no CDP call, so the check lives in E31-S01, on a club address.
- Start URL `/club` (the member pages), `display: standalone`, theme colour = the club colour, else `#171717` (Vereino's mark).

## Files changed

- `packages/app/src/modules/club_core/lib/web-app.ts`, `lib/__tests__/web-app.test.ts`, `services/web-app.ts`, `components/WebAppClient.tsx`, `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/src/app/manifest.ts`, `src/app/app-icon/[size]/route.tsx`, `src/app/offline/route.ts`, `src/app/layout.tsx`, `src/components/AppProviders.tsx`, `public/sw.js`, `next.config.ts`
- `packages/ui/src/member/install-prompt.ts`, `member/member-shell.tsx`, `index.ts`, `__tests__/install-prompt.test.mjs`
- `packages/core/src/install-offer.ts`, `src/index.ts`, `src/__tests__/install-offer.test.mjs`
- `packages/app/.ai/qa/tests/club_core/E31-S01-installable-web-app.spec.ts`, `packages/app/.ds-check-ignore`
- `BACKWARD_COMPATIBILITY.md`, `.ai/lessons/app-route-handlers-use-the-api-bootstrap.md`

## Commands and results

- `yarn typecheck`: the first run failed only on missing `.mercato/generated` files in the fresh worktree. After `yarn install` and `yarn generate`, one error remained: `Uint8Array<ArrayBufferLike>` is not a `BodyInit` in the icon route. Typed as `Uint8Array<ArrayBuffer>`, the typecheck passed.
- `yarn workspace @vereino/ui test`: the first run failed one assertion (my regex expected `method` before `action` on the sign-out form). After the fix, 290 passed, and `install-prompt.ts` and `member-shell.tsx` are at 100/100/100.
- `yarn jest src/modules/club_core/lib/__tests__/web-app.test.ts`: 12 passed, `web-app.ts` at 100 %.

- `yarn test:integration:vereino --filter E31-S01`, first run: test 1 (manifest and icons) passed. Test 2 failed: on the club-domain process every API dispatcher call answered 500 (`/api/people/me`, `/api/auth/feature-check`, the public club routes), and the page showed "Your profile could not be loaded". With the fixture's `stdio` sent to a file (temporarily), the log read `Error: Duplicate command loader registration for key auth:commands:acl`. Cause: `services/web-app.ts` called the page bootstrap `@/bootstrap` from a route handler. When the manifest was that process's first request, the dispatcher's own `@/bootstrap-api` registered the commands a second time. On the shared app the order was reversed, and the manifest silently fell back to "Vereino" (the warning `The web app identity of the request host could not be read`). Fix: `@/bootstrap-api`. Lesson `app-route-handlers-use-the-api-bootstrap`.
- Second run: the profile loaded. The test had expected the club name in the member header, but the header shows the club's short name, which the test club lacks ("Klub" fallback). The test now waits for the bottom bar instead.
- Third run: `Notification.permission` is `denied` by default in headless Chromium. The test now counts calls to `Notification.requestPermission` and `PushManager.subscribe` (0). Fourth run: 4 passed (56 s).
- `yarn test:integration:vereino --filter E06-S19`: 1 passed. `--filter E09-S04`: 1 passed (member shell and More entries).
- `yarn verify` failed at `lint`: the app's type-aware `eslint .` exhausted the default 4 GB heap (`FATAL ERROR: Ineffective mark-compacts near heap limit`). The heap is a property of the whole app, not of this change. Measured with an 8 GB heap: peak RSS 6.4 GB, and three real errors in my files (`react-hooks/set-state-in-effect` in `WebAppClient`, `unbound-method` and `require-await` in E31-S01), all fixed. The gate was then run with `NODE_OPTIONS=--max-old-space-size=8192`, as `build` and `typecheck` already set it.
- `yarn ds:check` flagged the inline `style` props of the icon route. Satori reads only inline styles, so three entries with that reason went into `.ds-check-ignore` (the check's own exception file).

- After the review fixes: `yarn test:integration:vereino --filter E31-S01` 4 passed (58.8 s; the early install offer, offline after sign-out, `/sw.js` header, no hint on `/login`, unpublished icons); E06-S19 1 passed on that build.
- `NODE_OPTIONS=--max-old-space-size=8192 yarn verify`: all 23 steps passed on the final code.
- Screenshots (temporary, uncommitted screenshot lines in E31-S01; removed after the run): the iPhone hint at 375 px (en), "Zainstaluj aplikację" in More (pl, desktop), the offline page (en). In the cockpit's artifacts.

## Independent review (subagent, fresh read of the diff)

- No blocking findings; privacy requirements confirmed.
- Fixed: (1) the icon cache was keyed on the raw `Host` header, so port or case variants missed it and caused redraws. It is now keyed per resolved club (`club:<slug>` or `vereino`). (2) The logo was read from storage for every manifest and icon request. The manifest now takes the version from the public logo URL, and the icon reads the file only on a cache miss. (3) A failed logo read hid the club's whole identity; it now falls back to the initial and keeps the name and colour. (4) A drawing failure answered 500 on every request; it now draws the initial and keeps that icon. (5) An install offer fired before hydration was lost; the head script `EARLY_INSTALL_OFFER_SCRIPT` (`@vereino/core`, safe in the server layout) keeps it, and the store adopts it. (6) Nits: the worker's `activate` deletes only `vereino-offline-*` caches, the touch icon without a version is kept for 5 minutes (a current versioned icon for a day), a rejected install dialog is caught, and the hint is a polite live region.
- Tests added from the review: the install offer is fired at `DOMContentLoaded`, before hydration. After sign-out, offline `/club` shows the offline page with no member content. The test checks `Cache-Control: no-cache` on `/sw.js`, that the hint is absent on `/login`, and that an unpublished club's icons equal the instance's mark.
- Left: the server snapshot of `useInstallAvailable` reads the store. The entry sits in the bottom bar, which renders only after the client-side profile load, never during hydration. A `() => false` snapshot would leave the visible branch uncoverable with the package's static-render tests. Also left: navigation preload, a maskable icon, `short_name` truncation, and the two slug reads (`clubFrame`, then `clubLogo` only on an icon cache miss).

## Open problems / next steps

- WebP logos fall back to the initial. Drawing them needs `sharp` as a declared dependency (Ask First).
- PR #864 (brief refresh with D-045) was still open at run time.
