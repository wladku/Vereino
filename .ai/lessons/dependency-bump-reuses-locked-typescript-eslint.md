---
title: "A dependency bump must not install a second typescript-eslint copy: reuse the locked one, do not dedupe upward"
modules: ["platform"]
areas: ["debugging"]
topics: ["yarn-lock", "dependencies", "eslint", "typescript-eslint", "yarn-guard", "security-advisories"]
---

# A dependency bump must not install a second typescript-eslint copy: reuse the locked one, do not dedupe upward

**Context**: #454 (2026-11-22) raised `next` and `eslint-config-next` 16.3.6 → 16.4.6. `eslint-config-next` 16.4.6 asks for `typescript-eslint@^8.56.0`. A plain `yarn install` resolved that to a new 8.73.0 beside the app's own `typescript-eslint` 8.71.2. `yarn lint` then crashed with `ConfigError: Config "typescript-eslint/base": Key "plugins": Cannot redefine plugin "@typescript-eslint"`. `yarn dedupe typescript-eslint '@typescript-eslint/*'` fixed lint by moving everything up to 8.73.0. It also brought in `minimatch` 11 and its new dependency `@isaacs/nonrecursive-glob-match`, and `yarn guard` blocked that (`new-lock-package`).

**Problem**: Yarn resolves a new range to the newest release instead of reusing a locked one that also satisfies it. ESLint flat config refuses two copies of the same plugin. Deduping upward pulls in new transitive packages, and the guard treats each one as a new dependency (Ask First).

**Rule**: When a bump adds a range for a package that is already locked (`typescript-eslint`, `@typescript-eslint/*`, any ESLint plugin), make the new range use the locked entry. Start from `main`'s `yarn.lock`, add the new descriptor to the existing entry's key line (for example `"typescript-eslint@npm:^8.56.0, typescript-eslint@npm:^8.71.2":`), then run `yarn install`. Check that `yarn why <pkg>` shows one version, that `git diff yarn.lock | grep '^+"'` shows only the packages you meant to change, and that `yarn guard` passes before running the gate.

**Applies to**: `yarn.lock`, `packages/app/package.json` dependency bumps (P2/P6 security fixes, platform upgrades), `yarn lint`, `yarn guard`.
