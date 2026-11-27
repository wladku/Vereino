---
title: "Files a module's commands, CLI or index reach never import next/server"
modules: ["foundation", "platform"]
areas: ["architecture", "testing"]
topics: ["next-server", "command-loaders", "module-index", "esm"]
---

# Files a module's commands, CLI or index reach never import next/server

**Context**: The staff second factor (#736) put its sign-in gate (`second-factor/gate.ts`, which builds
`NextResponse` answers) behind the foundation index and imported its requirement check from the reset command and the
operator CLI. The production build passed, typecheck passed, but the integration app never became ready: the generated
`command-loaders.generated.mjs` and `search.generated.mjs` are loaded by plain Node ESM, which cannot resolve the bare
specifier `next/server` (`ERR_MODULE_NOT_FOUND ... Did you mean to import "next/server.js"?`).

**Problem**: Only the integration run (or `yarn mercato …`) loads these registries in plain Node, so the failure shows
up late, as "the app process exited before it became ready", far from the import that caused it. Anything reachable
from `commands/*.ts`, `cli.ts`, `di.ts` or a module's `index.ts` (other modules' `search.ts` and subscribers import it)
is loaded this way.

**Rule**: Keep `next/server` value imports (`NextResponse`, `NextRequest`) in route files, pages and helpers that only
routes import. A helper a command, a CLI or the module index needs goes into its own file without Next.js imports
(here `second-factor/requirement.ts`); an app route that needs a Next-bound helper imports it from its file, not from
the module index. `import type { NextResponse }` is safe (erased).

**Applies to**: `packages/app/src/modules/*/{commands,cli.ts,di.ts,index.ts}` and everything they import; the app
routes under `packages/app/src/app/**`.
