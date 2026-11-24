---
title: "ds:check reads a bracketed `[word: …]` string literal as an arbitrary Tailwind value"
modules: ["people", "platform"]
areas: ["testing"]
topics: ["ds-check", "design-system", "string-literals", "false-positive"]
---

# ds:check reads a bracketed `[word: …]` string literal as an arbitrary Tailwind value

**Context**: #527 (2026-11-22). The person data export marks a withheld PESEL with the spec value `[withheld: people.pesel.view]` (DD-X08), defined as a constant in `people/lib/data-export.ts`.

**Problem**: `yarn ds:check` (a `yarn verify` step) applies the `arbitrary-tailwind` rule to every string and comment in `src/**`. Its pattern `^\[[a-z-]+:[^\]]+\]` (an arbitrary property such as `[mask-type:luminance]`) also matches the plain text `[withheld: …]`, in a string, a template literal or a doc comment. The repository has no `.ds-check-ignore` file.

**Rule**: For a non-CSS value that must look like `[word: …]`, build it from parts so no source token starts with `[word:`, e.g. `'[' + \`withheld: ${FEATURE}\` + ']'`. Explain why in a comment that does not contain the bracketed text itself, and pin the value with a unit test. Do not add an ignore file just for this.

**Applies to**: `packages/app/src/**` string constants and comments checked by `packages/app/scripts/ds-check.mjs`.
