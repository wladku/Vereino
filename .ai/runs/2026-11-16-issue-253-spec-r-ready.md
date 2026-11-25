# Run: #253 — spec R (facilities parity) to `Ready for implementation`

- **Goal and trigger:** unattended cezar run (task 4be70a43) of `om-auto-create-pr`, asked by the owner: record the owner decisions of 2026-11-16 in spec R, fix the pre-implementation audit gaps (c1)–(c10), set `Status: Ready for implementation`. Docs only.
- **Spec:** `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md`. **Epic:** #253 ([audit](https://github.com/wladku/Vereino/issues/253#issuecomment-6899389065), [owner decisions](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)). **Branch:** `docs/issue-253-spec-r-ready`.

## Steps

1. Read the audit and the owner decisions on #253, the spec, and the facts the fixes rest on: spec N's widget table and J-N04 (widget 8, "no facility assigned" delegated to R), spec C's *Rental charge* rule (`payee = owner_institution`, nullable institution) and phase 1, `foundation/services/token-link.ts` (`tokenLinkColumns({ use })`), `payments/events.ts` (`payments.payment.reversed` exists), the indexes of `facilities_rentals` (none on `charge_id`).
2. Recorded the owner answers: status line; the *Rollout* Ask First table rewritten with the audit's six items, each marked approved 2026-11-16 with the link; Q-R01, Q-R21, Q-R22 resolved; Q-R02…Q-R20 marked confirmed (the two ⚠ rows resolved); Q-R23 (move keeps the amount, #221) and Q-R24 (widget scope) added as resolved.
3. Fixed (c1)–(c10) in place: Problem Statement and DD-R04 (D-029 §2), *UI architecture* (coordinator and attendant widget 8, coach none), REQ-R20, the widget row, TEST-R20, phase 16, AC-R16; the M-12 "no facility assigned" state (+ TEST-R13, phase 8); Non-goals (a move keeps the amount); DD-R11, *Automatic expiry*, *Unpaid after the deadline*, TEST-R09, AC-R05 (partly paid never expires); *Payment deadline* and a `move` row (deadline kept with a charge); *Payment reversed* row, an events row, TEST-R08, AC-R04; the subscriber rows and phase 11 (always present, no-op), *Data Models* (no new index, org-scoped lookup); *Payee of a rental* aligned with C; `facilities_rental_links` (`ScopedEntityBase`, `tokenLinkColumns({ use: 'single' })`, `purpose`, `updated_at`, `deleted_at`); tenancy paragraph and phase 12 (`AGENTS.md` exception line); phases 13 and 14, AC-R14, TEST-R19 (spec A).
4. Added the cross-spec dependency table (N, A, C, L) under *Rollout → Order*; fixed the *Compatibility* paragraph (two widenings, two narrowings).
5. Final Compliance Report: a row for the decisions and the gap fixes; verdict Ready.
6. Changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-16-issue-253-ready.md`; this log.

## Decisions

- **(c6) no index on `charge_id`:** the owner approved the migration "with the model fixes from c8", not an extra index, so the spec takes the audit's other option — an organization-scoped lookup among `requested` rentals, served by the existing `facilities_rentals_org_status_hold_idx`.
- **(c7) aligned in R's text, not in C:** C is being made Ready in parallel and must not be edited here. R now states that the charge follows C's rule (`owner_institution`, null institution) and that the facilities screens say "to the club's account"; B-22's label is left to C, recorded as a note in the dependency table.
- **(c5) no subscriber for reversals:** `facilities` reads the charge state live through `statusOf`, so the `open` state shows without any write; the rental stays `confirmed` (forward-only statuses).
- **(c4) keep the deadline for a rental with a charge** rather than accept divergence: one date, the one the unpaid list reads, equals the charge's due date.
- **New owner answers numbered Q-R23 and Q-R24** so the Open Questions table keeps one row per decision.
- The other parity specs are not edited (owner instruction).

## Commands and results

- `yarn verify` → `[verify] all 17 step(s) passed` (`spec-changelogs:check`: "Spec changelogs are valid"; `build` 312 s).
- No integration test: docs only, no code and no migration file.

## Open problems and next steps

- Spec C should label a rental charge without an owner institution "to the club's account" on B-22 (note in R's dependency table) — for the author of C's Ready pass.
- Implementation starts per *Rollout → Order*; #285 waits for C phase 1, #288 for A's REQ-A08.
