# Vereino — product brief

- Date: 2026-10-23
- Mode: own; Owner: Władek Kuć (product owner, KS Gwiazda vice-president); Pass: full
- Evidence basis:
  - two conversations with the academy coordinator, a club insider outside the founding team (an online call cut short, then a phone call; automatic transcripts);
  - one account from outside the team: a guardian of three sons in another club's academy, which already uses a club app. Phone interview, automatic transcript;
  - one first-hand account of a guardian who is also a co-founder and board member;
  - one real Messenger excerpt from one group channel;
  - the club's internal knowledge from the founders' meeting;
  - the Orlik 2024 regulations;
  - a competitor benchmark of 13 products checked by an agent on 2026-10-23, not yet re-checked by a human, and the earlier ProTrainUp benchmark of 2026-09-30;
  - twenty decision records.
  
  The co-founder's account is tagged `[INTERVIEW]` because it is a real guardian's own experience. Note that `research/README.md` reserves that tag for people outside the team.
  
  Apart from the coordinator and the guardian from another club, nobody outside the team has been interviewed. Claims about coaches come from the team or the coordinator; none comes from a coach or the treasurer. Claims about other clubs are team beliefs or vendor pages. The most consequential untested belief is that guardians will declare attendance in Vereino instead of the Messenger poll (A01).
- Coverage: 123 claims — 101 sourced (interview 41, data 0, document 55, product 1, benchmark 4), 0 synthetic, 22 assumed; 9 entries on the collection plan. Most "document" lines are the team's own decisions and the spec, not evidence about users.
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: not yet signed. Problems and Target group rest on two guardian accounts, one of them from a co-founder, and the coordinator's account from two conversations. There is no account yet from coaches or the treasurer. Ready for: research (interviews already requested); not for implementation planning, which waits for the interviews (D15).
- Sources:
  - `.ai/specs/research/` (business case, vision board, stakeholders, protopersonas, journey map, MoSCoW, benchmark);
  - `research/interviews/2026-10-23-interview-guardian-founder.md`;
  - `research/interviews/2026-10-23-interview-guardian-multi-club.md`;
  - `research/interviews/2026-10-23-interview-coordinator.md`;
  - `research/interviews/2026-09-26-meeting-wk-kk.md`;
  - `research/interviews/2026-10-23-interview-coordinator-2.md`;
  - `research/decisions/D-001…D-020`;
  - `research/2026-10-23-benchmark-competitors.md` (13 products) and `research/2026-10-20-business-case.md` (revised 2026-10-23);
  - `research/2026-10-23-benchmark-sportbm.md` (screens of another club's app);
  - `.ai/specs/2026-10-20-vereino-club-management.md` (Draft).

## Decision summary

**Current decision (agreed 2026-10-23):** find out, through the interviews already requested, which beliefs behind the 1.0 scope hold before that scope is treated as closed. The scope stays as decided (D01–D17, the spec's REQ-001…REQ-035); implementation planning waits for the interviews (D15); grant settlement has its own discovery track (D18); the overlap with a separately built club website is checked before the scope changes (D20).

**What we know.** By the board's own knowledge, the club runs schedule and attendance through Messenger groups, tracks fees by hand, and arranges substitutions and Orlik bookings by phone (Problems). The accounts so far add:

- **Guardians (two):** regular training times are known from the season start; the friction is friendlies and tournaments — a gathering time that differed between a post and its poll, an address without a map pin that cost 30 minutes. One mutes every messenger app and checks the day before; both arrange lifts in the group chat. In another club's app, a confirmation deadline was missed, urgent changes still go through WhatsApp ("nobody will see it" in the app), the parent pays a commission he dislikes, and the visible "unpaid" status helps him pay. A standing order kept paying through fee-free summer months, unnoticed by the club.
- **The academy coordinator (two conversations):** the club must keep an attendance list, and coaches need the number beforehand (he planned for 6, 4 came); he would want absence-only reporting for training and confirmation for matches. He and the other groups he knows of call up all their players. Urgent changes go only through the Messenger groups. Substitutions are rare and settled among coaches, with no dispute described (Władek recalls none either). Coach pay is a fixed base adjusted per missed or covered session plus away trips (Q14). Coaches collect cash and hand it over monthly; coaches of the two older league groups pay referees from that cash or their own money. The training timetable has no collisions; matches, tournaments and pitch maintenance do (D17). The club rents school halls in winter (Q15). Grant settlement — about 12 grants this year, rules differing per agreement, allocations the municipality can reject, a substantive report — takes most of his time, hours unknown (D16, D18).
- **A separate club website** is being built by another person. By the coordinator's account it is to present coaches and groups, hold documents and consents, take sign-ups and show the Orlik schedule with booking, which the Orlik management agreement is expected to require to be public. This overlaps Vereino's public page and Orlik booking (Q17, D20).
- **The benchmark** (13 products, agent-checked) found no product combining the club side with municipal-facility administration; Vibeclass also covers multi-section clubs; on 2026-10-23 ProTrainUp's pricing page lists a facilities module (whether it is new since 2026-09-30 is unknown), with nothing found on external rentals or an owner report.

**What is chosen.** 1.0 serves a small multi-section club with the football academy as its main section (D11), with KS Gwiazda as the pilot. Scope and exclusions are in Scope and Non-goals (N01–N17); the guardian's view across several clubs is later (D14).

**What could change it:**
- A01 and A07: whether guardians declare attendance in the app and whether notifications reach them.
- A02: whether the treasurer's pain is the one 1.0 addresses.
- A03 and A04: whether other small clubs would choose Vereino and administer a facility.
- A05: whether automatic substitution settlement solves a real problem.
- A09 and Q12: whether guardians need to see who else is called up (at Gwiazda the coordinator and the groups he knows of call up all their players).
- Q13: whether the team's energy should go to grant settlement for all associations instead (A10).
- Q17: how Vereino and the club website divide the public page, the Orlik schedule and booking, and sign-ups.

Two guardians and one coordinator do not show what guardians or coordinators in general do.

**Next.** Interviews with two more guardians and the treasurer/administrator (requested), several coaches (planned, not yet requested), and the club website's scope (Collection plan; owner Władek; dates not set). Then refresh this brief with `om-discover --refresh`.

**The gap.** The planned conversations do not yet reach the revisit points the decisions set: D01 needs 5 conversations with target users; D08 and D11 need 5 other clubs, including a non-football section. Today the material has 2 guardians and the coordinator, and the plan adds 2 guardians, the treasurer, several coaches (not yet requested) and 1 other club (not yet contacted) (Q08). Criteria for stopping or revising the project are not decided (Q05).

## Vision

A small club runs the club, not Excel and Messenger — the founders' intended direction, not a demonstrated benefit. `[DOCUMENT]` research/2026-10-20-product-vision-board.md

## Target group and stakeholders

- Customer (pays): the board of a small multi-section club (association) whose main section is a football academy (indicatively up to ~200 players); chosen segment. `[DOCUMENT]` D-011
- Customer's cost: in the open-source model the club pays with time and hosting, not a license. `[ASSUMPTION]` research/2026-10-20-product-vision-board.md
- Pilot club: KS Gwiazda Ściejowice. It has a football academy, a swimming pool and extra classes, and it administers the Orlik 2024 pitch complex on behalf of Gmina Liszki. `[DOCUMENT]` research/2026-10-20-business-case.md, Orlik regulations
- Pilot sections: Akademia piłkarska, Basen, Zumba, Szachy and Cheerleader. The academy has eight birth-year groups. `[DOCUMENT]` spec Q-005
- User (uses): a guardian of one child in the academy. He learns the training times at the start of the season, and he learns the details of friendlies and tournaments from the group's Messenger channel and poll. `[INTERVIEW]` interviews/2026-10-23-interview-guardian-founder.md
- User (uses), in another club: a guardian of three sons in a football academy that uses a club app. He handles football and his wife handles their dance classes elsewhere. `[INTERVIEW]` interviews/2026-10-23-interview-guardian-multi-club.md
- User (uses): the academy coordinator. He coordinates coaches, sessions, matches, places and equipment, manages substitutions, calculates coach pay, collects coaches' cash, and settles grants with the administrator. `[INTERVIEW]` interviews/2026-10-23-interview-coordinator.md
- Users (uses), not yet observed: coordinators of other sections, treasurer/administrator, coaches (often on contract), participants aged 13+, facility attendant. `[ASSUMPTION]` research/2026-10-20-stakeholders.md
- Stakeholders: the Gwiazda board decides the rollout. Gmina Liszki owns the Orlik and receives the report. The platform is Open Mercato. `[DOCUMENT]` research/2026-10-20-stakeholders.md
- Stakeholders found in the coordinator interviews: the person who builds the club's website (a separate, paid project), the person who maintains the pitch, the schools that rent halls to the club, the external accountant, league referees, and grant-makers (municipality, ministry). `[INTERVIEW]` interviews/2026-10-23-interview-coordinator.md, interviews/2026-10-23-interview-coordinator-2.md
- Decider for scope decisions: Władek Kuć (RACI A for 1.0 scope, segment, name and license); Kacper Kuć for technology and hosting. Rollout, payment model and Orlik rules have no named decider (Q01, Q02, Q04).

## Problems, with evidence

- **Current tools.** The club runs schedule and attendance through Messenger groups, keeps membership fees by hand, arranges coach substitutions by phone, takes Orlik bookings by phone calls to the club, and keeps no record of difficult cases. This is board knowledge, not a user account. `[DOCUMENT]` interviews/2026-09-26-meeting-wk-kk.md
- **Friendlies and tournaments.** One guardian described them as the harder part: the venue rotates between clubs, and the coach posts the address, the times and a poll in the group channel. `[INTERVIEW]` interviews/2026-10-23-interview-guardian-founder.md
- **Conflicting times.** In one real post from the past week, the post gave the gathering at 8:30 and the poll's title gave 9:30. The guardian had not noticed. `[INTERVIEW]` same note (Messenger excerpt)
- **Wrong venue.** Once, a message gave the address of an Orlik in a neighbouring municipality instead of a map pin; the family got lost and arrived about 30 minutes late. `[INTERVIEW]` same note
- **Lifts.** Guardians arrange lifts to weekend trips in the group chat. The guardian values that use. `[INTERVIEW]` same note
- **Muted apps.** The guardian mutes all messenger apps entirely and checks the time and place the day before by scrolling the channel history. `[INTERVIEW]` same note
- **Fee errors.** The guardian's standing order paid through two summer months when no fees are charged, and nobody from the club contacted him about it. He does not remember whether he then skipped September, so it is unknown whether the club lost or kept any money. He named two further possibilities: a standing order carrying last year's rate, or one with a wrong amount. Those two did not happen to him. `[INTERVIEW]` same note
- **Absences.** Guardians report absences in the group channel or privately to the coach, outside the poll. `[INTERVIEW]` same note
- **Missed confirmations.** In the other club's app, a call-up for a friendly has a confirmation deadline. The second guardian missed one, and he says parents forget to click and the coach then phones to ask. `[INTERVIEW]` interviews/2026-10-23-interview-guardian-multi-club.md
- **Who else is coming.** The second guardian cannot see in the app who else is called up for a friendly. On WhatsApp he could, which helped arrange lifts. He would also like to see which children are in his son's training group, for contact between parents (a stated preference). Three families rotate driving to training. `[INTERVIEW]` same note
- **Urgent changes.** In the other club, urgent changes (a match moved from 10:00 to 11:00 the day before) and practical requests (lending a kit) still go through WhatsApp. He said that "nobody will see it" in the app, and that a messenger is what the app misses most. `[INTERVIEW]` same note
- **Commission and status.** Paying fees in the other club's app costs the parent a commission of about PLN 2 per basket, which annoys him. A friend of his pays by bank standing order; the note gives no reason. The visible "unpaid" status, on the other hand, prompts him to pay. `[INTERVIEW]` same note
- **Kit orders in the other club.** That club's coordinator takes kit orders through WhatsApp, although the app supports them. `[INTERVIEW]` same note
- **Kit orders.** A guardian pays the coach in cash when the kit is handed over, or has to remember to settle the amount later. Today the club collects orders through a Google Form. `[INTERVIEW]` same note; `[DOCUMENT]` D-013
- **Fee control (belief).** The guardian believes nobody in the club is in control of fee settlement. This is his belief, not an observation. `[ASSUMPTION]` same note
- **Treasurer (belief).** The treasurer does not know at any moment who is overdue, sends reminders by hand, and collects coaches' units from memory. `[ASSUMPTION]` research/2026-10-20-protopersonas.md (A02)
- **Coaches (belief).** Coaches lose declarations in the chat and argue about units after substitutions. `[ASSUMPTION]` research/2026-10-20-protopersonas.md (A05)
- **Substitutions.** Coaches look for a substitute among themselves and go to the coordinator only if they cannot find one; substitutions are now rare, more frequent around June, and no dispute about them was described. `[INTERVIEW]` interviews/2026-10-23-interview-coordinator.md
- **Substitutions (owner's recollection).** Asked in the refresh session, Władek recalls no coach dispute about substitution settlement in the last year. `[DOCUMENT]` om-discover refresh session, 2026-10-23
- **Coach pay.** Coach pay is a fixed monthly base per coach (higher for the older league groups), reduced by a fixed amount per missed session that passes to the substitute, plus a fixed amount per away trip; the coordinator calculates it monthly from each coach's summary. Amounts are not recorded. `[INTERVIEW]` same note
- **Cash and referees.** Coaches take fees and kit payments in cash, list who paid what on an envelope or a sheet, and hand the cash to the coordinator once a month; he keeps a cash notebook and an Excel settlement. Coaches of the older league groups pay referees at home league matches from the collected cash or their own money, and the referee's declaration is the receipt used for tax and social-insurance payments. `[INTERVIEW]` same note
- **School halls.** In winter the academy trains in school halls in three nearby villages under signed contracts; for one hall the club logs the hours and the school bills from that log, the other two schools keep their own logs and bill monthly. `[INTERVIEW]` same note
- **Grant settlement.** The club settled about 12 grants this year, by the coordinator's estimate; each invoice from KSeF is allocated to one or more grants, described, stamped and tabulated monthly, and a double claim could cost a whole grant. The coordinator named this as the work that takes most of his time; how long one settlement takes is not recorded. `[INTERVIEW]` same note
- **Grant settlement (owner's view).** Władek, as vice-president, calls grant settlement "a nightmare"; he has not described a specific settlement. `[ASSUMPTION]` research/decisions/D-018-grant-settlement-discovery-track.md
- **Children in several organisations (belief).** Guardians with children in several organisations struggle to keep track of what is on, where and when. D-014 rests on Władek's description of a friend, who was interviewed on 2026-10-23 (A06). `[ASSUMPTION]` D-014 (A06)
- **Orlik rules.** The Orlik regulations set hour zones, a 90-minute unit, payment to the municipality's account and a 24 h cancellation rule. The regulations are cited from the business case; no copy is in the repository. `[DOCUMENT]` research/2026-10-20-business-case.md
- **Collisions.** The regular training timetable has no collisions: the coordinator and the administrator set it and publish it as a summer and a winter poster. Collisions happen "very often" between matches, tournaments and pitch maintenance planned by someone else; league matches are known up to two weeks ahead, tournaments sometimes only days ahead. This replaces the team's earlier belief that the coordinator lacks a tool to detect collisions between groups. `[INTERVIEW]` interviews/2026-10-23-interview-coordinator.md
- **Public schedule (belief).** The Orlik has no public schedule today. `[ASSUMPTION]` spec Problem Statement
- **Public schedule required.** The coordinator expects the Orlik management agreement the club will sign to require a public Orlik schedule; he sees it as an active calendar where people can book instead of phoning the club. The agreement has not been read. `[INTERVIEW]` interviews/2026-10-23-interview-coordinator-2.md
- **Attendance list and numbers.** The club must keep an attendance list. Knowing the number beforehand matters to coaches: he planned a session for at least 6 children, 4 came because of illness, and he changed the whole session on the spot. `[INTERVIEW]` same note
- **Attendance preference.** He would want guardians to report only absence for training and to confirm presence for friendlies and matches; he noted that confirming every time burdens parents. This is a stated preference. `[INTERVIEW]` same note
- **Last season's sheet.** Last season attendance was kept in a shared Google sheet, where coaches also noted fee payments; he summed them per group and added cash. Now monthly bank transfers are typed into a template by hand and cash is added at month end. `[INTERVIEW]` same note
- **Urgent changes at Gwiazda.** The only way to reach guardians quickly today is the Messenger groups; SMS might get more attention, "though that varies too". `[INTERVIEW]` same note
- **Call-ups at Gwiazda.** He calls up all his players, and so do the other groups he knows of; squads are on the edge (a team playing 11-a-side sometimes travels with exactly 11). `[INTERVIEW]` same note
- **Grant settlement rules.** Rules differ per agreement (for example, whether costs count from the grant's start or only from when the money arrives); the municipality can reject the club's allocation of invoice parts; each settlement includes a substantive report with photos and proof that the project succeeded; documents are kept, he thinks, for about 5 years. He could not say how many hours a settlement takes — for the municipal ones "several good afternoons" with the administrator, the rest is hers. `[INTERVIEW]` same note
- **Fear of error in grants.** He describes fear that a bad description is read as fraud or clawed back, and reports hearing the same from other associations at a local meeting; that is second-hand. For an expected grant he will sign a promissory note with personal liability. `[INTERVIEW]` same note
- **Club website.** Another person is building a website and system for the club, paid by the club and separate from Vereino. By the coordinator's account it is to present the coaches and groups, hold documents and consents, take sign-ups ("enrol a child", cheerleading, chess, zumba) and show the Orlik schedule with booking. `[INTERVIEW]` same note; separate project confirmed by Władek `[DOCUMENT]` D-020

## Product and how it stands out

- What it is: an open-source (MIT) club management application on Open Mercato for a small multi-section club; detail in Scope. `[DOCUMENT]` D-011, D-012
- What makes it different, as hypotheses only:
  - the municipal facility as a core feature;
  - non-football sections as a full use case (Vibeclass also presents this, so it is not unique);
  - one person and one calendar across sections;
  - no license fee and data kept by the club.
  
  That these differences make a small club choose Vereino is A03. `[ASSUMPTION]` research/2026-10-20-business-case.md

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|
| SportBM (as used by LKS Lotnik 1949) | one calendar with several children's events, per-child call-up status, a venue with address and map pin, the coach's free-text notes, payment status on the dashboard `[BENCHMARK]` (four screenshots from one guardian's account; public page and pricing not yet checked) | the gathering time sits only in free text; who else is called up is not shown; that account had 135 unread notifications; the club's cost is unknown | 2026-10-23 | not yet checked |
| ProTrainUp | calendar, attendance, announcements, fees with reminders and online payment, multiple roles, mobile apps; Club Pro PLN 125/month, Silver PLN 245/month; on 2026-10-23 the pricing page also lists a "facilities and reservations" module from Club Pro and bank statement parsing from Gold `[BENCHMARK]` (agent-checked, not yet re-checked by a human; no demo used) | nothing found on external rentals, a public schedule or an owner report; a football/sports model, heavy for a small academy, vendor-held data — the last three are `[ASSUMPTION]` until checked | 2026-10-23 | https://protrainup.com/pl/pricing |
| Vibeclass | presents multi-section clubs (several sports under one roof) as a core case; per-section schedules and fees, coach-hour settlement, internal room bookings with collision detection `[BENCHMARK]` (agent-checked) | no evidence found on sibling discount, bank import, kit orders, a public page or external rentals; price for ~200 players not computable from the page | 2026-10-23 | see research/2026-10-23-benchmark-competitors.md |

- Another academy uses a dedicated club app, SportBM according to the screenshots. Per the guardian, it has an account per son, a calendar with list and calendar views, events with a map pin, a coach's description, start and end times, call-ups with a confirmation deadline, fee payment with a commission, and kit orders. This is a guardian's account, not a checked benchmark. `[INTERVIEW]` interviews/2026-10-23-interview-guardian-multi-club.md

- Across 13 products, the agent found none that combines the club side with municipal-facility administration, and none that describes substitution settlement, a coach-to-treasurer cash handover or a text to paste into a group chat. This is an assessment from vendor pages, not evidence of demand. `[ASSUMPTION]` assessment in research/2026-10-23-benchmark-competitors.md

- The coordinator, who tested ProTrainUp, remembers call-ups with confirmation, a calendar and fees, but no pitch or Orlik bookings and nothing visible on the web; this is his recollection. `[INTERVIEW]` interviews/2026-10-23-interview-coordinator-2.md

Checking SportBM's public page and pricing, and ProTrainUp's facilities module in a demo, are on the Collection plan.

## Goals and success criteria

- Business goal: Gwiazda — all sections — runs on Vereino for the full 2027/28 season without going back to Messenger for attendance. This is a provisional target set by the founders; its feasibility is A01. `[DOCUMENT]` research/2026-10-20-product-vision-board.md, spec Overview
- User outcome: a guardian knows on the day before where and when their child must be, from one consistent source. Proposed in this session from the interview; not yet chosen. `[ASSUMPTION]` interviews/2026-10-23-interview-guardian-founder.md
- Gap against that outcome: the spec's session has start and end times but no gathering time, so the 8:30/9:30 conflict would still sit in free text. A place does carry an address, coordinates and an external flag. `[PRODUCT]` spec Data Models
- The other academy's app also puts the gathering time in a free-text note, apart from the event's start time. `[BENCHMARK]` research/2026-10-23-benchmark-sportbm.md
- Primary metric, baseline today, threshold, date:
  - The share of attendance declarations made in the app, measured per section. The threshold of ≥80% for the 2027/28 season is a provisional founders' target.
  - The baseline is unknown: the spec plans to count Messenger declarations by hand in one group for 4 weeks. `[DOCUMENT]` spec Overview and Success Measures
- What must not get worse:
  - Guardians' ability to arrange lifts in the group chat. Vereino works alongside the chat, not instead of it (D09). `[INTERVIEW]` interviews/2026-10-23-interview-guardian-founder.md, interviews/2026-10-23-interview-guardian-multi-club.md
  - The club's obligations to the municipality under the Orlik regulations (R05).

## Scope

- **Now (1.0):** the spec's Must set (`.ai/specs/2026-10-20-vereino-club-management.md`, REQ-001…REQ-035 with Must priority), delivered in its five phases.
  - The 1.0 scope is D01 as extended by D13 and D17: people and roles, sections and groups, activities and calendars, attendance, substitutions, announcements, fees with online payment, facility and bookings, public club page, cash and bank reconciliation, order campaigns, treasurer role, a bilingual interface, and facility maintenance planned in the facility calendar (D17).
  - Phase 1 (club and people) is the smallest coherent outcome.
- **Later:** a guardian's view across several clubs (D14); push with a native app (D09); online payment for renters; projects and grants, with grant settlement explored on its own track (D16, D18); volunteer duty sign-up (1.1).
- **Not doing:** see Non-goals.

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Section | a first-class part of the club (football academy, swimming pool, zumba…) with its own coordinator | club administrator | staff, public page |
| Group | a team (`team`) or a class group (`class_group`); both kinds are equal (D03) | section coordinator | staff, members |
| Activity / session | an activity with recurrence generates sessions (training, match, friendly, camp, tournament, other) (D02) | coordinator, coach | role-filtered calendars |
| Unit | one `training` session in status `done`, owed to whoever ran it (R04) | coordinator | coach, treasurer |
| Orlik | the municipal pitch complex the club administers on behalf of Gmina Liszki | club, under the agreement with the municipality | public schedule |
| Case | a thread marked as evidence: undeletable, with full history | section coordinator, administrator | coordinator, administrator |

Full vocabulary: spec *Domain Vocabulary and Business Rules*.

## Key flows

- Current state, regular training: the times are fixed for the season. The only declarations seen are absence reports, in the group channel or privately to the coach. `[INTERVIEW]` interviews/2026-10-23-interview-guardian-founder.md
- Current state, friendlies and tournaments: `[INTERVIEW]` same note
  1. The coach posts the venue, the start time, the gathering time and a poll in the group's Messenger channel.
  2. Guardians answer the poll.
  3. Guardians arrange lifts in the same channel.
  4. A guardian re-reads the history the day before to find the time.
- Current state, another club with an app: `[INTERVIEW]` interviews/2026-10-23-interview-guardian-multi-club.md
  1. The coach announces a friendly on Monday with a confirmation deadline (e.g. Thursday 12:00).
  2. Guardians accept or decline in the app; an event left unanswered expires and disappears for the parent.
  3. The coach phones parents who did not answer.
  4. Urgent changes and lifts go through WhatsApp.
- Current state, cash from coaches: `[INTERVIEW]` interviews/2026-10-23-interview-coordinator.md
  1. A parent pays a coach in cash for a fee or a kit.
  2. The coach notes who paid what, on an envelope or a sheet; coaches of the older groups also pay referees from it or from their own money.
  3. Once a month the coach hands the cash, the list and the referees' declarations to the coordinator.
  4. The coordinator records it in a cash notebook and an Excel settlement; invoices and declarations go to the external accountant through the administrator.
  5. Monthly bank transfers are typed into a template by hand; cash is added at month end, which shows who paid and who did not. `[INTERVIEW]` interviews/2026-10-23-interview-coordinator-2.md
- Future state: the spec's User Journeys describe the 1.0 flows. Whether the guardian's flow replaces step 2 for friendlies and tournaments (declaration in the app) is A01, and whether regular training has a declaration step at all is Q09; steps 3 and 4 stay in the chat or move to the app depending on A07 and D09.

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | One person is one record with at most one account; permissions add up across roles; each action records the role it was taken in | all roles | `[DOCUMENT]` D-005 | active | not anticipated | superseding row approved by the owner | Władek Kuć | none |
| R02 | A ward under the age threshold (default 13) has no account; from the threshold a ward gets a limited own login; consents and payments stay with the guardian; a minor never sees payments | guardians, participants | `[DOCUMENT]` D-004, spec REQ-002 | active (threshold 13 vs 16 open, Q03) | before rollout at Gwiazda | superseding row approved by the owner after the legal opinion | Władek Kuć | none |
| R03 | How a ward aged 13+ declares attendance is configurable per club, group or activity type (immediate, guardian confirms, guardian only) | attendance | `[DOCUMENT]` D-006 | active (default values are a proposal) | after the parent interviews | superseding row approved by the owner | Władek Kuć | none |
| R04 | One `training` session in status `done` is one unit, owed to whoever ran it; a substitution moves the unit | coaches, treasurer | `[DOCUMENT]` D-007, spec Q-004 | active | unknown | superseding row approved by the owner | Władek Kuć | none |
| R05 | Orlik bookings use a 90-minute unit, free cancellation up to 24 h before, and payment to the municipality's account | Orlik bookings | `[DOCUMENT]` Orlik 2024 regulations, D-008 | proposal (hours, rates and payment deadline to be confirmed) | before phase 5 | the person accountable towards the municipality (Q04) | pending | none |
| R06 | Staff of any section book any club facility immediately when the slot is free; an external request is valid only after administrator approval and holds the slot for at most 48 h | facility bookings | `[DOCUMENT]` spec Q-022, Q-023 | active | phase 5 exit gate (D-013) | superseding row approved by the owner | Władek Kuć | none |
| R07 | A coach or coordinator may accept cash for their groups' orders with a numbered receipt, and for membership fees when the club setting allows it (default: allowed); the treasurer confirms each handover | payments | `[DOCUMENT]` spec Q-029, Q-037, REQ-033 | active | phase 4 exit gate (D-013) | superseding row approved by the owner | Władek Kuć | none |
| R08 | Siblings: the oldest child pays the full rate and the others get the discount, on monthly fees only | membership fees | `[ASSUMPTION]` spec Q-006 default | proposal | before phase 4 | the treasurer and Władek | pending | none |
| R09 | The interface is multilingual; content entered by the club stays in one language per club | all texts | `[DOCUMENT]` spec Q-038 | active | unknown | superseding row approved by the owner | Władek Kuć | none |

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | Coaching tools: training diagrams, exercise library, medical module, scouting and assessments, individual statistics | a small club would use a fraction; ProTrainUp is strong there; kept after the coordinator's wish for training plans, which is an intention tied to a possible certification (D16) | Władek Kuć | active | at the brief refresh after the administrator interview and the second coordinator conversation (D16); change if the club commits to the certification and coaches confirm the need | superseding row approved by the owner | `[DOCUMENT]` D-011, business case, D-016 | none |
| N02 | Push notifications in 1.0 | no web push for a PWA in the platform; returns with a native app | Władek Kuć | active | with the native app | superseding row approved by the owner | `[DOCUMENT]` D-009, spec Q-002 | none |
| N03 | Messenger/WhatsApp integration | no official API for groups; a text with a link to paste replaces it | Władek Kuć | active | if a group API appears | superseding row approved by the owner | `[DOCUMENT]` D-009 | none |
| N04 | Payment gateways other than Stripe, including a custom Przelewy24/PayU adapter | Stripe is available in the platform | Władek Kuć, Kacper Kuć | active | after the treasurer interview | superseding row approved by both owners | `[DOCUMENT]` D-010, spec Q-003 | none |
| N05 | Online payment for renters and accounts for regular renters | requests without payment are in; payment stays a transfer to the municipality | Władek Kuć | active | phase 5 exit gate | superseding row approved by the owner | `[DOCUMENT]` D-013 | none |
| N06 | A page editor (CMS) | the public page is built from club data | Władek Kuć | proposal | unknown | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals | none |
| N07 | Projects and grants; a shop (order campaigns are in) | not needed for the 1.0 thesis; kept after the coordinator named grant settlement as his biggest time sink, because it rests on one account and the administrator was not interviewed (D16); explored on its own track (D18) | Władek Kuć | active | at the brief refresh after the administrator interview and the second coordinator conversation (D16), and when the D18 evidence is collected | superseding row approved by the owner | `[DOCUMENT]` D-001, D-013, D-016, D-018 | none |
| N08 | Bookkeeping of coach payouts and payroll export | 1.0 only calculates units and exports CSV | Władek Kuć | active | unknown | superseding row approved by the owner | `[DOCUMENT]` D-007 | none |
| N09 | Multiple clubs on one instance in 1.0 (the architecture must not block it) | one instance per club; the hosting model is open | Władek Kuć | active | with the hosting decision (Q06) | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals, D-014 | none |
| N10 | A guardian's view across several clubs in 1.0 | the benefit needs other clubs on Vereino; the problem is unverified | Władek Kuć | active | after the parent interviews | superseding row approved by the owner | `[DOCUMENT]` D-014 | none |
| N11 | Translating club-entered content | one content language per club | Władek Kuć | active | unknown | superseding row approved by the owner | `[DOCUMENT]` spec Q-038 | none |
| N12 | A native app; PWA packaging | 1.0 is a responsive web site | Władek Kuć | proposal | unknown | superseding row approved by the owner | `[DOCUMENT]` research/2026-10-20-moscow.md, spec Non-goals | none |
| N13 | Integration with PZPN / Łączy nas piłka | not needed in 1.0 | Władek Kuć | proposal | unknown | superseding row approved by the owner | `[DOCUMENT]` research/2026-10-20-moscow.md | none |
| N14 | Bulk import of people from a spreadsheet | open whether the pilot needs it (spec Q-018) | Władek Kuć | proposal | before the pilot | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals | none |
| N15 | A guardians' contact list for coaches | data minimisation; coaches reach guardians through announcements and threads | Władek Kuć | proposal | unknown | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals | none |
| N16 | Volunteer duty sign-up in 1.0 | planned for 1.1 | Władek Kuć | proposal | 1.1 planning | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals | none |
| N17 | Sales documents (receipts, invoices) for kit orders | the system records orders and payments only | pending (board / accountant, spec Q-034) | proposal | before the first order campaign | the board | `[DOCUMENT]` spec Q-034 | none |

## Decisions

| Id | Date | Decision | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| D01 | 2026-09-26 (extended 2026-10-20) | 1.0 = calendar core + payments + full facility module | the coordinator and administrator first need people, places, classes and a calendar; payments and the Orlik are the edge over ProTrainUp | Władek Kuć | active | after 5 conversations with target users | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-001-mvp-scope.md | none |
| D02 | 2026-09-26 | Classes and events are one Activity with a type and recurrence | one calendar, one attendance | Władek Kuć | active | after the camp is built | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-002-single-activity.md | none |
| D03 | 2026-09-26 | Team and class group are one Group with a kind | multi-section club, same mechanisms | Władek Kuć | active | after 1.0 | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-003-single-group.md | none |
| D04 | 2026-09-26 | Guardian account with child profiles; own login from 13 (adopts R02) | the parent sees all children; a teenager checks the schedule | Władek Kuć | active | before rollout at Gwiazda | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-004-child-account.md | none |
| D05 | 2026-09-29 | One person can combine roles (adopts R01) | that is how a small club works | Władek Kuć | active | not anticipated | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-005-multiple-roles.md | none |
| D06 | 2026-09-29 | Attendance declaration of a ward 13+ is configurable (adopts R03) | families and clubs differ | Władek Kuć | active | after the parent interviews | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-006-declaration-13plus.md | none |
| D07 | 2026-09-29 | Coach = base pay + units; a substitution moves the unit (adopts R04) | that is how Gwiazda settles; automation removes disputes | Władek Kuć | active | unknown | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-007-substitution-settlement.md | none |
| D08 | 2026-09-26 | Full facility module in 1.0 | ready rules in the regulations; the edge over ProTrainUp; Gwiazda administers the Orlik | Władek Kuć (scope); towards the municipality: pending | active (scope) / proposal (detailed rules, R05) | after conversations with coordinators of other clubs | superseding row approved by the owner; moves to Should if most academies do not administer a facility | `[DOCUMENT]` research/decisions/D-008-orlik-in-mvp.md | none |
| D09 | 2026-09-29 (confirmed 2026-10-20) | Announcements in the app with in-app notification and e-mail plus a "share to group" text; no messenger integration | no group API; the app is the source of truth, the chat stays alongside | Władek Kuć | active | after the magic link test in one Gwiazda group | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-009-announcements-without-messenger.md | none |
| D10 | 2026-10-19 (confirmed 2026-10-20) | Online membership payment in 1.0 through Stripe | fee collection is the first argument in the segment; commission model open (Q02) | Władek Kuć; Kacper Kuć for the gateway | active | after the treasurer interview | superseding row approved by the owners | `[DOCUMENT]` research/decisions/D-010-online-payments-in-mvp.md | none |
| D11 | 2026-10-19 (corrected 2026-10-20) | Segment: small multi-section clubs with a football academy as the main section | Władek knows the segment from the inside; ProTrainUp is heavy and paid there | Władek Kuć | active | after 5 conversations with coordinators or presidents of other clubs | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-011-segment.md | none |
| D12 | 2026-09-29 | Name Vereino, MIT license; domain on hold | name checks; license chosen with the repository | Władek Kuć | active (domain and hosting model open) | before the first public commit (the repository already exists; the trigger is passed) | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-012-open-source-name.md | none |
| D13 | 2026-10-20 | Scope added to 1.0 after discovery (REQ-023…REQ-035); kit orders Could → Must | the pilot club does these by hand today | Władek Kuć | active | phase 4 and phase 5 exit gates | superseding row approved by the owner; candidates to move to Should in order: REQ-029, REQ-028, REQ-030 | `[DOCUMENT]` research/decisions/D-013-scope-added-after-discovery.md | none |
| D14 | 2026-10-23 | A guardian's view across several clubs is later; 1.0 must not block it (adopts N10) | 1.0 is one club per instance and the benefit needs other clubs on Vereino; placement was Claude's recommendation, accepted by Władek; a calendar subscription link was considered | Władek Kuć | active | after the parent interviews | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-014-cross-club-guardian-view-later.md | none |
| D15 | 2026-10-23 | Implementation planning of phase 1 waits for the requested interviews | phase 1 ends with guardians signing in, which is untested (A01, A07); planning now with the risk accepted was the alternative | Władek Kuć | active | when the interview notes are in and the brief is refreshed | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-015-phase-1-waits-for-interviews.md | none |
| D16 | 2026-10-23 | Grants (N07) and training plans (N01) stay out of 1.0 after the coordinator interview; the problem and the intention are recorded | each rests on one account; the administrator was not interviewed; the certification is not decided; Claude's recommendation, accepted by Władek | Władek Kuć | active | at the brief refresh after the administrator interview and the second coordinator conversation | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-016-keep-grants-and-coaching-tools-out.md | none |
| D17 | 2026-10-23 | Facility maintenance and inspections (REQ-022) move from Could to Must. Planned work occupies the facility calendar like a closure, and recurring tasks run by date and by hours of use | "it affects facility bookings" (Władek); the academy coordinator reports frequent collisions between matches and tournaments and pitch maintenance | Władek Kuć | active | phase 5 exit gate | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-017-maintenance-must.md; `[INTERVIEW]` research/interviews/2026-10-23-interview-coordinator.md | none |
| D18 | 2026-10-23 | Grant settlement gets a separate discovery track, as a possible separate product that could also run as a Vereino module; the 1.0 scope and D16 stay meanwhile | the coordinator's account and Władek's view; Claude's proposal, accepted by Władek; whether to move the team's energy there is open (Q13) | Władek Kuć | active (track) / open (direction) | when the D18 evidence is collected | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-018-grant-settlement-discovery-track.md | none |
| D19 | 2026-10-23 | Maintenance work is planned by anyone holding the feature `facilities.maintenance.manage`, with no new role; a person holding only this feature works on assigned places and sees their calendar without other people's data | one capability for the person who maintains the pitch, without a new role; per-user features exist in the platform (spec V-13); a new maintainer role was considered and rejected (spec Q-041, Q-043) | Władek Kuć | active | phase 5 exit gate | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-019-maintenance-planner-by-permission.md | none |
| D20 | 2026-10-23 | The separately built club website overlaps Vereino's public page and Orlik booking; the 1.0 scope stays until the website's scope, booking, launch date, embedding and upkeep are known | the only source is the coordinator's short account; cutting scope now could remove something the website will not do, keeping both unchecked could make the club pay twice; Claude's recommendation, accepted by Władek | Władek Kuć | active | when the website's scope is collected | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-020-club-website-overlap-facts-first.md | none |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | Guardians will declare attendance in Vereino instead of the Messenger poll `[ASSUMPTION]` vision board ("biggest risk") | high | one guardian answers the coach's poll and keeps the chat for lifts; absences go to the chat or privately (interview 2026-10-23, co-founder). In another club's app, the outside guardian missed one confirmation deadline. He says parents often forget and the coach phones them. He thinks everyone installed the app because there is no choice, but he is not sure that all did (interview 2026-10-23, outside guardian). The coordinator needs the number beforehand and would want absence-only reporting for training and confirmation for matches (interviews/2026-10-23-interview-coordinator-2.md) | the primary metric and D09 fail; the guardian's side of 1.0 needs rethinking | parent interviews on how they last declared attendance; the magic link test in one Gwiazda group (D09) needs REQ-017 (a Should) built first, so it cannot run before scope is closed | Władek Kuć | unknown | untested |
| A02 | The treasurer's biggest pain is not knowing who is overdue, and online payment helps; Stripe commissions are acceptable `[ASSUMPTION]` protopersonas, D-010 | high | none about overdue amounts. A second guardian dislikes the commission that parents pay on in-app payments in his club; a friend of his pays by standing order. This is the parent's side; D10's trigger concerns the club's side. The visible unpaid status prompts him to pay (interviews/2026-10-23-interview-guardian-multi-club.md). One guardian's standing-order overpayment drew no contact from the club (interview 2026-10-23); online payment (D10) would not catch that, while bank import with matching (REQ-030, a D13 candidate for Should) would. There is no treasurer account. | the payments phase targets the wrong problem; D10 and the place of REQ-030 are revisited | interview with the treasurer/administrator, plus the baseline: number of families and overdue amounts at the end of the last month | Władek Kuć | unknown | untested |
| A03 | A small club chooses Vereino over ProTrainUp because it is free, simple and handles the facility `[ASSUMPTION]` business case | high | benchmarks only: 13 products checked on 2026-10-23 show the multi-section edge is not unique (Vibeclass) and on 2026-10-23 ProTrainUp's pricing page lists a facilities module; no product found with the municipal-facility side (research/2026-10-23-benchmark-competitors.md) | no clubs beyond Gwiazda; the business goals fail | conversations with coordinators or presidents of other clubs (e.g. Lotnik Ryspinów): what they use, who decides, whether open source is an argument or a risk | Władek Kuć | unknown | untested |
| A04 | Most academies in the segment administer a municipal facility `[ASSUMPTION]` D-008 | medium | Gwiazda only | the facility module moves from Must to Should (D08) | the same conversations with other clubs | Władek Kuć | unknown | untested |
| A05 | Coaches will use one club tool, and automatic unit settlement removes disputes `[ASSUMPTION]` protopersonas | medium | against the dispute part: the coordinator says substitutions are rare and settled among coaches and described no dispute (interviews/2026-10-23-interview-coordinator.md); Władek recalls none in the last year (refresh session, 2026-10-23). No coach interviewed | substitutions and units (D07) lose their point; coaches stay on their own tools | interviews with several coaches; the coordinator's second conversation | Władek Kuć | unknown | untested |
| A06 | Guardians with children in several organisations struggle to keep track `[ASSUMPTION]` D-014 | low for 1.0 | Władek's description of one friend. Władek identified the interviewee as that friend; the transcript gives three sons in football, D-014 says two. He splits the organisations with his wife (he handles football, she handles dance) and has not tried combining calendars (interviews/2026-10-23-interview-guardian-multi-club.md) | D14 stays later or is dropped | the remaining parent interviews | Władek Kuć | unknown | untested |
| A07 | In-app notifications and e-mail reach guardians `[ASSUMPTION]` D-009 | high | one guardian mutes all messenger apps and checks the schedule the day before (interview 2026-10-23, co-founder). In another club, urgent changes go through WhatsApp because in the app "nobody will see it" (interview 2026-10-23, outside guardian). His app account showed 135 unread notifications (research/2026-10-23-benchmark-sportbm.md). At Gwiazda, urgent changes reach guardians only through the Messenger groups (interviews/2026-10-23-interview-coordinator-2.md) | changes go unnoticed; a view the guardian checks themselves (or a calendar link) matters more than notifications | parent interviews: how they last found out about a change, and whether they read club e-mail | Władek Kuć | unknown | untested |
| A08 | A club without an IT person can get an instance hosted and maintained `[ASSUMPTION]` D-012 | medium | none | rollout beyond Gwiazda stalls | team decision plus the conversations with other clubs | Kacper Kuć | unknown | untested |
| A09 | Guardians need to see which other children are called up or in their group, to arrange lifts `[ASSUMPTION]` from two guardian accounts | medium | two guardians describe arranging lifts with other families and one wants to see who is called up (both interviews 2026-10-23); at Gwiazda the coordinator and the groups he knows of call up all their players (interviews/2026-10-23-interview-coordinator-2.md), so (interpretation) the list of who is called up there is the whole group | if false, guardians arrange lifts without seeing who is called up and the app need not show other children. If true and the app does not show them, the group chat stays the place where attendance is visible, and A01 gets harder. Showing them raises data-minimisation and consent questions. | ask the remaining guardians how they last arranged a lift, and ask coaches what they are willing to show | Władek Kuć | unknown | untested |
| A10 | Grant settlement is a frequent, costly and error-prone problem for associations beyond KS Gwiazda `[ASSUMPTION]` D-018 | high for the product direction (Q13), low for 1.0 | the coordinator's account (about 12 grants this year, his biggest time sink, risk of losing a grant; rules differ per agreement, allocations can be rejected, a substantive report is required; no hours known) and Władek's view; from other associations only the coordinator's second-hand report of the same fear (interviews/2026-10-23-interview-coordinator-2.md) | a product for all associations loses its case; D18 chooses between a Vereino module and no product | the D18 track: the last settlement step by step at Gwiazda, two or three other associations, and a benchmark of grant-settlement tools | Władek Kuć | unknown | untested |

## Kill criteria

Not decided (Q05). Two revision triggers exist in the decisions:
- D08: if most of the other academies do not administer a facility, the facility module moves to Should.
- D01: if interviews show that another module drives adoption, the scope changes.

No observation has been agreed that would stop the project.

## Hypotheses to test

None. No synthetic walkthrough has been run.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Who is accountable for the rollout at Gwiazda: the date, and who trains coordinators and coaches? (spec Q-039) | yes — blocks the 4-week pilot of phase 2 | Gwiazda board | open |
| Q02 | Whose Stripe account is it, and who approves the commission model? (spec Q-016) | yes — blocks payments in production (phase 4) | Gwiazda board / treasurer | open |
| Q03 | Is the age threshold for an own account 13 or 16? (spec Q-007) | yes — blocks the pilot, not the code | Władek Kuć after a legal opinion | open |
| Q04 | Who is accountable for the Orlik rules towards the municipality (hours, zones, rates, payment deadline)? (spec Q-008) | yes — blocks phase 5 data | Władek Kuć / Gmina Liszki | open |
| Q05 | What observation would make the team stop or substantially revise the project? | no — blocks a decision to commit beyond the pilot | Władek Kuć, Kacper Kuć | open |
| Q06 | Who hosts and maintains an instance for a club without an IT person? (D-012) | no — blocks rollout beyond Gwiazda | Kacper Kuć | open |
| Q07 | Do the 1.0 problems hold for guardians, coaches and the treasurer outside the team? | yes — blocks implementation readiness of phases 2–5 | the interviews in the Collection plan | open |
| Q08 | Which conversations will the team treat as enough to revisit D01, D08 and D11? | no — blocks those revisits | Władek Kuć | open |
| Q09 | Do guardians declare anything for regular training today, other than absences? | no — informs A01 and the primary metric | guardians (Collection plan) | open |
| Q10 | What answer from the guardian interviews would make the owner revisit D09 or the primary metric? | no — without it the interviews have no agreed outcome | Władek Kuć | open |
| Q12 | Should guardians see which other children are called up or in their group, given data minimisation and consent? | no — informs the guardian calendar and attendance (REQ-006, REQ-007) | Władek Kuć, after the coach interviews | open |
| Q13 | Should the team's energy go to a grant-settlement system for all associations rather than to Vereino? | no — informs the product direction; decided after the D18 evidence | Władek Kuć | open |
| Q14 | Does REQ-021 ("base + units × rate + matches and away trips per contract") match how the club pays coaches (a fixed base, minus a fixed amount per missed session passed to the substitute, plus a fixed amount per away trip)? | no — needed before REQ-021 is specified | Władek Kuć, the coordinator | open |
| Q15 | Should Vereino record the club's own rentals of other facilities (school halls: hours, bills)? | no — not in the 1.0 scope today | Władek Kuć | open |
| Q16 | Should cash expenses paid by coaches (referees) be recorded in Vereino, or stay in the cash notebook and with the accountant? | no — informs REQ-031 and REQ-033 | Władek Kuć, the treasurer | open |
| Q17 | How do Vereino and the separately built club website divide the public club page, the Orlik schedule and booking, and sign-ups? | yes — blocks planning of REQ-025, REQ-026, REQ-014 and REQ-024; not phase 1's people and roles | Władek Kuć, after the website's scope is known (D20) | open |
| Q11 | Is phase 1 planned before the interviews, accepting that guardians' sign-in is untested? | closed | Władek Kuć | closed 2026-10-23: no, planning waits for the interviews (D15) |

## Definition of Ready addendum (own)

- Problems and Target group have two guardian accounts (one from outside the team, one from a co-founder) and two conversations with the coordinator. There is no account from coaches or the treasurer. Ticket-level readiness for user-facing work is therefore not met.
- The scope decisions (D01–D20; D18: the track only) are confirmed by the product owner. The beliefs behind them are untested: A01, A02, A03 and A07 are high-importance and untested. No assumption has been accepted untested.
- **Ready for:** research. The interviews are requested.
- **Not yet ready for:** implementation planning.
  - Phase 1's outcome (the guardian and a 14-year-old sign in and see their profiles) also depends on guardians signing in, which is close to A01 and A07.
  - The owner decided that phase 1 planning waits for the interviews (D15).
  - The public club page and the Orlik schedule and booking also wait for Q17 (D20).

## Collection plan

### How do guardians learn about changes, declare attendance and pay today?

- What decision or work needs it: A01 and A07 (primary metric, D09), A02 (from the guardian's side), A06 (D14); blocks Q07
- Who can answer it: two more guardians with children in clubs. The first one, identified by Władek as the friend from D-014, is done (interviews/2026-10-23-interview-guardian-multi-club.md).
- How: interviews with `research/interviews/2026-10-20-script-parent.md`, asking about the last change, the last poll and the last fee paid
- Owner and by when: Władek Kuć; invitations sent 2026-10-23, first interview done 2026-10-23, the others' dates unknown
- Template: `research/templates/interview-note.md`

### How does the treasurer collect fees today, what does it cost, and what is the baseline?

- What decision or work needs it: A02, D10 (commissions), the payments phase; the success-measure baseline
- Who can answer it: the club's treasurer/administrator
- How: interview with `research/interviews/2026-10-20-script-treasurer.md`; data: number of families and overdue amounts at the end of the last month
- Owner and by when: Władek Kuć; invitation sent, date unknown
- Template: `research/templates/interview-note.md`, `research/templates/data-request.md`

### How do the coordinator and coaches run attendance and substitutions?

- What decision or work needs it: A05, D07, R04; the coach side of phases 2–3
- Who can answer it: the academy coordinator, plus several different coaches
- How: interviews with `research/interviews/2026-10-20-script-coach.md`
- Owner and by when: Władek Kuć; both coordinator conversations are done (interviews/2026-10-23-interview-coordinator.md, interviews/2026-10-23-interview-coordinator-2.md); still open with him: who decides the rollout (Q01), the coach pay formula (Q14) and the counting request; the coaches are not scheduled
- Template: `research/templates/interview-note.md`

### What do other clubs use, who decides, and do they administer a facility?

- What decision or work needs it: A03, A04, A08; D08 and D11 revisit points
- Who can answer it: a coordinator or president of another academy with several sections (e.g. Lotnik Ryspinów)
- How: an interview about the tools they use today, who chose them, and their facility
- Owner and by when: Władek Kuć; not yet contacted
- Template: `research/templates/interview-note.md`

### How does SportBM work beyond the four screens, and what does it cost the club?

- What decision or work needs it: the comparison in Product and how it stands out; A01, A07, A09
- Who can answer it: the guardian interviewed on 2026-10-23, and SportBM's public page
- How: four screenshots are in (research/2026-10-23-benchmark-sportbm.md). Still missing: a dated check of the public page and pricing, the call-up screen with its deadline, the payment screen, and what the "messages" tile does
- Owner and by when: Władek Kuć; unknown
- Template: `research/templates/benchmark-check.md`

### How does grant settlement work, and is it a problem beyond KS Gwiazda? (D18)

- What decision or work needs it: A10, Q13, the D18 decision (separate product, Vereino module, or none); N07
- Who can answer it: the administrator and the coordinator at Gwiazda; two or three other associations, not only sports clubs
- How: the last settlement of one grant step by step (who, how long, what had to be corrected); the sample agreement and settlement the coordinator offered to share, seen as a whole; the same in the other associations; a dated benchmark of grant-settlement tools
- Owner and by when: Władek Kuć; unknown
- Template: `research/templates/interview-note.md`, `research/templates/benchmark-check.md`

### What will the separately built club website do? (D20)

- What decision or work needs it: Q17; REQ-025, REQ-026, REQ-014, REQ-024
- Who can answer it: the administrator, or the person building the website
- How: ask what the website will present, whether Orlik booking works on it or only links out, its launch date, whether it can embed or link a calendar from another system, and who maintains it
- Owner and by when: Władek Kuć; unknown
- Template: `research/templates/interview-note.md`

### Does ProTrainUp's facilities module cover external rentals, a public schedule and an owner report?

- What decision or work needs it: A03, D08's edge over ProTrainUp
- Who can answer it: ProTrainUp's 14-day demo
- How: a dated check of the facilities module in the demo
- Owner and by when: Władek Kuć; unknown
- Template: `research/templates/benchmark-check.md`

### How many attendance declarations happen in Messenger today?

- What decision or work needs it: the baseline for the primary metric
- Who can answer it: a coach or coordinator of one group
- How: count poll answers and absence messages in one group channel for 4 weeks (spec Overview)
- Owner and by when: unknown
- Template: `research/templates/data-request.md`
