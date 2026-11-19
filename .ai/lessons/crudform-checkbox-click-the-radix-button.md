---
title: "Click a CrudForm checkbox through its Radix button, never its hidden input; keep only dt/dd groups in a dl"
modules: ["payments", "platform"]
areas: ["testing", "backend-ui"]
topics: ["crudform", "checkbox", "playwright", "axe", "definition-list"]
---

# Click a CrudForm checkbox through its Radix button, never its hidden input; keep only dt/dd groups in a dl

**Context**: The first CI run of `TEST-C15-online-payment-tab-ui` (PR #401, issue #302) timed out after 5 minutes. It clicked `[data-crud-field-id="method_card"] input`. On the same run, `E07-S01` failed its axe scan of `/backend/payments/settings` with a `definition-list` violation: a hint `<p>` had been placed directly inside the group's `<dl>`. The test was written on a host where Chromium cannot start, so CI was the first browser run.

**Problem**: A CrudForm `checkbox` field renders a Radix `button[role="checkbox"]` and a hidden native `<input aria-hidden tabindex="-1">`. Playwright resolves `… input` to the hidden input, the group card intercepts the pointer, and `click()` retries until the test timeout. Separately, axe allows only `dt`/`dd` groups (optionally wrapped in a `div`), `script` and `template` inside a `<dl>`. Any other child fails every page-level axe check, including those in other stories' tests.

**Rule**: In integration tests, target a CrudForm checkbox with `[data-crud-field-id="<id>"] button[role="checkbox"], [data-crud-field-id="<id>"] input[type="checkbox"]` and `.first()`. `toBeChecked` also works on that button. In components, put notes and hints outside the `<dl>`. A UI test that could not run locally will first run in CI, so watch the axe scans of neighbouring stories on the same page too.

**Applies to**: `packages/app/.ai/qa/tests/**` that toggle CrudForm checkboxes; read-only fact lists (`<dl>`) in a CrudForm group `component`.
