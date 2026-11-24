---
title: "A module CLI's JSON result is not always the last JSON line: tests pick the line with a status, and commands check options before the app boots"
modules: ["club_core", "platform"]
areas: ["testing", "integration"]
topics: ["cli", "stdout", "pino", "integration-tests", "operator-commands"]
---

# A module CLI's JSON result is not always the last JSON line: tests pick the line with a status, and commands check options before the app boots

**Context**: TEST-M07 (#632, 2026-11-23) ran `yarn mercato club_core offboard-club --notice-days 5` and expected the
`{"status":"invalid",…}` line. Under the ephemeral runner (`NODE_ENV=production`) the app's logger prints JSON lines
(`{"level":30,…,"msg":"pg pool created with options"}`) to stdout, and one came after the command's line, so the
test's "last line that starts with `{`" parser read a log line. It passed against a dev shell, where the logger prints
plain text.

**Problem**: Any operator command that prints one JSON result line shares stdout with the platform logger. Booting the
container (`createRequestContainer`) opens the database pool and logs; work after the result line can log too.

**Rule**: In a test, take the last stdout line that parses as JSON **and has the command's own key** (`status`), not
the last line starting with `{`. In a command, validate the options before `createRequestContainer()`, so a usage
error answers before anything boots or logs. Document the result line as "one JSON object with a `status`; platform
log lines may follow it" (as `BACKWARD_COMPATIBILITY.md` does for `sync-role-acls-if-changed`).

**Applies to**: `packages/app/src/modules/*/cli.ts`, `club_core/services/offboarding-cli.ts`, the `mercato()` /
`clubCli()` helpers of `packages/app/.ai/qa/tests`.
