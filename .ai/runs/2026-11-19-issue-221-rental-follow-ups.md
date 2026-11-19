# Run: #221 the last E08-S02 follow-ups — occupancy `em`, the charge follows a move, re-quote, schedule backfill

- **Goal / trigger:** cezar task `85508871` started `om-auto-fix-issue 221` (issue labelled `cezar`, 2026-11-19). On 2026-11-19 the product owner approved M1, decided L2 (an additive `payments.chargeService` method) and the move question (re-quote on another place) in [a comment on #221](https://github.com/wladku/Vereino/issues/221#issuecomment-7019142348). PR #242 and PR #315 had fixed the other items.
- **Issue / branch:** #221, `refactor/issue-221-rental-follow-ups-3` (renamed from `cez/221`). Specs updated in place: facilities parity (R), payments parity (C), foundation II (P-26).
- **Claim:** assignee `wladku`, `in-progress` label and a `🤖` claim comment naming this run, worktree and branch (2026-11-19).

## Steps

1. **M1:** `OccupancyContext` (`foundation/services/occupancy.ts`) gains the optional `em`. `facilities` `blockingIntervals` reads on `ctx.em` when given, else on its own fork. `activities` `findConflicts` passes its transactional `em` on a save, which holds the occupancy lock. A preview keeps the provider on a fork, so a provider error cannot abort the caller's transaction.
2. **L2:** `payments.chargeService.rescheduleForSource(em, { sourceType, sourceId, payeeInstitutionId, amount, dueDate, description }, ctx)`. It row-locks the live charge and changes it only when no payment was ever recorded on it. That is the same rule `sourceCancelDecision` applies to a cancellation. It writes the due date, description, amount, payee and the status for the new amount. A charge holding a payment returns `charge_paid` unchanged. The consumer type in `facilities/services/charges.ts` declares it.
3. **Move re-quote:** `facilities.rentals.move` reads the charge state first. When the charge holds a payment, the rental keeps its amount and deadline. Otherwise the move re-dates the payment deadline, and a move to another place re-quotes `amount` and `rate_id`, with 422 `rental_rate_missing` where that place has no rate. With a charge, `rescheduleForSource` runs in the same transaction. If it answers `charge_paid` (a payment arrived since the read), the rental keeps its old terms. The OpenAPI text and comments were updated.
4. **L4:** `facilities/services/club-setup.ts` `setUpClubFacilities` now holds the three schedule registrations. `setup.ts` delegates to it and re-exports the constants. The new CLI `facilities set-up-club --tenant --org` prints `{ schedules }` and exits 1 when a schedule was refused. `docs/ops/deploy.md` lists it.
5. **L5:** no code. The week preview no longer lists rentals: #276 moved them to the day axis. That axis (`services/calendar.ts`) reads the whole place family through `placeFamilyIds`.
6. **`lockSchedule` key note:** no code (every running instance takes `vereino.occupancy:`). Recorded as lesson `advisory-lock-key-change-splits-a-rolling-deploy`.
7. Specs: the facilities parity spec has the new rule *Move of a rental*. *Payment deadline*, Non-goals, DD-R08, the move and DI rows, TEST-R08 and AC-R04 were updated, and Q-R23 is marked superseded. The payments parity spec gets the rule *Rescheduling a rental charge*, a DI row, the consumer row and Contract 1a. Foundation II P-26 gets `em?`. Each spec gets one changelog file.
8. Tests: TEST-R08's move section now covers a same-place move that re-dates the open charge and its description, a move to a place without a rate (422), and a move to a place with its own rate (re-quoted rental and charge, payee null). It also covers a rental whose charge held a reversed payment (kept terms) and the rental without a charge. A new `ISSUE-221-facilities-set-up-club` runs the CLI twice and asserts three schedules with the right values, the other club untouched.

## Decisions

- **A payment-holding charge keeps its terms.** The owner's decision speaks of the unpaid charge. Repricing money already paid would need a refund or top-up flow, which nobody asked for. So the rule is the same one cancellation uses: any recorded payment, reversed or not, freezes the charge, and the rental keeps its amount and deadline with it. Nothing diverges.
- **The method also rewrites description, amount and payee**, not only the due date. The description names the slot, and the re-quote decision changes the amount and possibly the payee. A method that moved only the date would leave the charge naming the old slot and the old price.
- **No event from `rescheduleForSource`.** No consumer needs one; adding `payments.charge.updated` would be a new contract surface.
- **Same-place moves do not re-quote**: the owner's decision names a place change only.
- **One PR for all remaining items.** Each item stayed small. L2 and the re-quote are one coupled change.

## Commands and results

- `yarn generate`, `yarn typecheck`: clean.
- The first integration attempt failed at `yarn build`: an apostrophe inside a single-quoted OpenAPI string (`that place's`). Fixed; typecheck had not run after that edit.
- `yarn format` fixed `facilities/services/charges.ts` and `facilities/setup.ts`.
- `yarn test:integration:vereino --filter TEST-R08`: `1 passed (37.1s)`.
- `yarn test:integration:vereino --filter ISSUE-221`: `1 passed (36.4s)`.
- `yarn test:integration:vereino --filter TEST-027` (the session save through the occupancy provider, M1 regression): `4 passed (45.2s)`.
- `yarn verify`: `all 18 step(s) passed`.

## Open problems / next steps

None on #221 once the PR merges. Deploy note: run `yarn mercato facilities set-up-club` once per existing club (`docs/ops/deploy.md`).
