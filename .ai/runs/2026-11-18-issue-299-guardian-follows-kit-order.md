# Run: issue #299 — E12-S09 a guardian follows a kit order on the phone: stage, deadlines, pickup and who handed it over

- **Goal and trigger:** cezar task (`om-auto-fix-issue 299`, label `cezar`): build phase 9 of `.ai/specs/2026-11-14-vereino-parity-payments.md` (REQ-C11; TEST-C12; AC-C11; J-C06 steps 1–3 and 5).
- **Spec / issue / branch:** spec `In progress`, Ready for implementation since the owner's approval of 2026-11-16 on #254 (this resolves the issue's "spec is Draft" open question; Q-C12 confirmed there); dependency #298 (E12-S08, `?pay=`) closed; issue #299; branch `feat/issue-299-guardian-follows-kit-order`.

## Steps

1. Claimed #299 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and approved, no open PR for the issue.
2. Slice (a), reads (additive): `services/orders.ts` — each order of the form adds `submittedAt` (the order's `createdAt`), `handedOverAt` and `handedOverBy { firstName, lastName }` (the handover person read with the children in one `findPersons`); `services/order-links.ts` — the link read adds `guardian { firstName, lastName }`. OpenAPI schemas in `api/order-routes.ts` and `api/order-links/[token]/route.ts` updated.
3. `lib/orders.ts`: `childPaymentState`, `campaignDeadlineLine`, `orderPickup`, `todayOrderCampaigns` with unit tests.
4. Slice (b), pages: M-16 stage badge (`STAGE_VARIANTS`), deadline line, payment due, per child the payment badge and a separate "picked up" badge (derived from `orderId`/`remaining`, so `GET /api/payments/my-orders` stays unchanged as the spec says). M-17 (`OrderFormSection`): head card with stage and both deadlines; the `SegmentedControl` replaced by chip links (`?child=`, `aria-current="page"`, check mark + sr-only "order placed", horizontal scroll); the child now follows the URL; summary "Order of {time}", notes, "Ready for pickup from the coach", "Picked up — {time} · handed over by {name}", "Pay online {amount}" → `/club/payments?pay={chargeId}`. M-19: notice `payments.orders.link.personalLink` / `personalLinkText` above the form; chips link to `/club/o/{token}?child=`; the route wraps the page in Suspense for `useSearchParams`.
5. Slice (c), Today tile: `widgets/injection/club-today-order` on `vereino:club:today:sections` (priority 90, before the coach tile), registered in `widgets/injection-table.ts`; one tile per campaign that still takes orders; hidden while loading, on any failed read and when nothing applies.
6. i18n en/pl: `payments.orders.club.{closedOn,readyForPickup,readyText,paymentDue,deadlines,childOrdered}`, `payments.orders.club.summary.{orderOf,notes,pickedUp,handedBy}`, `payments.orders.club.pay.onlineAmount`, `payments.orders.link.{personalLink,personalLinkText}`, `payments.orders.tile.{title,ordersUntil,ordered,notOrdered}` (Polish texts from the mockup catalog).
7. Integration test `payments/TEST-C12-guardian-orders-on-the-phone.spec.ts`.

## Decisions

- **Tile campaigns** = status `open` and still taking orders (`ordersOpen`): an `open` campaign past its deadline would otherwise show "orders until" a past date.
- **"Picked up" apart from payment on M-16**: the API's `state` collapses a handed-over order into `picked_up`; the payment badge is derived from `orderId` and `remaining` instead of changing the read the spec marks unchanged.
- **Time zone**: times use the club's zone inside the member frame; on M-19 (no frame) the device's zone.
- **Child chips shown with two or more children**, as the switcher was before.
- **AC-C11** stays unticked until UI QA (both locales are exercised by TEST-C12 through the locale cookie; screenshots are the QA step).

## Commands and results

- `yarn generate`: pass. `yarn typecheck`: pass. `yarn typecheck:qa`, `qa-texts:check`, `ds:check`, `i18n:check-hardcoded --strict`, `contracts:check`, `glossary:check`, `spec-changelogs:check`, `yarn lint` (0 errors): pass.
- `npx jest src/modules/payments`: 14 suites, 300 tests passed; `payments/lib` 100 % lines/branches/functions.
- `yarn test:integration:vereino --filter TEST-C12`: 1 passed (2.5m), first run.
- `yarn test:integration:vereino --filter E07-S09`: 1 passed (1.9m).
- `yarn verify`: `[verify] all 17 step(s) passed`.

## Open problems

- None known.

## Next steps

- UI QA of M-16, M-17, M-19 and the Today tile at 375 px in both locales, light and dark (AC-C11).
