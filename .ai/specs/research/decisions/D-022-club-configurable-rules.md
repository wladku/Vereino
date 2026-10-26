---
number: D-022
date: 2026-10-23
owner: Władek Kuć
source: om-discover session 2026-10-23 — Władek's answers to Q02, Q03, Q09, Q12, Q14, R08 and N17
status: confirmed
---
# D-022 Rules the club configures, with their defaults

Several open questions are answered by making the rule a club setting that the administrator (or the board, through the administrator) sets, with a default.

| Setting | Options | Default | Answers |
|---|---|---|---|
| Age for a child's own account | any age | **16**; "in other countries it may differ" | Q03, R02 (was default 13); Władek waived the legal opinion that Q03 had required |
| Online payment commission (Stripe) | included in the price (the club pays) / passed on to the payer | **the club pays** | Q02 (the Stripe account is the club's, confirmed by Władek) |
| Sibling discount | which child pays the full rate; which fees it covers | the spec's default: the oldest pays full, monthly fees only | R08 |
| Coach settlement model | the spec's "base + units × rate + matches and trips per contract", or the coordinator's "fixed base minus a fixed amount per missed session passed to the substitute, plus a fixed amount per trip" | not stated | Q14, REQ-021 |
| Attendance declaration | for training, guardians report absence only; for friendlies, tournaments and matches, they confirm presence; actual attendance is always recorded | **the coordinator's model** | Q09 |
| Guardians see other children called up or in the group | not shown / shown for children whose guardians consented | not stated | Q12 |
| Sales document for order campaigns | none / receipt / invoice | **none**; receipt and invoice are later (D-023) | N17 |

**Why:** different clubs and countries differ, the pilot club's practice is known for most rules, and a setting avoids a wrong single rule.

**To change:** a superseding record approved by the owner.

**Revisit:** at the spec revision that implements these settings.
