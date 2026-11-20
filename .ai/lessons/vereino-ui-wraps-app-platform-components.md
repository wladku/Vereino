---
title: "@vereino/ui wraps platform components the app passes in, because its own @open-mercato/ui copy has other React contexts"
modules: ["ui", "platform"]
areas: ["architecture", "backend-ui"]
topics: ["vereino-ui", "nm-hoisting", "radix", "react-context", "dialog", "focus-return"]
---

# @vereino/ui wraps platform components the app passes in, because its own @open-mercato/ui copy has other React contexts

**Context**: #481 (2026-11-20) needed every Vereino dialog to return focus to its opener. The first version put a `DialogContent` wrapper in `@vereino/ui` that imported `DialogContent` from `@open-mercato/ui/primitives/dialog`; the app would then render the app's `Dialog` root around the wrapper's content.

**Problem**: With `nmHoistingLimits: workspaces`, `packages/ui/node_modules` holds its own `@open-mercato/ui`, `@open-mercato/shared` and `@radix-ui/react-dialog`. Next.js aliases only `react`; Jest and Node resolve the others by file location (lesson `jest-one-react-for-vereino-ui`), and nothing in `next.config.ts` dedupes them, so a platform component imported inside `packages/ui` can be a second module instance. Mixed with the app's copy, its Radix context (`DialogContent` inside `Dialog`) and the `I18nProvider` context of `useT` are not the ones the app provides, and the content throws "must be used within `Dialog`" / "useT must be used within I18nProvider". The unit test in `packages/ui` cannot show it: there both parts come from the same copy.

**Rule**: A `@vereino/ui` helper that must sit inside a platform component tree takes the platform component as an argument (`withReturnFocusContent(PlatformDialogContent, 'DialogContent')`) and imports only React; the app instantiates it once (`packages/app/src/components/ui/dialog.tsx`) with its own copy. Do not mix a platform root from one copy with its parts from the other. Vereino modules import `DialogContent` / `SheetContent` from `@/components/ui/dialog` (ESLint `no-restricted-imports`).

**Applies to**: `packages/ui/src/**`, `packages/app/src/components/ui/dialog.tsx`, `eslint.vereino.mjs` (`DIALOG_CONTENT_RESTRICTIONS`); see also lessons `jest-one-react-for-vereino-ui` and `vereino-ui-imports-no-platform-client-sources`.
