---
title: "Narrow a CLI option only on the command the issue names, and grep the integration tests for every command you touch"
modules: ["people", "platform"]
areas: ["module-data", "testing"]
topics: ["mercato-cli", "integration-tests", "contract-narrowing", "scope"]
---

# Narrow a CLI option only on the command the issue names, and grep the integration tests for every command you touch

**Context**: #564 asked for the retention sweep (`people retention-sweep`) to accept `--today` only with `--dry-run`. PR #643 also added the same refusal to the sibling `people life-cycle` command. TEST-L07, TEST-L09 and TEST-L10 run real `life-cycle` passes on a given day (`--today` without `--dry-run`), so all three failed in CI shard 6/6 with `Cannot read properties of null (reading 'steps')`. Only TEST-086, the sweep's own test, had been run locally.

**Problem**: `life-cycle` refuses with `process.exitCode = 1; return`, which `mercato` turns into exit 0 (lesson `mercato-module-cli-exit-code`). The test fixture saw a successful run with no JSON on stdout and parsed it as `null`, so the failure pointed at a null result, not at the refusal. A refusal copied to a look-alike command breaks every older test that calls that command, and running only the issue's own test does not catch it.

**Rule**: Change only the command the issue names; a "consistent" copy to a sibling command is a separate contract change that needs its own issue. Before you push a change to a CLI command's options, grep `packages/app/.ai/qa/tests` for the command name (`'life-cycle'`, `'retention-sweep'`, …) and run every test that calls it with the changed option.

**Applies to**: `packages/app/src/modules/*/cli.ts`, job input validators in `data/validators.ts`, integration tests that call the `mercato` fixture.
