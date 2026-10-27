# Foundation III spec — audience, dispatch and messaging primitives

- **Date:** 2026-10-27
- **Agent / tool:** Claude Code (Opus 5.5), `om-spec-writing` (interactive) with two read-only subagents (V-4 platform verification; one fresh-context review)
- **Trigger:** product owner — "Chcę stworzyć specyfikację na podstawie issue #23. Ważne jest jednak to, żeby w trakcie pisania specyfikacji powstał nie tylko sam feature, ale też framework pod spodem …", then "Przyjmij rekomendowane odpowiedzi Q1–Q11 i kontynuuj projekt."
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md`; issue #23 (E04) with #35 and #36 as consumers; branch `docs/foundation-iii-spec`, started from `docs/foundation-review-blockers` (PR #44, itself on PR #43) because foundation I and II as amended exist only there
- **Status:** in progress — design complete and reviewed; the gate reopened for Q14 (the e-mail standards S12) and Q15 (the opt-out mechanism)

## Goal

Design the communication phase (E04) and the foundation underneath it — audience, dispatch, e-mail templates and the shared admin pieces — so every later e-mail of phases 3–5 is one template and one call; mark the club spec's phase 3 ready for REQ-009 and REQ-010.

## Steps

1. Context: #23, #35, #36; the club spec's phase 3 (REQ-009/010/017, DD-16/17/35, J-003, the `communication` rows, TEST-015…017, V-4); the e-mail consumers in the payments and facilities specs; the architectural review of 2026-10-26 (Critical: link-token e-mails vs ids-only events; High: `communication` as an e-mail hub with a cycle); foundation I and II.
2. V-4 verified by a subagent and spot-checked in the installed source (`messages/data/validators.ts:129` `max(100)`, `messages/lib/email-sender.ts:109` default locale, `communication_channels` `requires: ['progress']`, `channel_resend` `requires: ['communication_channels','integrations']`, `channel_resend/lib/adapter.ts:105` always `sent`, `sendEmail` throws without a transport, the notification e-mail strategy swallows errors).
3. Skeleton with the gate Q1–Q11 (functionality kinds M1–M10, candidate inventory P-29…P-32, checks V-M01…V-M05). Hard stop; the owner accepted every recommendation.
4. Full design: REQ-M01…M11, DD-M01…M16, phases A–C, TEST-M01…M10, AC-M01…M11.
5. Fresh-context review (20 findings) re-checked: S12.3–S12.6 exist in the engineering standards; `SendEmailOptions` has no `headers`; `shouldDeliver.ts:42` applies `channelsOverride ?? type.channels`; `createBatch` supports `groupKey`; `communication_channels/lib/error-classification.ts` exists; `isEmailDeliveryDisabled()` covers `OM_TEST_MODE` and `OM_DISABLE_EMAIL_DELIVERY`. All findings applied except the S12 conflict, which reopened the gate (Q14) together with the opt-out mechanism (Q15).
6. Club spec amended (phase 3 readiness, V-4, DD-16, the `messages`, `communication`, API, events, surface, observability, risk and exit-gate rows, TEST-015's oracle); payments and facilities specs amended (e-mails through `dispatch`, phase 5 depends on foundation III phase A).

## Decisions

- Own `communication` tables; `messages` stores nothing (V-4 negative) and is enabled only if the app needs it.
- Delivery is a `foundation` primitive (outbox + per-recipient rows) — removes the e-mail-hub cycle and keeps raw link tokens out of events (encrypted delivery secret, wiped after use).
- Recipients follow the club spec's *Thread* rule; a member's reply goes to staff only (R15).
- At-least-once delivery stated honestly; the lease is per delivery; jobs carry tenant and organization.
- Every `communication` command is non-undoable; a case cannot be unmarked.

## Files changed

- `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md` — new
- `.ai/specs/2026-10-20-vereino-club-management.md` — phase 3 readiness and the rows above
- `.ai/specs/2026-10-27-vereino-club-payments.md`, `.ai/specs/2026-10-27-vereino-facilities.md` — e-mail rows through `dispatch`
- `.ai/runs/2026-10-27-foundation-iii-spec.md` — this log

## Commands and results

- Read-only greps and reads of `packages/app/node_modules/@open-mercato/{core,shared,channel-resend,queue}/src/**` and the engineering standards.
- Scripted id audit of the new spec: REQ-M01…M11 traced both ways, every referenced TEST-M, AC-M and DD-M defined, no duplicate DD-M, 0 `TODO`.
- `git diff --check` clean. `yarn verify` not run: Markdown under `.ai/` only.

## Open problems

- Q14 (S12 e-mail standards vs `sendEmail`) and Q15 (opt-out mechanism) wait for the owner.
- Q13 (retention) is part of the owner's GDPR decision on the foundation specs.
- The branch depends on PRs #43 and #44.

## Next steps

- Apply the owner's answers to Q14 and Q15; open the PR (merge after #43 and #44).

## Lessons recorded

none
