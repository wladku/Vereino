---
title: "A new script under the 100 % rule goes into test:scripts and coverage-scope.test.mjs together"
modules: ["platform"]
areas: ["testing"]
topics: ["coverage", "test-scripts", "tooling-scripts"]
---

# A new script under the 100 % rule goes into test:scripts and coverage-scope.test.mjs together

**Context**: #450 added `scripts/merge-train-trailers.mjs` and its `--test-coverage-include` in the `test:scripts` script of `packages/app/package.json`. `yarn verify` failed at `test:scripts` on `the coverage globs match the test:scripts script`, although every test of the new module passed at 100 %.

**Problem**: `packages/app/scripts/__tests__/coverage-scope.test.mjs` keeps its own copy of the include list (`COVERED_GLOBS` and the expected array) and a minimum file count, so the guard can load every covered file. Editing only `package.json` breaks it; editing only the guard lets the file escape the threshold.

**Rule**: When a tooling script joins the 100 % coverage rule, add it in the same order to the `test:scripts` includes, to `COVERED_GLOBS` and to the expected array in `coverage-scope.test.mjs`, and raise the `files.length >=` minimum by one.

**Applies to**: `packages/app/package.json` (`test:scripts`), `packages/app/scripts/__tests__/coverage-scope.test.mjs`, any new file in `scripts/` or `packages/app/scripts/` under the 100 % rule.
