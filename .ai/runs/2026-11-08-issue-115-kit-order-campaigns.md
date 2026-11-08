# Run — issue #115: kit order campaigns (E07-S08)

- **Goal and trigger:** cezar task `om-auto-fix-issue 115`, unattended. It first stopped for approval, then resumed on the owner's instruction (2026-11-08): "continue autonomously, make reasonable assumptions, do not ask".
- **Issue:** #115 (feature, priority-medium, risk-high). **Spec:** `.ai/specs/2026-10-27-vereino-club-payments.md`, phase 4 step 9 (REQ-032, DD-30, TEST-044).
- **Branch:** `feat/issue-115-kit-order-campaigns` (renamed from `cez/115`).
- **Outcome:** the administrator part of step 9 is implemented. `yarn verify` passes, and the E07-S08 integration test (API and browser) passes.

## Steps

1. **First pass.**
   - No claim, no assignee, no open PR; #108 is closed.
   - Classified as a feature: no order-campaign code existed.
   - The story needs a new `payments` migration, and no approval was recorded on #115 (D30 covers only the gateway modules). Q1 and Q2 on the issue were unanswered.
   - Stopped before claiming and posted the proposed defaults (issuecomment-6723457896). The stop record was committed as 68963c8.
2. **Resume.**
   - On the owner's instruction, posted the defaults as taken (issuecomment-6723465058).
   - Claimed the issue: assignee, `in-progress`, and the claim comment.
3. **Pure rules:** `lib/order-campaigns.ts`, with 100 % coverage in `lib/__tests__/order-campaigns.test.ts`:
   - the stages, each with one next action, and `transitionTarget`;
   - the edit window;
   - the deadline errors and the product and set errors;
   - the size price and the removed products;
   - the supplier summary (set items under their products, prints by group) and its CSV, with formula neutralization;
   - the KPIs and the product drafts of a copy.
4. **Data.**
   - Four entities: `OrderCampaign`, `OrderProduct`, `Order` (with a partial unique index on one submitted order per child) and `OrderLine` (with the price snapshot).
   - The encryption map covers the order contact fields and notes.
   - Generated `Migration20261108154449_payments` offline (`DATABASE_URL=postgres://u:p@127.0.0.1:1/none yarn db:generate`). The first attempt failed on a `default: '{}'` for a `uuid[]` property; I removed the default.
5. **Commands:** `payments.order_campaigns.create|update|transition|remind` (`commands/order-campaigns.ts`). They are audited and not undoable.
   - Coded field errors carry `fieldErrors`.
   - Products are upserted by id; a removed product that is on a submitted order answers 409 `order_product_in_use`.
   - A transition out of order answers 409 `order_campaign_transition_invalid`.
   - The reminder goes through the foundation dispatch as `payments.order_reminder`. An adult participant without a guardian is reminded directly.
6. **Routes:** the CRUD route `/api/payments/order-campaigns`, `GET …/{id}`, five transition routes, `/summary` (JSON or CSV), `/share-text`, `/remind`, `/missing` (additive) and `GET /api/payments/orders?campaignId=`.
   - New ACL feature `payments.orders.manage`; the club administrator has it through `payments.*`.
   - The `payments:close-order-campaigns` sweep ships as the CLI command `close-order-campaigns`.
7. **UI:**
   - B-30 list, with an empty state.
   - B-31 wizard: start blank, from the template, or as a copy; group chips with "Select all"; a product and set editor; "Save draft" and "Save and open collection".
   - B-32 campaign page: the stage stepper, the next action with a confirm dialog (the close dialog counts children without an order), the KPIs, the Messenger text dialog, and the tabs Orders, Supplier summary (with CSV download) and No order (with "Remind everyone").
   - en and pl catalogs; a sidebar entry under Payments.
8. **Test:** `E07-S08-order-campaign-admin.spec.ts` plus the fixture `_fixtures/orders.ts`. Orders are seeded directly in the test database until E07-S09 adds order placement.
9. Updated the spec (the step 9 note and the `/missing` API row) and added a changelog file. Updated the module README and description. Added a lesson and promoted a repeated test pitfall to AGENTS.md.

## Decisions

- **Migration and Q1/Q2:** taken under the owner's autonomous instruction, as posted on #115.
  - The supplier CSV has the print columns only (Q1).
  - "Copy an earlier campaign" sits next to the fixed template (Q2).
- **`payments_order_links` is not created.** It belongs to E07-S09's personal link.
- **Orders are not placed in this story.** The `payments_orders` and `payments_order_lines` tables exist, so the KPIs, the summary and the "used product" 409 work now. The test inserts orders the way E07-S09's command will store them.
- **Commands are not undoable.** Products are a nested aggregate that orders point at, a transition is a real-world stage, and a reminder is an e-mail already sent. All of them are audited.
- **The scheduled close is an operator command**, following the `reconcile-checkouts` precedent (#110). A per-club schedule would need setup and a backfill for existing clubs.
- **The Messenger link points at `/club/orders/{id}`**, the guardian page E07-S09 builds (spec M-17).
- **The groups field is not `required` in CrudForm.** That check pre-empts the issue's message "Select at least one group", so `onSubmit` checks emptiness instead (lesson `crudform-required-preempts-domain-message`).

## Files changed

- `packages/app/src/modules/payments/`:
  - `lib/order-campaigns.ts` and its test, `lib/error-codes.ts`, `lib/__tests__/payments-rules.test.ts`;
  - `data/entities.ts`, `data/validators.ts`, `data/queries.ts`, the migration and its snapshot;
  - `encryption.ts`, `acl.ts`, `events.ts`, `di.ts`, `cli.ts`, `index.ts`, `README.md`;
  - `emails/templates.ts`, `commands/shared.ts`, `commands/order-campaigns.ts`;
  - `services/directory.ts`, `services/order-campaigns.ts`;
  - `api/shared.ts`, `api/order-campaign-routes.ts`, `api/order-campaigns/**`, `api/orders/route.ts`;
  - `backend/payments/orders/**`, `components/orders/*`;
  - `i18n/en.json`, `i18n/pl.json`.
- `packages/app/.ai/qa/tests/_fixtures/orders.ts`, `packages/app/.ai/qa/tests/payments/E07-S08-order-campaign-admin.spec.ts`.
- `.ai/specs/2026-10-27-vereino-club-payments.md`, `.ai/specs/changelog/2026-10-27-vereino-club-payments/2026-11-08-issue-115-order-campaigns.md`.
- `.ai/lessons/crudform-required-preempts-domain-message.md`, `AGENTS.md` (one Validation sentence).

## Commands and results

- `npx jest src/modules/payments/lib/__tests__/order-campaigns.test.ts --coverage`: 19 passed. The first run had 97.46 % branch coverage (the prints sort); after more cases, 100 %.
- `yarn typecheck`: clean after `yarn generate`. One error was fixed along the way: the product input type of `writeProducts`.
- `yarn test:integration:vereino --filter E07-S08`:
  1. Failed in the browser: `locator.fill: Element is not an <input>`. The label regex matched the "Name for printing" checkbox, because CrudForm inputs have no accessible name. Switched to `[data-crud-field-id="name"] input`.
  2. Failed: "Select at least one group" was not visible, because the test clicked "Select all" twice.
  3. Failed: CrudForm showed "This field is required". Removed `required` from the custom field.
  4. Failed: `getByTestId('order-campaign-tab-summary')` was not found, because `TabsTrigger` drops `data-testid`. Switched to a role selector.
  5. **1 passed (1.5m).**
- `yarn verify`:
  - First run: failed at `ds:check` with `[arbitrary-tailwind]` on `[...product.sizesChild]` in `lib/order-campaigns.ts`, a false positive. Replaced it with `Array.from`.
  - `--from format:check`: all 9 steps passed.
  - Final full run: all 14 steps passed.
- Final integration runs on the final build:
  - `yarn test:integration:vereino --filter E07-S08`: 1 passed (1.4m).
  - Regressions `--filter TEST-043` and `--filter E07-S02`: 1 passed each (1.3m).

- **Merge with `origin/main` (#224, the payer code)** before opening the PR:
  - additive conflicts in `data/entities.ts`, the README, the module description and the payments snapshot;
  - the snapshot was taken from main and regenerated, and the duplicate migration it produced was deleted (the same four tables as `Migration20261108154449_payments`).
  - After the merge: `yarn verify` all 14 steps passed; `--filter E07-S08` 1 passed; `--filter E07-S04` (#224) 1 passed.

## Open problems / next steps

- The owner confirms or overrides the defaults on the PR: the migration, Q1, Q2, the operator command instead of a schedule, and the commands not being undoable.
- E07-S09: guardian ordering (`POST /api/payments/orders`, `?for=me`, `/form`), the personal link (`payments_order_links`), and the `/club/orders/{id}` page the share text and the reminder link to.
- E07-S10 (#117): the kit handover and the coach view.
