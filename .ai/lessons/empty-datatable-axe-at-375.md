---
title: "An empty platform DataTable fails axe scrollable-region-focusable at 375 px; render the empty state outside the table"
modules: ["people", "platform"]
areas: ["backend-ui"]
topics: ["data-table", "axe", "empty-state", "mobile"]
---

# An empty platform DataTable fails axe scrollable-region-focusable at 375 px; render the empty state outside the table

**Context**: Issue #28 (2026-10-30) added the import history page `/backend/people/imports`, checked with axe at 375 px.

**Problem**: With no rows, the platform `DataTable` scroll wrapper has nothing focusable and axe reports `scrollable-region-focusable` at 375 px. fast-xml-parser 5 (used by the XLSX reader) also neither decodes numeric character references nor throws on broken XML.

**Rule**: Render an empty list as a heading and a sentence instead of an empty `DataTable`; add no axe baseline entry for it. Decode numeric character references yourself and validate the structure you read from fast-xml-parser.

**Applies to**: Vereino list pages and `people/lib/import-xlsx.ts`.
