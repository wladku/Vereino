---
title: "yarn dev's webpack fallback is untested; check a dev or setup change on Turbopack and say which bundler ran"
modules: ["platform"]
areas: ["debugging", "testing"]
topics: ["dev-server", "webpack", "turbopack", "inotify", "clean-clone"]
---

# yarn dev's webpack fallback is untested; check a dev or setup change on Turbopack and say which bundler ran

**Context**: The ENG-TEST-19 clean-clone run (#578, 2026-11-26) followed `CONTRIBUTING.md` on a Linux host with the
default inotify limits and no password-less `sudo`. `scripts/dev.mjs` could not raise the limits and continued with
`next dev --webpack`. The app then failed three times in a row: the instrumentation hook (`createRequire is not a
function`, from #733), `node:crypto` in a client bundle, and global CSS from `react-big-calendar`. Turbopack on the same
clone served `/login` and the sign-in.

**Problem**: CI, the integration runner (production build) and every developer machine with raised limits use Turbopack, so
nothing exercises webpack. A `node:` import that a client component reaches, or a `node:*` dynamic import in
`src/instrumentation.ts`, breaks only the fallback, and nobody notices until a new contributor's first `yarn dev`.
`OM_DEV_BUNDLER=turbopack` does not help on such a host: it fails the same inotify preflight.

**Rule**: Treat webpack as unsupported until #808 decides. When a contributor or an agent reports a dev-server
failure, first check the bundler line (`▲ Next.js … (webpack)` or the "continuing with Next.js Webpack" warning). If it
is webpack, the fix is to raise the limits (`node packages/app/scripts/fix-wsl-inotify.mjs`), not to patch the code. An
agent that may not change host settings can check the app on Turbopack with `next dev --turbopack` from
`packages/app`. Say so in the evidence, because it skips the `yarn dev` preflight.

**Applies to**: `packages/app/scripts/dev.mjs`, `packages/app/scripts/dev-inotify-limits.mjs`,
`packages/app/next.config.ts` (`webpack` hook), `packages/app/src/instrumentation.ts`, `CONTRIBUTING.md` *Local setup*,
`docs/ops/clean-clone-setup.md`.
