# Vereino — payments parity: rental charges, cash on every screen, the order campaign record and the payer's phone pages

**Date**: 2026-11-14
**Status**: In progress — phase 1 built in #291 (2026-11-16), phase 2 in #292 (2026-11-16), phase 5 in #295 (2026-11-17), phase 8 in #298 (2026-11-17), phase 10 in #300 (2026-11-18), phase 4 in #294 (2026-11-18), phase 12 in #302 (2026-11-18). Ready for implementation since its approval by the product owner on 2026-11-16 ([owner decisions on #254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798), answering the [pre-implementation audit](https://github.com/wladku/Vereino/issues/254#issuecomment-6899501375)): the eleven Ask First items approved (migrations A1, A2, B, C, D; Contracts 1–6), Q-C20 and Q-C22 answered, V-C01 and V-C02 answered, Q-C01 … Q-C16 confirmed with Q-C07 amended, the audit gaps (c1)–(c8) fixed in this text. Build starts with #291 (phase 1). Cross-spec dependencies: *Dependencies on the other parity specs*

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: the parity audit of 2026-11-14 (the application on `main` at `a312199` against the clickable mockup, the specifications and `docs/ux-concept/README.md`) and the owner's decisions D-029, D-030 and D-031 (`.ai/specs/research/decisions/`). Design authority for the screens: `docs/ux-concept/README.md` (B-01, B-10, B-20 … B-22, B-29 … B-32, M-08, M-15 … M-19) and the mockup `docs/ux-concept/mockups/app.ts` (`screenCharges`, `screenCharge`, `chargesTable`, `screenBank`, `cashForm`, `recordCash`, `screenCashMobile`, `screenKitCampaignAdmin`, `screenKitBuilder`, `kitDashboardWidget`, `screenDashboard`, `screenPerson`, `screenPayments`, `paySummary`, `kitPayHint`, `kitTodayTiles`, `screenKitList`, `kitOrderPage`, `kitOrderSummary`, `screenKitToken`, `screenGroupPayments`, `rentalCharge`) with its catalogs `i18n/pl.json` and `i18n/en.json`.

This spec is an addendum to `.ai/specs/2026-10-27-vereino-club-payments.md` (phase 4), whose requirements REQ-011, REQ-012 and REQ-030 … REQ-033 it completes, and it delivers the provider side of DD-19 of `.ai/specs/2026-10-27-vereino-facilities.md` (D-028). It does not change the status or the phases of either. Ids carry the letter **C** (`REQ-C01`, `DD-C01`, `J-C01`, `TEST-C01`, `AC-C01`, `Q-C01`) so they never collide with the global ids (D-028). It is one of the five parity specifications of 2026-11-14; the other four are named where this one depends on them.

**Rows of the base specs this addendum supersedes.** The base specs' bodies are not edited; the changelog entry `2026-11-14-parity-c.md` in each base spec's folder points here.

| Base spec section and row | Superseded by |
|---|---|
| Payments, *User Journeys*, J-004 ("The treasurer, in `/backend/payments/fees` …"; step 2 "On the 1st day of the month the system generates charges") | J-C01: the club administrator is the actor (D-030); generation runs on a schedule and can still be run by hand (REQ-C13) |
| Payments, *User Journeys*, J-010 steps 3–4 ("the treasurer Iwona sees the same payments in `/backend/payments/cash-custody`") | J-C02: the administrator accepts the handover on B-33, which is issue #118 and is not specified here |
| Payments, *UI and Interaction Contracts*, row `/backend/payments/charges` (+ `[id]`): "and Rentals only when `facilities` is enabled (Q-051)"; "Accept cash" on the list only | REQ-C01 (DD-C02), REQ-C02, REQ-C03 |
| Payments, *UI*, row `/backend/payments/bank` (B-29) | REQ-C04: row actions as buttons, history as a table, "Accept cash", deleting an import |
| Payments, *UI*, row `/backend/payments/orders/[id]` (B-32) | REQ-C05 |
| Payments, *UI*, row `/club/payments` (M-08): "selection and online payment" | REQ-C10: everything payable is ticked on entry, the fee line always shows, a partially paid charge is payable |
| Payments, *UI*, row `/club/coach/payments` (M-18): data source `POST /api/payments/cash` | The coach's cash is `POST /api/payments/group-charges/cash`, as built in #117; `POST /api/payments/cash` needs `payments.cash.record` |
| Payments, *API*, row `POST /api/payments/cash`: "or `payments.groups.collect` only for charges of children within the coach's scope" | As above: one endpoint per actor |
| Payments, *API*, row `GET /api/payments/cash/charges`: "or `payments.groups.collect`" | The route requires `payments.cash.record` only (`payments/api/cash/charges/route.ts:21`); the coach reads `GET /api/payments/group-charges` |
| Payments, *API*, row `/api/payments/order-campaigns/{id}/remind`: "also `payments.groups.view` in scope" | The coach's reminder is `POST /api/payments/group-charges/campaigns/{id}/remind` (#117) |
| Payments, *Requirement Traceability*, REQ-032: "`/api/payments/order-campaigns*` (incl. `?for=me`)" | The guardian's list is `GET /api/payments/my-orders` (#116); `?for=me` does not exist |
| Payments, *Requirement Traceability*, REQ-033: "`POST /api/payments/cash` (coach scope)" | `POST /api/payments/group-charges/cash` |
| Payments, *Domain Vocabulary*, row *Payment*: "online only for the full amount of open charges" | DD-C07: online for the full **remaining** amount of `open` and `partially_paid` charges |
| Payments, *Events, Jobs*, rows `payments:generate-charges`, `payments:overdue-reminders`, `payments:reconcile-checkouts`, `payments:close-order-campaigns` (declared, never scheduled) | REQ-C13 |
| Payments, *Implementation Phases*: "Phase readiness" (status `Draft`); step 2 "deferred with no story yet: the scheduled `payments:generate-charges` job"; step 4 "refunds are API-only (no screen)"; step 7 "Deferred: … deleting an import" | Phases 4, 6 and 11 of this spec. Phase 4 of the base spec is built except the held-back part of step 10 (#118, #245) |
| Facilities, DD-19, the `createForSource` input | One optional field is added, `payerDisplayName` (DD-C01, *Rollout*); step 3's note "`payments` does not provide it yet" ends with phase 1 of this spec |
| Club management, *Users, Permissions, and Scope*, row Guardian: "payments (one list of charges for the whole club)" | DD-C06, confirmed by the owner on 2026-11-16 (Q-C03): a guardian who is not the ward's payer sees who pays and no amounts. The changelog entry `2026-11-16-issue-254-guardian-payments-row.md` in the club spec's folder points here |

## TLDR

Phase 4 shipped the payments module. The audit found where it stops short of the mockup or of its own specification, and this spec closes those places:

- **Rental charges.** `payments` registers `payments.chargeService`, so a rental creates a charge payable to the facility owner. The charges list gets the perspective "Rentals (municipality)" and a payee filter; the charge record names the owner.
- **Cash.** The one "Accept cash" dialog opens from every screen the mockup shows it on: B-21, B-22 (payer chosen), B-29, the B-32 order rows (payer and charge chosen) and the dashboard.
- **Order campaign record (B-32)** in full: row actions Cash and Hand over, the "Ordered by" column, payment and handover detail, the supplier, KPI hints, the guardians of children without an order, the completion warning.
- **Panel leftovers:** bank rows with their actions as buttons and a deletable import; a manual charge; assigning a payer to a charge without one; a refund dialog and the "to refund" list; the person record's Charges tab; the dashboard widgets "Bank statements and cash" and "Order campaigns".
- **Phone pages** M-08 and M-15 … M-19 show what the mockup shows; a guardian who is not the payer is told who pays.
- **Jobs.** Charge generation, overdue reminders, the checkout sweep and the campaign closing run on a schedule instead of an operator's command.
- **Stripe.** The administrator sees whether online payment is connected and chooses the methods.

Everything reuses the existing commands, routes and components of `payments`, the foundation schedule and dispatch helpers, widget injection and the DD-19 contract. Five additive migrations (A1, A2, B, C, D) and six contract changes were approved by the owner on 2026-11-16 (*Rollout, Migration, and Rollback*).

## Problem Statement

The owner compared the running application with the mockup and found it short "in every area" (D-031). For payments the audit (`a312199`; code read, not run) confirmed:

- **A rental creates no charge.**
  - `facilities/services/charges.ts` declares the contract `PaymentsChargeService` behind the optional token `payments.chargeService`; `payments/di.ts` registers nothing under it. The calls at `facilities/commands/rentals.ts:221` and `facilities/commands/requests.ts:444` therefore do nothing, and `Rental.chargeId` stays empty.
  - `payments/components/ChargesTable.tsx:46` hard-codes `FACILITIES_ENABLED = false`, so the rentals perspective never shows.
  - `payments_charges` has no `payer_institution_id` or `payee_institution_id` (`payments/data/entities.ts:121-187`).
  - The facilities spec promises the charge in J-005, AC-013 and AC-024.
- **"Accept cash" is on one screen.** The mockup calls the shared `cashForm` from B-21, from B-22 with the payer preselected (`app.ts:1794`), from B-29 (`app.ts:1713`), from the B-32 order rows with payer and charge preselected (`app.ts:2331`) and from the dashboard (`app.ts:1289`). The app mounts `AcceptCashDialog` on B-21 only (`ChargesTable.tsx:408`), and `CashAcceptForm` accepts no payer or charge (`components/cash/CashAcceptForm.tsx:31-37`).
- **B-32 is the largest gap** (`components/orders/OrderCampaignPage.tsx`):
  - no row actions (`:140-205`); the handover column says Yes or No (`:197`);
  - no "Ordered by" column although the API returns `orderedBy`; the payment column is a status badge;
  - four KPI tiles without hints; the supplier name is shown nowhere although `payments_order_campaigns.supplier_name` exists;
  - "No order" lists no guardians; completing a campaign with kits not handed over asks a generic confirmation.
- **Money cannot be corrected or completed from a screen.** Refunds are API-only (base spec step 4). A charge without a payer can never get one: `payer_person_id` is written at generation only. The source type `manual` exists (`lib/payments-rules.ts:26`) with no command. A bank import cannot be deleted (base spec step 7).
- **Nothing runs by itself.** `payments/cli.ts` holds `reconcile-checkouts` and `close-order-campaigns` as operator commands; `payments` has no `setup.ts` and no workers; `payments:generate-charges` and `payments:overdue-reminders` exist only as rows of the base spec's events table. Yet the mockup tells the administrator "After {date} the system closes the orders automatically" (`action.kitStatus.closeAuto`), and J-004 says charges appear on the 1st.
- **Phone pages are thinner than the mockup.**
  - M-08 starts with nothing ticked (`ClubPaymentsPage.tsx:270`), hides the fee line when it is zero (`:162`), shows a discount without its rule's name and refuses a partially paid charge (`services/my-charges.ts:121`).
  - M-16 shows no stage and no payment deadline; M-17 shows only a "picked up" badge; M-19 does not say whose link it is.
- **Deferred items were never picked up.** The person record's Charges tab (#84) and the dashboard widgets "Bank statements and cash" and "Order campaigns" (#88) waited "until the module exists". The module has existed since #108.
- **The base spec contradicts itself and D-030.** J-004 and J-010 name the treasurer as the actor although the role is held back (D-030, #245). Two endpoints are named two ways: the guardian's order list and the coach's cash.
- **Nobody on the club's side can tell whether Stripe works.** The keys live on the platform integration page; the club administrator's role holds no `integrations.*` feature (`packages/core/src/roles.ts:36-46`); no screen shows the connection. The checkout offers `['card']` only (`payments/commands/checkout.ts:44`).

One correction to the audit note `02-payments.md`: it says facilities "creates rental charges". It does not. The call exists and does nothing until the token is registered.

Who has it: the club administrator (who does the treasurer's work, D-030); the guardian and the adult participant as payers; the coach and the coordinator; the facility attendant and the renter, through the rental charge.

## Overview and Success Measures

- **Primary outcome:** every payments function the mockup shows is reachable in the application on the same screen, and no payments job needs an operator's command. It is measured by AC-C01 … AC-C14 and by a second audit pass over the screens listed in *Sources* that finds no row marked GAP.
- **Leading indicators:**
  - rentals with a non-empty `charge_id`;
  - cash receipts issued from B-22, B-29 and B-32 (the audit context of `payments.cash.record` carries the opening screen, DD-C03);
  - `payments_charge_generations` rows written by the scheduler;
  - reminder e-mails sent by `payments:overdue-reminders`;
  - no open charge with `payer_missing` older than 7 days.
- **Baseline:** no rental charge; 1 of 5 screens opens the cash dialog; 0 of 4 jobs scheduled; 13 audit rows on B-32 alone.
- **Market / product reference:** the mockup is the model (D-031 §1).
  - **Adopted** from SportBM and ProTrainUp (studied in E01-T05 #15): one cash form reachable from the payer, the charge and the order; automatic monthly charges with reminders.
  - **Rejected:** a general ledger or cash book. The club's accounting stays outside Vereino (base spec Q-034, D-023).

## Goals

- **REQ-C01** — A rental entered by staff or approved from a request creates, in the rental's own transaction, a charge payable to the facility owner, with the renter (an institution, a person or a typed-in name) as payer; a cancellation cancels or forfeits it. The administrator finds these charges under "Rentals (municipality)" on B-21, filters any perspective by payee, and reads the owner's name on B-22 (provider side of facilities DD-19; base spec *Proposed Solution*).
- **REQ-C02** — The administrator opens the one "Accept cash" dialog from B-21, from B-22 with the charge's payer chosen, from B-29, from a B-32 order row with the orderer and the order's charge chosen, and from the dashboard widget (completes REQ-031).
- **REQ-C03** — B-21 and B-22 match the mockup: an "Import statement" link to B-29, the perspective and the filters in the URL, the mockup's perspective order and sort, "—" when nothing remains, and "bank statement" as the receiver of an imported transfer (completes REQ-011, REQ-030).
- **REQ-C04** — B-29 shows the actions Confirm, Change / Assign, Skip, Undo and Restore as buttons in the row, tells "recorded automatically" from "recorded", lists the import history as a table, and lets the administrator delete an import from which nothing was ever booked (completes REQ-030).
- **REQ-C05** — B-32 shows, for each order, who ordered (name, phone, channel) with the notes, the payment (amount to pay, overdue marker, method and collector) and the handover (who and when), and offers Cash, Hand over and Charge in the row. The KPI tiles carry their hints and the supplier; the tabs carry counts; "No order" lists each child's guardians and flags a missing e-mail or a missing guardian; completing with kits not handed over warns with their number. B-31 says how many orders exist when an open campaign is edited and explains a locked campaign (completes REQ-032).
- **REQ-C06** — The administrator adds a charge by hand for a person and assigns a payer to an open charge that has none. A guardian who becomes the ward's primary payer later is assigned automatically (completes REQ-011).
- **REQ-C07** — The person record (B-10) has a "Charges" tab with the charges the person owes or pays, visible to those who may view charges.
- **REQ-C08** — The administrator refunds an online payment, in full or in part, from B-22, and finds every online overpayment flagged "to refund" in one list (completes REQ-012; Q-049, Q-050).
- **REQ-C09** — The dashboard (B-01) shows "Bank statements and cash" (transfers waiting, links to the import and to cash) and "Order campaigns" (each running campaign with its progress). "Overdue" adds the number of charges and how many have no payer; "Charges without a payer" lists them.
- **REQ-C10** — On M-08 every payable charge is ticked on entry with the summary and the pay button ready; the fee line always shows; a discount names its rule; an open order campaign is announced above the list; a partially paid charge can be paid online for what remains. A guardian who is not the payer sees who pays instead of "Everything is paid" (completes REQ-012).
- **REQ-C11** — M-16 shows each campaign's stage, the payment deadline and "ready for pickup". M-17 shows the stage and both deadlines, the order's time and notes, "ready for pickup from the coach" after delivery, who handed the kit over and when, and a "Pay online {amount}" action for that one charge. M-19 says whose personal link it is. The Today page carries an "Order" tile while a campaign is open (completes REQ-032).
- **REQ-C12** — M-15 names the receiver before saving and lists today's receipts by what was paid. M-18 states the club's coach mode on the group card, marks groups that are not the coach's own, opens from a link with the group and the "to pay" filter set, and shows when a kit was handed over (completes REQ-031, REQ-033).
- **REQ-C13** — The period's charges are generated automatically on the club's chosen day; payers of overdue charges are reminded on the day after the due date and then weekly; unfinished checkouts are reconciled and due campaigns closed every 15 minutes — all without an operator (completes REQ-011, REQ-012, REQ-032).
- **REQ-C14** — On "Fees and discounts" the administrator sees whether online payment is connected and in which mode, chooses the offered methods (card, BLIK, Przelewy24), and reads the online payment fee with a link to where it is set (completes REQ-012; Q-016).

## Non-goals

- **The treasurer and B-33.** The treasurer role, its panel and the cash-custody page B-33 with numbered handovers are held back (D-030, issue #245) and tracked in issue #118 for the administrator only. This spec references them and specifies nothing of theirs. Until #118 lands, a coach's cash stays under "Cash with you".
- **Entry points and badges.** The bottom bar's "Payments" tab on every member page, the "More" list (Orders, My groups' payments, Accept cash) and the sidebar count badges belong to the navigation spec (`2026-11-14-vereino-parity-navigation-and-naming.md`). This spec owns what the pages contain and supplies the counts (REQ-C09).
- **The facilities side of the rental charge.** Passing the owner as payee, the charge's description, confirming a rental when its charge is paid and the report's payments figure belong to the facilities parity spec (`2026-11-14-vereino-parity-facilities.md`).
- **A child who changes group within a period, a ward turning 18 and a payer who leaves.** The rule that the period's fee is charged once after a move (REQ-L11), the payer at 18 (REQ-L06) and open charges at a departure (REQ-L03, REQ-L04) belong to the life-cycle spec (`2026-11-14-vereino-people-life-cycle-and-data-entry.md`). REQ-L11 changes the same charge generation that this spec schedules (REQ-C13); whichever of the two lands second rebases on the other.
- **Renames.** Menu groups and screen names ("Finanse", "Należności" …) follow the navigation spec's "Glossary (D-031 §2)". This spec uses the mockup's names and cites catalog keys.
- **Editing a charge.** A wrong amount or due date is corrected by cancelling the charge and creating it again (DD-C12).
- **Unchanged from the base spec:** receipts and invoices (`order_sales_document`, D-023); gateways other than Stripe; a `ProgressJob` for generation or large statements (kept synchronous, Q-C09).
- **Stripe keys in a Vereino screen** (DD-C11).
- **A refund made in the Stripe Dashboard.** Refunds go only through Vereino (Q-050, D-030 §2, unchanged); a refund made outside Vereino is not recorded (Q-C22, answered "no" by the owner on 2026-11-16).
- **Reacting to `groups.membership.deleted`** (V-A01 of the groups and activities spec). Not in E12: issued charges stay when a membership is deleted, as spec A's confirm text says. The reaction is a follow-up story under E13 (life cycle), decided by the owner on 2026-11-16.
- **B-33 and the handover of a coach's cash** stay in issue #118 (see the first non-goal).

### Dependencies on the other parity specs

The five parity specifications of 2026-11-14 are built in parallel. Spec N (`2026-11-14-vereino-parity-navigation-and-naming.md`) is `Ready for implementation`; specs A (`…-parity-groups-and-activities.md`), R (`…-parity-facilities.md`) and L (`2026-11-14-vereino-people-life-cycle-and-data-entry.md`) are being made Ready alongside this one. This spec edits none of them; each dependency below is stated here and in the phase it touches.

| Other spec | What it needs from C, or C from it | Where in C | Rule |
|---|---|---|---|
| N (Ready) | Its menu counts "Bank statements" and "Order campaigns" (phase 6, issue #260, AC-N03) read `bank.toDecide` and the number of running campaigns from `GET /api/payments/dashboard`, refreshed on navigation and every 60 seconds | REQ-C09, phase 7: the lean read `?only=counts` | #260 can merge with its other counts; the two payments counts close after C's phase 7. N's badge reads `bank.toDecide` and `campaignsRunning` (the length of the full read's `campaigns[]`) |
| N (Ready) | Entry points, menu names and the widgets' role visibility | Non-goals; *UI architecture* | C uses N's glossary names and catalog keys |
| R | R's phase 11 (the rental charge, confirmation on payment) needs C's phase 1: `payments.chargeService` registered with `statusOf` and the `payerDisplayName` input | Phase 1, Contract 1 | C's phase 1 lands first or alone; until R lands, `facilities` passes `payeeInstitutionId: null` and the renter's name as the description (phase 1, *Risks*) |
| L | L's REQ-L11 (the period's fee charged once after a group move) changes the same charge generation that C's REQ-C13 schedules | Phase 11 | Whichever lands second rebases on the other; neither changes the other's rule |
| L | L's phases and C's phase 5 both edit `people/components/PersonRecord.tsx`; L fixes the tab order Details, Guardians, Roles, Account, Groups, Charges, Leaving | Phase 5 | The Charges tab sits between Groups and Leaving; the second pull request rebases on the first and changes nothing of the other's tab |
| A | A's V-A01 hands the reaction to `groups.membership.deleted` to C | Non-goals | Not in E12; a follow-up story under E13 |
| — | Issue #118 (B-33, cash to settle) | Non-goals | Outside C |

## Proposed Solution

**Rental charges.** `payments` adds `services/charge-service.ts` with `createForSource`, `cancelForSource` and `statusOf` and registers it under `payments.chargeService` in `payments/di.ts`. The type is declared again inside `payments` and kept structurally equal to the one in `facilities/services/charges.ts`; neither module imports the other (DD-C01). The service follows the DD-19 transaction contract as written: it writes only through the caller's `em`, reads tenant and organization from `ctx`, emits nothing itself and returns `afterCommit`. `payments_charges` gains `payer_institution_id`, `payee_institution_id` and an encrypted `payer_label` (migration A1) and the lookup indexes (migration A2). Institution names come from `club_core`'s directory (`clubCoreDirectory.findInstitutions`); `payments/services/directory.ts` wraps only `findSections` of that directory today, so phase 1 adds a `findInstitutions` wrapper next to it.

**One cash dialog.** `CashAcceptForm` gains two optional props, `payerPersonId` and `chargeIds`. A small `AcceptCashButton` wraps the button and `AcceptCashDialog`, so each screen mounts one element. No new route: the form keeps `GET /api/payments/cash/payers`, `GET /api/payments/cash/charges` and `POST /api/payments/cash`.

**B-32.** The orders read (`services/order-campaigns.ts`, `CampaignOrderRow`) returns the fields the mockup shows; the page renders them and adds the row actions. Cash is the shared dialog; Hand over is the existing `POST /api/payments/orders/{id}/hand-over`; Charge is a link to B-22. The "No order" read adds each child's guardians.

**Corrections.** Three small commands: `payments.charges.create_manual`, `payments.charges.assign_payer` and `payments.bank_imports.delete`. The refund is a dialog on B-22 over the existing `payments.payments.refund`. A guardian marked as primary payer is assigned by a `payments` subscriber to `people.guardianship.created` and `.updated`, whose payload gains `wardPersonId` (Contract 6, approved 2026-11-16; V-C02).

**Seams into other modules.**

- The person record gets a second injection spot next to the groups one (`people/components/PersonRecord.tsx:35`); `payments` injects the tab's body. The tab sits between Groups and Leaving (spec L's order).
- The dashboard gets two more `payments` dashboard widgets, fed by the extended `GET /api/payments/dashboard`; the same route answers a lean `?only=counts` for spec N's menu counts.
- The Today page has two `payments` spots. The payments tile (`club-today-payments`, with its new state "paid by {name}") stays on `vereino:club:today:payments`. The new "Order" tile is a `payments` injection widget on `vereino:club:today:sections`, next to the coach's tile, which already uses that spot.
- `people` adds `wardPersonId` to the payload of the guardianship events (`guardianshipEvents` in `people/commands/shared.ts:179-184`, today `{ id, tenantId, organizationId, guardianPersonId }`). The config is shared by `.created`, `.updated` and `.deleted`, so all three carry it; `payments` listens to the first two.

**Jobs.** A new `payments/setup.ts` registers four schedules with the foundation helper `registerModuleSchedule`. Four workers dispatch four job commands with `jobCommandContext` — the pattern of `facilities/setup.ts` and `facilities/workers/rental-lifecycle.ts`. All four job commands are new: `payments.charges.generate_due` decides whether a month is due (DD-C08) and runs the same generation service as the existing manual command `payments.charges.generate`; `payments.charges.remind_overdue` is new logic; `payments.checkouts.reconcile` and `payments.order_campaigns.close_due` wrap the services `reconcileCheckouts` and `closeOrderCampaigns`, which the CLI calls directly today (`payments/cli.ts:9-10`). The two CLI commands stay for operators. In-app notices use a new `payments/notifications.ts` (the file does not exist yet; model: `facilities/notifications.ts`).

**Phone pages.** The pages keep their routes and components. The reads gain additive fields (`discountName`, `otherPayers`, `stage`, handover detail), and the checkout accepts `partially_paid` charges. A checkout stores each charge's share (its remaining amount at checkout) in `payments_checkouts.charge_amounts` (migration D), and the fulfilment spreads the received amount by those shares (DD-C07).

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-C01** `payments` implements the DD-19 contract structurally and registers it in `payments/di.ts`; the consumer's type stays in `facilities/services/charges.ts`. `statusOf(chargeIds, ctx)` is part of the registered service although the consumer's type does not declare it yet. The input gains one optional field, `payerDisplayName` | The same direction as `groups.personFilter` (precedent DD-U01): the consumer declares, the provider registers, nobody imports across modules. DD-19 names `statusOf`; the facilities parity spec adds it to the consumer's type when it builds the confirmation. A renter of type `unregistered` has no id, so without a name the payer column would be empty | Move the type to `@vereino/core` | A shared-package change for one consumer; DD-19 already fixes the shape |
| **DD-C02** The rentals perspective is shown when the charges list response says so (`meta.rentalsPerspective`): true when the token `facilities.occupancyService` is registered or the club has at least one live `rental` charge | A constant in a client component cannot know the deployment. A DI check imports nothing. The "has charges" half keeps old charges reachable if `facilities` is disabled later | Always show the tab, as the mockup does | An empty tab in a club without a facility; Q-051 made it conditional and the reason still holds |
| **DD-C03** One cash form with preselection by props. The opening screen is passed as `origin` and stored in the command's audit context | The mockup has one `cashForm(pre, inModal, only)`; five copies would drift apart | A dialog per screen | Duplicated validation and receipt logic |
| **DD-C04** B-32 "Hand over" calls the existing `payments.orders.hand_over` with the order's own `groupId`. The administrator already passes its gate (`payments.groups.collect` through `payments.*`) and is not bound by `coach_fee_access` | No new route; the unpaid warning (`confirmUnpaid`) and the 409 before delivery already exist | A second, admin-only route | Two code paths for one rule |
| **DD-C05** The person record's Charges tab is a `people` injection spot, `vereino:people:person-record:charges`; `payments` injects a narrowed `ChargesTable` | `people` must not import `payments`; the groups tab already works this way | A tab rendered by `people` over the payments API | `people` would know payments' columns and features |
| **DD-C06** A guardian who is not the ward's payer sees no amounts. M-08 and the Today tile say "{child}: paid by {payer's first name}" | The mockup lists only what the caller pays or owes (`myCharges`), and today such a guardian reads "Everything is paid", which is false. Amounts and discounts — some are social relief — stay with the payer until the owner decides otherwise (Q-C03) | A read-only list of the ward's charges for every guardian (club spec *Users*: "one list of charges") | It shows one parent the other's settlements. Adding fields later is easy; taking them away is not |
| **DD-C07** A `partially_paid` charge is payable online for its remaining amount. The checkout stores each charge's share — its remaining amount when the checkout is created — in `payments_checkouts.charge_amounts` (int[] in grosz, parallel to `charge_ids`, migration D). The fulfilment spreads the received amount by these shares, oldest due date first as today; a share larger than what remains at fulfilment becomes an overpayment "to refund" for the difference. A checkout created before migration D has no shares (`charge_amounts` null) and keeps today's spread by `amountDue`, which is exact for it because it holds only `open` charges | The mockup ticks `open` and `partially_paid` alike and pays `remaining(c)`. A parent who gave the coach half must not be forced to a transfer. Today `payments_checkouts` holds only `charge_ids` and the total `amount` (`payments/data/entities.ts:316-321`), and the fulfilment gives each charge its full `amountDue` (`lib/checkout-rules.ts:120-124`): for a partially paid charge that books the part already paid as a false overpayment. Hence the stored share | Keep "only `open`" (the base spec); recompute the shares at fulfilment from the remaining amounts | A dead end on the phone for a common case; a share recomputed at fulfilment hides a cash payment made between checkout and capture, which must surface as "to refund" |
| **DD-C08** Schedules live in a new `payments/setup.ts`; each worker dispatches a job command and holds no logic. Generation runs daily at 06:00 club time; the job command `payments.charges.generate_due` acts only on or after `generation_day`, for the current month, when that month has no generation yet and the month is automatic (below), and then runs the generation service of the manual command `payments.charges.generate`. **First automatic month** (owner, Q-C07, 2026-11-16): the first month generated automatically is the month *after* the one in which migration B was applied; the current month of the deploy is never caught up mid-month. The boundary is read once per run from the `executed_at` of migration B's row in `mikro_orm_migrations_payments`, taken in the club's time zone, even when the club's generation day of the deploy month has not come yet; manual generation ("Generate period") is unaffected | The foundation helper is idempotent per organization. A daily run survives a missed day within a month. The unique charge index and the advisory lock already make generation idempotent. The migration row is the one stored fact of "when the automation arrived" that needs no new column and is the same for every club | A cron expression per club for the chosen day; a catch-up window of 3 days past `generation_day` (the audit's alternative) | Changing the day would rewrite a schedule; the window would still generate the deploy month when B lands on days 1–3, against the owner's answer |
| **DD-C09** Overdue reminders: the first on the day after `due_date`, then every 7 days, at most 4 for one charge. One message per payer lists all their overdue charges. The charge stores `last_reminded_at` and `reminder_count` | The base spec's cadence, with a cap so a forgotten charge does not mail forever. One message per payer avoids three e-mails for three children | No cap; a message per charge | Spam; the administrator's "Overdue" list is the escalation |
| **DD-C10** "To refund" is a B-21 perspective shown only when it is not empty, plus a line in the "Bank statements and cash" widget. The refund itself is a dialog on B-22; a refund is made only through Vereino, never recorded from the Stripe Dashboard (Q-C22, owner 2026-11-16) | The mockup has no refund screen. A conditional tab adds nothing to a normal day and keeps the money visible when it matters (S10.3) | A page `/backend/payments/refunds` | A menu item for a rare event |
| **DD-C11** Stripe keys stay on the platform integration page, entered by the technical administrator or taken from `OM_INTEGRATION_STRIPE_*`. Vereino shows the connection status and stores the offered methods | No secret passes through a new Vereino form. The club administrator holds no `integrations.*` feature, and granting one is a role-catalogue change (Q-C15) | A Vereino form for the keys | Duplicates the platform's encrypted credential store |
| **DD-C12** A manual charge is created by a command and never edited. A wrong one is cancelled (`payments.charges.cancel`) and created again | The ledger rule of the base spec: no edit, cancel with a reason | An edit form for the amount and the due date | Breaks "a charge's amount is what was issued"; needs a versioned history |
| **DD-C13** Deleting a bank import removes the import, its transactions and its file. It is allowed only when no payment row has ever referenced one of its transactions | "Nothing booked" must include booked-then-undone: the reversing entries still point at the transaction. Removing the rows frees their `tx_hash`, so the corrected file can be imported | Soft delete | The unique `(organization_id, tx_hash)` index would still reject the re-import |

## Domain Vocabulary and Business Rules

Terms not listed here keep the meaning of the base spec (*Domain Vocabulary and Business Rules*). Polish names follow the navigation spec's "Glossary (D-031 §2)".

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Rental charge | A charge with `source_type = rental`, `source_id` = the rental's id, `payee = owner_institution`, `payee_institution_id` as given (may be null), no `person_id`, no discount. Exactly one live rental charge exists for one `source_id` | `payments_charges`; created only by `payments.chargeService.createForSource` | A second create for the same `source_id` returns the existing charge's id and writes nothing |
| Payer of a rental charge | The first that is present: `payer_institution_id`, `payer_person_id`, `payer_label` (the typed-in renter). `payer_missing` is false for every rental charge: the renter is always known | `payments_charges` | None of the three → the service throws 422 `charge_payer_required`, and the rental's transaction rolls back (DD-19) |
| Cancelling a rental charge | `cancelForSource` with `cancelled` sets `cancelled`; with `forfeited` sets `forfeited`. A charge with any payment is left as it is and the call returns the warning `charge_paid` | `payments_charges` | No charge for the source → no-op without a warning |
| `statusOf` | For the given charge ids of the caller's organization, the stored status (`open`, `partially_paid`, `paid`, `cancelled`, `forfeited`). Unknown or foreign ids are absent from the result | `payments_charges` | Never throws for an unknown id |
| Online payment of a rental charge | Not offered: a rental charge is never listed by `my-charges` and never accepted by the checkout (the mockup's `myCharges` excludes `rental`; the money goes to the owner's account) | `payments` | 403 `checkout_charge_forbidden` |
| Manual charge | `source_type = manual`, no `source_id`, a debtor `person_id`, a description (3–200 characters), an amount of 1 grosz to PLN 100 000, a due date from 12 months back to 12 months ahead, `payee = club`. The payer follows the base spec's *Payer* rule unless the administrator names one | `payments.charges.create_manual` | 422 per field; no payer found → the charge is created with `payer_missing` |
| Assigning a payer | Allowed on an `open` or `partially_paid` charge with `payer_missing`. The payer must be an active guardian of the debtor, or the debtor when adult. It clears `payer_missing`; payments already recorded stay | `payments.charges.assign_payer` | 409 `charge_payer_already_set`, `charge_not_payable`; 422 `charge_payer_not_eligible` |
| Automatic payer assignment | When a guardianship with `is_primary_payer` is created or changed, every `open` or `partially_paid` charge of that ward with `payer_missing` gets that guardian as payer. The subscriber takes the ward from the event's `wardPersonId` (Contract 6) and re-reads the ward's primary payer through `people.personDirectory.primaryPayers`, so a stale or replayed event assigns only the payer that is current | `payments` subscriber to `people.guardianship.created` and `.updated` | The subscriber is persistent and idempotent: a charge that already has a payer is skipped; an event without `wardPersonId` (emitted before Contract 6) is ignored. There is no other path: the daily generation does not assign payers to existing charges, and the administrator assigns the rest on B-22 (REQ-C06) |
| To refund | An `online` payment with `is_overpayment = true` whose amount has not been fully refunded | `payments_payments` | — |
| Refundable part | The payment's amount minus the sum of its refunds (reversing entries with `gateway_refund_id`) | `payments_payments` | More than the refundable part → 422 (existing) |
| Online-payable charge | A charge the caller pays, `open` or `partially_paid`, with a payer, not `rental`; the amount is what remains (DD-C07) | `payments.checkout.create` | 409 `charge_not_open` for any other status — the existing code is kept, so no client breaks |
| Checkout share | For each charge of a checkout, its remaining amount when the checkout was created, stored in `payments_checkouts.charge_amounts` in the order of `charge_ids`; the shares sum to `amount` | `payments_checkouts` (migration D) | At fulfilment: the part of a share up to what then remains is booked; the rest is an overpayment "to refund" (DD-C07). `charge_amounts` null (an older checkout) → the spread by `amountDue` of today |
| Other payer | For the caller's ward: an active payer who is not the caller and at least one `open` or `partially_paid` charge of the ward. The caller learns the payer's first name and the ward's first name, never an amount (DD-C06) | `payments` read over `people.personDirectory.primaryPayers` | No payer → the existing "no payer — contact the club" row |
| Automatic generation | On each daily run, `payments.charges.generate_due` generates the current month when `auto_generate_charges` is on, the club's date is on or after `generation_day`, the month is later than the month in which migration B was applied (first automatic month, DD-C08) and no `payments_charge_generations` row exists for the month (an undone row counts) | `payments_settings`, `payments_charge_generations`, `mikro_orm_migrations_payments` (migration B's `executed_at`) | 409 `generation_in_progress` → the next daily run retries; an undone generation is not repeated automatically in the same month; the migration row unreadable → the run generates nothing and logs a warning |
| Overdue reminder | For a charge `open` or `partially_paid`, with a payer, past `due_date` in the club's calendar: a reminder is due when `reminder_count = 0` and today > `due_date`, or when 7 days have passed since `last_reminded_at`, while `reminder_count < 4` (DD-C09). Rental charges are not reminded | `payments_charges.last_reminded_at`, `reminder_count` | The marker is written in the same transaction that enqueues the dispatch; a failed delivery is the dispatch's retry, not a second reminder |
| Deletable import | A bank import none of whose transactions is referenced by any payment row, reversed or not (DD-C13) | `payments_bank_imports`, `payments_payments.bank_transaction_id` | 409 `bank_import_has_bookings` |
| Offered online methods | A non-empty subset of `card`, `blik`, `p24`, stored per club; default `['card']`. The checkout passes it as `paymentTypes` | `payments_settings.online_methods` | Empty or unknown value → 422 |
| Online payment connection | `connected_test`, `connected_live` or `not_connected`, derived from the installed `integrationCredentialsService.resolve(<stripe integration id>, scope)` and `integrationStateService.isEnabled` of the organization: enabled with a publishable key starting `pk_test_` → `connected_test`, `pk_live_` → `connected_live`, otherwise `not_connected`. Only the mode leaves the server, never a key (V-C01, answered 2026-11-16) | `integrations` (`integration_credentials`, integration state) | Unreadable → `unknown`, shown as "not verified" |
| Refund made outside Vereino | Not recorded. A refund is made only through `payments.payments.refund` and the gateway (Q-050, D-030 §2; Q-C22 answered "no" on 2026-11-16) | — | The gateway refuses (e.g. a late capture on a terminal transaction) → 502, nothing booked; the case stays a known gap of the base spec (step 4) |

## Users, Permissions, and Scope

The full actor and feature list stays in `2026-10-20-vereino-club-management.md` (*Users, Permissions, and Scope*). No new feature id and no role-catalogue change is needed.

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Club administrator (does the treasurer's work, D-030) | Everything in REQ-C01 … REQ-C09, REQ-C13 settings, REQ-C14; M-15 on the phone | Club-wide (`club_admin` grant), as every `payments` write of phase 4 | `payments.view`, `payments.manage`, `payments.cash.record`, `payments.bank.import`, `payments.orders.manage`, `payments.groups.collect` (all through `payments.*`) |
| Payer (guardian or adult participant) | M-08 with DD-C07; M-16, M-17; the Today tiles | The charges they pay; their wards' and their own orders (R10 gate `people.paymentsGate`) | `payments.view_own`, `payments.pay_online`, `payments.orders.place` |
| Guardian who is not the payer | The "paid by {name}" notice on M-08 and on the Today tile; orders as any guardian | Own wards only; no amounts (DD-C06) | `payments.view_own` |
| Guardian without an account | M-19 from the personal link | The link's guardian and campaign | token |
| Coach, coordinator | M-18 with the REQ-C12 additions | Own groups; the coordinator's sections (unchanged, DD-32) | `payments.groups.view`, `payments.groups.collect` |
| `facilities` (module) | `createForSource`, `cancelForSource`, `statusOf` | The tenant and organization of the calling command's `ctx`, never of the input (DD-19) | optional DI token `payments.chargeService` |
| Scheduler | The four job commands | The schedule registration's tenant and organization, re-validated by the worker (`jobCommandContext`) | system, per organization |
| Treasurer | Nothing in this spec | Held back (D-030, #245); D-029 makes the phone its device when it arrives | — |

`tenantId` and `organizationId` come from the authenticated context in every route and command, from `ctx` in the charge service and from the schedule registration in the workers. The person record's tab passes only a person id; the list route applies the caller's own scope.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Rental charge | extend | `payments` (provider), `facilities` (consumer, unchanged here) | optional DI token `payments.chargeService`, contract in `facilities/services/charges.ts` | DD-19, D-028 |
| Institution names on charges | reuse | `club_core` | `clubCoreDirectory.findInstitutions` (`club_core/services/directory.ts:76`); `payments/services/directory.ts` resolves that directory but wraps only `findSections`, so `findInstitutions` is a new wrapper there (phase 1) | Names only; contacts stay in `club_core` |
| Cash dialog | extend | `payments` | `components/AcceptCashDialog.tsx`, `components/cash/CashAcceptForm.tsx`, `cash-client.ts` | One form, five places |
| Kit handover from the panel | reuse | `payments` | `POST /api/payments/orders/{id}/hand-over`, command `payments.orders.hand_over` (`commands/group-charges.ts`) | DD-C04 |
| Person record tab | extend | `people` (spot), `payments` (widget) | injection spot `vereino:people:person-record:charges`, like `GROUPS_SPOT_ID` | DD-C05 |
| Dashboard widgets | extend | `payments` | `widgets/dashboard/*`, `GET /api/payments/dashboard`; frame and role visibility in the navigation spec | The two existing widgets are the model |
| Today "Order" tile; "paid by" state of the payments tile | extend | `payments` | `widgets/injection-table.ts`: the new "Order" tile on spot `vereino:club:today:sections`; the existing payments tile on `vereino:club:today:payments` | The coach tile already uses the sections spot; the payments tile keeps its own |
| Guardians of a child, payer changes | reuse + extend | `people` | `people.personDirectory` (the reads `payments.order_campaigns.remind` and the generation already use); events `people.guardianship.created`, `.updated`, whose payload gains `wardPersonId` (Contract 6) | No import of `people`; without the ward id the subscriber cannot find the charges (V-C02) |
| Schedules and workers | reuse | `foundation` | `registerModuleSchedule`, `jobCommandContext` (`facilities/setup.ts`, `facilities/workers/*`) | The established job pattern |
| Reminder and notices | reuse | `foundation` dispatch | template `payments.charge_reminder` (`payments/emails/templates.ts`), a new in-app type in a new file `payments/notifications.ts` (phase 11; model: `facilities/notifications.ts`) | Foundation III P-30 |
| Refund | reuse | `payments`, `payment_gateways` | `payments.payments.refund` → `paymentGatewayService.refundPayment` (DD-42) | Only the screen is new |
| Stripe connection status | reuse | `integrations` | `integrationCredentialsService.resolve(<stripe integration id>, scope)` and `integrationStateService.isEnabled`, resolved from DI (V-C01) | Credentials stay in `integration_credentials`; only the mode is returned |

The source of truth stays where it is: charges and payments in `payments`, rentals in `facilities`, institutions and places in `club_core`, guardianships in `people`. No table is duplicated.

## Architecture and Data Flow

```text
staff rental / request approval (facilities command, one transaction)
  -> payments.chargeService.createForSource(em, input, ctx) -> payments_charges (rental)
  -> commit -> afterCommit() -> payments.charge.created
record payment on B-22 / cash / statement -> payments.payment.recorded
  -> facilities subscriber (facilities parity spec) -> statusOf -> rental confirmed

B-21 | B-22 | B-29 | B-32 row | B-01 widget -> AcceptCashButton -> CashAcceptForm
  -> POST /api/payments/cash -> payments.cash.record -> KP receipt, e-mail

scheduler (per organization) -> worker -> job command
  payments:generate-charges   daily 06:00    -> payments.charges.generate_due (new) -> generation service of payments.charges.generate
  payments:overdue-reminders  daily 09:00    -> payments.charges.remind_overdue (new) -> dispatch
  payments:reconcile-checkouts every 15 min  -> payments.checkouts.reconcile (new) -> reconcileCheckouts (service, as the CLI)
  payments:close-order-campaigns every 15 min -> payments.order_campaigns.close_due (new) -> closeOrderCampaigns (service, as the CLI)

people.guardianship.created|updated { wardPersonId } -> payments subscriber -> payments.charges.assign_payer (system)

GET /api/payments/dashboard?only=counts  <- spec N's menu counts (60 s)
```

- **Module boundaries:** `payments` stays one module. It registers a DI token another module may call, injects into the person record's new spot, the two Today spots and the dashboard, and listens to `people` events. It imports no Vereino module. `people` changes only additively: one injection spot and one payload field (Contract 6).
- **Extension points:** optional DI (`payments.chargeService`), widget injection (person record, Today page), dashboard widgets, module schedules, the foundation dispatch.
- **Alternatives considered:** `facilities` emitting an event that `payments` turns into a charge. Rejected by DD-19: the rental and its charge must commit or fail together.
- **Compatibility:** the guardianship event payload gains a field (additive, Contract 6). Every route change is additive except three, each listed in *Rollout*: the checkout accepts `partially_paid` (DD-C07), the charges list sorts differently by default, and `GET /api/payments/my-charges` marks partially paid charges `payable`. Existing `?perspective=` links keep working.

## User Journeys

### Journey J-C01 — Membership fees with the administrator as actor (replaces J-004)

1. Aneta, the club administrator, sets "Żaki fee PLN 150 / month" and the rule "siblings −30%" on `/backend/payments/fees`. On the same page she leaves "Generate charges automatically" on, with day 1.
2. On the 1st at 06:00 the job generates the month's charges: Ola the full rate of her group, Jaś PLN 105, payer Kasia, due on the 10th. The dashboard shows nothing to do. Aneta can still press "Generate period" for another month.
3. Kasia opens `/club/payments`. Both charges are ticked, the summary shows the charges, the fee line ("0 zł — paid by the club") and the total; she presses "Pay 255 zł", pays in the embedded form and sees "Paid".
4. A family pays in cash: Aneta opens the charge on B-22 and presses "Accept cash". The dialog opens with that payer chosen; she ticks the charges, saves, and the parent gets the KP e-mail. A part payment leaves the charge "partially paid", and the parent can pay the rest online.
5. On the 11th the reminder job e-mails each payer of an overdue charge once, then every 7 days, four times at most.
6. Failures: a declined payment leaves the charges open with a retry; a repeated webhook books once; a charge without a payer appears in "Charges without a payer" on the dashboard, and Aneta assigns the payer on B-22 (J-C05).

### Journey J-C02 — Coach's cash (replaces J-010 steps 3–5)

1. Steps 1–2 of J-010 stand: Wojtek opens `/club/coach/payments`, accepts PLN 255 for a fee and a kit through `POST /api/payments/group-charges/cash`, and reminds another payer. A link from the Today tile opens the page with his group and "To pay" chosen.
2. "Cash with you" shows the total he holds with the KP list.
3. Aneta receives the cash and confirms it on B-33 "Cash to settle". That page and the handover number are issue #118; until it lands the cash stays under "Cash with you" and Aneta reads who holds what in the "Cash payments" perspective of B-21.
4. Failures as in J-010 step 5, except the handover conflict, which belongs to #118.

### Journey J-C03 — A rental gets its charge

1. The facility attendant enters a rental of Boisko piłkarskie for "KS Sąsiedzi" (J-005 of the facilities spec). In the same transaction `payments` writes a charge payable to the municipality.
2. Aneta opens B-21, perspective "Rentals (municipality)": the charge shows the renter as payer and the badge "municipality" as payee. B-22 says "to the account of Gmina Przykładowo".
3. She records the transfer on B-22. The charge becomes `paid`; `facilities` confirms the rental from `payments.payment.recorded` (facilities parity spec).
4. The renter cancels more than 24 hours ahead: the charge becomes `cancelled`. A late cancellation forfeits it. If money was already recorded, the charge stays and the rental's response carries `charge_paid`.
5. Failure: the charge cannot be written (no payer of any kind) → 422, and no rental is saved.

### Journey J-C04 — Running the kit campaign from its record (completes J-009 steps 3–5)

1. Aneta opens `/backend/payments/orders/{id}`. The tiles read "14 / 22 — children in the selected groups", "1 320 zł — of 1 680 zł · due 30.11", "0 / 14 — Sportex". The tabs read "Orders (14)", "Supplier summary", "No order (8)".
2. A father pays at the office: she presses "Cash" in his row. The dialog opens with him chosen and only the kit charge ticked. After saving, the row shows "paid — cash — Aneta".
3. On "No order" she sees each child's guardians, "(no e-mail)" next to one and "no guardian" for another child, and presses "Remind everyone".
4. After delivery she presses "Hand over" in a row. For an unpaid order the warning "Still to pay: 120 zł" must be confirmed; the row then shows "handed over — Aneta".
5. She completes the campaign. Three kits are not handed over, so the dialog says "3 kits not marked as handed over" and asks again.
6. Failures: Hand over before delivery → the button is absent, the API answers 409; a stale row → 409 with a reload.

### Journey J-C05 — A charge without a payer, a manual charge and a refund

1. The dashboard widget "Charges without a payer" lists "Membership fee — Żaki · Period 2026-11 · Bartek". Aneta opens it. B-22 shows the warning "No payer" with "Assign payer" and a link to Bartek's guardianship tab.
2. She picks his mother from the list of his guardians. The charge now appears on the mother's `/club/payments`. Had she instead marked the mother as primary payer on the person record, the charge would have been assigned by itself.
3. On Bartek's person record, tab "Charges", she presses "Add charge": "Tournament fee", PLN 40, due in a week.
4. A parent paid online while the coach took cash for the same charge. The "To refund" perspective appears on B-21 with one row. On B-22 Aneta presses "Refund" on the online payment, keeps the suggested amount, gives a reason and confirms; the row shows the refund and the perspective disappears.
5. Failures: refund above the refundable part → 422 on the field; the gateway refuses → 502, nothing booked, the dialog stays open with the message; assigning a person who is not a guardian → 422.

### Journey J-C06 — The guardian orders and collects a kit on the phone (completes J-009 steps 2–3)

1. Kasia's Today page shows the tile "Order" with the campaign's name and deadline and "Jaś — not ordered". `/club/payments` shows the campaign card above her charges.
2. She orders on `/club/orders/{id}`. The summary shows the order's time, the lines and "Pay online 120 zł"; the link opens `/club/payments` with only that charge ticked.
3. After delivery `/club/orders` shows "ready for pickup from the coach". After the handover the order shows "Picked up — 12.12 17:40 · handed over by Wojtek Malinowski".
4. Tomasz, the other parent, is not the payer. His `/club/payments` says "Jaś: paid by Kasia" and offers no amounts.
5. A grandmother without an account opens her personal link: `/club/o/{token}` says "Personal link: Halina Nowak — do not pass it on".

## UI and Interaction Contracts

Conventions (page shells, `DataTable`, `CrudForm`, states) are those of `2026-10-20-vereino-club-management.md` and the standards S7.1 … S7.9. Polish texts come from the mockup's `i18n/pl.json` under the keys named below and are copied into `payments/i18n/pl.json` and `en.json` under `payments.*`. Every reference to a person, an institution or a group is a name, never an id.

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/backend/payments/charges` (B-21, `screenCharges`) | Head: "Accept cash", "Import statement" (link to B-29), "Add charge", "Generate period". Perspectives in the mockup's order: Membership fees, Overdue, Orders, Without payer, Rentals (municipality) when DD-C02 says so, Cash payments, All, To refund when not empty. Filters Period and Payee. Sort: period descending, then due date. "—" in Remaining for `paid`, `cancelled`, `forfeited` | `GET /api/payments/charges` (+ `meta`), `POST /api/payments/charges` | `payments/components/ChargesTable.tsx`; URL state as `people/components/PersonsTable.tsx` (precedent DD-U03) | `DataTable`, app-owned tablist, `StatusBadge`, `AcceptCashButton`, `CrudForm` dialog | loading, empty, filtered-empty, error, 409 generation in progress | REQ-C01, REQ-C02, REQ-C03, REQ-C06, REQ-C08 |
| `/backend/payments/charges/[id]` (B-22, `screenCharge`) | Head: "Accept cash" (payer chosen; only for an open charge with a person as payer), "Record payment", "Cancel charge". Tile "Payer and payee": payer name or "No payer" with "Assign payer"; "to the club's account" or "to the account of {owner}". Payments table: "Received by" shows the person or "bank statement"; row actions Reverse (cash, transfer) and Refund (online) | `GET /api/payments/charges/{id}`, `POST …/{id}/payer`, `POST /api/payments/payments/{id}/refund` | `payments/components/ChargeRecord.tsx`, `ReasonDialog.tsx`, `RecordPaymentDialog.tsx` | detail tiles, `DataTable`-style list, dialogs | loading, 404, error, 409 version, 422 per field, 502 gateway | REQ-C01, REQ-C02, REQ-C03, REQ-C06, REQ-C08 |
| `/backend/payments/bank` (B-29, `screenBank`) | Head: "Accept cash". Row buttons by status: Confirm / Change / Skip; Assign / Skip; Undo; Restore. Status badge "recorded automatically" when `autoBooked`. Import history as a table (file, when, who, items, automatic, to confirm, unmatched, skipped) with a row action Delete | `GET /api/payments/bank-transactions`, `GET /api/payments/bank-imports`, `DELETE /api/payments/bank-imports/{id}` | `payments/components/bank/BankStatementPage.tsx` | `DataTable` with perspectives, inline `Button`s (`RowActions` only under 640 px), `useConfirmDialog` | loading, empty, error, 409 status changed, 409 `bank_import_has_bookings` | REQ-C02, REQ-C04 |
| `/backend/payments/orders/[id]` (B-32, `screenKitCampaignAdmin`) | See the wireframe below | `GET /api/payments/order-campaigns/{id}`, `GET /api/payments/orders?campaignId=`, `GET …/{id}/missing`, `POST /api/payments/orders/{id}/hand-over`, `POST /api/payments/cash` | `payments/components/orders/OrderCampaignPage.tsx` | `DataTable` with tabs, `StatusBadge`, `AcceptCashButton`, `useConfirmDialog` | loading, empty ("Send parents the text with the link"), error, 409 | REQ-C02, REQ-C05 |
| `/backend/payments/orders/[id]/edit` (B-31, `screenKitBuilder`) | Editing an `open` campaign with orders: info alert `kit.screenKitBuilder.collectingTitle` / `collectingText` with the number of orders. A campaign past `open`: warning `lockedTitle` / `lockedText` and the link `backToCampaign` instead of a bare error | `GET /api/payments/order-campaigns/{id}` | `payments/components/orders/OrderCampaignForm.tsx` | `Alert`, link | locked, loading, error | REQ-C05 |
| `/backend/payments/fees`, tab "Coaches and payments" (B-20, `screenFees`) | Three groups: the existing coach setting; "Automatic charges and reminders" (switch, day 1–28, reminders switch); "Online payment" (status badge, methods as checkboxes, the fee mode read-only with a link to club settings B-02, key `b.screenFees.onlineFee`) | `GET/PUT /api/payments/settings` | `payments/components/PaymentsSettingsForm.tsx` | `CrudForm` groups | loading, error, 409 version, 422, status "not verified" | REQ-C13, REQ-C14 |
| `/backend/people/persons/[id]?tab=charges` (B-10, `screenPerson`) | Tab "Charges" (`b.screenPerson.tab.charges`), placed between Groups and Leaving (spec L's order Details, Guardians, Roles, Account, Groups, Charges, Leaving): the B-21 columns for charges the person owes or pays; "Add charge" for this person; rows open B-22 | `GET /api/payments/charges?involvesPersonId=` | the groups tab of `people/components/PersonRecord.tsx:177` | `InjectionSpot`, a narrowed `ChargesTable` | loading, empty ("No charges"), error; the tab is absent without `payments.view` or without `payments` | REQ-C06, REQ-C07 |
| `/backend` dashboard (B-01, `screenDashboard`, `kitDashboardWidget`) | "Bank statements and cash": "{n} transfers are waiting …" or "All imported transfers are settled", "{n} to refund" when any, buttons "Import statement" and "Accept cash". "Order campaigns": each campaign not `draft` or `completed` with its badge and "{orders} of {kids} children · paid {paid} of {value}". "Overdue": total, "{n} overdue charges · {n} families · {n} without a payer". "Charges without a payer": up to 5 rows (description · period · person), then "and {n} more". The same route's `?only=counts` feeds spec N's menu counts, not these widgets | `GET /api/payments/dashboard` | `payments/components/PaymentsDashboardWidget.tsx`, `widgets/dashboard/overdue` | dashboard widget frame | loading, empty line, error | REQ-C02, REQ-C09 |
| `/club/payments` (M-08, `screenPayments`, `paySummary`, `kitPayHint`) | See the wireframe below | `GET /api/payments/my-charges`, `GET /api/payments/my-orders`, `POST /api/payments/checkout/quote`, `POST /api/payments/checkout` | `payments/components/club/ClubPaymentsPage.tsx` | member frame, design-system form | loading, empty ("Everything is paid"), other-payer notice, error, payment in progress | REQ-C10 |
| `/club/cash` (M-15, `screenCashMobile`) | The line `b.cashForm.takenBy` under the form; "Received today" lists the charge's description over the receipt number, with the total to hand over. Used by the administrator today; the treasurer follows with #245 | `GET /api/payments/cash`, `POST /api/payments/cash` | `payments/components/club/ClubCashPage.tsx`, `cash/CashTodayList.tsx` | member frame, `CashAcceptForm` | loading, empty, 422, success | REQ-C12 |
| `/club/orders` (M-16, `screenKitList`) | Per campaign: stage badge; "orders until {date}", "ready for pickup from the coach" or "closed on {date}"; "payment due {date}"; per child the payment badge and "picked up" | `GET /api/payments/my-orders` | `payments/components/club/orders/ClubOrdersPage.tsx` | member frame, `StatusBadge` | loading, empty, error | REQ-C11 |
| `/club/orders/[campaignId]` (M-17, `kitOrderPage`, `kitOrderSummary`) | Head card: stage badge and both deadlines. Child chips with a check mark and a screen-reader text for a child with an order. Summary: "Order of {time}", lines, print, notes; "Ready for pickup from the coach" after delivery; "Picked up — {time} · handed over by {name}"; "Pay online {amount}" → `/club/payments?pay={chargeId}` | `GET /api/payments/order-campaigns/{id}/form` | `ClubOrderPage.tsx`, `OrderFormSection.tsx` | member frame | loading, closed, 409, 422, success | REQ-C11 |
| `/club/o/[token]` (M-19, `screenKitToken`) | Info notice `kit.screenKitToken.personalLink` with the guardian's name and `personalLinkText` above the form | `GET /api/payments/order-links/{token}` | `OrderLinkPage.tsx` | sessionless frame | 410, 404, as M-17 | REQ-C11 |
| `/club/coach/payments` (M-18, `screenGroupPayments`) | Group card: total, late count and the club's mode (`m.screenGroupPayments.modeCollect` / `modeView` / `modeNone`). Chip suffix `sectionSuffix` for a group that is not the caller's own. `?group=&due=1` selects the group and the filter and is kept in the URL. Handover badge with the time | `GET /api/payments/group-charges?groupId=&due=` | `payments/components/club/coach/CoachPaymentsPage.tsx` | member frame | loading, empty, 403, 409, 422 | REQ-C12 |
| `/club` Today (M-02, `kitTodayTiles`) | Tile "Order" for each `open` campaign covering the caller's wards: name, "orders until {date}", per child "ordered — {amount}" or "not ordered", link to M-17; a new widget on the spot `vereino:club:today:sections`. The payments tile (`club-today-payments`, spot `vereino:club:today:payments`) gains the state "paid by {name}" | `GET /api/payments/my-orders`, `GET /api/payments/my-charges/summary` | `payments/widgets/injection/club-coach-payments` (same spot as the "Order" tile), `club-today-payments` | injection widgets | hidden when nothing applies | REQ-C10, REQ-C11 |

### UI architecture

Navigation groups, their order and names, the member bottom bar and "More" are specified in the navigation spec; this table names only what this spec adds.

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Club administrator | Finance → Fees and discounts, Charges, Bank statements, Order campaigns (unchanged items) | "Bank statements and cash", "Order campaigns", "Overdue", "Charges without a payer" | `/backend` → "Accept cash" in the widget → payer → save: 3 clicks. `/backend` → campaign in the widget → "Cash" in the row: 2 clicks |
| Payer | Payments (entry points: navigation spec) | Today tiles "Payments" and "Order" | `/club` → tile "Pay" → "Pay {amount}": 2 taps (everything is ticked) |
| Coach, coordinator | My groups' payments (entry points: navigation spec) | Today tile "My groups' payments" linking `?group=&due=1` | `/club` → tile → "Accept cash": 2 taps |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| B-21 | "No charges — generate a period" + Generate period; filtered: "No charges match" + Clear filters | Filters collapse into the drawer under 768 px; Payee and Period columns hide under 640 px | Tablist with arrow keys; the URL updates without a reload |
| Cash dialog | "No payer has anything to pay" | Full-screen sheet under 640 px | Focus on the payer search, or on the amount when the payer is preselected; Escape closes; Ctrl/Cmd+Enter saves |
| B-29 rows | "No transfers to confirm" | Row buttons fold into `RowActions` under 640 px | Buttons are in tab order; a decision moves focus to the next row |
| B-32 Orders | "Send parents the text with the link" + Text for Messenger | "Ordered by" and "Print" hide under 768 px; actions stay | Row buttons in tab order; dialogs trap focus |
| Person record, Charges | "No charges" + Add charge | As B-21 | As B-21 |
| M-08 | "Everything is paid"; other payer: the notice | 375 px: one column; the pay button sticks to the bottom (S7.9 Fitts) | Checkboxes are labelled by the charge; the summary is a live region |
| M-16, M-17, M-19 | "No orders" with the explanation | 375 px: cards; chips scroll horizontally | Chips are links with `aria-current` |
| M-18 | "Everything is paid" | 375 px: chips scroll; buttons at least 24 × 24 px | Filter is a group of two buttons with `aria-pressed` |

### `/backend/payments/orders/[id]` — Order campaign (B-32)

```text
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Academy kit 2026/27                  [Edit form] [Text for Messenger] [Close orders]│
│ Akademia · 3 groups · orders until 20.11 · payment due 30.11                        │
│ (draft) (collecting) (closed) (ordered) (delivered) (completed)                     │
├───────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ Orders       14 / 22  │ Paid               1 320 zł │ Handed over            0 / 14 │
│ children in the       │ of 1 680 zł · due 30.11     │ Sportex                       │
│ selected groups       │                             │ (or "supplier not specified") │
├───────────────────────┴─────────────────────────────┴───────────────────────────────┤
│ [Orders (14)] [Supplier summary] [No order (8)]                                     │
│ Child          Ordered by           Items         Print   Amount Payment   Handover │
│ Kowalski Jan   Kowalska Kasia       Set (116…)    JAŚ 7   120 zł to pay 120 zł  —   │
│ Żaki           600 100 200 · app    Notes: …                     overdue            │
│                                                   [Cash] [Hand over] [Charge]       │
│ Nowak Ola      Nowak Piotr          Shirt — 140   —        60 zł paid      handed   │
│ Trampkarze     … · e-mail link                                  cash — W.M. over    │
│                                                                           W. M.     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

- **Behavior:**
  - "Ordered by" shows the orderer's name, then the contact phone and the channel (`kit.via.app`, `kit.via.email_link`). Notes follow the items.
  - "Payment" shows the badge (to pay with the remaining amount, in the error variant when overdue; partially paid; paid) and, for each payment, the method and the collector's name. The suffix "held by the collector" arrives with #118.
  - "Handover" shows "—" or the badge "handed over" with the person's name; the time is in the title.
  - "Cash" shows while the charge is not paid and opens the shared dialog with the orderer and that charge. "Hand over" shows only in `delivered` for an order not yet handed over; an unpaid order asks `action.kitHand.unpaidTitle` with the amount. "Charge" links to B-22.
  - The Paid tile's hint is `kpiPaidHint`; the Handed over tile's hint is the supplier's name or `noSupplier`.
  - "Supplier summary" adds the column "Of which in sets" and, while the campaign is `open`, the warning `collectingTitle` / `collectingText`. The on-screen prints table adds the child's name, as in the mockup; the supplier CSV stays without it (Q-C11).
  - "No order" adds the column "Guardians": names, "(no e-mail)" after a guardian without an address, "no guardian" when there is none.
  - "Close orders" names the number of children without an order, the payment deadline and the automatic closing date (`action.kitStatus.closeAuto`). "Complete" with kits not handed over uses the danger dialog `action.kitStatus.completeNotHanded`.
- **Responsive and accessibility:** the stage chips mark the current one with `aria-current="step"`; badges carry text; the row buttons have accessible names that include the child's name.
- **Localization:** `payments.orders.orders.*`, `payments.orders.kpi.*`, `payments.orders.missing.*`, `payments.orders.next.*` in en and pl.
- **Design-system and theming:** `StatusBadge` variants and semantic tokens only; checked in light and dark mode.

### `/club/payments` — Payments (M-08)

```text
┌──────────────────────────────────────┐
│ Academy kit 2026/27        [until 20.11]│
│ Order — order for your child         │
├──────────────────────────────────────┤
│ TO PAY                               │
│ [x] Membership fee — Żaki      105 zł│
│     Period 2026-11 · due 10.11 ·     │
│     discount Siblings −45 zł         │
│ [x] Kit — Academy kit           50 zł│
│     due 30.11  [partially paid]      │
│ Jaś: paid by Kasia   (other payer)   │
├──────────────────────────────────────┤
│ Charges                        155 zł│
│ Online payment fee  0 zł — paid by   │
│                     the club         │
│ Total                          155 zł│
│ [          Pay 155 zł              ] │
│ Transfer: account, payer code GW-K7Q2│
└──────────────────────────────────────┘
```

- **Behavior:** on load every payable charge is ticked and the quote is requested once; unticking updates the summary and the button. `?pay={chargeId}` ticks only that charge. The fee line always shows: `m.screenPayments.sumFeeClub` in `club_pays` mode, the amount in `payer_pays`. The discount line names the rule (`m.screenPayments.discount`). The campaign card shows for the first `open` campaign that covers the caller's wards: "order for your child" while a ward has no order, otherwise "see orders". A row for another payer has no checkbox and no amount.
- **Responsive and accessibility:** 375 px, both locales, light and dark; the summary is `aria-live="polite"`; a disabled row says why in text.
- **Localization:** `payments.club.*`.
- **Design-system and theming:** semantic tokens; no hard-coded colours.

For backend UI, implementation must invoke `om-backend-ui-design` and follow `.ai/guides/backend-ui.md`.

## Data Models

Entity ownership, soft-delete rules and scope columns are those of the base spec. Only changes are listed.

### `payments_charges` (changed)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `payer_institution_id` | uuid, null | — | no | Migration A1. Set by `createForSource`; an id of `club_core`, never a relation |
| `payee_institution_id` | uuid, null | — | no | Migration A1. Set by `createForSource`; null shows "the facility owner" |
| `payer_label` | text, null | — | yes — added to `payments/encryption.ts` | Migration A1. The typed-in renter's name; at most 200 characters |
| `last_reminded_at` | timestamptz, null | — | no | Migration B. Written by `payments.charges.remind_overdue` only |
| `reminder_count` | int, default 0 | — | no | Migration B. 0–4 (DD-C09) |
| index | (`organization_id`, `source_type`, `source_id`) | new, non-unique | — | Migration A2. The lookup of `cancelForSource` and of the idempotent create |
| unique | (`organization_id`, `source_id`) where `source_type = 'rental'`, `status <> 'cancelled'`, `deleted_at IS NULL` | new, partial | — | Migration A2. One live rental charge per rental |

Migration A is split in two, because `CREATE INDEX CONCURRENTLY` cannot run inside a transaction: **A1** adds the three columns in an ordinary transactional migration; **A2** builds the two indexes `CONCURRENTLY` with `SET lock_timeout = '5s'` in a separate migration whose `isTransactional()` returns `false`, as `club_core/migrations/Migration20261103220618` does. A2 runs after A1; both ship in phase 1.

### `payments_checkouts` (changed — migration D)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `charge_amounts` | int[], null | — | no | Grosz; one share per entry of `charge_ids`, in the same order; written once by `payments.checkout.create` (each charge's remaining amount at that moment); the shares sum to `amount`. Null for checkouts created before migration D (DD-C07) |

### `payments_settings` (changed)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `auto_generate_charges` | boolean, default true | — | no | Changed through `payments.manage` |
| `generation_day` | int, default 1 | — | no | 1–28 |

`auto_generate_charges`, `generation_day` and `overdue_reminders` are migration B; `online_methods` is migration C.
| `overdue_reminders` | boolean, default true | — | no | — |
| `online_methods` | text[], default `{card}` | — | no | Non-empty subset of `card`, `blik`, `p24` |

### `payments_bank_imports`, `payments_bank_transactions` (behaviour only)

No column changes. `payments.bank_imports.delete` hard-deletes the import's transactions and the import and removes the file from the private `attachments` partition (DD-C13). The command's audit entry keeps the file name, the counts and the actor.

No other table changes: the migrations are A1, A2, B, C and D, all in `payments`. `people` gains an injection spot and an event payload field (`wardPersonId`, Contract 6), not a column. The order reads use columns that exist (`ordered_by_person_id`, `contact_phone`, `submitted_via`, `notes`, `handed_over_at`, `handed_over_by_person_id`, `supplier_name`).

## API, Command, and Error Contracts

The route conventions (S6.3–S6.7, versions, 409s, error codes) of the club spec apply. New routes are custom guarded command routes with per-method `metadata` and OpenAPI schemas; new error codes go to `payments/lib/error-codes.ts`.

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| DI / `createForSource` | `payments.chargeService` | the caller's command context | `em`, `{ sourceType: 'rental', sourceId, payee: 'owner_institution', payeeInstitutionId, payerInstitutionId?, payerPersonId?, payerDisplayName?, amount, dueDate, description }`, `ctx` | `{ chargeId, afterCommit }`; `afterCommit` emits `payments.charge.created` | 422 `charge_payer_required`, `charge_amount_invalid` (thrown, so the caller's transaction rolls back); idempotent per `sourceId` | REQ-C01 |
| DI / `cancelForSource` | `payments.chargeService` | as above | `em`, `{ sourceType, sourceId, outcome }`, `ctx` | `{ warning?: 'charge_paid', afterCommit? }`; `payments.charge.cancelled` after commit | no-op when nothing to cancel | REQ-C01 |
| DI / `statusOf` | `payments.chargeService` | as above | `chargeIds[]`, `ctx` | `Map<chargeId, status>` | unknown ids absent | REQ-C01 |
| `GET` | `/api/payments/charges` (changed, additive) | `payments.view` + `club_admin` grant | new filters `involvesPersonId`, `toRefund=1`; `payee` now offered by the UI; default sort `period_label` desc, then `due_date` asc (the list's stable tiebreak; a period's charges oldest due first) | each item adds `payerInstitution { id, name }?`, `payeeInstitution { id, name }?`, `payerLabel?`; the response adds `meta { rentalsPerspective, toRefundCount }` | 400, 403 | REQ-C01, REQ-C03, REQ-C07, REQ-C08 |
| `GET` | `/api/payments/charges/{id}` (changed, additive) | `payments.view` | — | adds the three payer/payee fields, `payerOptions[]` when `payerMissing` (the debtor's active guardians, the debtor if adult) and, per payment, `source` (`manual` / `bank_statement` / `cash` / `online`), `refundable`, `refunds[]` | 404, 403 | REQ-C01, REQ-C03, REQ-C06, REQ-C08 |
| `POST` / `payments.charges.create_manual` | `/api/payments/charges` | `payments.manage` | `{ personId, description, amount, dueDate, payerPersonId? }` | 201 `{ chargeId, payerMissing }`; `payments.charge.created`; audited, not undoable (cancel instead) | 400 description or amount; 422 `charge_due_date_out_of_range` (with `from` and `to`), `charge_payer_not_eligible`; 404 person | REQ-C06 |
| `POST` / `payments.charges.assign_payer` | `/api/payments/charges/{id}/payer` | `payments.manage` | `{ payerPersonId }` + version | 200 `{ updatedAt }`; `payments.charge.payer_assigned` (ids only); audited | 409 `charge_payer_already_set`, `charge_not_payable`, version; 422 `charge_payer_not_eligible` | REQ-C06 |
| `POST` / `payments.payments.refund` | `/api/payments/payments/{id}/refund` (unchanged) | `payments.manage` | `{ amount?, reason, operationId }` + version | as the base spec | as the base spec | REQ-C08 |
| `GET` | `/api/payments/bank-imports` (changed, additive) | `payments.bank.import` | — | each item adds `importedBy { firstName, lastName }`, `deletable` | 403 | REQ-C04 |
| `DELETE` / `payments.bank_imports.delete` | `/api/payments/bank-imports/{id}` | `payments.bank.import` | version | 204; `payments.bank_import.deleted` (ids and counts); audited, not undoable | 409 `bank_import_has_bookings`, version; 404 | REQ-C04 |
| `GET` | `/api/payments/orders?campaignId=` (changed, additive) | `payments.orders.manage` | — | each row adds `orderedByPersonId`, `contactPhone`, `submittedVia`, `notes`, `dueDate`, `overdue`, `payments[] { method, collectedBy }`, `handedOverAt`, `handedOverBy` | 403 | REQ-C05 |
| `GET` | `/api/payments/order-campaigns/{id}`, `…/{id}/summary` (changed, additive) | `payments.orders.manage` | — | the campaign adds `supplierName` and `kpis.notHandedOver`; the JSON summary adds `inSets` per product and size and `participant` per print (the CSV is unchanged) | 404 | REQ-C05 |
| `GET` | `/api/payments/order-campaigns/{id}/missing` (changed, additive) | `payments.orders.manage` | — | each item adds `guardians[] { firstName, lastName, hasEmail }` | 403, 404 | REQ-C05 |
| `POST` | `/api/payments/cash` (changed, additive) | `payments.cash.record` | adds optional `origin` (`charges`, `charge`, `bank`, `order_campaign`, `dashboard`, `phone`) | unchanged; `origin` goes to the audit context | unchanged | REQ-C02 |
| `GET` | `/api/payments/cash/payers` (changed, additive) | `payments.cash.record` | adds `personId` (one payer by id, for the preselection) | one item or none | 403 | REQ-C02 |
| `GET` | `/api/payments/dashboard` (changed, additive) | `payments.view` + `club_admin` grant | optional `only=counts` | adds `overdue.withoutPayer`, `withoutPayer.items[]` (up to 5: description, period, person) and `withoutPayer.more`, `bank { toDecide }` (with `payments.bank.import`), `toRefund { count }`, `campaigns[] { id, name, status, orders, children, paid, value }` and `campaignsRunning` (the length of `campaigns[]`) (with `payments.orders.manage`). With `only=counts` the response holds only `bank { toDecide }` and `campaignsRunning`, each under its own feature and omitted without it: two indexed count queries (`payments_bank_transactions.status`, `payments_order_campaigns` `(organization_id, status)`), no list and no decryption — spec N's menu counts call it on navigation and every 60 seconds, within S7.6's list p95 ≤ 500 ms | 400 unknown `only`, 403 | REQ-C09 |
| `GET` | `/api/payments/my-charges` (changed) | `payments.view_own` | — | each item adds `discountName`; `payable` is true for `open` and `partially_paid`; adds `otherPayers[] { wardFirstName, payerFirstName }` | 403 | REQ-C10 |
| `GET` | `/api/payments/my-charges/summary` (changed, additive) | `payments.view_own` | — | adds the state `other_pays` with `payerFirstName` | 403 | REQ-C10 |
| `POST` / `payments.checkout.create` | `/api/payments/checkout`, `/quote` (changed) | `payments.pay_online` + payer of the charges | `{ chargeIds[] }` | amount = the sum of what remains on each charge; each charge's remainder is stored in `charge_amounts` (migration D, DD-C07); `paymentTypes` = the club's `online_methods` | 409 `charge_not_open` only for `paid`, `cancelled` and `forfeited`; 403 `checkout_charge_forbidden` for a rental charge | REQ-C10, REQ-C14 |
| `GET` | `/api/payments/my-orders` (unchanged) | `payments.orders.place` | — | already returns each campaign's `status`, `paymentDueOn` and `ordersOpen` and each child's state (`payments/services/orders.ts:126-137`); only the page changes | 403 | REQ-C11 |
| `GET` | `/api/payments/order-campaigns/{id}/form`, `/api/payments/order-links/{token}` (changed, additive) | as today | — | the campaign's `status` and `paymentDueOn` and the order's `notes` are already there; each existing order adds `submittedAt`, `handedOverAt`, `handedOverBy { firstName, lastName }`; the link read adds `guardian { firstName, lastName }` | as today | REQ-C11 |
| `GET` | `/api/payments/group-charges` (changed, additive) | `payments.groups.view` | — | adds `coachFeeAccess`; each group adds `own`; each order adds `handedOverAt` | 403 | REQ-C12 |
| `GET`, `PUT` | `/api/payments/settings` (changed, additive) | `payments.manage` | adds `autoGenerateCharges`, `generationDay`, `overdueReminders`, `onlineMethods` | adds the same and, read-only, `onlineConnection` and `onlineFeeMode` | 422, 409 version | REQ-C13, REQ-C14 |
| job command (all four new) | `payments.charges.generate_due`, `payments.charges.remind_overdue`, `payments.checkouts.reconcile`, `payments.order_campaigns.close_due` | system (worker) | `{ tenantId, organizationId, now? }` | counts in the job log. `generate_due` runs the generation service of the existing manual command `payments.charges.generate`; `reconcile` and `close_due` wrap `reconcileCheckouts` and `closeOrderCampaigns`, which the CLI calls directly | idempotent; a failure is retried by the queue | REQ-C13 |
| event payload (changed, additive) | `people.guardianship.created`, `.updated`, `.deleted` | — | — | adds `wardPersonId` to `{ id, tenantId, organizationId, guardianPersonId }` (Contract 6) | consumers that ignore unknown fields are unaffected | REQ-C06 |

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| schedule `payments:generate-charges`, cron 06:00 in the club's time zone | scheduler | `payments` worker → `payments.charges.generate_due` | the current month's charges when due (DD-C08), never for the month in which migration B was applied; the result is a `payments_charge_generations` row like a manual run | unique charge index; the per-club advisory lock; an undone month is not regenerated |
| schedule `payments:overdue-reminders`, cron 09:00 club time | scheduler | `payments` worker → `payments.charges.remind_overdue` → foundation `dispatch` | one e-mail (`payments.charge_reminder`) and one in-app notification `payments.charge_overdue` per payer with the overdue charges, the payer code and a link to `/club/payments` | marker and count in the enqueueing transaction; at most 4 per charge; off when `overdue_reminders` is false |
| schedule `payments:reconcile-checkouts`, every 15 minutes | scheduler | `payments` worker → `payments.checkouts.reconcile` (new command over the service `reconcileCheckouts`) | the sweep of DD-42, today the CLI `payments reconcile-checkouts` | unchanged logic; `last_checked_at` |
| schedule `payments:close-order-campaigns`, every 15 minutes | scheduler | `payments` worker → `payments.order_campaigns.close_due` (new command over the service `closeOrderCampaigns`) | `open` past `closes_on` → `closed`; today the CLI `payments close-order-campaigns` | status condition in the UPDATE |
| `people.guardianship.created`, `people.guardianship.updated` (payload with `wardPersonId`, Contract 6) | `people` | `payments` subscriber | reads the ward's current primary payer through `people.personDirectory.primaryPayers` and assigns them to the ward's open charges without a payer; emits `payments.charge.payer_assigned` | persistent subscriber; skips charges that have a payer; ignores an event without `wardPersonId` |
| `payments.charge.created` (rental) | `payments`, from `afterCommit()` | audit; `facilities` may listen | — | emitted only after the rental's commit (DD-19) |
| `payments.charge.payer_assigned` (new) | `payments` | audit | ids only: charge, payer | — |
| `payments.bank_import.deleted` (new) | `payments` | audit | ids and counts | not undoable |
| `payments.payment.recorded` (unchanged) | `payments` | `facilities` (facilities parity spec) | confirms a rental whose charge is paid | ids only; DD-19, DD-46 |

`payments/setup.ts` registers the four schedules in `seedDefaults` per organization; the helper upserts on stable ids, so a redeploy registers nothing twice. The cron jobs use the club's time zone, read as `facilities/setup.ts` does. Dashboard counts are read on request; no cache is added.

## Security, Privacy, and Compliance

- **Authorization:** feature gates only, as listed in *API*; the panel reads keep the `club_admin` grant of phase 4. The charge service trusts no scope from its input: tenant and organization come from `ctx`, and `statusOf` filters by them. The person record's tab cannot widen what `GET /api/payments/charges` returns.
- **Tenant isolation:** every new query filters by `tenant_id` and `organization_id` and fails closed; the workers re-validate the registration's scope. TEST-C02 and TEST-C13 read across two tenants.
- **Sensitive data:**
  - `payer_label` holds a renter's name and is encrypted; `description` already is.
  - The orderer's phone and notes are decrypted for B-32 through `findWithDecryption` and stay out of the supplier CSV (base spec *Security*).
  - A guardian who is not the payer receives a first name and no amount (DD-C06).
  - The connection status exposes a mode, never a key.
  - Deleting an import removes third-party bank data and its file; the audit entry holds no transaction content.
- **Abuse and failure modes:**
  - A refund retried with the same `operationId` returns the same refund (DD-42).
  - A partial online payment cannot overpay: the share is capped at fulfilment, and the excess is flagged, never lost (DD-C07).
  - Reminder mail is capped per charge and per day (one message per payer).
  - `assign_payer` accepts only a guardian of the debtor, so a charge cannot be pushed onto a stranger.
  - The manual charge has the PLN 100 000 limit of #185.
  - Two cash dialogs open on the same charge: the second save answers 409 or 422 from the existing row lock.

## Integration Coverage

Tests are self-contained (their own tenant, club and people), live in `packages/app/.ai/qa/tests/payments/` next to the `E07-*` files, and run with `yarn test:integration:vereino --filter`. Online payment uses the gateway test adapter `vereino_test` (#110). Member pages are checked at 375 px in both locales, light and dark (D-029, S7.8).

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-C01 | integration | club with a place owned by a municipality; renters of each type; `payments` and `facilities` enabled | staff rental; request approval; free and late cancellation; cancellation after a recorded payment; a second create for the same rental; a rental with no payer of any kind | one `rental` charge with payer institution, person or label and `payee = owner_institution`; `Rental.chargeId` set; `cancelled` / `forfeited`; `charge_paid` warning and the charge untouched; the second create writes nothing; 422 `charge_payer_required` and no rental row; `payments.charge.created` only after commit; `payer_label` encrypted in the database | REQ-C01 |
| TEST-C02 | security | two tenants with charges and rentals; a payer with a rental charge in their name | `statusOf` with a foreign charge id; `GET /api/payments/charges?involvesPersonId=` of the other tenant; `my-charges` and checkout with a rental charge; the person tab as a coordinator | foreign ids absent; empty list; the rental charge is not in `my-charges` and the checkout answers 403; no Charges tab without `payments.view` | REQ-C01, REQ-C07 |
| TEST-C03 | UI | charges of every source; `facilities` enabled, then a club without it and without rental charges | B-21: perspectives and their order; Payee filter; reload with the URL; default sort; a paid row; "Import statement" | "Rentals (municipality)" present, then absent; the filter narrows every perspective; the URL restores perspective and filters; period descending; "—" in Remaining; the link opens B-29; B-22 of a rental charge reads "to the account of {owner}" and of an imported transfer "bank statement" | REQ-C01, REQ-C03 |
| TEST-C04 | integration + UI | payer with three charges, one of them a kit order; an unmatched transfer; a delivered campaign | "Accept cash" from B-21, B-22, B-29, a B-32 order row and the dashboard widget | B-22: payer chosen, focus on the amount; B-32: orderer chosen and only the order's charge ticked; every save issues one KP number and refreshes the screen it came from; the audit context carries `origin`; B-22 of a rental charge shows no "Accept cash" | REQ-C02 |
| TEST-C05 | integration + UI | statement with a confident match, a suggestion, an unmatched transfer and a skipped one | B-29 row buttons per status; undo; delete the import before and after a booking; re-import the deleted file | buttons are in the row, not in a menu, at 1280 px; "recorded automatically" only for `autoBooked`; history is a table with the eight columns; delete with a booked or booked-then-undone transfer → 409 `bank_import_has_bookings`; otherwise 204, the transactions and the file are gone and the same file imports again; stale version → 409 | REQ-C04 |
| TEST-C06 | UI | campaign with a supplier, orders from the app and from a link, paid, partly paid in cash by a coach, overdue; children without an order, one without a guardian, one whose guardian has no e-mail | B-32 through its stages; Cash; Hand over paid and unpaid; Complete with kits left; B-31 on the open and on the closed campaign | every column of the wireframe; KPI hints and the supplier; tab counts; guardians with "(no e-mail)" and "no guardian"; Hand over absent before `delivered`; the unpaid warning names the amount; the completion dialog names the number; B-31 shows the orders alert, then the locked warning with the back link | REQ-C05 |
| TEST-C07 | integration + UI | minor with a guardian who is not the payer; minor without a guardian; adult member | manual charge for each; assign a guardian, a stranger, a second time, with a stale version; mark a guardian as primary payer | payer resolved by the *Payer* rule or `payer_missing`; assignment clears the flag and the charge appears on the payer's M-08; stranger → 422 `charge_payer_not_eligible`; second → 409 `charge_payer_already_set`; the guardianship events carry `wardPersonId`; the new primary payer is assigned by the subscriber once, also when the event is replayed; a paid charge is untouched | REQ-C06 |
| TEST-C08 | UI | person who owes two charges and pays a third | person record → Charges as administrator and as coordinator; "Add charge" | three rows with the B-21 columns; a row opens B-22; the new charge appears; the coordinator has no tab; `?tab=charges` opens it | REQ-C06, REQ-C07 |
| TEST-C09 | integration + UI | online payment; an online overpayment from a charge paid in cash meanwhile (TEST-057 c) | B-21 "To refund"; refund in part, the rest, above the refundable part, a retry with the same operation id, a gateway error | the perspective and the widget line appear with one row and disappear after the full refund; reversing entries with `gateway_refund_id`; 422 on the field; the retry returns the same refund; 502 leaves nothing booked and the dialog open | REQ-C08 |
| TEST-C10 | UI | transfers to decide, two running campaigns, overdue charges of two families and one without a payer | the administrator's dashboard | "Bank statements and cash" with the count and both actions; "Order campaigns" with each campaign's progress line and link; "Overdue" with charges, families and without-payer counts; "Charges without a payer" with its rows; each "Open" link lands on the right perspective; the campaigns widget is absent without `payments.orders.manage`; `?only=counts` returns exactly `bank.toDecide` and `campaignsRunning`, equal to the full read, each omitted without its feature, and another tenant's transactions and campaigns are not counted | REQ-C09 |
| TEST-C11 | integration + UI (375 px) | payer with an open charge with a sibling discount and a partially paid one; `club_pays`, then `payer_pays`; an open campaign; a second guardian of the same child | open M-08; untick; pay; a cash payment for the partially paid charge between checkout and capture; `?pay={id}`; open M-08 and Today as the second guardian | everything ticked and the button shows the total on entry; the fee line in both modes; the discount names the rule; the campaign card; the checkout total is the sum of the remainders and `charge_amounts` holds them; the partially paid charge is booked for its remainder only, with no overpayment; after the cash payment in between, the share above what remains becomes an overpayment "to refund"; `?pay=` ticks one charge; the second guardian sees "Jaś: paid by Kasia", and the API response holds no amount for that ward | REQ-C10 |
| TEST-C12 | UI (375 px) | campaign `open`, then `delivered`, then an order handed over; a guardian with a personal link | Today; M-16; M-17 before and after delivery and handover; "Pay online"; M-19 | the "Order" tile with per-child state, gone when no campaign is open; stage badge and payment deadline on M-16; "ready for pickup from the coach"; "Picked up — {time} · handed over by {name}"; the pay link opens M-08 with that charge only; M-19 names the guardian | REQ-C11 |
| TEST-C13 | UI (375 px) | administrator on M-15; coach of one group and coordinator of the section; `coach_fee_access` in each mode | M-15 save; M-18 from the Today tile link; switch group; hand over a kit | "Received by: {name}" before saving; today's list shows the description over the receipt; M-18 opens with the group and "To pay" from the URL and keeps them on reload; the mode line per setting; "(section)" on groups that are not the caller's own; the handover badge carries the time | REQ-C12 |
| TEST-C14 | integration | two clubs in two tenants with fees; charges due yesterday, 8 days ago and 40 days ago; a `created` checkout the provider has captured; an `open` campaign past its deadline | each job command with `now`: in the month in which migration B was applied (after its generation day), then in the next month before and on the generation day, twice, after an undo, with the switch off; reminders on day +1, +7 and after four; one payer with three charges; switch off; the two sweeps; `seedDefaults` twice | nothing generated in migration B's month; one generation per later month, none before the day, none after an undo or when off; one message per payer listing three charges; `reminder_count` stops at 4; no reminder for a rental charge or a charge without a payer; the checkout is fulfilled; the campaign is `closed`; four schedules per organization, not eight; the other tenant is untouched | REQ-C13 |
| TEST-C15 | integration + UI | club with the test adapter; settings with `card`, then `card` and `blik` | save the methods; start a checkout; empty selection; the settings tab with and without stored credentials | the adapter receives the saved `paymentTypes`; empty → 422; the status badge reads connected (test), connected (live), not connected or "not verified"; the fee mode is shown with a link to club settings and cannot be changed here | REQ-C14 |
| TEST-C16 | unit | `payments/lib/**` | the pure rules: reminder due, generation due (including the first automatic month after migration B's month), perspective set and order, checkout shares and overpayment split, deletable import, payer eligibility, payer display order. The fulfilment spread (`lib/checkout-rules.ts`) has its own cases: a partially paid charge whose stored share equals its remainder books no overpayment; a share above the remainder at fulfilment books the difference as an overpayment; `charge_amounts` null keeps the spread by `amountDue` | 100 % of the new and changed functions (`AGENTS.md` coverage rule) | REQ-C01, REQ-C03, REQ-C04, REQ-C06, REQ-C10, REQ-C13 |

## Implementation Phases

Validation for every phase: `yarn verify` (including `typecheck:packages`, the strict i18n check, `contracts:check` and `build`), the phase's integration tests, and for a phase with a migration the SQL review from `yarn db:generate` — never `yarn db:migrate` without approval. Each phase is one pull request and leaves a working app. The migrations of phases 1 (A1, A2), 8 (D), 11 (B) and 12 (C) and the contract changes of every phase were approved by the owner on 2026-11-16 (Q-C20, *Rollout*); each migration's SQL from `yarn db:generate` is shown in its pull request before it is applied. The phases are independent unless "Depends on" says otherwise; dependencies on the other parity specs are in *Dependencies on the other parity specs*.

### Phase 1 — Rental charge service

- **Depends on:** migrations A1 and A2 and Contract 1 (approved 2026-11-16). Issue #291 (S01). The facilities parity spec (R) consumes it (payee, description, confirmation in its phase 11) and can land before or after; R's phase 11 needs this phase first.
- **Outcome:** J-C03 steps 1, 2 and 4 work; a rental has its charge.
- **Why this order / value delivered:** it unblocks the facilities spec's promises (J-005, AC-013, AC-024) and is the only cross-module contract here.
- **Rollout fact until spec R lands:** `facilities` passes `payeeInstitutionId: null` and the renter's name as the description (`facilities/commands/rentals.ts:221-238`, `facilities/commands/requests.ts:444-461`). B-22 then reads "to the account of the facility owner" without a name, and the list shows the renter's name as payer and as description. Spec R's phase 11 passes the owner and the `charge.rentalDesc` description; this phase changes nothing in `facilities`.
- **Deliverables:**
  - migration A1 (columns, transactional) and migration A2 (the two indexes, `isTransactional() = false`, `CONCURRENTLY`, `lock_timeout = '5s'`); `payments/data/entities.ts`, `encryption.ts` (`payer_label`);
  - `payments/services/directory.ts`: a new `findInstitutions` wrapper (today it wraps only `findSections` of `club_core`'s directory);
  - `payments/services/charge-service.ts` and its registration in `payments/di.ts`;
  - `lib/charge-ledger.ts`: the perspective rule of DD-C02 and the payer display order;
  - `api/charges/route.ts` and `[id]/route.ts`: institution fields, `meta.rentalsPerspective`; the checkout and `my-charges` exclude rental charges;
  - `ChargesTable.tsx` (the flag removed, Payee filter), `ChargeRecord.tsx` (owner line).
- **Independent slices / estimated commits:** (a) entity, migration and service: 1; (b) reads and exclusions: 1; (c) B-21 and B-22: 1.
- **Requirements closed:** REQ-C01
- **Tests:** TEST-C01, TEST-C02 (rental part), TEST-C03 (rental part), TEST-C16
- **Validation:** as above
- **Exit gate:** a rental entered in the browser shows under "Rentals (municipality)", and B-22 names the owner when the rental passes one, otherwise "the facility owner"; light and dark.

### Phase 2 — Cash dialog on every screen; B-21 and B-22 completeness

- **Depends on:** none (the B-32 mount lands with phase 3)
- **Outcome:** J-C01 step 4 works from B-22; B-21 and B-22 match the mockup.
- **Why this order / value delivered:** the administrator's most frequent money action; phases 3 and 7 reuse the button.
- **Deliverables:** `CashAcceptForm.tsx` props, `AcceptCashButton.tsx`, `api/cash/payers` (`personId`), `api/cash` (`origin`); `ChargesTable.tsx` (import link, URL state, order, sort, "—"); `ChargeRecord.tsx` (button, "bank statement"); `BankStatementPage.tsx` (button).
- **Independent slices / estimated commits:** (a) the form and button: 1; (b) B-21: 1; (c) B-22 and B-29 mounts: 1.
- **Requirements closed:** REQ-C03; REQ-C02 except the B-32 and dashboard mounts
- **Tests:** TEST-C03, TEST-C04 (B-21, B-22, B-29)
- **Validation:** as above
- **Exit gate:** cash accepted from B-22 in three steps; the list URL survives a reload.

### Phase 3 — Order campaign record and builder notices

- **Depends on:** Phase 2 (the button)
- **Outcome:** J-C04 works end to end.
- **Why this order / value delivered:** the largest panel gap; it replaces the coach page as the administrator's only way to hand over a kit.
- **Deliverables:** `services/order-campaigns.ts` (row fields, `supplierName`, `notHandedOver`, summary `inSets` and print participant, guardians of missing children through `people.personDirectory`); `OrderCampaignPage.tsx`; `OrderCampaignForm.tsx` (two alerts); catalog keys.
- **Independent slices / estimated commits:** (a) reads: 1; (b) Orders tab and actions: 1; (c) tiles, tabs, summary, "No order", dialogs, B-31: 1.
- **Requirements closed:** REQ-C05; REQ-C02 (B-32 mount)
- **Tests:** TEST-C06, TEST-C04 (B-32)
- **Validation:** as above
- **Exit gate:** J-C04 in the browser in both locales; axe clean on B-32.

### Phase 4 — Bank statements: row buttons, history, deleting an import

- **Depends on:** none
- **Outcome:** B-29 matches the mockup; a wrong file can be removed and imported again.
- **Why this order / value delivered:** one click less per transfer on the screen used after every statement.
- **Deliverables:** `commands/bank.ts` (`payments.bank_imports.delete`), `api/bank-imports/[id]/route.ts`, `lib/bank-matching.ts` (deletable rule), `BankStatementPage.tsx`, `events.ts`.
- **Independent slices / estimated commits:** (a) command and route: 1; (b) the page: 1.
- **Requirements closed:** REQ-C04
- **Tests:** TEST-C05
- **Validation:** as above
- **Exit gate:** delete and re-import shown in the browser; 409 after a booking.

### Phase 5 — Manual charge, assigning a payer, the person record's Charges tab

- **Depends on:** Contracts 4 (guardianship events assign payers), 5 and 6 (approved 2026-11-16). Spec L also edits `people/components/PersonRecord.tsx` (the Leaving tab, the staff-setup spot); no other file is shared. **Tab position:** the Charges tab sits between Groups and Leaving — the order Details, Guardians, Roles, Account, Groups, Charges, Leaving fixed by spec L. **Rebase rule:** whichever of this phase and spec L's person-record change merges second rebases on the first, keeps the other's tab and spot as they are and only inserts its own in that order.
- **Outcome:** J-C05 steps 1–3 work.
- **Why this order / value delivered:** removes two dead ends of the data-entry audit (a charge without a payer, no manual charge).
- **Deliverables:** `commands/ledger.ts` (`create_manual`, `assign_payer`), routes, `subscribers/guardianship-payer.ts`; `people/commands/shared.ts` (`guardianshipEvents` payload adds `wardPersonId`, Contract 6) with the `people` event declaration; `people/components/PersonRecord.tsx` (the spot and the tab between Groups and Leaving, shown when a widget is registered); `payments/widgets/injection/person-charges/`; `involvesPersonId` on the list route; dialogs on B-21 and B-22.
- **Independent slices / estimated commits:** (a) commands and subscriber: 1; (b) the tab: 1; (c) dialogs: 1.
- **Requirements closed:** REQ-C06, REQ-C07
- **Tests:** TEST-C07, TEST-C08, TEST-C02 (tab part)
- **Validation:** as above
- **Exit gate:** a charge without a payer gets one from B-22 and from the guardianship tab.

### Phase 6 — Refunds

- **Depends on:** none
- **Outcome:** J-C05 step 4 works.
- **Why this order / value delivered:** Q-049 promised a list the administrator has never seen.
- **Deliverables:** refund dialog in `ChargeRecord.tsx` (model: `ReasonDialog.tsx`), `toRefund` filter and `meta.toRefundCount`, the conditional perspective, payment `source`, `refundable`, `refunds[]` in the detail read.
- **Independent slices / estimated commits:** (a) reads: 1; (b) dialog and perspective: 1.
- **Requirements closed:** REQ-C08
- **Tests:** TEST-C09
- **Validation:** as above
- **Exit gate:** a partial and a full refund against the test adapter; the perspective disappears.

### Phase 7 — Dashboard widgets

- **Depends on:** Phases 2 and 6 for the cash button and the refund count; the navigation spec decides which role sees which widget. Spec N (Ready) depends on this phase: its menu counts "Bank statements" and "Order campaigns" (N's phase 6, issue #260, AC-N03) read `bank.toDecide` and `campaignsRunning` from `GET /api/payments/dashboard?only=counts`
- **Outcome:** the administrator's dashboard shows the four finance widgets of the mockup, and spec N's two payments counts have their source.
- **Why this order / value delivered:** deferred since #88; the counts also feed the navigation spec's menu badges, which refresh on navigation and every 60 seconds on every panel page — hence the lean `?only=counts` read instead of a full dashboard read per minute.
- **Deliverables:** `api/dashboard/route.ts` (the extended read and `?only=counts`, with `openApi` for both), `widgets/dashboard/bank/`, `widgets/dashboard/order-campaigns/`, `PaymentsDashboardWidget.tsx`.
- **Independent slices / estimated commits:** (a) the read and the counts read: 1; (b) widgets: 1. Slice (a) may merge first so #260 can close its two counts.
- **Requirements closed:** REQ-C09; REQ-C02 (dashboard mount)
- **Tests:** TEST-C10, TEST-C04 (dashboard)
- **Validation:** as above
- **Exit gate:** each widget's link lands where the mockup's does; `?only=counts` answers within the S7.6 list budget on the example club.

### Phase 8 — Payer's page M-08

- **Depends on:** migration D and Contract 2 (approved 2026-11-16); issue #298 (S08). The bottom-bar entry is the navigation spec's
- **Outcome:** J-C01 step 3 and J-C06 step 4 work.
- **Why this order / value delivered:** two taps to pay; the false "Everything is paid" is gone.
- **Deliverables:** migration D (`payments_checkouts.charge_amounts`); `data/entities.ts`; `services/my-charges.ts` (`discountName`, `payable`, `otherPayers`); `services/checkout.ts` (stores each charge's remainder as its share) and `lib/checkout-rules.ts` (the fulfilment spreads by the stored shares, falls back to `amountDue` when they are null; DD-C07); `api/my-charges/summary`, `ClubPaymentsPage.tsx`, the Today payments widget (spot `vereino:club:today:payments`).
- **Independent slices / estimated commits:** (a) migration D and the checkout rule with unit tests: 1; (b) reads: 1; (c) the page: 1.
- **Requirements closed:** REQ-C10
- **Tests:** TEST-C11, TEST-C16
- **Validation:** as above
- **Exit gate:** M-08 at 375 px, both locales, light and dark; a partially paid charge paid against the test adapter.

### Phase 9 — Orders on the phone: M-16, M-17, M-19 and the Today tile

- **Depends on:** Phase 8 for `?pay=`
- **Outcome:** J-C06 steps 1–3 and 5 work.
- **Why this order / value delivered:** the guardian learns that the kit waits and who handed it over without asking the coach.
- **Deliverables:** `services/orders.ts` (order fields, link guardian), `ClubOrdersPage.tsx`, `ClubOrderPage.tsx`, `OrderFormSection.tsx`, `OrderLinkPage.tsx`, `widgets/injection/club-today-order/` (spot `vereino:club:today:sections`, a row in `widgets/injection-table.ts`).
- **Independent slices / estimated commits:** (a) reads: 1; (b) pages: 1; (c) tile: 1.
- **Requirements closed:** REQ-C11
- **Tests:** TEST-C12
- **Validation:** as above
- **Exit gate:** the three pages and the tile at 375 px, both locales, light and dark.

### Phase 10 — M-15 and M-18 contents

- **Depends on:** none
- **Outcome:** the cash and coach pages match the mockup.
- **Why this order / value delivered:** small, independent, phone-first (D-029).
- **Deliverables:** `CashAcceptForm.tsx` (receiver line), `CashTodayList.tsx`, `services/group-charges.ts` (`coachFeeAccess`, `own`, `handedOverAt`), `CoachPaymentsPage.tsx` (URL state), the coach tile's link.
- **Independent slices / estimated commits:** 2
- **Requirements closed:** REQ-C12
- **Tests:** TEST-C13
- **Validation:** as above
- **Exit gate:** both pages at 375 px, both locales, light and dark.

### Phase 11 — Scheduled jobs

- **Depends on:** migration B and Contracts 4 and 5 (approved 2026-11-16); issue #301 (S11). Spec L's REQ-L11 changes the same charge generation: whichever lands second rebases on the other
- **Outcome:** J-C01 steps 2 and 5 happen without anyone pressing a button.
- **Why this order / value delivered:** closes the contradiction between J-004 and the manual generation; ends four operator duties.
- **Deliverables:**
  - migration B; `payments/setup.ts`; `payments/workers/{generate-charges,overdue-reminders,reconcile-checkouts,close-order-campaigns}.ts`;
  - four **new** job commands: `payments.charges.generate_due` in `commands/generate.ts` (the due check of DD-C08, including the first automatic month after migration B's month, then the generation service that the existing manual command `payments.charges.generate` uses — that command is unchanged); `payments.charges.remind_overdue` in `commands/ledger.ts`; `payments.checkouts.reconcile` in `commands/checkout.ts` and `payments.order_campaigns.close_due` in `commands/order-campaigns.ts`, which wrap the services `reconcileCheckouts` and `closeOrderCampaigns` that `payments/cli.ts` calls directly today (the CLI keeps calling them);
  - `lib/payments-rules.ts` (due rules, first automatic month);
  - a **new** file `payments/notifications.ts` with the type `payments.charge_overdue` (it does not exist yet; model: `facilities/notifications.ts`);
  - the settings group on the "Coaches and payments" tab.
- **Independent slices / estimated commits:** (a) the two sweeps on a schedule (no migration): 1; (b) generation: 1; (c) reminders: 1.
- **Requirements closed:** REQ-C13
- **Tests:** TEST-C14, TEST-C16
- **Validation:** as above, plus `yarn generate` for the workers
- **Exit gate:** the four schedules listed for the example club; each job command run once with `--now` semantics in the integration test.

### Phase 12 — Online payment status and methods

- **Depends on:** migration C (approved 2026-11-16); issue #302 (S12). V-C01 is answered (*Domain Vocabulary*, "Online payment connection")
- **Outcome:** the administrator sees the connection and chooses the methods.
- **Why this order / value delivered:** last, because production needs the club's Stripe account (base spec step 1).
- **Deliverables:** migration C; `services/online-connection.ts` (resolves `integrationCredentialsService` and `integrationStateService` from DI, returns the mode only); `api/settings/route.ts`; `PaymentsSettingsForm.tsx`; `commands/checkout.ts` (methods from settings).
- **Independent slices / estimated commits:** 2
- **Requirements closed:** REQ-C14
- **Tests:** TEST-C15
- **Validation:** as above
- **Exit gate:** the status and the methods on the tab; BLIK offered in the test adapter's session.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-C01 | J-C03; B-21, B-22 | `payments.chargeService`; `payments_charges` (migrations A1, A2); `GET /api/payments/charges` `meta` | 1 | TEST-C01, TEST-C02, TEST-C03, TEST-C16 | AC-C01 |
| REQ-C02 | J-C01, J-C04; B-21, B-22, B-29, B-32, B-01 | `POST /api/payments/cash` (`origin`), `GET /api/payments/cash/payers?personId=` | 2, 3, 7 | TEST-C04 | AC-C02 |
| REQ-C03 | J-C03; B-21, B-22 | `GET /api/payments/charges` (sort), `GET /api/payments/charges/{id}` (`source`) | 2 | TEST-C03, TEST-C16 | AC-C03 |
| REQ-C04 | B-29 | `payments.bank_imports.delete`, `DELETE /api/payments/bank-imports/{id}`, `payments.bank_import.deleted` | 4 | TEST-C05, TEST-C16 | AC-C04 |
| REQ-C05 | J-C04; B-32, B-31 | `GET /api/payments/orders`, `…/order-campaigns/{id}`, `…/summary`, `…/missing`; `payments.orders.hand_over` | 3 | TEST-C06 | AC-C05 |
| REQ-C06 | J-C05; B-21, B-22, B-10 | `payments.charges.create_manual`, `payments.charges.assign_payer`, subscriber to `people.guardianship.created|updated` (payload `wardPersonId`, Contract 6), `payments.charge.payer_assigned` | 5 | TEST-C07, TEST-C08, TEST-C16 | AC-C06 |
| REQ-C07 | J-C05; B-10 | spot `vereino:people:person-record:charges`; `involvesPersonId` | 5 | TEST-C02, TEST-C08 | AC-C07 |
| REQ-C08 | J-C05; B-21, B-22 | `payments.payments.refund`; `toRefund`, `meta.toRefundCount` | 6 | TEST-C09 | AC-C08 |
| REQ-C09 | B-01 | `GET /api/payments/dashboard` (+ `?only=counts` for spec N); two dashboard widgets | 7 | TEST-C10 | AC-C09 |
| REQ-C10 | J-C01, J-C06; M-08, M-02 | `GET /api/payments/my-charges`, `/summary`; `payments.checkout.create` (DD-C07); `payments_checkouts.charge_amounts` (migration D) | 8 | TEST-C11, TEST-C16 | AC-C10 |
| REQ-C11 | J-C06; M-16, M-17, M-19, M-02 | `GET /api/payments/my-orders`, `…/form`, `/api/payments/order-links/{token}`; injection widget | 9 | TEST-C12 | AC-C11 |
| REQ-C12 | J-C02; M-15, M-18 | `GET /api/payments/cash`, `GET /api/payments/group-charges` | 10 | TEST-C13 | AC-C12 |
| REQ-C13 | J-C01; B-20 settings tab | four schedules, four job commands; `payments_settings`, `payments_charges` (migration B); `payments.charge_overdue` | 11 | TEST-C14, TEST-C16 | AC-C13 |
| REQ-C14 | B-20 settings tab | `GET/PUT /api/payments/settings`; `payments_settings.online_methods` (migration C) | 12 | TEST-C15 | AC-C14 |

Each row names the Vereino file that already adapted the platform capability (*Reuse and Ownership Map*, *UI* table); the implementation starts from that adaptation.

## Rollout, Migration, and Rollback

Rollback follows S14.6: it redeploys the previous release and never runs `down()`. Every migration here is additive and backward compatible for one release.

**Ask First items (`AGENTS.md`) — all eleven approved by the product owner on 2026-11-16** ([#254 owner decisions](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)). Each migration's SQL from `yarn db:generate` is shown in its pull request before it is applied; nobody runs `yarn db:migrate` against a shared database without that review.

| Item | Kind | Content | Phase / issue | Approval |
|---|---|---|---|---|
| Migration A1 | migration (`payments`) | `payments_charges`: `payer_institution_id` uuid null, `payee_institution_id` uuid null, `payer_label` text null (encrypted). Transactional | 1 / #291 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Migration A2 | migration (`payments`) | `payments_charges`: non-unique index (`organization_id`, `source_type`, `source_id`); partial unique index (`organization_id`, `source_id`) `WHERE source_type = 'rental' AND status <> 'cancelled' AND deleted_at IS NULL`. Separate migration with `isTransactional() = false` (precedent `club_core/migrations/Migration20261103220618`), each index built `CONCURRENTLY` after `SET lock_timeout = '5s'` (`BACKWARD_COMPATIBILITY.md` §5); no rental charge exists today, so the unique index cannot fail on data | 1 / #291 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Migration B | migration (`payments`) | `payments_charges`: `last_reminded_at` timestamptz null, `reminder_count` int default 0; `payments_settings`: `auto_generate_charges` bool default true, `generation_day` int default 1, `overdue_reminders` bool default true. Its `executed_at` is the boundary of the first automatic month (DD-C08) | 11 / #301 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Migration C | migration (`payments`) | `payments_settings.online_methods` text[] default `{card}` | 12 / #302 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Migration D | migration (`payments`) | `payments_checkouts.charge_amounts` int[] null — the per-charge share parallel to `charge_ids` (DD-C07); existing rows stay null | 8 / #298 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Contract 1 | DI contract | `payments` registers `payments.chargeService`; the input gains optional `payerDisplayName`; `statusOf` is provided (the consumer's type in `facilities` declares it in the facilities parity spec). Amends facilities DD-19 additively; spec R's phase 11 depends on it | 1 / #291 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Contract 2 | route behaviour | `POST /api/payments/checkout` and `/quote` accept `partially_paid` charges and charge the remainder; `my-charges.payable` is true for them (DD-C07). The error code `charge_not_open` is kept | 8 / #298 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Contract 3 | route behaviour | `GET /api/payments/charges` sorts by period desc, then due date, by default (was due date ascending); clients may still pass a sort | 2 / #292 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Contract 4 | behaviour by default | Automatic generation and overdue reminders are **on** for every club after migration B, including the example club — the first automatic month is the one after migration B's month (Q-C07); `people.guardianship.created|updated` now assign payers | 5, 11 / #295, #301 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Contract 5 | new surfaces | Routes `POST /api/payments/charges`, `POST /api/payments/charges/{id}/payer`, `DELETE /api/payments/bank-imports/{id}`, the `only=counts` parameter of `GET /api/payments/dashboard`; commands `payments.charges.create_manual`, `.assign_payer`, `.generate_due`, `.remind_overdue`, `payments.bank_imports.delete`, `payments.checkouts.reconcile`, `payments.order_campaigns.close_due`; events `payments.charge.payer_assigned`, `payments.bank_import.deleted`; notification type `payments.charge_overdue`; injection spot `vereino:people:person-record:charges`; four module schedules; error codes `charge_payer_required`, `charge_amount_invalid`, `charge_payer_already_set`, `charge_payer_not_eligible`, `bank_import_has_bookings`. All become protected surfaces (`BACKWARD_COMPATIBILITY.md`) | 1, 4, 5, 7, 11 / #291, #294, #295, #301 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Contract 6 | event payload (`people`) | `people.guardianship.created`, `.updated` (and `.deleted`, which shares the config) gain `wardPersonId`; additive (V-C02) | 5 / #295 | approved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |

No new module and no new dependency (none approved, none needed). No role-catalogue change. No Stripe credential enters the repository (D-030).

- **Order:** any; phase 1 can ship before or after the facilities parity spec, because `facilities` already calls the token when it is registered. From that deploy on, new rentals get charges; earlier rentals get none (D-028). A1 runs before A2. Cross-spec order: *Dependencies on the other parity specs*.
- **Seeds:** `payments/setup.ts` registers the schedules in `seedDefaults`; existing organizations get them on the next deploy's setup sync. The example club needs no data change.
- **Rollback notes:**
  - Phase 1: the previous release registers no service, so new rentals again carry only their amount; rental charges already written stay and remain readable under "All".
  - Phase 8: the previous release rejects `partially_paid` at checkout again and ignores `charge_amounts`; a checkout created meanwhile that holds a partially paid charge is then fulfilled by the old spread, which books the already-paid part as an overpayment "to refund" — visible and refundable, never lost. The column stays (no `down()`).
  - Phase 11: the previous release has no workers; the schedules stay registered and their jobs are not consumed. The operator commands still work.
- **Feature flags:** none. The three settings switches are club settings, not flags.
- **Observability:** each worker logs the organization and its counts; a failed job is retried by the queue and reported as the platform reports worker failures.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| The charge service throws inside the rental's transaction | Staff cannot save a rental | By design (DD-19): no rental without its charge. The only business throw is a rental with no payer of any kind, which `facilities` never produces (a renter always has a name); TEST-C01 | Low |
| `facilities` still passes `payeeInstitutionId: null` and the renter's name as the description (`facilities/commands/rentals.ts:221-238`, `facilities/commands/requests.ts:444-461`) until spec R's phase 11 lands | B-22 reads "to the account of the facility owner" without a name; the list shows the renter's name twice | The display falls back to "the facility owner" (AC-C01 accepts it); handed over to the facilities parity spec | Accepted until then |
| The first automatic run generates a month the club did not expect | Mid-month charges right after the deploy | The first automatic month is the one after migration B's month (Q-C07, owner 2026-11-16); TEST-C14 covers B's month | Low |
| A partial online payment races a cash payment | The payer pays more than remains | The share is capped at fulfilment and the excess is flagged "to refund" (DD-C07); TEST-C11 | Low |
| Automatic generation creates charges the club did not expect | Parents see charges; the administrator must undo | The switch and the day are on the settings tab; the generation undo of #108 cancels a run's open charges; the job never repeats an undone month; no production club exists yet (D-030 §5) | Low |
| Reminder mail annoys or reaches the wrong payer | Complaints | One message per payer per run, four per charge at most, a club switch; a charge without a payer is never reminded; the payer is the stored one | Low |
| The dashboard read grows with four more counts | A slower dashboard | Each count is one indexed query (`status`, `due_date`; `status` on transactions; `status` on campaigns); measured in phase 7 against the S7.6 budget | Low |
| Deleting an import loses decisions (skips, assignments not booked) | The administrator repeats them | The confirmation says so and names the counts; allowed only when nothing was ever booked | Accepted |
| The connection status cannot be read from the platform (V-C01) | The tab shows "not verified" | Fallback defined; the checkout's own 502 already tells a broken connection | Low |
| A late capture on a terminal gateway transaction cannot be refunded through the gateway (base spec step 4, known gap 1) | The refund dialog answers 502 | The dialog explains it. The owner kept refunds Vereino-only (Q-C22 "no", 2026-11-16; Q-050, D-030 §2), so a refund made in the Stripe Dashboard is not recorded | Medium, accepted by the owner |
| Five screens depend on one cash form | A defect shows everywhere | One component, one set of tests (TEST-C04, TEST-043) | Low |
| A second guardian wants to see amounts | A support question | The notice names who pays; the owner confirmed DD-C06 (Q-C03, 2026-11-16) | Accepted |
| Spec N's menu counts read the dashboard every 60 seconds on every panel page | Load on the payments tables | The lean `?only=counts` read: two indexed counts, no list, no decryption (REQ-C09, phase 7) | Low |

## Acceptance Criteria

- [ ] **AC-C01** — With `payments` and `facilities` enabled, a rental entered by staff or approved from a request has a charge payable to the facility owner in the same transaction; the charge appears under "Rentals (municipality)" on B-21, B-22 names the owner when `facilities` passes one and says "the facility owner" otherwise (the named owner is checked after spec R's phase 11), a free cancellation cancels it and a late one forfeits it, and a failing charge leaves no rental.
- [ ] **AC-C02** — The administrator opens "Accept cash" from B-21, B-22, B-29, a B-32 order row and the dashboard; from B-22 the payer is chosen, from B-32 the orderer and the order's charge are chosen; each save issues one KP number and refreshes the screen.
- [x] **AC-C03** — B-21 restores its perspective and filters from the URL, lists the perspectives in the mockup's order with "Rentals (municipality)" only where DD-C02 allows, sorts by period, shows "—" when nothing remains and links to the statement import; B-22 shows "bank statement" for an imported transfer.
- [ ] **AC-C04** — On B-29 every decision is one click on a button in the row; an automatically recorded transfer says so; the history is a table; an import from which nothing was ever booked can be deleted and its file imported again, and any other answers 409.
- [ ] **AC-C05** — On B-32 the administrator reads who ordered and how, what is paid and to whom, and who handed the kit over; accepts cash and hands a kit over from the row, with a warning naming the amount for an unpaid kit; sees the guardians of every child without an order; and is told how many kits are not handed over before completing.
- [x] **AC-C06** — The administrator adds a charge for a person in one dialog and assigns a payer to a charge without one in one dialog; only a guardian of the debtor, or the adult debtor, is accepted; marking a guardian as primary payer assigns them to the ward's open charges without a payer.
- [x] **AC-C07** — The person record shows a "Charges" tab with every charge the person owes or pays, for users who may view charges and for nobody else.
- [ ] **AC-C08** — An online payment can be refunded in full or in part from B-22 with a reason; a refund above the refundable part is rejected; every online overpayment is listed under "To refund" until it is refunded.
- [ ] **AC-C09** — The dashboard shows the number of transfers waiting with links to the import and to cash, each running order campaign with its progress, the overdue total with the numbers of charges, families and charges without a payer, and the charges without a payer by name.
- [ ] **AC-C10** — At 375 px, in Polish and English, light and dark: a payer opens M-08 and pays everything in two taps; the fee line shows in both fee modes; a discount names its rule; a partially paid charge is paid for what remains; a guardian who is not the payer sees who pays and no amount, on the page and in the API.
- [ ] **AC-C11** — At 375 px, in both locales, light and dark: M-16 and M-17 show the stage, the deadlines, "ready for pickup from the coach" and who handed the kit over and when; "Pay online" opens M-08 with that charge only; M-19 names the link's guardian; the Today page shows the "Order" tile while a campaign is open.
- [ ] **AC-C12** — At 375 px, in both locales, light and dark: M-15 names the receiver and lists today's receipts by what was paid; M-18 opens from the Today tile on the right group with "To pay", states the club's coach mode, marks groups that are not the coach's own and shows when a kit was handed over.
- [ ] **AC-C13** — Without any operator command, a club with fees has the month's charges on its generation day from the month after migration B's month on (nothing is generated automatically in that month), payers of overdue charges get one message on the day after the due date and at most three more a week apart, a captured checkout is booked within 15 minutes and an order campaign past its deadline is closed within 15 minutes; each switch turns its job off.
- [ ] **AC-C14** — The "Coaches and payments" tab shows whether online payment is connected and in which mode, saves the offered methods, which the next checkout uses, and shows the fee mode with a link to where it is set.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md` (module boundaries, Ask First, coverage rule, repository language), `.ai/guides/spec-delivery.md`, `BACKWARD_COMPATIBILITY.md` (Contracts 1–6), standards S7.x, S10.x, S14.6 |
| Data models, APIs, events, UI, and tests are internally consistent | pass | *Requirement Traceability* rows REQ-C01 … REQ-C14 |
| Every workflow completes end to end without a catch-all integration phase | pass | J-C01 … J-C06; each phase closes its own requirements |
| Platform-native reuse and extension points were chosen before custom code | pass | *Reuse and Ownership Map*; DD-C01, DD-C04, DD-C05, DD-C08 |
| UI contracts identify references, canonical components, and theme/state coverage | pass | *UI and Interaction Contracts* |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Phases 1–12 |
| Gaps verified against the code, not taken from the audit notes | pass | *Problem Statement* file references at `a312199`; one note corrected |
| Owner decisions respected | pass | D-029 (375 px criteria AC-C10 … AC-C12), D-030 (administrator as actor; treasurer and #118 referenced only), D-031 §1–§2 (mockup layout and names) |
| Ask First items listed and approved | pass | Migrations A1, A2, B, C, D and Contracts 1–6 approved by the owner on 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)); *Rollout* table |
| Pre-implementation audit gaps closed | pass | [audit on #254](https://github.com/wladku/Vereino/issues/254#issuecomment-6899501375) (c1) DD-C07, *Data Models* `payments_checkouts`, migration D, TEST-C11, TEST-C16, phase 8; (c2) V-C02 answered, Contract 6, *Domain Vocabulary* "Automatic payer assignment" (no generation fallback), TEST-C07, phase 5; (c3) migrations A1 and A2 in *Data Models*, phase 1, *Rollout*; (c4) one name `payments.charges.generate_due`, four new job commands in *Proposed Solution*, *API*, *Events*, phase 11; (c5) `findInstitutions` wrapper new (phase 1), `payments/notifications.ts` new (phase 11), Today spots `:payments` and `:sections`; (c6) `?only=counts` in REQ-C09's API row, phase 7, TEST-C10; (c7) phase 5 tab position and rebase rule; (c8) phase 1 rollout fact, AC-C01 fallback |
| Cross-spec dependencies stated | pass | *Dependencies on the other parity specs* (N Ready; A, R, L in parallel); the other specs are not edited here |

Verdict: `Ready for implementation` — the owner approved the eleven Ask First items, answered Q-C20 and Q-C22, confirmed Q-C01 … Q-C16 (Q-C07 amended) and decided V-A01 on 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)); V-C01 and V-C02 are answered. Build starts with #291 (phase 1).

## Resolved assumptions (autonomous defaults)

The first group repeats defaults taken autonomously in earlier issues; the second group was new in this spec. The product owner confirmed all of them on 2026-11-16 ([#254 owner decisions](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)), Q-C07 with one amendment (the first automatic month).

| ID | Question | Chosen answer | Rationale | Confirmation |
|---|---|---|---|---|
| Q-C01 | (#108 Q1) Where is the online payment fee set — B-20, as in the mockup's `screenFees`, or club settings B-02? | Kept on B-02 (DD-37: it is a club setting of `club_core`); B-20 shows it read-only with a link (REQ-C14) | One owner of the setting; the mockup's place still shows the value | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C02 | (#109 Q1, Q-051) Which perspectives does B-21 have, and is "Municipality" a perspective or a filter? | The mockup's six in the mockup's order, plus "All" and the conditional "To refund"; rentals shown per DD-C02; payee is a filter and a column | D-031 §1 for the order; the reason for the condition still holds | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C05 | (#109, Q-052) Cancel needs a reason and payments are reversed, although the mockup has neither | Kept ("the API wins") | S10.4; the audit trail | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C09 | (#113; #108) Statement import and generation run synchronously (2 MB, 2000 lines) without a `ProgressJob`; a skipped transfer can be restored | Kept | A club's monthly statement is far below the limit; a job adds a screen state for no gain today | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C10 | (#115 Q2) B-31 starts blank, from the "Academy kit" template or from a copy of an earlier campaign | Kept | A superset of the mockup | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C11 | (#115 Q1) The supplier CSV carries no child's full name | Kept for the CSV; the on-screen prints table shows the child, as in the mockup | The administrator already sees the names; the file leaves the club | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C12 | (#116 Q1) A closed campaign answers "Orders are closed" (409); 410 only for an expired link or a completed campaign | Kept | The guardian can still read their order | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C03 | What does a guardian who is not the payer see? | A notice with the payer's first name, no amounts (DD-C06). The alternative is a read-only list of the ward's charges (club spec *Users*: "one list of charges") | Closest to the mockup's list; privacy between guardians | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C04 | Can a partially paid charge be paid online? | Yes, for what remains (DD-C07); this reverses the base spec's "only `open`" | The mockup; no dead end on the phone | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C06 | How often is a payer reminded? | Day +1, then weekly, four at most, one message per payer; rental charges and charges without a payer never (DD-C09) | The base spec's cadence with a cap | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C07 | Is automatic generation on by default, and when does it run? | On, day 1, checked daily at 06:00 club time; reminders at 09:00; both switchable (DD-C08). **Amended by the owner:** the first automatic run covers the month *after* the one in which migration B was applied; the deploy month is never caught up mid-month | J-004 and the mockup promise automation; no production club exists yet; a mid-month first run would surprise clubs (audit b2) | confirmed with the amendment 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C08 | Where does the administrator refund? | A dialog on B-22; "To refund" as a conditional perspective and a widget line (DD-C10) | No menu item for a rare event | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C13 | Where is "Add charge", which the mockup does not have? | In the head of B-21 and on the person record's Charges tab; no edit, cancel and re-create (DD-C12) | The data-entry audit's dead end; the ledger rule | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C14 | Is a deleted import kept? | No: the rows and the file are removed; the audit entry stays (DD-C13) | The re-import must pass the hash index | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C15 | Which methods are offered, and who connects Stripe? | Card by default; BLIK and Przelewy24 selectable, to be switched on only after the sandbox run of base spec step 1. The technical administrator enters the keys (DD-C11); the alternative is a new `integrations.*` grant for the club administrator | No secret in a new form; Q-016 left the methods open | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |
| Q-C16 | Does "Accept cash" show on B-22 of a rental charge? | No: the mockup shows it only for a person as payer, and the money goes to the owner's account; "Record payment" stays | The cash form lists persons | confirmed 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)) |

## Open Questions

None is open. Every question below was resolved on 2026-11-16 ([#254 owner decisions](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798), answering the [pre-implementation audit](https://github.com/wladku/Vereino/issues/254#issuecomment-6899501375)).

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-C20 | Are the migrations and contract changes of *Rollout* approved? (Originally migrations A, B, C and Contracts 1–5; the audit split A into A1 and A2 and added migration D and Contract 6) | Władek Kuć | was yes | Resolved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)): all eleven items approved — migrations A1, A2, B, C, D and Contracts 1–6; each migration's SQL is shown in its pull request before it is applied |
| Q-C22 | A late capture whose gateway transaction is terminal cannot be refunded through the gateway (base spec step 4). May the administrator record a refund made in the Stripe Dashboard, against Q-050? | Władek Kuć | no (only that case) | Resolved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)): **no**. Refunds stay Vereino-only (Q-050, D-030 §2, unchanged); a refund made in the Stripe Dashboard is not recorded. The draft's default ("yes") is withdrawn; no decision record supersedes Q-050 |
| V-A01 | (from the groups and activities spec) Does `payments` react to `groups.membership.deleted`? | Władek Kuć | no | Resolved 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)): not in E12; issued charges stay, as spec A's confirm text says; a follow-up story under E13 (life cycle) |
| V-C01 | Which read of `payment_gateways` / `integrations` tells that an organization has Stripe credentials, and their mode, without exposing them? | implementer, phase 12 step 1 | no | Resolved 2026-11-16 (audit (b7), confirmed by the owner): `integrationCredentialsService.resolve(<stripe integration id>, scope)` and `integrationStateService.isEnabled`; the publishable key's prefix (`pk_test_` / `pk_live_`) gives the mode; only the mode is returned (*Domain Vocabulary*, "Online payment connection") |
| V-C02 | Does the `people.guardianship.updated` payload carry the ward's id, so the subscriber can read the new payer through `people.personDirectory.primaryPayers`? | implementer, phase 5 step 1 | no | Resolved 2026-11-16: **no** — the payload is `{ id, tenantId, organizationId, guardianPersonId }` (`people/commands/shared.ts:179-184`). The payload gains `wardPersonId` (Contract 6, approved). The draft's fallback (the daily generation also assigns payers) is dropped: it was in no requirement or test |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-14-vereino-parity-payments/` (`YYYY-MM-DD-<slug>.md`, one `| date | change |` row), so parallel PRs never conflict here; `cat .ai/specs/changelog/2026-11-14-vereino-parity-payments/*.md` lists them in date order. Never add rows to this section.
