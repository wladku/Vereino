---
title: "One axe baseline entry per rule; a test reported at hours means a suspended host; db:generate for a new module needs a seed snapshot"
modules: ["groups", "platform"]
areas: ["testing", "debugging"]
topics: ["axe", "accessibility-baseline", "playwright", "host-suspend", "db-generate", "migrations"]
---

# One axe baseline entry per rule; a test reported at hours means a suspended host; db:generate for a new module needs a seed snapshot

**Context**: Issue #30 (2026-10-29) scanned the first `groups` pages with axe, ran the integration suite across a host suspend, and generated a new module's migration while Docker Desktop was down.

**Problem**: (1) `PLATFORM_BASELINE` in `packages/app/.ai/qa/tests/_fixtures/axe.ts` is searched with `find`, so a second entry for the same rule is never reached; the `AppShell` brand link (`aria-label="Go to dashboard"`, visible text = brand name) failed `label-content-name-mismatch` on pages that scan the main sidebar. (2) A run reported TEST-F01 at "1.7h" against a 300 s timeout: Playwright's own timer did not fire, the server and worker logs were silent for the same window — the host had suspended every process, the code had not hung. (3) `yarn db:generate` runs offline when a module has a snapshot; a new module without one needs an empty seed snapshot or a database.

**Rule**: Extend the existing baseline entry's node matcher for a rule (by node, never by rule) and record the owner. Before diagnosing a "hang", compare the reported duration with the test timeout and check whether logs went silent everywhere at once. Verify an offline-generated migration against a throwaway database (`db:generate` reports no changes; up, down, up as raw SQL) before committing it. On Windows, write generated files with `newline=''` (or binary) so `format:check` does not flag CRLF.

**Applies to**: `packages/app/.ai/qa/tests/_fixtures/axe.ts`; `yarn test:integration:vereino` diagnostics; `yarn db:generate` for new modules; scripts that write repository files on Windows.
