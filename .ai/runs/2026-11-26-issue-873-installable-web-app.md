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
- `packages/app/.ai/qa/tests/club_core/E31-S01-installable-web-app.spec.ts`
- `BACKWARD_COMPATIBILITY.md`

## Commands and results

- `yarn typecheck`: the first run failed only on missing `.mercato/generated` files in the fresh worktree. After `yarn install` and `yarn generate`, one error remained: `Uint8Array<ArrayBufferLike>` is not a `BodyInit` in the icon route. Typed as `Uint8Array<ArrayBuffer>`, the typecheck passed.
- `yarn workspace @vereino/ui test`: the first run failed one assertion (my regex expected `method` before `action` on the sign-out form). After the fix, 290 passed, and `install-prompt.ts` and `member-shell.tsx` are at 100/100/100.
- `yarn jest src/modules/club_core/lib/__tests__/web-app.test.ts`: 12 passed, `web-app.ts` at 100 %.

## Open problems / next steps

- WebP logos fall back to the initial. Drawing them needs `sharp` as a declared dependency (Ask First).
- PR #864 (brief refresh with D-045) was still open at run time.
