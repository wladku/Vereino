# `@vereino/enterprise` — public CI fixture

A minimal, AGPL-licensed stand-in for the private Vereino Enterprise package (enterprise package spec
`.ai/specs/2026-11-23-vereino-enterprise-package.md`, DD-E11). The CI job `enterprise-overlay` copies this folder to
`packages/enterprise` and runs `node scripts/enterprise-overlay.mjs --ci`, so public CI proves the overlay build without
access to the private repository. The private repository starts as a copy of this folder (phase 2).

- One module, `enterprise_demo`: `GET /api/enterprise_demo/state` answers the licence state of the caller's tenant
  (404 when `off`), `POST` is the demo write (409 when `read_only`), and `/backend/enterprise-demo` shows the state.
- No third-party dependency of its own: every import is a `peerDependency` with exactly the app's range, so the overlay
  install resolves nothing the public lockfile does not already lock (DD-E02). The overlay links `packages/node_modules`
  to the app's, so the imports resolve to the app's single copies of React, zod and `@open-mercato/*`.
- `exports` maps `./modules/*` to `.ts`/`.tsx` sources (and `./modules/*.json` to the catalogs), because the platform
  generator imports `@vereino/enterprise/modules/<id>/<file>` without an extension.
- The folder is excluded from the app's `tsconfig.json` and Jest; it is compiled only in the overlay shape.
