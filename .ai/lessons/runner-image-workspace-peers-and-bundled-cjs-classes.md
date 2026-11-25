---
title: "The production image needs the shared packages' peers linked to the app's node_modules, and the bundled Redis cache needs Node's own require"
modules: ["platform"]
areas: ["architecture", "debugging"]
topics: ["docker", "redis", "cache", "turbopack", "workspaces", "railway"]
---

# The production image needs the shared packages' peers linked to the app's node_modules, and the bundled Redis cache needs Node's own require

**Context**: #727 (found by the capacity test of #633): the Dockerfile's `runner` stage could run no `yarn mercato`
process (`Cannot find package 'react' imported from /app/packages/ui/src/emails/EmailLayout.ts`), and with
`CACHE_STRATEGY=redis` the Next production server threw `Class constructor Redis cannot be invoked without 'new'` on
every cached read, so `/api/healthz` answered 503. No CI job ran the image, so both reached `main` unseen.

**Problem**:
- `@vereino/ui` and `@vereino/db` list React and MikroORM as **peer** dependencies (dev dependencies cover them in a
  full install). `yarn workspaces focus @vereino/app --production` with `nmHoistingLimits: workspaces` installs them
  only into `packages/app/node_modules`; Node resolves an import from `packages/ui/src/...` by its real path, so it
  never looks there. The Next bundle hides it; the CLI, which loads the TypeScript sources, does not.
- `@open-mercato/cache` is in `transpilePackages`, so Turbopack bundles its `await import("ioredis")`. ioredis's
  CommonJS `module.exports` is the `Redis` class; Turbopack's ESM interop wraps a function export in a **callable
  namespace** that calls it with `apply`. The cache's `pickRedisConstructor` takes the first function it finds, the
  wrapper, and `new wrapper()` calls the class without `new`. The CLI and the worker are not bundled and work.

**Rule**:
- Link the shared packages' peers to the app's copies in the runner stage (`ln -s app/node_modules
  packages/node_modules`), not by installing dev dependencies or moving peers to dependencies (two Reacts).
- Give the cache Node's own `require` (`globalThis.__non_webpack_require__`, set in `src/instrumentation.ts`): it
  then loads the real `Redis` class. Listing `ioredis` in `serverExternalPackages` does **not** help (tried in #727):
  the external module still reaches the cache through Turbopack's async-import interop and the same callable wrapper.
  The same trap waits for any CommonJS class a bundled package picks out of a dynamic import with `typeof === 'function'`.
- A change to the `Dockerfile`, the start scripts or the server packages is proven by `scripts/image-smoke.sh` (CI job
  `image-smoke`): it runs the exact image and commands Railway runs, with the Redis cache. Before trusting a deploy
  recipe in a test, start the exact image and command the deploy uses.

**Applies to**: `Dockerfile` (runner stage), `packages/app/src/instrumentation.ts`,
`scripts/image-smoke.sh`, `scripts/railway-*.sh`, `.github/workflows/ci.yml` (`image-smoke`).
