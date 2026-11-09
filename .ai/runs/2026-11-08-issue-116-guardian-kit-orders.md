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
8. **UI:** M-16 `/club/orders` (`ClubOrdersPage`), M-17 `/club/orders/[campaignId]` (`ClubOrderPage`: the member frame when signed in, the campaign card with "Sign in" and the link request without a session), M-19 `/club/o/[token]` (`OrderLinkPage` in the foundation `TokenPageShell`); the shared `OrderFormSection` (child switcher, the set with its saving, a size or "Not ordering" per product, print name and number with the numbers taken in the group, contact, notes, live total; the summary with how to pay, "Change" and "Cancel"). A "Kit orders" button on M-08. en and pl catalogs.
9. **Test:** `E07-S09-guardian-kit-orders.spec.ts` covers every acceptance criterion of #116 (API, link and browser at 375 px).
10. **Docs:** the spec (step 9 note, J-009, the UI and API rows) and its changelog file, the module README and description, lesson `optional-session-page-disables-401-redirect`.
11. **Merge with `origin/main` (#229, the bank statement import):** additive conflicts in the entities, validators, events, error codes, ACL comment, README, i18n and the error-code test. The payments snapshot was taken from main and regenerated; the duplicate migration it produced (the same `payments_order_links` SQL as `Migration20261108223622_payments`) was deleted.

## Files changed

- `packages/app/src/modules/payments/`:
  - `lib/orders.ts` and its test, `lib/error-codes.ts`, `lib/__tests__/payments-rules.test.ts`;
  - `data/entities.ts`, `data/validators.ts`, the migration `Migration20261108223622_payments.ts` and the snapshot;
  - `acl.ts`, `events.ts`, `di.ts`, `index.ts`, `README.md`, `emails/templates.ts`, `i18n/en.json`, `i18n/pl.json`;
  - `commands/orders.ts`; `services/orders.ts`, `services/order-links.ts`, `services/order-campaigns.ts` (exports `orderMoney`);
  - `api/order-routes.ts`, `api/my-orders`, `api/orders/**`, `api/order-campaigns/[id]/form`, `api/order-campaigns/[id]/share-text` (club slug), `api/public/order-campaigns/**`, `api/order-links/**`;
  - `components/club/orders/*`, `components/club/ClubPaymentsPage.tsx`, `frontend/club/orders/**`, `frontend/club/o/[token]/*`.
- `packages/app/.ai/qa/tests/payments/E07-S09-guardian-kit-orders.spec.ts`.
- `.ai/specs/2026-10-27-vereino-club-payments.md`, `.ai/specs/changelog/2026-10-27-vereino-club-payments/2026-11-08-issue-116-guardian-orders.md`, `.ai/lessons/optional-session-page-disables-401-redirect.md`.

## Commands and results

- `npx jest src/modules/payments/lib/__tests__/orders.test.ts --coverage`: 18 passed, 100 % lines, branches and functions on `lib/orders.ts`.
- `DATABASE_URL=postgres://u:p@127.0.0.1:1/none yarn db:generate`: `Migration20261108223622_payments` (one table, its unique hash, two indexes).
- `yarn test:integration:vereino --filter E07-S09`: **did not run**: `[ephemeral] starting PostgreSQL (pgvector/pgvector:pg17-trixie)` / `Could not find a working container runtime strategy`. Docker Desktop is not running on this machine, and this run may not start it. The migration was therefore not applied to a throwaway database either. The CI integration shards run the test on the PR.
- `yarn verify`:
  1. failed at `lint` (22 errors in the new files: template literals with `string | undefined`, a spread of an entity, `FormEvent`, arrow shorthands returning `void`, `setState` in an effect, a dynamic `delete`, an unnecessary assertion). Fixed; the effect became a reset-on-key during render.
  2. failed at `lessons:check` (`apiCall` is not a kebab-case topic) and at `test` (the error-code table test lists the codes). Fixed.
  3. Full run: all 14 steps passed.
  4. After the merge with `origin/main`: all 14 steps passed.

## Open problems / next steps

- The owner confirms or overrides the defaults on the PR: the migration, Q1, `GET /api/payments/my-orders` instead of `?for=me`, the club slug in the share link, and the commands not being undoable.
- E07-S09 must pass on the CI integration shards (first run there).
- E07-S10 (#117): the kit handover and the coach view.

## Review (fresh agent, after the PR opened)

- **Fixed:** the M-17 form's first order sent no `campaignId` (strict schema → 400); `appEndpoints` is now built per campaign.
- **Fixed:** the children came in grant (UUID) order, so the test's expected order was random; both services now sort the children by first name, then id.
- **Fixed:** a change or cancellation while an online checkout of the charge is still `created` now answers 409 `order_payment_in_progress`, so the provider cannot book the old amount on a changed or cancelled charge.
- **Left as is (minor):** an invalid e-mail sent from the form comes back as a plain 400 banner, not a field error; the per-guardian link limit (3 an hour) is counted without a lock, and the per-IP rate limit bounds it.
- `yarn verify` after the fixes: all 14 steps passed.

## CI run 42536001900 (first integration run of E07-S09)

- **E07-S09 failed at its last step** (`getByTestId('order-card')` not found): the signed-out browser was sent to `/login?redirect=/club/orders/…`. Every API, link and signed-in browser step before it passed. Cause: `ClubOrderPage` rendered `PaymentsClubFrame` while the session probe was still loading, and the frame's `/api/people/me` read redirects on 401. Fixed: the page shows a plain loading state until the probe answers. The lesson `optional-session-page-disables-401-redirect` records it.
- **Also failed, not caused by this PR:** TEST-043 (`cash-today-item` count 2 instead of 3), E06-S02 (`data-membership-status` "upcoming" instead of "active"), E08-S02 (`facilities-calendar-rental-…` not found), and J-003 flaky. The shards ran 00:37–01:02 Europe/Warsaw, across midnight, and each assertion depends on "today": the tests' Warsaw date and the server's date disagree there. This PR changes neither people, facilities, the cash list nor the journeys.
- `yarn verify` after the fix: all 14 steps passed.
