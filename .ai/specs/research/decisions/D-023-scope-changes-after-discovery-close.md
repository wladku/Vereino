---
number: D-023
date: 2026-10-23
owner: Władek Kuć
source: om-discover session 2026-10-23 — Władek's answers on non-goals N06, N12–N17, Q15, Q17, D08 and D18
status: confirmed
supersedes: D-020
---
# D-023 Scope changes when discovery closed

**Confirmed non-goals** (from proposal to active):
- N06 — page editor (CMS);
- N12 — native app and PWA packaging;
- N16 — volunteer duty sign-up in 1.0.

**Moved into the 1.0 scope:**

| Item | Was | Now |
|---|---|---|
| N13 Integration with PZPN / Łączy nas piłka | non-goal (proposal) | **Should** |
| N14 Bulk import of people from a spreadsheet | non-goal (proposal) | **Must** |
| N15 A guardians' contact list for coaches | non-goal (proposal, data minimisation) | **Must**. The spec must give a legal basis or consent and limit it to the coach's own groups. |
| Q15 Hours report for school halls the club rents (from session data) | not in scope | **Should** |
| N17 Sales documents for order campaigns | non-goal (proposal) | a setting in 1.0 with only "no document"; receipt and invoice **later** (D-022) |

**Unchanged on purpose:**
- **The club website (Q17, D-020):** both the separately built club website and Vereino's public club page, Orlik schedule and booking stay in 1.0. The risk is duplicated work and cost for the club.
- **The facility module (D08)** stays Must although no other academy was asked (A04, accepted untested in D-021).
- **Grant settlement (D-018, Q13):** the track is **parked**. Vereino is the priority, and it is revisited after 1.0. N07 and D-016 stay.
- **Coaches' cash expenses (Q16)**, such as referee payments, stay outside 1.0, in the cash notebook and with the accountant (Władek: "Poza 1.0").

**Supersedes D-020:** D-020 held the scope until the club website's scope was known. With no further information collected at this stage, Władek decided that both stay in 1.0.

**Consequences:**
- The Must set grows again (D-013, D-017).
- D-013's rule applies: if the date is threatened, the candidates to move to Should are REQ-029, REQ-028 and REQ-030 in order; otherwise the deadline moves.
- The spec needs new requirements for the spreadsheet import, the coaches' contact list, the school-hall report and the PZPN integration.

**To change:** a superseding record approved by the owner.

**Revisit:** at the spec revision that adds these requirements, and at each phase exit gate.
