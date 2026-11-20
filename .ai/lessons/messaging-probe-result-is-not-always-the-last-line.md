---
title: "Read the messaging probe's result line by its shape, not as stdout's last line"
modules: ["platform", "communication"]
areas: ["testing"]
topics: ["integration-tests", "messaging-probe", "flaky", "stdout"]
---

# Read the messaging probe's result line by its shape, not as stdout's last line

**Context**: PR #432 (2026-11-20). `J-003-cancellation-announcement-case` failed in CI shard 4/6 on both attempts at `expect(probe.result.failure).toBeNull()` with `Received: undefined`. The probe always writes `failure` (`null` or a message), so the parsed line was not the result. `runProbe` took stdout's last line, and that was a JSON line from the app's logger (pino), written after the result and before `process.exit`. The test passed locally on its own (54.5 s) and on `main`. The failure depended on load: a log line logged during the drain landed after the result.

**Problem**: An app that logs JSON to stdout can interleave lines with the probe's own output. Any parser that trusts line position turns a passing step into an unrelated assertion failure.

**Rule**: `runProbe` (`_fixtures/messaging.ts`) picks the last stdout line that parses to an object with `failure` and an `outputs` array, and treats the other lines as the log. When a QA probe prints a result to a process that also runs the app, identify the result by its shape or a marker, never by its position.

**Applies to**: `packages/app/.ai/qa/tests/_fixtures/messaging.ts`, `messaging-probe/probe.mjs`, and any other spawned probe whose stdout the tests parse.
