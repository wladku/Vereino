---
title: "A success toast repeats the value of the record it announces; read the value from the record's test id, not a page-wide getByText"
modules: ["platform", "payments"]
areas: ["testing"]
topics: ["playwright", "strict-mode", "toast", "flaky-test"]
---

# A success toast repeats the value of the record it announces; read the value from the record's test id, not a page-wide getByText

**Context**: PR #422 (docs only): `integration (shard 5/6)` failed on both attempts in TEST-046 (`payments/TEST-046-cash-handover.spec.ts`, from #421). After the handover was accepted, the test read the new number with `page.getByText(/RG\/\d{4}\/\d{2}\/001/)` and got `strict mode violation … resolved to 2 elements`: the toast `Handover RG/2026/11/001 accepted` and the history row `<span data-testid="handover-number">RG/2026/11/001</span>`. It passed on `main` (run 44661705064), where the history refetch landed after the read.

**Problem**: A flash message names the record it created (number, name, code), and the page refetches its list right after the mutation. Whether one or two elements match a page-wide `getByText` of that value depends only on how fast the refetch is, so the test passes locally and fails under CI load.

**Rule**: Read a created record's value from its own element (`getByTestId(...)`, a row scoped locator) and then assert the toast with its full catalog text (`uiText('<key>', { params })`), which only the toast contains. Never locate a value that both a toast and a list show with a page-wide `getByText` regex.

**Applies to**: integration tests under `packages/app/.ai/qa/tests/**` that assert a flash message after a create or accept action.
