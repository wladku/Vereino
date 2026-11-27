---
title: "A module CLI prints its result as one compact JSON line; the test fixture reads the last line starting with {"
modules: ["enrolment", "platform"]
areas: ["testing"]
topics: ["cli", "integration-tests", "json"]
---

# A module CLI prints its result as one compact JSON line; the test fixture reads the last line starting with {

**Context**: #800 (2026-11-27) added `yarn mercato enrolment applicant-data` and first printed its applications with
`JSON.stringify(value, null, 2)`. TEST-J11 failed with `SyntaxError: Expected property name or '}' in JSON at position
5` in `lastJsonLine` (`_fixtures/club.ts`).

**Problem**: The integration fixture `mercato()` takes the last stdout line that starts with `{` and parses it; a
pretty-printed object spans many lines, so the parsed "line" is a fragment.

**Rule**: A module CLI command writes its machine-readable result as one line: `JSON.stringify(value)` plus `\n`
(the pattern of every `cli.ts` job command). Human-friendly output, if any, goes to stderr.

**Applies to**: `packages/app/src/modules/*/cli.ts`; `packages/app/.ai/qa/tests/_fixtures/club.ts` `mercato`.
