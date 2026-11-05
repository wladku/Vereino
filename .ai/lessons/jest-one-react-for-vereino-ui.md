---
title: "App Jest maps react to the app's copy, because @vereino/ui dependencies otherwise load a second React"
modules: ["ui", "platform"]
areas: ["testing"]
topics: ["jest", "react", "duplicate-react", "vereino-ui", "lucide-react", "nm-hoisting"]
---

# App Jest maps react to the app's copy, because @vereino/ui dependencies otherwise load a second React

**Context**: Issue #101 (2026-11-03) added `lucide-react` icons to `MemberShell` in `@vereino/ui`; the app's Jest test of the shell failed with `Cannot read properties of null (reading 'useContext')`.

**Problem**: With `nmHoistingLimits: workspaces`, `packages/ui/node_modules` has its own `react` and `lucide-react`. Next.js aliases every `react` import to its bundled copy, so the app works, but Jest resolves by file location: the icon's hooks ran against `packages/ui/node_modules/react` while `react-dom` from the app rendered. A hook-free component hid the problem until then.

**Rule**: `packages/app/jest.config.cjs` maps `^react$` and `^react/(.*)$` to the app's `node_modules/react`; keep that mapping. A runtime dependency of a `@vereino/ui` component is declared as a `peerDependency` of `@vereino/ui` in the app's version range.

**Applies to**: `packages/app/jest.config.cjs`, `packages/ui/package.json`, any app Jest test that renders a `@vereino/ui` component with hooks.
