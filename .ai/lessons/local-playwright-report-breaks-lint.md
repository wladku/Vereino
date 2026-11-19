---
title: "Delete the local Playwright report before running yarn verify"
modules: ["platform"]
areas: ["testing"]
topics: ["yarn-verify", "eslint", "integration-tests"]
---

# Delete the local Playwright report before running yarn verify

**Context**: #311: after a local `yarn test:integration:vereino --filter TEST-L16`, `yarn verify` failed at `lint` with 162 `react-hooks/rules-of-hooks` errors, all in `packages/app/.ai/qa/test-results/html/trace/*.js` (the minified Playwright trace viewer).

**Problem**: `.ai/qa/test-results/` is gitignored but `yarn lint` still walks it, so a report left behind by an integration run fails the gate locally while CI (a clean checkout) passes.

**Rule**: After a local integration run, remove `packages/app/.ai/qa/test-results/` (it belongs to that run) before `yarn verify`, then resume with `yarn verify --from lint`. Do not silence it in the ESLint config without the owner's say.

**Applies to**: local gate runs after `yarn test:integration:vereino` in any worktree.
