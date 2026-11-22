---
title: "A QA probe that calls a compiled makeCrudRoute write lets its bundled commands replace the bootstrapped ones"
modules: ["activities", "foundation"]
areas: ["testing"]
topics: ["integration-probe", "command-registry", "make-crud-route", "occupancy-provider"]
---

# A QA probe that calls a compiled makeCrudRoute write lets its bundled commands replace the bootstrapped ones

**Context**: #590 (TEST-G04) needed the activity create route to answer with a throwing `vereino.occupancyProvider`, which the running app (whose `facilities` module registers the provider) cannot do. The `occupancy-provider-probe` boots the app like the CLI, swaps the token in every container through `registerDiRegistrars`, compiles the route with `compileAppSourceFile` (as the messaging probe's `routeGet` does) and calls `POST` with a bearer token.

**Problem**: The compiled bundle carries its own copy of the module's command files. Importing it, and again the first write (`makeCrudRoute` loads command modules lazily), calls `registerCommand` for ids the bootstrap already registered, and the platform registry throws `Duplicate command registration` outside development. The route turns that into a 500 `INTERNAL_ERROR` that looks exactly like the expected fail-closed answer; only a provider call counter showed the provider was never reached. Restoring the registry right after the import is not enough, because the lazy load happens on the first request.

**Rule**: In a probe that calls a compiled route's write method, wrap `commandRegistry.register` for the whole process so a registration replaces the handler of the same id (unregister, then register), as the registry does in development. When the expected answer is an error, assert a probe-side signal that the code under test ran (a call counter on the fake, the token lookup) besides the status, so an unrelated 500 cannot pass. A GET on a CRUD route loads no commands and needs no wrap.

**Applies to**: `packages/app/.ai/qa/tests/_fixtures/*-probe/probe.mjs` that import a route through `compileAppSourceFile`; `TEST-G04-occupancy-provider-failure`.
