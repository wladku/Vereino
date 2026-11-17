---
title: "Integration tests read UI texts from the catalogs, never as literals"
modules: ["platform"]
areas: ["testing"]
topics: ["i18n", "integration-tests"]
---

# Integration tests read UI texts from the catalogs, never as literals

**Context**: On 2026-11-15 #319 changed Polish wording to the mockup's glossary ("trenerzy" → "prowadzący", "Wyloguj się" → "Wyloguj"). Its own E06-S15 and TEST-047 failed on the old wording, and #320, merged with `main` seconds later, failed because its new E09-S04 still looked for "Wyloguj się". Each failure showed only in the integration shards, after about 25 minutes of CI.

**Problem**: A test that writes a label as `/^(Sign out|Wyloguj się)$/` copies the catalog. Any wording change, made in the same PR or in a PR merged meanwhile, breaks it, and only the integration run notices.

**Rule**: Write UI texts as `uiText('<key>')` from `.ai/qa/tests/_fixtures/ui-text.ts`. Use `{ exact: true }` for a whole text, and `params` for placeholders; a placeholder without a value matches any text. `qa-texts:check` (`yarn verify`) fails on a key missing from either catalog. It also fails on more hardcoded bilingual texts in a file than `packages/app/scripts/vereino-ui-texts.baseline.json` allows; when you remove some, lower that file's entry. Data the test created itself (names, reasons) stays literal. Name the key the component on that page renders: read its `t('…')` call, and never pick a key only because its text matches. Many keys share "Create", "All" or "Save". On 2026-11-17 TEST-N03 checked the threads tabs' "All" through `activities.occurrences.perspectives.all`, and #340's rename of that activities text to "Upcoming" broke it. A helper used on several pages, such as a person picker, takes the pattern (`uiText('<key>')`) as an argument, so `qa-texts:check` still sees the key. `{ exact: true }` anchors the pattern (`^…---
title: "Integration tests read UI texts from the catalogs, never as literals"
modules: ["platform"]
areas: ["testing"]
topics: ["i18n", "integration-tests"]
---

# Integration tests read UI texts from the catalogs, never as literals

**Context**: On 2026-11-15 #319 changed Polish wording to the mockup's glossary ("trenerzy" → "prowadzący", "Wyloguj się" → "Wyloguj"). Its own E06-S15 and TEST-047 failed on the old wording, and #320, merged with `main` seconds later, failed because its new E09-S04 still looked for "Wyloguj się". Each failure showed only in the integration shards, after about 25 minutes of CI.

**Problem**: A test that writes a label as `/^(Sign out|Wyloguj się)$/` copies the catalog. Any wording change, made in the same PR or in a PR merged meanwhile, breaks it, and only the integration run notices.

), so it matches only a locator whose whole text is that label: use it with `getByRole(..., { name })` or `getByText`, never with `toContainText` on a section or a page, which then never matches (#279 lost two TEST-R07 runs to it, #298 one TEST-C11 run; promoted to `AGENTS.md` → Validation).

**Applies to**: every file under `packages/app/.ai/qa/tests`.
