---
title: "Search tokens are rebuilt from the stored row: hide a record from name search by filtering, not by deleting tokens"
modules: ["people", "platform"]
areas: ["module-data"]
topics: ["search", "query-index", "erasure", "privacy"]
---

# Search tokens are rebuilt from the stored row: hide a record from name search by filtering, not by deleting tokens

**Context**: Issue #308 (people life-cycle spec phase L6, 2026-11-20) anonymises a former person but keeps the name under a retention hold (DD-L07), and the acceptance criterion says a search by the old name finds nothing.

**Problem**: The platform `query_index` builds `search_tokens` from the decrypted index document of the stored row (`query_index/lib/search-tokens.ts`, `subscribers/upsert_one.ts`). Deleting a record's tokens or index doc does not last: the next `people.person.updated` reindex, a full reindex, or the hybrid engine's auto-reindex on partial coverage writes them back from the same row. Deleting the index doc can also make the list query fall back or reindex.

**Rule**: While a value must stay in the row, keep it out of search at read time: every Vereino token search (`searchPersonIds` in `people/services/person-directory.ts`, the list's `search`) drops the hidden records by a plain column (`anonymized_at`), and the global search presenter shows a label instead of the value. Clear the value in the row when it may go; the next reindex then rebuilds empty tokens.

**Applies to**: `people` name search and any module that must hide a still-stored, token-indexed value (erasure with a retention hold, soft privacy states).
