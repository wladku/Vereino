# Issue #791 — the coach starts a cash handover, the treasurer or administrator confirms it (D-042)

- **Date:** 2026-11-26
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (feature route), Cezar run
- **Trigger:** issue #791 labelled `cezar` by the owner; the owner approved the `payments_cash_handovers` migration on the issue (2026-11-26)
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` (REQ-033a, DD-31a, J-010a, TEST-089, AC-033a); #791; `feat/issue-791-cash-handover-confirm`
- **Status:** completed

## Goal

Amend the payments spec with the two-sided cash handover of D-042 and build it: the coach sends a pending `RG/…` handover from the phone, the treasurer or administrator confirms or rejects it (phone and panel), the coach can withdraw it, the one-sided "Accept handover" stays as a fallback and tells the coach; notifications in the app and by e-mail; audit entries for every step.

## Steps

1. Claimed #791 (assignee, `in-progress`, claim comment). Read D-042 from branch `docs/d-042-cash-handover-confirmation` (PR #790, still open).
2. Amended the payments spec: REQ-033a, DD-31a, J-010a, UI rows M-18/M-18a/B-33, data model, API rows, events, TEST-089, AC-033a, traceability; changelog file.
3. Entity + migration `Migration20261125232526_payments` (generated offline with `yarn db:generate`, then a backfill of `decided_at`/`decided_by_*` for existing rows added by hand; approved by the owner on #791).
4. Pure rules (`lib/cash-handovers.ts`) with unit tests; commands `send`, `withdraw`, `confirm`, `reject`, fallback `accept` updated; notices service; four e-mail templates + in-app types; events; routes `/api/payments/my-cash-handovers`, `…/{id}/withdraw`, `/api/payments/cash-handovers/{id}/confirm|reject`, `?status=` on the history.
5. UI: M-18 "Hand over cash" section, M-18a `/club/cash-handovers`, Today row widget, B-33 pending list + reserved payments + status column; en/pl catalogs.
6. Isolation inventory + seed (`$B:pendingHandover`), TEST-089, screenshots, gate.

## Decisions

- Reservation as a column `payments_payments.pending_cash_handover_id` (not only the handover's `payment_ids` array) — indexable, row-locked with the payments, so one payment is never in two pending handovers.
- The number is issued when the handover is sent; rejected and withdrawn numbers are kept (no gaps for the invariants check).
- Notices are sent after the commit (like `people`'s departure notices) with the key `payments:cash-handover:{id}:{step}`; a failure is logged, never undoes the handover.
- One notification type per outcome (sent / confirmed / rejected / settled): the in-app notice carries generic keys only (DD-M07, lesson `dispatch-in-app-link-is-per-type`); the rejection reason travels in the e-mail and is encrypted at rest.
- The collector's commands use the `self` grant; another person's handover answers 404 (filtered in `loadTarget`), so a club B id is indistinguishable from an unknown one.
- Decisions are status-guarded transitions with the handover row locked (409 `cash_handover_not_pending`), no version token.
- B-33 shows "Handovers to confirm" under the custody table (heading order h1 → h2), not above it.
- Dropped the declared-but-unused `cash_handover_not_found`: the scoped loader already answers 404.

## Files changed

`.ai/specs/2026-10-27-vereino-club-payments.md`, its changelog file; `packages/app/src/modules/payments/` — `data/entities.ts`, `migrations/Migration20261125232526_payments.ts` + snapshot, `encryption.ts`, `lib/cash-handovers.ts` (+ tests), `lib/error-codes.ts` (+ vocabulary test), `data/validators.ts`, `commands/cash-handovers.ts`, `services/cash-handovers.ts`, `services/cash-handover-notices.ts`, `services/directory.ts`, `services/data-export-contribution.ts`, `api/cash-handover-routes.ts`, `api/cash-handovers/**`, `api/my-cash-handovers/**`, `emails/templates.ts`, `notifications.ts`, `events.ts`, `di.ts`, components (`CashHandoverSection`, `PendingHandovers`, `ClubCashHandoversPage`, B-33 page and dialog, clients), `frontend/club/cash-handovers/*`, `widgets/injection/club-today-cash-handovers/*`, `widgets/injection-table.ts`, i18n en/pl, `README.md`; QA: `TEST-089-cash-handover-confirmation.spec.ts`, isolation inventory and seed.

## Commands and results

- `npx jest src/modules/payments` — 408 passed (first run: the error-code vocabulary test failed on the three new codes; updated).
- `yarn test:integration:vereino --filter TEST-089` — 1 passed (1.0m), first run.
- `--filter ISSUE-628` 1 passed (2.4m); `--filter TEST-046` 2 passed; `--filter TEST-C13` 1 passed; `--filter TEST-045` 1 passed.
- `yarn verify` — all 22 steps passed. `yarn guard` — no blocking findings.
- First typecheck failed after a `sed` swapped typographic apostrophes in single-quoted OpenAPI strings for ASCII ones (`error TS1005`); reverted to the typographic apostrophe the codebase uses.

## Open problems

- D-042's record lives on PR #790 (open); the spec links its path.
- Not built (D-042 "not decided here"): a reminder for old pending handovers.

## Next steps

- Owner QA on the preview (instruction in the PR); merge through the train.
