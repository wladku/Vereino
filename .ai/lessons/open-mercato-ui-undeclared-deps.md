---
title: "Add Open Mercato UI's undeclared dependencies to any workspace that renders its primitives"
modules: ["platform"]
areas: ["architecture", "backend-ui"]
topics: ["dependencies", "open-mercato-ui", "workspaces", "storybook"]
---

# Add Open Mercato UI's undeclared dependencies to any workspace that renders its primitives

**Context**: Setting up Storybook in `packages/ui` (2026-10-27, branch `build/storybook-ui`) was the first time a workspace other than `packages/app` imported `@open-mercato/ui/primitives/*`. `yarn workspace @vereino/ui typecheck` failed with "Cannot find module 'class-variance-authority'", `lucide-react` and `tailwind-merge` from files inside `@open-mercato/ui/src` and `@open-mercato/shared/src`.

**Problem**: `@open-mercato/ui` 0.9.0 imports `class-variance-authority`, `clsx`, `lucide-react` and `tailwind-merge` but lists none of them in `dependencies` or `peerDependencies`. Inside `packages/app` they resolve because the app depends on them; with `nmHoistingLimits: workspaces` every other workspace has its own `node_modules`, so the imports fail there. The platform ships TypeScript sources as its types, so the error appears in typecheck as well as at runtime.

**Rule**: A workspace that renders Open Mercato UI primitives (`packages/ui`, Storybook, tests) declares `class-variance-authority`, `clsx`, `lucide-react` and `tailwind-merge` itself, with the same ranges as `packages/app/package.json`, so the lock file reuses the app's versions. Recheck the list when `@open-mercato/ui` is upgraded: compare its imports with its `dependencies`.

**Applies to**: `packages/ui/package.json`; any new workspace importing `@open-mercato/ui`; platform upgrades (P1…P6).
