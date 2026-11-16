---
title: "makeCrudRoute sorts by one default key plus an ascending tiebreak; NULLs come first in a descending sort"
modules: ["payments", "platform"]
areas: ["module-data"]
topics: ["sorting", "make-crud-route", "list-routes"]
---

# makeCrudRoute sorts by one default key plus an ascending tiebreak; NULLs come first in a descending sort

**Context**: #292 changed the default order of `GET /api/payments/charges` to "period descending, then due date" (Contract 3 of the payments parity spec). The spec's API table asked for `due_date` descending as the second key.

**Problem**: `makeCrudRoute` `list.defaultSort` takes one `{ field, dir }`; the only second key is `list.tiebreakSortField`, which the factory always appends **ascending** (then `id` ascending). A second descending key needs a custom list query. The query engine orders base columns with a plain `ORDER BY col DESC`, so rows whose key is `NULL` (charges of orders and rentals have no `period_label`) come **first**. Clients that send `sortField` override the default, so a B-21 that kept sending `sortField=dueDate` would never see the new order.

**Rule**: For a route's default order use `defaultSort` + `tiebreakSortField` (ascending) and write the direction into the spec; do not promise a second descending key. Keep `sortField` optional without a zod `.default()`, add the field to `sortFieldMap` and the query schema's enum, and stop the page's client from sending its own sort. Expect NULL keys first under a descending default.

**Applies to**: list routes built with `makeCrudRoute` (`packages/app/src/modules/*/api/**/route.ts`), e.g. `payments/api/charges/route.ts`.
