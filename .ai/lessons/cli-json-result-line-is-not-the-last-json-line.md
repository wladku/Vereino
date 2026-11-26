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

**Update (PR #829, 2026-11-26)**: the cause is the logger's stream, not only the boot order. Pino's default
destination is an asynchronous sonic-boom on fd 1, while `process.stdout.write` to a pipe is synchronous, so a record
logged *before* the result line can still be written *after* it. TEST-M06 (`foundation club-jobs sweep`) failed twice
in a row on CI with `sweeps.sweeps` undefined: the parser read a log record (most likely the command's last
`{"level":30,…,"msg":"Club job sweep finished"}`), not `{"sweeps":…}`. The
shared `mercato()` / `mercatoAsync()` helpers in `_fixtures/club.ts` now run the CLI with `OM_LOG_DESTINATION=stderr`
(the platform logger's own switch), so stdout carries only the command's output. A new helper that spawns
`yarn mercato` and parses stdout sets the same variable.

**Applies to**: `packages/app/src/modules/*/cli.ts`, `club_core/services/offboarding-cli.ts`, the `mercato()` /
`clubCli()` helpers of `packages/app/.ai/qa/tests`.
