---
title: "A module CLI command fails by throwing, never by setting process.exitCode"
modules: ["people", "platform"]
areas: ["module-data", "testing"]
topics: ["exit-code", "mercato-cli"]
---

# A module CLI command fails by throwing, never by setting process.exitCode

**Context**: #564 made `yarn mercato people retention-sweep --today …` without `--dry-run` print its usage and set `process.exitCode = 1`. TEST-086 expected the run to exit 1, but it exited 0.

**Problem**: `@open-mercato/cli` runs a module command as `await cmd.run(rest); return 0`, and `bin.js` ends with `process.exit(code ?? 0)`. The explicit `process.exit(0)` replaces any `process.exitCode` the command set. Only an exception gives exit code 1 (`💥 Failed: …` on stderr). About 30 Vereino CLI commands still use the `process.exitCode = 1; return` pattern, so a script or CI step that relies on their exit status sees success after a usage error or a failed step.

**Rule**: In a `ModuleCli.run`, report a usage error or a failed step by throwing an `Error`. Do not set `process.exitCode`. Write the usage text to stderr and give the thrown message an `[internal] ` prefix: `i18n:check-hardcoded --strict` flags any other `throw new Error('…')` text. A test that asserts a refusal checks for the non-zero exit (`mercato()` throws `exited 1`).

**Applies to**: `packages/app/src/modules/*/cli.ts`, integration tests that call the `mercato` fixture.
