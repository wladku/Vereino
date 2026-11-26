---
title: "yarn dev stops on low inotify limits; it never falls back to webpack"
modules: ["platform"]
areas: ["debugging"]
topics: ["dev-server", "turbopack", "webpack", "inotify"]
---

# yarn dev stops on low inotify limits; it never falls back to webpack

**Context**: `packages/app/scripts/dev.mjs` (scaffolded from Open Mercato) switched to `next dev --webpack` when it could not raise the Linux inotify limits without password-less `sudo`. The ENG-TEST-19 clean-clone run (#578, #808) found that this app does not compile under webpack: `src/instrumentation.ts` crashes on `createRequire`, client code reaches `node:crypto` (the `webpack()` hook strips `node:` for the server compiler only), and webpack cannot parse the `react-big-calendar` CSS that `@open-mercato/ui` imports.

**Problem**: Every Vereino check (CI, integration tests, browser smoke) runs Turbopack, so nothing keeps the app webpack-clean. A fallback to an untested bundler turns a clear preflight error into a crash or HTTP 500 that a new contributor cannot read.

**Rule**: With low limits `yarn dev` stops and names `yarn dev:fix-wsl-watchers` (`resolveDevBundlerDecision` in `scripts/dev-inotify-limits.mjs` returns Turbopack for `auto`). Webpack is reachable only as the explicit opt-in `OM_DEV_BUNDLER=webpack`, which is unsupported until a check keeps the app compiling under it. When a Turbopack-only config is added (`turbopack.resolveAlias`, `node:` imports, instrumentation), do not re-add a silent webpack fallback.

**Applies to**: `packages/app/scripts/dev.mjs`, `packages/app/scripts/dev-inotify-limits.mjs`, `packages/app/next.config.ts`, upstream scaffold refreshes of the dev runner.
