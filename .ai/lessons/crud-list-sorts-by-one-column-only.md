---
title: "A CRUD list sorts by one column; an order by an expression is read by an ORM service under the same scope"
modules: ["groups", "platform"]
areas: ["module-data", "architecture"]
topics: ["crud-list", "sorting", "query-engine", "paging"]
---

# A CRUD list sorts by one column; an order by an expression is read by an ORM service under the same scope

**Context**: The B-12 roster (#267, parity spec REQ-A03) must list coaches, then assistants, then participants, the
latest start first, with server paging. `makeCrudRoute`'s query-engine list takes one `sortField` (mapped through
`sortFieldMap` to a column) plus an optional ascending tiebreak; a `case` on `role` cannot be expressed there, and
the alphabetical order of the role values (`assistant`, `coach`, `participant`) is not the wanted one.

**Problem**: Sorting one page on the client (or in `afterList`) looks right on page 1 but breaks paging: rows move
between pages and a long roster drops or repeats rows.

**Rule**: Keep the CRUD list for every ordinary sort and route only the expression sort (`sortField=roster`) to a small
service that reads with MikroORM `findAndCount` and `orderBy: [{ [raw((alias) => 'case …')]: 'asc' }, …, { id: 'asc' }]`,
under the same record scope (`readableGroupIds` / the same `buildFilters` conditions), and answers the same
`{ items, total, page, pageSize, totalPages }` shape. Assert in an integration test that every row of every view is
reachable page by page and that the totals agree with the CRUD list.

**Applies to**: `groups/api/memberships/route.ts`, `groups/services/roster-list.ts`; any Vereino list that needs an
order by a computed rank.
