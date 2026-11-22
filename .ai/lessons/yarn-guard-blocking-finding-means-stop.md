---
title: "A yarn guard finding means stop and ask; fixtures that name test markers are built from parts"
modules: ["platform"]
areas: ["testing"]
topics: ["yarn-guard", "test-weakening", "dependencies", "quarantine"]
---

# A yarn guard finding means stop and ask; fixtures that name test markers are built from parts

**Context**: #520 added `yarn guard` (`scripts/guard.mjs`), which blocks a PR that deletes a test, adds a skip/only/x-prefixed test or an unquarantined `fixme`, lowers coverage, adds a dependency or a lockfile package, or adds a secret. Its own test file first held the literal `'.only('` and the guard blocked the PR that introduced it.

**Problem**: The guard reads added lines of test files as text, so a fixture string that names a marker counts as the marker. Under pressure to turn CI green, the tempting "fix" for a real finding is to dodge the pattern (rename, move the test, edit the guard), which defeats the gate the merge train relies on.

**Rule**: Run `yarn guard` before pushing. A blocking finding on real code means: stop, explain it in the PR and ask the owner; only the owner adds `guard-approved`. A test that must be switched off for a failure outside the PR uses `test.fixme` with `// quarantine: #<issue>` on the same line or the line above, and the issue must be open and labelled `bug`. When a test file must contain a marker as data (tests of tooling), assemble it from parts (`['it', '.on', 'ly('].join('')`), as the secrets tests do for sample secrets.

**Applies to**: `scripts/guard.mjs`, `packages/app/scripts/__tests__/guard.test.mjs`, the CI `gate` job, SDLC.md "Validation gate", every autonomous fix run.
