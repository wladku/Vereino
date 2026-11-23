---
title: "A module CLI command exits non-zero only by throwing; process.exitCode is dropped by the mercato runner"
modules: ["platform", "club_core"]
areas: ["module-data", "testing"]
topics: ["mercato-cli", "exit-code", "integration-tests"]
---

# A module CLI command exits non-zero only by throwing; process.exitCode is dropped by the mercato runner

**Context**: `club_core create-club` (#630) set `process.exitCode = 1` for invalid options and refusals, as the platform's own `auth setup` does. TEST-M01 saw exit 0 for a reserved slug.

**Problem**: `@open-mercato/cli` runs a module command with `await cmd.run(rest); return 0`, and `bin.js` then calls `process.exit(code)`, so a `process.exitCode` set inside `run` never reaches the shell. Only a thrown error makes the runner print `Failed: …` and return 1. Several existing Vereino commands still set `process.exitCode = 1` on a usage error and therefore exit 0.

**Rule**: In a module `cli.ts`, print the machine-readable result first (the last JSON line on stdout), then `throw new Error(…)` for every outcome that must exit non-zero. Never rely on `process.exitCode`. A test that asserts a failure checks the exit status, not only the printed JSON.

**Applies to**: `packages/app/src/modules/*/cli.ts`, operator runbooks in `docs/ops/` that branch on exit codes, integration tests that spawn `yarn mercato`.
