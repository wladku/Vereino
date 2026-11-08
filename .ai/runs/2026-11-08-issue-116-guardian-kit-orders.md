# Run — issue #116: guardian kit orders (E07-S09)

- **Goal and trigger:** cezar task `om-auto-fix-issue 116`, unattended. It first stopped for approval, then resumed on the owner's instruction (2026-11-08): "continue autonomously, make reasonable assumptions, do not ask".
- **Issue:** #116 (feature, priority-medium, risk-high). **Spec:** `.ai/specs/2026-10-27-vereino-club-payments.md`, phase 4 step 9 (REQ-032, REQ-002, DD-30, TEST-044).
- **Branch:** `feat/issue-116-guardian-kit-orders` (renamed from `cez/ee454072`).

## Steps

1. **First pass.**
   - No claim, no assignee, no open PR; #115 (PR #227) and #110 (PR #212) are merged.
   - Classified as a feature: no guardian ordering code existed (no `POST /api/payments/orders`, no form, no personal link, no M-16/M-17/M-19).
   - The personal link needs `payments_order_links`, a new `payments` migration, and no approval was recorded on #116. Q1 (410 vs "Orders are closed") was unanswered.
   - Stopped before claiming and posted the proposed defaults (issuecomment-6728034823).
2. **Resume.**
   - On the owner's instruction, posted the defaults as taken (issuecomment-6728039867).
   - Claimed the issue: assignee, `in-progress`, and the claim comment. Renamed the branch.
3. **Pure rules:** `lib/orders.ts` with 100 % coverage in `lib/__tests__/orders.test.ts`: the order lines of the answers (the set at its set price, single products at the price of their size, "Not ordering"), the answers of stored lines, the print name and number, the numbers taken in a group, the order window, a child's state, the paid floor, the address match and the link expiry (end of the deadline in the club's zone).
4. **Data:** the `OrderLink` entity (`payments_order_links`, foundation `tokenLinkColumns`, `until_expiry`), generated offline as `Migration20261108223622_payments` (one table, its unique hash and two indexes).
5. **Commands:** `payments.orders.place|update|cancel` (`commands/orders.ts`). The same commands serve the session (behind the R10 gate) and a personal link (`token` in the input → `TokenLinkService.redeem`, `{ token }` scope source). The campaign row is locked while an order is written. Audited, not undoable, `replayable: false`.
6. **Reads:** `services/orders.ts` (M-16 list, M-17/M-19 form) and `services/order-links.ts` (public card, link request, link page).
7. **Routes:** `GET /api/payments/my-orders`, `GET /api/payments/order-campaigns/{id}/form`, `POST /api/payments/orders`, `PUT /api/payments/orders/{id}`, `POST …/{id}/cancel`, `GET /api/payments/public/order-campaigns/{id}?club=`, `POST …/{id}/link-request`, `GET /api/payments/order-links/{token}`, `POST …/{token}/orders`, `POST …/{token}/orders/{id}/cancel`. The share text now links `/club/orders/{id}?club=<slug>`.

## Decisions

- **Migration and Q1:** taken under the owner's autonomous instruction, as posted on #116. A closed campaign answers 409 `campaign_closed` and the form shows "Orders are closed"; 410 is for an expired link (`token_link_expired`) or a completed campaign (`order_campaign_completed`).
- **`GET /api/payments/my-orders` instead of `?for=me` on the campaign list.** The campaign list is the administrator's `makeCrudRoute` route with `payments.orders.manage` on `GET`; a guardian's list there would mix two audiences and two permissions in one handler. The spec row is updated.
- **The link request needs the club's public slug.** D-024 allows a sessionless lookup only by a public slug or a token hash, so the share link carries `?club=<slug>` (while the club's public pages are on) and the request sends it.
- **One command per write for both channels.** A `token` in the input switches the actor to the link's guardian; the session path keeps the R10 gate.
- **The copy e-mail goes after the commit** (with the payer code), through the foundation dispatch; a failure is logged and the order stands.
