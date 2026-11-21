---
title: "A new tooling script joins the 100 % rule by its name; only an exclusion edits test:scripts"
modules: ["platform"]
areas: ["testing"]
topics: ["coverage", "test-scripts", "tooling-scripts"]
---

# A new tooling script joins the 100 % rule by its name; only an exclusion edits test:scripts

**Context**: #450 added `scripts/merge-train-trailers.mjs` and its `--test-coverage-include` in the `test:scripts` script of `packages/app/package.json`. `yarn verify` failed at `test:scripts` on `the coverage globs match the test:scripts script`, although every test of the new module passed at 100 %: `coverage-scope.test.mjs` then kept its own copy of the include list and a minimum file count. #504 replaced both lists with globs (lesson `coverage-scope-by-convention`).

**Problem**: A script under the rule that no test loads escapes the coverage report; a hand-kept list of covered files makes every tooling PR edit the same lines.

**Rule**: Do not add a `--test-coverage-include` for a new tooling script and do not edit `coverage-scope.test.mjs`: a root `scripts/*.mjs`, a `packages/app/scripts/vereino-*.mjs` or `check-*.mjs` is covered by its name, and the guard loads it. Ship its tests at 100 %. Only a root script that must stay outside the rule (platform scaffold, an I/O wrapper whose logic sits in a covered `*-plan.mjs`) gets a `--test-coverage-exclude`, with that reason.

**Applies to**: `packages/app/package.json` (`test:scripts`), `packages/app/scripts/__tests__/coverage-scope.test.mjs`, any new file in `scripts/` or `packages/app/scripts/`.
