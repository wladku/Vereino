---
title: "Pin a response's meta object exactly only together with every field other open PRs add"
modules: ["payments", "testing"]
areas: ["testing"]
topics: ["integration-tests", "semantic-merge-conflict", "list-meta"]
---

# Pin a response's meta object exactly only together with every field other open PRs add

**Context**: #385 (TEST-C01) asserted `GET /api/payments/charges` `meta` with `toEqual({ rentalsPerspective: true })` while #391 (#296) added `meta.toRefundCount` to the same object. Each PR was green on its own; after `main` with #385 was merged into #391, `integration (shard 3/3)` failed on TEST-C01 with `+ "toRefundCount": 0`.

**Problem**: An exact `toEqual` on an extensible object (list `meta`, enrichments, additive response fields) turns every additive change in a parallel PR into a semantic merge conflict that git does not report and only the full integration suite finds.

**Rule**: When you add a field to a shared response object, grep `.ai/qa/tests` for exact assertions on that object (`meta).toEqual`, `toStrictEqual`) and update them in the same PR. When you write such an assertion, prefer the exact form only when it states a deterministic value for every field; otherwise assert the fields under test (`toMatchObject` or a property check).

**Applies to**: `packages/app/.ai/qa/tests/**`, list routes returning `meta` (S6.4 list responses), additive response-field changes.
