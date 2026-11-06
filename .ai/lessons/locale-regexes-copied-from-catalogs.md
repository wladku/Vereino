---
title: "Copy both locales' strings for a UI test regex from the i18n catalogs, never translate them by hand"
modules: ["activities", "platform"]
areas: ["testing"]
topics: ["integration-tests", "playwright", "i18n", "locale", "assertions"]
---

# Copy both locales' strings for a UI test regex from the i18n catalogs, never translate them by hand

**Context**: E06-S16 (#98). The integration test matched the pending declaration badge with
`/Awaiting guardian confirmation|Oczekuje na potwierdzenie opiekuna/`. The browser ran in Polish and rendered the
catalog value `Czeka na potwierdzenie opiekuna`, so the assertion timed out after a full build and test run, while
the feature itself worked.

**Problem**: The test browser's locale follows the member's or the club's default and is often Polish. A Polish
alternative written from memory looks plausible but rarely matches the catalog word for word, and the mismatch costs
a whole integration run (build + Testcontainers) to find.

**Rule**: Every `en|pl` alternative in a Playwright regex is copied from `i18n/en.json` and `i18n/pl.json` of the
module that renders it (grep the key first). Prefer asserting a `data-testid` or a `data-*` state attribute, and use
text only where the wording is the requirement (a toast naming the ward, an empty-state sentence).

**Applies to**: `packages/app/.ai/qa/tests/**` — every UI assertion on translated text.
