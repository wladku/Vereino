---
number: D-042
date: 2026-11-26
owner: Władek Kuć
source: the owner's report of 2026-11-26 after signing in to the sandbox as the treasurer ("brakuje mi opcji… przyjęcia gotówki od trenera, może trener powinien wygenerować przekazanie gotówki, a skarbnik… potwierdzić przyjęcie") and his four answers to Claude's questions the same day
status: confirmed (direction) / open (data model and migration, settled in the payments spec amendment)
supersedes: the one-sided handover of B-33 (payments spec REQ-033, #118) as the main path; it stays as a fallback
---
# D-042 The coach starts a cash handover, and the treasurer or administrator confirms it

## Context

- Today a cash handover is one-sided. Only the club administrator or the treasurer records it, in the panel: **Finanse › Gotówka do rozliczenia › Przyjmij rozliczenie** (B-33, #118). The coach has no action of their own and gets no record of handing the money over.
- The page exists only in the panel. A treasurer who also has a member side lands on the phone pages (`/club`), where there is no handover at all. That is what the owner met in the sandbox.
- In the sandbox there was also no cash payment with a receipt, so the panel page had nobody to settle.

## Decision

1. **The coach starts the handover from the phone.**
   - On "Płatności moich grup", next to "Gotówka u Ciebie", the coach chooses "Przekaż gotówkę".
   - All held cash payments (with their KP receipts) are preselected, and the coach can untick some.
   - The coach sends the handover. It gets its number (`RG/…`) and waits for confirmation.
   - The payments stay "held by the coach" until someone confirms, and they cannot be added to a second pending handover.
   - The coach can withdraw a pending handover.
2. **The treasurer or the club administrator confirms.** Only holders of `payments.cash.settle` confirm; no new permission.
   - They see pending handovers on the phone (a Today tile "Przekazania do potwierdzenia" and a list) and in the panel's "Gotówka do rozliczenia".
   - "Potwierdź" accepts the whole handover. The cash becomes the club's, and the coach is notified.
3. **A difference means rejection with a reason.**
   - The confirmer rejects the handover with a short description of the difference.
   - The coach is notified, corrects it (for example by choosing other payments) and sends it again.
   - There is no partial acceptance.
4. **The one-sided path stays as a fallback.** "Przyjmij rozliczenie" without the coach's step remains for a coach without a phone or an account, and the coach is notified that their cash was settled.
5. **Audit.** Every step (sent, withdrawn, confirmed, rejected, settled without the coach) is in the audit log with who and when. The handover keeps who started it and who confirmed or rejected it.

## Why

- Two-sided confirmation protects both sides. The coach has proof of handing the money over, and the club has a named person who received it.
- Cash changes hands at the pitch, so the treasurer confirms on the phone, like other everyday work (D-029).
- Rejecting with a reason keeps every payment's state clear. Partial acceptance would split handovers and make differences harder to trace.

## Not decided here (for the spec amendment)

| Item | Note |
|---|---|
| Data model | status of `payments_cash_handovers` (pending, confirmed, rejected, withdrawn), who started it, when it was sent and decided, the rejection reason; how pending payments are reserved. Migration: Ask First. |
| Notifications | which channel for the coach and the confirmers (in-app and e-mail proposed) |
| Coordinators | whether a coordinator who collects cash uses the same handover; proposed yes, since they hold `payments.groups.collect` |
| Old pending handovers | a reminder after some days, and what the dashboard shows |

## Applied in

- The product brief: row D42.
- A story for the payments spec amendment and build.

**To change:** a superseding record approved by the owner.

**Revisit:** after the first month of real cash handovers with a pilot club.
