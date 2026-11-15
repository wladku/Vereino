---
title: "@vereino/ui takes the platform API client as an argument instead of importing it"
modules: ["ui"]
areas: ["architecture", "testing"]
topics: ["vereino-ui", "typecheck", "apicall", "dependency-injection"]
---

# @vereino/ui takes the platform API client as an argument instead of importing it

**Context**: #258 added `useMemberNavFeatures` to `@vereino/ui`. Its first version imported `apiCall` from `@open-mercato/ui/backend/utils/apiCall`. The unit tests passed, but `yarn verify` failed at `typecheck:packages`: the import resolved to the platform's TypeScript sources (`node_modules/@open-mercato/ui/src/backend/...`), which do not pass `@vereino/ui`'s stricter compiler options (TS2322, TS18048, TS2488).

**Problem**: `@open-mercato/ui` publishes its sources as types, so a value import from a deep backend path makes the package typecheck the platform's code. Primitives (`primitives/button`, `primitives/select`) are fine; the backend utilities are not.

**Rule**: In `packages/ui`, import only `@open-mercato/ui/primitives/*` and the schedule types. Anything that talks to the server (`apiCall`, queries) is injected by the app: a hook or component takes the client as an argument (`useMemberNavFeatures(apiCall)`, the audience picker's `request`). Run `yarn typecheck:packages` before calling a `@vereino/ui` change done.

**Applies to**: `packages/ui/src/**`, `yarn verify` step `typecheck:packages`.
