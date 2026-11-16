# Run: epic #254 — spec C to Ready for implementation

- **Goal and trigger:** unattended cezar run (task 5e0a82d8) of `om-auto-create-pr`: record the owner's decisions of 2026-11-16 in spec C, fix the pre-implementation audit gaps (c1)–(c8) including the cross-spec dependencies, set the status to Ready. Docs only.
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-payments.md`. **Issue:** epic #254 ([audit](https://github.com/wladku/Vereino/issues/254#issuecomment-6899501375), 2026-11-15; [owner decisions](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798), 2026-11-16). **Branch:** `docs/issue-254-spec-c-ready`.

## Steps

1. Read the epic's audit and owner-decision comments.
2. Re-checked the audit's code facts before writing them into the spec: `payments_checkouts` holds `charge_ids` and a total `amount` only (`payments/data/entities.ts:316-321`); the fulfilment gives each charge `amountDue` as its share (`lib/checkout-rules.ts:120-124`); `guardianshipEvents` builds `{ id, tenantId, organizationId, guardianPersonId }` for created, updated and deleted (`people/commands/shared.ts:179-184`); `payments/services/directory.ts` wraps `findSections` but no `findInstitutions`; `payments/notifications.ts` does not exist; the payments Today tile is on `vereino:club:today:payments`, the coach tile on `:sections`; `payments/cli.ts` calls `reconcileCheckouts` and `closeOrderCampaigns` directly; the existing manual command id is `payments.charges.generate`; `facilities` passes `payeeInstitutionId: null` and the renter's name as description; `club_core/migrations/Migration20261103220618_club_core.ts` exists as the non-transactional precedent; the platform names migration tables `mikro_orm_migrations_<module>`; `people.personDirectory.primaryPayers` exists; spec N refreshes counts every 60 seconds; spec L fixes the tab order Details … Groups, Charges, Leaving.
3. Edited the spec: status, superseded-rows table (club spec Guardian row), TLDR, Non-goals (Stripe-Dashboard refunds, V-A01, #118), new *Dependencies on the other parity specs*, Proposed Solution, DD-C07, DD-C08, DD-C10, Domain Vocabulary, Reuse map, Architecture, UI rows, Data Models (A1/A2 split, `payments_checkouts`), API (dashboard `only=counts`, checkout shares, job commands, guardianship payload), Events, TEST-C07/C10/C11/C14/C16, phases 1, 5, 7, 8, 9, 11, 12, traceability, Rollout (approvals with date and link, rollback for phase 8), Risks, AC-C01, AC-C13, Final Compliance, Resolved assumptions, Open Questions.
4. Changelog entries: `.ai/specs/changelog/2026-11-14-vereino-parity-payments/2026-11-16-issue-254-ready.md` and, for Q-C03, `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-16-issue-254-guardian-payments-row.md`.

## Decisions

- **First automatic month (Q-C07):** the boundary is migration B's `executed_at` in `mikro_orm_migrations_payments`, read once per run in the club's time zone. It needs no column beyond the approved migration B and is the literal "month after migration B lands" of the owner's answer; the audit's 3-day window was rejected because it would still generate the deploy month when B lands on days 1–3. An unreadable row generates nothing and logs a warning.
- **Migration D shape:** `charge_amounts int[]` parallel to `charge_ids` (the audit's first option), null for older checkouts, which keep today's spread (exact for them, as they hold only `open` charges).
- **V-C02 route:** extend the payload (Contract 6, approved) rather than a new `people.personDirectory` read; the subscriber still re-reads the current primary payer, so replays are safe. The generation fallback is dropped.
- **Spec N's counts:** a lean `?only=counts` read returning `bank.toDecide` and `campaignsRunning`; spec N is not edited — the spec states the field names N's badge reads.
- **Other parity specs** (N, A, R, L) are not edited; dependencies are stated in spec C only. The club-management spec's body is not edited either; its Guardian row is superseded through a changelog entry, as the owner asked.

## Commands and results

- `yarn spec-changelogs:check` → "Spec changelogs are valid".
- `yarn verify` → `[verify] all 17 step(s) passed`, exit 0.
- No integration test: docs only.

## Open problems and next steps

- Build starts with #291 (phase 1). Each migration's SQL is shown in its PR before it is applied.
- The E13 follow-up story for `groups.membership.deleted` (V-A01) is not filed by this run (docs-only scope).
