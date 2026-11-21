---
title: "A UI behavior change searches every integration test for the changed data-testid, href or menu order"
modules: ["facilities", "payments", "navigation", "qa"]
areas: ["testing"]
topics: ["integration-tests", "data-testid", "menu-order", "page-title", "merge-train", "stale-assertion"]
---

# A UI behavior change searches every integration test for the changed data-testid, href or menu order

**Context**: PR #354 (E11-S08, #282) made "No-show" (`club-facility-entry-no-show`) present on every rental that holds its slot, answering `noShow.tooEarly` before the start (parity spec, Today tab behavior). Its own test TEST-R13 covered the new contract, but the older E08-S06 test still asserted `toHaveCount(0)` on an upcoming rental. The merge train failed on `integration (shard 2/3)`, identically on the first attempt and on the retry.

It happened again in PR #513 (#494): moving "Cash to settle" after "Order campaigns" in the Finance menu updated TEST-N01, but TEST-046 (treasurer menu) still listed the sidebar hrefs in the old order, and `integration (shard 5/6)` failed on both attempts.

A third time in the same PR: #509 (#485) landed on `main` with ISSUE-485, which asserts the window title of `/backend/club/publication` as `club_core.publication.title`. PR #513 had changed that page's `pageTitleKey` to the short menu label `club_core.nav.publication`; its grep ran before ISSUE-485 existed, so the merge train failed `integration (shard 2/6)`.

**Problem**: A failure that repeats on the Playwright retry with the same assertion is not a flake. Shards hide which older spec touches a changed element, so the author's focused run stays green while the full suite turns red only in the train.

**Rule**: When a change alters when an element with a `data-testid` is shown, hidden or enabled, or moves, renames or reorders a menu item, or changes a page's `pageTitleKey`, run `grep -rn "<testid or href>" packages/app/.ai/qa/tests` and update every older assertion to the new contract (citing the spec line or issue) in the same PR, then run each touched test with `yarn test:integration:vereino --filter <ID>`. Repeat the grep after every merge of `main` into the PR: tests that arrive from `main` were written against the old contract. Classify a red shard as a flake only when the retry passed or the failure differs between attempts.

**Applies to**: `packages/app/.ai/qa/tests/**`, every PR that changes visibility rules of existing UI controls or the backend menu (`page.meta.ts` order, groups, `overrides.nav`). Promoted to an `AGENTS.md` rule after the second occurrence.
