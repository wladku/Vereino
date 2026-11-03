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

## docs/ux-concept/README.md
Backlog source: docs/ux-concept/README.md
Last filed: 2026-11-03

2026-11-03 — gap analysis of the clickable mockup (`docs/ux-concept/mockups/`) against `main` (`db2bd67`), screen by screen, at the product owner's request ("specify everything that was in the mockup and prepare it for implementation"). The owner approved the tree before filing. E06 holds the phase 1–3 gaps on built screens; E07 (phase 4) and E08 (phase 5) file the payments and facilities spec phases as stories that stay not ready until their specs are `Ready for implementation`. The held-back items are filed and blocked on their tickets: A05 on E06-S13 and E06-S14, A02 on E07-S11, foundation I phase C on E06-S23. Ids continue after E05 of the product-brief source. The tracker search found no existing issue covering these items; nothing was adopted. Design authority: the UX concept, with `.ai/specs/2026-10-20-vereino-club-management.md` (E06), `.ai/specs/2026-10-27-vereino-club-payments.md` (E07) and `.ai/specs/2026-10-27-vereino-facilities.md` (E08).

| Id | Issue | Title | Epic | Depends on | Adopted |
|---|---|---|---|---|---|
| E06 | [#82](https://github.com/wladku/Vereino/issues/82) | UX parity with the clickable mockup, phases 1–3 | — | — | no |
| E06-S01 | [#83](https://github.com/wladku/Vereino/issues/83) | An administrator filters the people list by section, group, role, account and age and sees roles, groups and guardians | #82 | — | no |
| E06-S02 | [#84](https://github.com/wladku/Vereino/issues/84) | An administrator sees a person's group history and lands on the right tab of the person record | #82 | — | no |
| E06-S03 | [#85](https://github.com/wladku/Vereino/issues/85) | An administrator manages sections with group counts, deactivation, tabs and a short description | #82 | — | no |
| E06-S04 | [#86](https://github.com/wladku/Vereino/issues/86) | An administrator filters places and sees the owner, the hierarchy, the regulations and photos | #82 | — | no |
| E06-S05 | [#87](https://github.com/wladku/Vereino/issues/87) | An administrator sets the time zone from a list, sees the public address and records institutions' bank accounts in a valid format | #82 | — | no |
| E06-S06 | [#88](https://github.com/wladku/Vereino/issues/88) | An administrator sees Vereino widgets on the dashboard, starting with sections without a coordinator | #82 | — | no |
| E06-S07 | [#89](https://github.com/wladku/Vereino/issues/89) | A guest finds the club's contact, rules and privacy policy on every public page and navigates back from a section | #82 | E06-S03 (#85), E06-S09 (#91) | no |
| E06-S08 | [#90](https://github.com/wladku/Vereino/issues/90) | A coordinator filters groups by section, kind and season and sees coaches and participant counts | #82 | — | no |
| E06-S09 | [#91](https://github.com/wladku/Vereino/issues/91) | A guest sees a section's public groups with their schedule, upcoming sessions and instructor, and the club's events | #82 | — | no |
| E06-S10 | [#92](https://github.com/wladku/Vereino/issues/92) | A coordinator gives a team its PZPN age category from the club dictionary | #82 | — | no |
| E06-S11 | [#93](https://github.com/wladku/Vereino/issues/93) | A coordinator creates an activity with types that fit the group, an opponent and a coach chosen from coaches | #82 | — | no |
| E06-S12 | [#94](https://github.com/wladku/Vereino/issues/94) | A coordinator works the sessions list from today, cancels or opens attendance from a row, and sees the section calendar | #82 | — | no |
| E06-S13 | [#95](https://github.com/wladku/Vereino/issues/95) | A coach reports an absence and the coordinator assigns a substitute from the sessions that need a coach | #82 | E06-S12 (#94), E06-S15 (#97) | no |
| E06-S14 | [#96](https://github.com/wladku/Vereino/issues/96) | An administrator records coach contracts and exports the monthly coach units report | #82 | E06-S13 (#95) | no |
| E06-S15 | [#97](https://github.com/wladku/Vereino/issues/97) | A coach finds their sessions on Today and runs one from the phone: attendance list, cancellation and a message to the group | #82 | — | no |
| E06-S16 | [#98](https://github.com/wladku/Vereino/issues/98) | A guardian declares attendance straight from Today and sees each ward's status | #82 | — | no |
| E06-S17 | [#99](https://github.com/wladku/Vereino/issues/99) | A coach fills the attendance list in one tap, sees a summary before closing and returns to Today | #82 | — | no |
| E06-S18 | [#100](https://github.com/wladku/Vereino/issues/100) | A guardian reads the calendar with a section legend and moves to the next week from an empty week | #82 | — | no |
| E06-S19 | [#101](https://github.com/wladku/Vereino/issues/101) | A member moves around /club with a bottom bar, switches the ward and signs out from More | #82 | — | no |
| E06-S20 | [#102](https://github.com/wladku/Vereino/issues/102) | A member sees case marks, copies the text for the group chat and a coach posts an announcement from the phone | #82 | — | no |
| E06-S21 | [#103](https://github.com/wladku/Vereino/issues/103) | A coordinator filters threads by scope and section and deletes a message before the thread becomes a case | #82 | — | no |
| E06-S22 | [#104](https://github.com/wladku/Vereino/issues/104) | A guardian sees wards with their groups on the profile and a ward with an account sees who their guardians are | #82 | — | no |
| E06-S23 | [#105](https://github.com/wladku/Vereino/issues/105) | A guardian without an account declares attendance from a personal link and gets reminders | #82 | — | no |
| E07 | [#106](https://github.com/wladku/Vereino/issues/106) | Payments (phase 4) | — | — | no |
| E07-T01 | [#107](https://github.com/wladku/Vereino/issues/107) | Verify V-5 against payment_gateways and gateway_stripe | #106 | — | no |
| E07-S01 | [#108](https://github.com/wladku/Vereino/issues/108) | A treasurer sets fee schedules and discount rules and generates a period's charges in one action | #106 | E07-T01 (#107) | no |
| E07-S02 | [#109](https://github.com/wladku/Vereino/issues/109) | A treasurer sees charges by perspective, records a payment and cancels a charge with a reason | #106 | E07-S01 (#108) | no |
| E07-S03 | [#110](https://github.com/wladku/Vereino/issues/110) | A guardian pays selected charges online and sees the result after returning from Stripe | #106 | E07-T01 (#107), E07-S02 (#109) | no |
| E07-S04 | [#111](https://github.com/wladku/Vereino/issues/111) | A guardian sees what they owe on Today and Payments with the payer code, and the administrator sees overdue widgets | #106 | E07-S03 (#110), E06-S06 (#88), E06-S19 (#101) | no |
| E07-S05 | [#112](https://github.com/wladku/Vereino/issues/112) | A guest sees each group's membership fee and discount on the section page | #106 | E07-S01 (#108), E06-S09 (#91) | no |
| E07-S06 | [#113](https://github.com/wladku/Vereino/issues/113) | A treasurer imports a bank statement and confirms the matched transfers | #106 | E07-S02 (#109) | no |
| E07-S07 | [#114](https://github.com/wladku/Vereino/issues/114) | A coach or treasurer accepts cash for several charges and issues a numbered receipt | #106 | E07-S02 (#109) | no |
| E07-S08 | [#115](https://github.com/wladku/Vereino/issues/115) | An administrator builds a kit order form, runs the campaign through its stages and gets the supplier summary | #106 | E07-S01 (#108) | no |
| E07-S09 | [#116](https://github.com/wladku/Vereino/issues/116) | A guardian orders kit for a child in the app or from a personal link and can change or cancel it before the deadline | #106 | E07-S08 (#115), E07-S03 (#110) | no |
| E07-S10 | [#117](https://github.com/wladku/Vereino/issues/117) | A coach sees their groups' fees and kit, accepts cash, sends reminders and hands over kit | #106 | E07-S07 (#114), E07-S08 (#115) | no |
| E07-S11 | [#118](https://github.com/wladku/Vereino/issues/118) | A treasurer sees who holds the club's cash and accepts a handover with a numbered record | #106 | E07-S10 (#117) | no |
| E08 | [#119](https://github.com/wladku/Vereino/issues/119) | Facilities and bookings (phase 5) | — | — | no |
| E08-T01 | [#120](https://github.com/wladku/Vereino/issues/120) | Verify V-7, V-10 and V-13 and choose the opening-hours source | #119 | — | no |
| E08-S01 | [#121](https://github.com/wladku/Vereino/issues/121) | An administrator sets zones, closures and rates and opens booking availability in bulk | #119 | E08-T01 (#120) | no |
| E08-S02 | [#122](https://github.com/wladku/Vereino/issues/122) | Staff enter a rental after a phone call, with the price quoted and the status managed until the slot ends | #119 | E08-S01 (#121) | no |
| E08-S03 | [#123](https://github.com/wladku/Vereino/issues/123) | A coach or coordinator sees facility occupancy on the phone and books a slot for a group event or club use | #119 | E08-S02 (#122) | no |
| E08-S04 | [#124](https://github.com/wladku/Vereino/issues/124) | A guest sees the club's facilities and each facility's public schedule without personal data | #119 | E08-S01 (#121) | no |
| E08-S05 | [#125](https://github.com/wladku/Vereino/issues/125) | An external renter requests a booking online, confirms it by e-mail and gets the administrator's decision | #119 | E08-S04 (#124), E08-S02 (#122) | no |
| E08-S06 | [#126](https://github.com/wladku/Vereino/issues/126) | An attendant opens and closes the facility, records today's use and reports incidents; the administrator keeps the log and bans | #119 | E08-S02 (#122) | no |
| E08-S07 | [#127](https://github.com/wladku/Vereino/issues/127) | An administrator generates the municipality report for a facility and period and exports it as CSV | #119 | E08-S02 (#122), E08-S03 (#123), E08-S06 (#126) | no |
| E08-S08 | [#128](https://github.com/wladku/Vereino/issues/128) | A maintainer plans maintenance that blocks the facility calendar and gets reminders by date and hours of use | #119 | E08-S01 (#121), E08-S03 (#123) | no |
| E08-S09 | [#129](https://github.com/wladku/Vereino/issues/129) | An administrator reports the hours the club rents from other owners and exports them as CSV | #119 | E08-S07 (#127) | no |
