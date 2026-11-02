---
title: "Code that platform workers or the CLI load may import only .ts from @vereino/ui, and the notification delivery strategies exist only in the web runtime"
modules: ["foundation", "platform", "notifications"]
areas: ["architecture", "integration"]
topics: ["workers", "cli", "tsx", "notifications", "di", "email"]
---

# Code that platform workers or the CLI load may import only .ts from @vereino/ui, and the notification delivery strategies exist only in the web runtime

**Context**: Foundation III phase A (#71, 2026-11-02) renders e-mails in the `foundation:dispatch-deliver` worker and creates in-app notifications from it.

**Problem**: Three runtime differences from the Next app showed up only when the worker ran.
- The CLI and worker bundle keep `@vereino/*` external and Node cannot load `.tsx`, so a `EmailLayout.tsx` imported by worker code crashed `yarn start`.
- Importing `@vereino/ui` from a file on the generated DI registry's import graph broke TypeScript's `@types/react` deduplication, with unrelated errors in `@open-mercato/ui` primitives.
- The platform registers its notification delivery strategies only in the web runtime (`runBootstrapRegistrations`, `bootstrap-common.ts`), not in the CLI and worker bootstrap. A `createBatch` without `channels` from a worker stores "all channels" and runs no strategy, while the same call in the web runtime would also e-mail.

**Rule**: Worker-reached code imports `@vereino/ui` only through a `.ts` subpath export (`@vereino/ui/emails`) and keeps it off `di.ts`'s import graph. Every `createBatch` names `channels` explicitly, and a test that checks "no platform e-mail" registers the strategies as the web runtime does.

**Applies to**: workers, CLI commands and subscribers of Vereino modules; any React rendering on the server outside Next.
