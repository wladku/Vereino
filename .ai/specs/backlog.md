# Backlogs

## .ai/specs/product-brief.md
Backlog source: .ai/specs/product-brief.md
Last filed: 2026-10-24

2026-10-23 — research variant: the brief did not meet the Definition of Ready in `SDLC.md` (A02, A03, A04, A05 and A08 rested only on assumptions; Q01–Q04, Q07 and Q17 were open; R05 and R08 were proposals; D15 held implementation planning). Only the Discovery epic E01 was filed.

2026-10-24 — 1.0 scope, phases 1–3: the brief's signed Definition of Ready addendum (D21) makes phases 1–3 ready for planning. E02–E04 were filed, plus the parked epic E05. Not filed yet: phase 4 payments and the treasurer role (A02, held back), substitution and coach-settlement automation of phase 2 (A05, held back), phase 5 facility and bookings (R05 is a proposal; Q04 and Q18 are open). The tracker search found no existing issue covering E02–E05; nothing was adopted. Design authority: the brief; detailed design in `.ai/specs/2026-10-20-vereino-club-management.md` (Draft, approval owed before implementation).

2026-10-27 — D-028 split the design authority: phases 1–3 (E02–E04) stay in `.ai/specs/2026-10-20-vereino-club-management.md`; phase 4 (payments) is now `.ai/specs/2026-10-27-vereino-club-payments.md` and phase 5 (facilities) `.ai/specs/2026-10-27-vereino-facilities.md`. The phase 4 and 5 items parked in E05 (#24) refer to those specifications; phase 5 no longer depends on phase 4.

| Id | Issue | Title | Epic | Depends on | Adopted |
|---|---|---|---|---|---|
| E01 | [#10](https://github.com/wladku/Vereino/issues/10) | E01 — Discovery | — | — | no |
| E01-T01 | [#11](https://github.com/wladku/Vereino/issues/11) | Find out how guardians learn about changes, declare attendance and pay | #10 | — | no |
| E01-T02 | [#12](https://github.com/wladku/Vereino/issues/12) | Find out how the treasurer collects fees today, what it costs, and the baseline | #10 | — | no |
| E01-T03 | [#13](https://github.com/wladku/Vereino/issues/13) | Find out how the coordinator and coaches run attendance, urgent changes and call-ups | #10 | — | no |
| E01-T04 | [#14](https://github.com/wladku/Vereino/issues/14) | Find out what other clubs use, who decides, and whether they administer a facility | #10 | — | no |
| E01-T05 | [#15](https://github.com/wladku/Vereino/issues/15) | Check SportBM beyond the four screens | #10 | — | no |
| E01-T06 | [#16](https://github.com/wladku/Vereino/issues/16) | Find out how grant settlement works and whether it is a problem beyond KS Gwiazda | #10 | — | no |
| E01-T07 | [#17](https://github.com/wladku/Vereino/issues/17) | Check ProTrainUp's facilities module in a demo | #10 | — | no |
| E01-T08 | [#18](https://github.com/wladku/Vereino/issues/18) | Count attendance declarations in one Messenger group for 4 weeks | #10 | — | no |
| E01-T09 | [#20](https://github.com/wladku/Vereino/issues/20) | Find out what the separately built club website will do | #10 | — | no |
| E02 | [#21](https://github.com/wladku/Vereino/issues/21) | E02 — Club and people (phase 1) | — | — | no |
| E02-S01 | [#25](https://github.com/wladku/Vereino/issues/25) | An administrator sets up the club: settings with defaults, sections with coordinators, places and institutions | #21 | — | no |
| E02-S02 | [#26](https://github.com/wladku/Vereino/issues/26) | An administrator keeps one record per person, with families, consents and roles | #21 | E02-S01 | no |
| E02-S03 | [#27](https://github.com/wladku/Vereino/issues/27) | A guardian signs in and sees all wards in their language; a ward from the club's threshold gets a limited account without payments | #21 | E02-S02 | no |
| E02-S04 | [#28](https://github.com/wladku/Vereino/issues/28) | An administrator imports families from a spreadsheet with a preview and a review queue | #21 | E02-S02 | no |
| E02-S05 | [#29](https://github.com/wladku/Vereino/issues/29) | A guest sees the public club and section pages built from club data, with the blocks the club enables and the logos | #21 | E02-S01 | no |
| E03 | [#22](https://github.com/wladku/Vereino/issues/22) | E03 — Groups, classes and attendance (phase 2) | — | — | no |
| E03-S01 | [#30](https://github.com/wladku/Vereino/issues/30) | A coordinator builds groups of both kinds with memberships over time, and the imported group column becomes memberships | #22 | E02-S02, E02-S04 | no |
| E03-S02 | [#31](https://github.com/wladku/Vereino/issues/31) | A coordinator schedules recurring activities and sees conflicts; a coach creates a one-off event for their own group | #22 | E03-S01 | no |
| E03-S03 | [#32](https://github.com/wladku/Vereino/issues/32) | A guardian sees one calendar of all wards across sections and declares per the club's model; a ward with an account declares per the policy | #22 | E03-S02, E02-S03 | no |
| E03-S04 | [#33](https://github.com/wladku/Vereino/issues/33) | A coach knows the expected numbers before a session and records actual attendance | #22 | E03-S03 | no |
| E03-S05 | [#34](https://github.com/wladku/Vereino/issues/34) | A coach sees the phone and email of consenting guardians of their group's children, every view audited | #22 | E02-S03, E03-S01 | no |
| E04 | [#23](https://github.com/wladku/Vereino/issues/23) | E04 — Communication (phase 3) | — | — | no |
| E04-S01 | [#35](https://github.com/wladku/Vereino/issues/35) | A coordinator or coach announces to a club, section, group or session; recipients get an in-app notification and an email, and the author gets a text to paste into the group chat | #23 | E03-S02 | no |
| E04-S02 | [#36](https://github.com/wladku/Vereino/issues/36) | A coordinator marks a thread as a case, undeletable with full history | #23 | E04-S01 | no |
| E05 | [#24](https://github.com/wladku/Vereino/issues/24) | E05 — Later (parked) | — | — | no |
