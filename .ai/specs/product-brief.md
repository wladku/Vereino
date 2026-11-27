# Vereino — product brief

- Date: 2026-11-26 (refresh of 2026-10-23)
- Mode: own, with the first prospective-club conversation; Owner: Władek Kuć (product owner); Pass: full (refresh)
- Evidence basis:
  - two conversations with the academy coordinator, a club insider outside the founding team (an online call cut short, then a phone call; automatic transcripts);
  - one account from outside the team: a guardian of three sons in another club's academy, which already uses a club app. Phone interview, automatic transcript;
  - one first-hand account of a guardian who is also a co-founder and board member;
  - one real Messenger excerpt from one group channel;
  - the club's internal knowledge from the founders' meeting;
  - the Orlik regulations;
  - a competitor benchmark of 13 products checked by an agent on 2026-10-23, not yet re-checked by a human, and the earlier ProTrainUp benchmark of 2026-09-30;
  - forty-five decision records;
  - since the 2026-11-26 refresh: the owner's note of the first presentation to a prospective club. The listener was a coach of a single-section youth football club; it was online, about 45 minutes, a demo on the fictional example club. The owner led it, so it is one account given during a sales demo, not a neutral interview.
  
  The co-founder's account is tagged `[INTERVIEW]` because it is a real guardian's own experience. Note that `research/README.md` reserves that tag for people outside the team.
  
  Apart from the coordinator and the guardian from another club, nobody outside the team has been interviewed. Claims about coaches come from the team or the coordinator; none comes from a coach or the treasurer. Claims about other clubs are team beliefs or vendor pages. The most consequential untested belief is that guardians will declare attendance in Vereino instead of the Messenger poll (A01); the first outside coach expects they will not.
- Coverage: 168 claims — 144 sourced (interview 51, data 0, document 88, product 1, benchmark 4), 0 synthetic, 24 assumed; 1 active entry on the collection plan (9 deferred). Recounted on 2026-11-26; the October count of 139 had not been updated as decision rows D29–D43 were added. Most "document" lines are the team's own decisions and the specs, not evidence about users.
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: Władek Kuć, product owner, with the risks of D21 accepted; refreshed 2026-11-26 for D44 and D45. Problems and Target group rest on two guardian accounts (one from a co-founder), two coordinator conversations and one prospective club coach's account given during a demo. The treasurer, the coaches as a group and most other clubs have no account; the beliefs about them are accepted untested, and an accepted risk does not replace evidence about a problem or its users. Ready for: phases 1–5 as built, D44 (event photos through a spec, with the guardian's image consent) and D45.
- Sources:
  - `.ai/specs/research/` (business case, vision board, stakeholders, protopersonas, journey map, MoSCoW, benchmark);
  - `guardian interview note (not public)`;
  - `guardian interview note (not public)`;
  - `coordinator interview note (not public)`;
  - `founders' meeting note (not public)`;
  - `coordinator interview note (not public)`;
  - `research/decisions/D-001…D-045`;
  - `first-club meeting note (not public)`;
  - `research/2026-10-23-benchmark-competitors.md` (13 products) and `business case (not public)` (revised 2026-10-23);
  - `research/2026-10-23-benchmark-sportbm.md` (screens of another club's app);
  - `.ai/specs/2026-10-20-vereino-club-management.md` (phases 1–3; phase 1 ready), `.ai/specs/2026-10-27-vereino-club-payments.md` (phase 4) and `.ai/specs/implemented/2026-10-27-vereino-facilities.md` (phase 5) — split by D28.

## Decision summary

**Current decision (agreed 2026-11-26):** with the 1.0 scope built, the next work is reaching guardians, adding photos and graphics to club events (D44), and making Vereino an installable web app with the club's name and logo (D45). The public club page stays a simple club card; it is not meant to replace a website builder. The earlier holds on the treasurer's work (A02) and on substitution and coach-settlement automation (A05) no longer apply: the owner released them on 2026-11-04 and 2026-11-19 (D30, D37), and that work is built.

**What the evidence shows.** The October material is unchanged (Problems): two guardians, two conversations with an academy coordinator and the board's knowledge. Guardians learn about friendlies and tournaments from the group chat, and the coordinator needs the number of children beforehand.

On 2026-11-26 the owner presented Vereino to a coach of a single-section youth football club. It is the first recorded account from a prospective club, and it came during a demo, so it is one person's view, not a neutral interview. What the coach said:

- the club talks to parents only in WhatsApp groups;
- fees are paid by bank transfer and settled by a treasurer with his own system;
- the club has a Facebook page and plans a website;
- he expects parents will not use an app, and says the club already chases parents by phone for attendance and fees;
- he asked whether the club page could replace Facebook and show event descriptions;
- he liked contact with parents "in one app", and the parent seeing what is on, when, and what is missing.

The owner draws two conclusions from this one conversation. First, contact with parents hurts more than fees. Second, the board decides, and the club itself must bring in a rule that parents answer only through the app.

**What is chosen.**
- **Invitations (D44).** Staff copy a personal invitation link for a family, send it on WhatsApp or show it as a QR code. A group QR code leads new children to the existing sign-up form (D41). Who creates accounts does not change. An open group link, where parents claim their own child, was considered and rejected: it would add a new way to create accounts and a risk to children's records.
- **Club page (D44).** The page stays a simple club card built from club data (N06). The only addition is photos and graphics on club events, next to the existing poster. A photo of a child is published only with the guardian's image consent recorded in Vereino (Q19). There are no news, no front-page blocks and no page editor.
- **What D44 does not do.** D44 makes it easier to get guardians started. It does not change whether they keep answering in Vereino, or a club's rule about it. Vereino already gives staff a text with a link to paste into the group chat (D09).
- **Installable app (D45).** A web app manifest per club, a minimal service worker and an install hint. Push and a native app stay out (N02; N12 narrowed). The owner promised "an icon on the phone" during the presentation, and the coach did not ask for it. D45 rests on the owner's choice, not on an observed need.
- **Grants.** An attendance report to settle municipal grants stays a hypothesis (A11); grants stay a non-goal (N07).

**What remains uncertain.**
- Whether guardians will use Vereino at all (A01, A07) is still untested. The new work lowers the effort to start, but it does not show that parents will declare attendance there. The only outside coach so far expects they will not.
- Photos of children on events follow the guardian's image consent (Q19, answered 2026-11-26). The consent text still needs the lawyer before real club data (D35 lawyer items); the design needs a spec.
- The pilot club is still to be chosen (Q18). Four clubs said they are interested. A second presentation is planned for 2026-11-27, and the others are postponed, not withdrawn. Their problems are not yet recorded (Collection plan).
- No step yet tests whether invited guardians then declare attendance in Vereino (A01). The coach's prediction is the main evidence against it.

**Next.** File the D44 and D45 stories with `om-backlog` (dry run first). Record the 2026-11-27 meeting, and refresh this brief when the other clubs' accounts are in.

## Vision

A small club runs the club, not Excel and Messenger — the founders' intended direction, not a demonstrated benefit. `[DOCUMENT]` research/2026-10-20-product-vision-board.md

## Target group and stakeholders

- Customer (pays): the board of a small multi-section club (association) whose main section is a football academy (indicatively up to ~200 players); chosen segment. `[DOCUMENT]` D-011
- Customer's cost: in the open-source model the club pays with time and hosting, not a license. `[ASSUMPTION]` research/2026-10-20-product-vision-board.md
- Pilot club: to be chosen; it must administer a municipal facility (D25). A candidate club named by the owner has not been contacted. `[DOCUMENT]` research/decisions/D-025-pilot-club-chose-another-vendor.md
- Prospective clubs: coaches of four clubs met at a tournament on 2026-11-22 said they are interested. `[DOCUMENT]` research/decisions/D-034-many-clubs-on-one-instance.md
- The first presentation was on 2026-11-26 to a coach of a single-section youth football club (about 60 children; several youth teams and a senior team). `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- A second presentation is planned for 2026-11-27; the other clubs postponed theirs and have not withdrawn. `[DOCUMENT]` the owner in the om-discover refresh session, 2026-11-26
- Former pilot: KS Przykład Dolina, where the discovery interviews took place. It has a football academy, a swimming pool and extra classes, and it administers the Orlik pitch complex on behalf of Gmina Zielony Las; its board chose another vendor's website and system, so it will not run Vereino. `[DOCUMENT]` business case (not public), research/decisions/D-025-pilot-club-chose-another-vendor.md
- Example club in the spec: "Dev Academy", with Przykład's five sections (Akademia piłkarska, Basen, Zumba, Szachy, Cheerleader) and the academy's eight birth-year groups, used for journeys, seeds and tests (D25). `[DOCUMENT]` spec Q-005, research/decisions/D-025-pilot-club-chose-another-vendor.md
- User (uses): a guardian of one child in the academy. He learns the training times at the start of the season, and he learns the details of friendlies and tournaments from the group's Messenger channel and poll. `[INTERVIEW]` guardian interview note (not public)
- User (uses), in another club: a guardian of three sons in a football academy that uses a club app. He handles football and his wife handles their dance classes elsewhere. `[INTERVIEW]` guardian interview note (not public)
- User (uses): the academy coordinator. He coordinates coaches, sessions, matches, places and equipment, manages substitutions, calculates coach pay, collects coaches' cash, and settles grants with the administrator. `[INTERVIEW]` coordinator interview note (not public)
- Users (uses), not yet observed: coordinators of other sections, treasurer/administrator, coaches (often on contract), participants aged 13+, facility attendant. `[ASSUMPTION]` stakeholder note (not public)
- Stakeholders: the pilot club's board will decide the rollout, and the municipality that owns its facility will receive the report; neither is known yet (D25). The platform is Open Mercato. `[DOCUMENT]` stakeholder note (not public), research/decisions/D-025-pilot-club-chose-another-vendor.md
- Stakeholders found in the coordinator interviews: the club website (a separate project), the person who maintains the pitch, the schools that rent halls to the club, the external accountant, league referees, and grant-makers (municipality, ministry). `[INTERVIEW]` coordinator interview note (not public), coordinator interview note (not public)
- Decider for scope decisions: Władek Kuć (RACI A for 1.0 scope, segment, name and license); Kacper for technology and hosting. Rollout, payment model and Orlik rules have no named decider (Q01, Q02, Q04).

## Problems, with evidence

- **Current tools.** The club runs schedule and attendance through Messenger groups, keeps membership fees by hand, arranges coach substitutions by phone, takes Orlik bookings by phone calls to the club, and keeps no record of difficult cases. This is board knowledge, not a user account. `[DOCUMENT]` founders' meeting note (not public)
- **Friendlies and tournaments.** One guardian described them as the harder part: the venue rotates between clubs, and the coach posts the address, the times and a poll in the group channel. `[INTERVIEW]` guardian interview note (not public)
- **Conflicting times.** In one real post from the past week, the post gave the gathering at 8:30 and the poll's title gave 9:30. The guardian had not noticed. `[INTERVIEW]` same note (Messenger excerpt)
- **Wrong venue.** Once, a message gave the address of an Orlik in a neighbouring municipality instead of a map pin; the family got lost and arrived about 30 minutes late. `[INTERVIEW]` same note
- **Lifts.** Guardians arrange lifts to weekend trips in the group chat. The guardian values that use. `[INTERVIEW]` same note
- **Muted apps.** The guardian mutes all messenger apps entirely and checks the time and place the day before by scrolling the channel history. `[INTERVIEW]` same note
- **Fee errors.** The guardian's standing order paid through two summer months when no fees are charged, and nobody from the club contacted him about it. He does not remember whether he then skipped September, so it is unknown whether the club lost or kept any money. He named two further possibilities: a standing order carrying last year's rate, or one with a wrong amount. Those two did not happen to him. `[INTERVIEW]` same note
- **Absences.** Guardians report absences in the group channel or privately to the coach, outside the poll. `[INTERVIEW]` same note
- **Missed confirmations.** In the other club's app, a call-up for a friendly has a confirmation deadline. The second guardian missed one, and he says parents forget to click and the coach then phones to ask. `[INTERVIEW]` guardian interview note (not public)
- **Who else is coming.** The second guardian cannot see in the app who else is called up for a friendly. On WhatsApp he could, which helped arrange lifts. He would also like to see which children are in his son's training group, for contact between parents (a stated preference). Three families rotate driving to training. `[INTERVIEW]` same note
- **Urgent changes.** In the other club, urgent changes (a match moved from 10:00 to 11:00 the day before) and practical requests (lending a kit) still go through WhatsApp. He said that "nobody will see it" in the app, and that a messenger is what the app misses most. `[INTERVIEW]` same note
- **Commission and status.** Paying fees in the other club's app costs the parent a commission of about PLN 2 per basket, which annoys him. A friend of his pays by bank standing order; the note gives no reason. The visible "unpaid" status, on the other hand, prompts him to pay. `[INTERVIEW]` same note
- **Kit orders in the other club.** That club's coordinator takes kit orders through WhatsApp, although the app supports them. `[INTERVIEW]` same note
- **Kit orders.** A guardian pays the coach in cash when the kit is handed over, or has to remember to settle the amount later. Today the club collects orders through a Google Form. `[INTERVIEW]` same note; `[DOCUMENT]` D-013
- **Fee control (belief).** The guardian believes nobody in the club is in control of fee settlement. This is his belief, not an observation. `[ASSUMPTION]` same note
- **Treasurer (belief).** The treasurer does not know at any moment who is overdue, sends reminders by hand, and collects coaches' units from memory. `[ASSUMPTION]` research/2026-10-20-protopersonas.md (A02)
- **Coaches (belief).** Coaches lose declarations in the chat and argue about units after substitutions. `[ASSUMPTION]` research/2026-10-20-protopersonas.md (A05)
- **Substitutions.** Coaches look for a substitute among themselves and go to the coordinator only if they cannot find one; substitutions are now rare, more frequent around June, and no dispute about them was described. `[INTERVIEW]` coordinator interview note (not public)
- **Substitutions (owner's recollection).** Asked in the refresh session, Władek recalls no coach dispute about substitution settlement in the last year. `[DOCUMENT]` om-discover refresh session, 2026-10-23
- **Coach pay.** Coach pay is a fixed monthly base per coach (higher for the older league groups), reduced by a fixed amount per missed session that passes to the substitute, plus a fixed amount per away trip; the coordinator calculates it monthly from each coach's summary. Amounts are not recorded. `[INTERVIEW]` same note
- **Cash and referees.** Coaches take fees and kit payments in cash, list who paid what on an envelope or a sheet, and hand the cash to the coordinator once a month; he keeps a cash notebook and an Excel settlement. Coaches of the older league groups pay referees at home league matches from the collected cash or their own money, and the referee's declaration is the receipt used for tax and social-insurance payments. `[INTERVIEW]` same note
- **School halls.** In winter the academy trains in school halls in three nearby villages under signed contracts; for one hall the club logs the hours and the school bills from that log, the other two schools keep their own logs and bill monthly. `[INTERVIEW]` same note
- **Grant settlement.** The club settled about 12 grants this year, by the coordinator's estimate; each invoice from KSeF is allocated to one or more grants, described, stamped and tabulated monthly, and a double claim could cost a whole grant. The coordinator named this as the work that takes most of his time; how long one settlement takes is not recorded. `[INTERVIEW]` same note
- **Grant settlement (owner's view).** The owner calls grant settlement "a nightmare"; he has not described a specific settlement. `[ASSUMPTION]` research/decisions/D-018-grant-settlement-discovery-track.md
- **Children in several organisations (belief).** Guardians with children in several organisations struggle to keep track of what is on, where and when. D-014 rests on the owner's description of one family, whose guardian was interviewed on 2026-10-23 (A06). `[ASSUMPTION]` D-014 (A06)
- **Orlik rules.** The Orlik regulations set hour zones, a 90-minute unit, payment to the municipality's account and a 24 h cancellation rule. The regulations are cited from the business case; no copy is in the repository. `[DOCUMENT]` business case (not public)
- **Collisions.** The regular training timetable has no collisions: the coordinator and the administrator set it and publish it as a summer and a winter poster. Collisions happen "very often" between matches, tournaments and pitch maintenance planned by someone else; league matches are known up to two weeks ahead, tournaments sometimes only days ahead. This replaces the team's earlier belief that the coordinator lacks a tool to detect collisions between groups. `[INTERVIEW]` coordinator interview note (not public)
- **Public schedule (belief).** The Orlik has no public schedule today. `[ASSUMPTION]` spec Problem Statement
- **Public schedule required.** The coordinator expects the Orlik management agreement the club will sign to require a public Orlik schedule; he sees it as an active calendar where people can book instead of phoning the club. The agreement has not been read. `[INTERVIEW]` coordinator interview note (not public)
- **Attendance list and numbers.** The club must keep an attendance list. Knowing the number beforehand matters to coaches: he planned a session for at least 6 children, 4 came because of illness, and he changed the whole session on the spot. `[INTERVIEW]` same note
- **Attendance preference.** He would want guardians to report only absence for training and to confirm presence for friendlies and matches; he noted that confirming every time burdens parents. This is a stated preference. `[INTERVIEW]` same note
- **Last season's sheet.** Last season attendance was kept in a shared Google sheet, where coaches also noted fee payments; he summed them per group and added cash. Now monthly bank transfers are typed into a template by hand and cash is added at month end. `[INTERVIEW]` same note
- **Urgent changes at Przykład.** The only way to reach guardians quickly today is the Messenger groups; SMS might get more attention, "though that varies too". `[INTERVIEW]` same note
- **Call-ups at Przykład.** He calls up all his players, and so do the other groups he knows of; squads are on the edge (a team playing 11-a-side sometimes travels with exactly 11). `[INTERVIEW]` same note
- **Grant settlement rules.** Rules differ per agreement (for example, whether costs count from the grant's start or only from when the money arrives); the municipality can reject the club's allocation of invoice parts; each settlement includes a substantive report with photos and proof that the project succeeded; documents are kept, he thinks, for about 5 years. He could not say how many hours a settlement takes — for the municipal ones "several good afternoons" with the administrator, the rest is hers. `[INTERVIEW]` same note
- **Fear of error in grants.** He describes fear that a bad description is read as fraud or clawed back, and reports hearing the same from other associations at a local meeting; that is second-hand. `[INTERVIEW]` same note
- **Club website.** Another person is building a website and system for the club, paid by the club and separate from Vereino. By the coordinator's account it is to present the coaches and groups, hold documents and consents, take sign-ups ("enrol a child", cheerleading, chess, zumba) and show the Orlik schedule with booking. `[INTERVIEW]` same note; separate project confirmed by Władek `[DOCUMENT]` D-020

- **Contact with parents in a prospective club.** The coach said the club reaches parents only through WhatsApp groups, and kit orders also go through a group. `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- **Chasing parents.** He said the club has to chase parents by phone about attendance and fees today. `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- **Parents and an app (prediction).** He expects that parents will not use an app. This is his prediction, not an observation of an app in use. `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- **Few hands.** He said the club has few people to do the work, and they need to be encouraged. `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- **Treasurer's own system.** In that club fees are paid only by bank transfer. A treasurer settles them in his own system; the coach thinks he may not want to change it. `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- **Club page instead of Facebook.** The club has only a Facebook page and plans a website. The coach asked whether the Vereino club page could replace Facebook and show event descriptions, and whether each club gets its own page. `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- **Outlines.** Coaches there plan sessions freely, and the head coach checks on the pitch. Their PZPN certificate level does not require outlines. `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- **Outlines as extra work.** The coach said entering outlines would be extra work for coaches and might bring demands for pay rises. He also said the app would be "a good start" if the club went for a higher certificate level. `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- **What the coach liked.** He named contact with parents "in one app", and the parent seeing what is on, when, and what is missing. `[INTERVIEW]` first-club meeting note, 2026-11-26 (not public)
- **Contact matters more than fees (interpretation).** For clubs like this one, contact with parents hurts more than fees. This is the owner's reading of one conversation. `[ASSUMPTION]` first-club meeting note, 2026-11-26 (not public)
- **The club decides the rule (interpretation).** The board decides, and the club itself has to bring in a rule that parents answer only through the app. This is also the owner's reading. `[ASSUMPTION]` first-club meeting note, 2026-11-26 (not public)

## Product and how it stands out

- What it is: an open-source (AGPLv3 core, commercial Vereino Enterprise — D35) club management application on Open Mercato for a small multi-section club; detail in Scope. `[DOCUMENT]` D-011, D-012
- What makes it different, as hypotheses only:
  - the municipal facility as a core feature;
  - non-football sections as a full use case (Vibeclass also presents this, so it is not unique);
  - one person and one calendar across sections;
  - no license fee and data kept by the club.
  
  That these differences make a small club choose Vereino is A03. `[ASSUMPTION]` business case (not public)

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|
| SportBM (as used by another club) | one calendar with several children's events, per-child call-up status, a venue with address and map pin, the coach's free-text notes, payment status on the dashboard `[BENCHMARK]` (four screenshots from one guardian's account; public page and pricing not yet checked) | the gathering time sits only in free text; who else is called up is not shown; that account had 135 unread notifications; the club's cost is unknown | 2026-10-23 | not yet checked |
| ProTrainUp | calendar, attendance, announcements, fees with reminders and online payment, multiple roles, mobile apps; Club Pro PLN 125/month, Silver PLN 245/month; on 2026-10-23 the pricing page also lists a "facilities and reservations" module from Club Pro and bank statement parsing from Gold `[BENCHMARK]` (agent-checked, not yet re-checked by a human; no demo used) | nothing found on external rentals, a public schedule or an owner report; a football/sports model, heavy for a small academy, vendor-held data — the last three are `[ASSUMPTION]` until checked | 2026-10-23 | https://protrainup.com/pl/pricing |
| Vibeclass | presents multi-section clubs (several sports under one roof) as a core case; per-section schedules and fees, coach-hour settlement, internal room bookings with collision detection `[BENCHMARK]` (agent-checked) | no evidence found on sibling discount, bank import, kit orders, a public page or external rentals; price for ~200 players not computable from the page | 2026-10-23 | see research/2026-10-23-benchmark-competitors.md |

- Another academy uses a dedicated club app, SportBM according to the screenshots. Per the guardian, it has an account per son, a calendar with list and calendar views, events with a map pin, a coach's description, start and end times, call-ups with a confirmation deadline, fee payment with a commission, and kit orders. This is a guardian's account, not a checked benchmark. `[INTERVIEW]` guardian interview note (not public)

- Across 13 products, the agent found none that combines the club side with municipal-facility administration, and none that describes substitution settlement, a coach-to-treasurer cash handover or a text to paste into a group chat. This is an assessment from vendor pages, not evidence of demand. `[ASSUMPTION]` assessment in research/2026-10-23-benchmark-competitors.md

- The coordinator, who tested ProTrainUp, remembers call-ups with confirmation, a calendar and fees, but no pitch or Orlik bookings and nothing visible on the web; this is his recollection. `[INTERVIEW]` coordinator interview note (not public)

Checking SportBM's public page and pricing, and ProTrainUp's facilities module in a demo, are on the Collection plan.

## Goals and success criteria

- Business goal: the pilot club — all sections — runs on Vereino for a full season without going back to Messenger for attendance. This was the founders' provisional target for Przykład and the 2027/28 season; the club and the season are open since D25, and its feasibility is A01. `[DOCUMENT]` research/2026-10-20-product-vision-board.md, research/decisions/D-025-pilot-club-chose-another-vendor.md
- User outcome: a guardian knows, no later than the day before, where and when their child must be, from one consistent source. Chosen by the owner, based on the guardian interviews. `[DOCUMENT]` research/decisions/D-021-proceed-without-further-interviews.md
- Gap against that outcome: the spec's session has start and end times but no gathering time, so the 8:30/9:30 conflict would still sit in free text. A place does carry an address, coordinates and an external flag. `[PRODUCT]` spec Data Models
- The other academy's app also puts the gathering time in a free-text note, apart from the event's start time. `[BENCHMARK]` research/2026-10-23-benchmark-sportbm.md
- Primary metric, baseline today, threshold, date:
  - The share of attendance declarations made in the app, measured per section. The threshold of ≥80% for the 2027/28 season is a provisional founders' target.
  - The baseline is unknown: the spec plans to count Messenger declarations by hand in one group for 4 weeks. `[DOCUMENT]` spec Overview and Success Measures
- What must not get worse:
  - Guardians' ability to arrange lifts in the group chat. Vereino works alongside the chat, not instead of it (D09). `[INTERVIEW]` guardian interview note (not public), guardian interview note (not public)
  - The club's obligations to the municipality under the Orlik regulations (R05).

## Scope

- **Now (1.0):** the Must set of the club specifications (REQ-001…REQ-039 with Must priority), delivered in five phases: phases 1–3 in `.ai/specs/2026-10-20-vereino-club-management.md`, phase 4 in `.ai/specs/2026-10-27-vereino-club-payments.md`, phase 5 in `.ai/specs/implemented/2026-10-27-vereino-facilities.md` (D28). Since D28 the facility module no longer requires payments.
  - The 1.0 scope is D01 as extended by D13, D17 and D23: people and roles, sections and groups, activities and calendars, attendance, substitutions, announcements, fees with online payment, facility and bookings, public club page, cash and bank reconciliation, order campaigns, treasurer role, a bilingual interface, and facility maintenance planned in the facility calendar (D17); D27 adds sign-in with Google and Facebook for account holders as Should.
  - Added by D23: bulk import of people from a spreadsheet and a guardians' contact list for coaches (Must); integration with PZPN / Łączy nas piłka and an hours report for the school halls the club rents (Should).
  - Club settings with defaults (D22): the age for a child's own account (16), who pays the online payment commission (the club), the sibling discount, the coach settlement model, the attendance declaration model, whether guardians see other children called up, and the sales document for order campaigns (none).
  - Both Vereino's public club page and Orlik booking and the separately built club website stay; the risk of duplicated work is accepted (D23).
  - Phase 1 (club and people) is the smallest coherent outcome.
  - Added 2026-11-26 (D44, D45):
    - personal invitation links and QR codes that staff share on WhatsApp or at training;
    - a group QR code to the section sign-up form;
    - photos and graphics on club events, next to the existing poster;
    - an installable web app with the club's name and logo.

    The club page stays a simple club card, with no news and no editor (N06). A photo of a child is published only with the guardian's image consent (Q19).
- **Later:** a guardian's view across several clubs (D14); push with a native app (D09); online payment for renters; projects and grants, with the grant-settlement track parked until after 1.0 (D16, D18, D23); receipts and invoices for order campaigns (D23); volunteer duty sign-up (1.1).
- **Not doing:** see Non-goals.

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Section | a first-class part of the club (football academy, swimming pool, zumba…) with its own coordinator | club administrator | staff, public page |
| Group | a team (`team`) or a class group (`class_group`); both kinds are equal (D03) | section coordinator | staff, members |
| Activity / session | an activity with recurrence generates sessions (training, match, friendly, camp, tournament, other) (D02) | coordinator, coach | role-filtered calendars |
| Unit | one `training` session in status `done`, owed to whoever ran it (R04) | coordinator | coach, treasurer |
| Orlik | a municipal pitch complex a club administers on behalf of its municipality (at Przykład: Orlik, for Gmina Zielony Las) | club, under the agreement with the municipality | public schedule |
| Case | a thread marked as evidence: undeletable, with full history | section coordinator, administrator | coordinator, administrator |

Full vocabulary: spec *Domain Vocabulary and Business Rules*.

## Key flows

- Current state, regular training: the times are fixed for the season. The only declarations seen are absence reports, in the group channel or privately to the coach. `[INTERVIEW]` guardian interview note (not public)
- Current state, friendlies and tournaments: `[INTERVIEW]` same note
  1. The coach posts the venue, the start time, the gathering time and a poll in the group's Messenger channel.
  2. Guardians answer the poll.
  3. Guardians arrange lifts in the same channel.
  4. A guardian re-reads the history the day before to find the time.
- Current state, another club with an app: `[INTERVIEW]` guardian interview note (not public)
  1. The coach announces a friendly on Monday with a confirmation deadline (e.g. Thursday 12:00).
  2. Guardians accept or decline in the app; an event left unanswered expires and disappears for the parent.
  3. The coach phones parents who did not answer.
  4. Urgent changes and lifts go through WhatsApp.
- Current state, cash from coaches: `[INTERVIEW]` coordinator interview note (not public)
  1. A parent pays a coach in cash for a fee or a kit.
  2. The coach notes who paid what, on an envelope or a sheet; coaches of the older groups also pay referees from it or from their own money.
  3. Once a month the coach hands the cash, the list and the referees' declarations to the coordinator.
  4. The coordinator records it in a cash notebook and an Excel settlement; invoices and declarations go to the external accountant through the administrator.
  5. Monthly bank transfers are typed into a template by hand; cash is added at month end, which shows who paid and who did not. `[INTERVIEW]` coordinator interview note (not public)
- Future state: the spec's User Journeys describe the 1.0 flows. Whether the guardian's flow replaces step 2 for friendlies and tournaments (declaration in the app) is A01, and whether regular training has a declaration step at all is Q09; steps 3 and 4 stay in the chat or move to the app depending on A07 and D09.

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | One person is one record with at most one account; permissions add up across roles; each action records the role it was taken in | all roles | `[DOCUMENT]` D-005 | active | not anticipated | superseding row approved by the owner | Władek Kuć | none |
| R02 | A ward under the age threshold (default 13) has no account; from the threshold a ward gets a limited own login; consents and payments stay with the guardian; a minor never sees payments | guardians, participants | `[DOCUMENT]` D-004, spec REQ-002 | superseded by R10 | before the pilot rollout (club open, D25) | superseding row approved by the owner after the legal opinion | Władek Kuć | none |
| R03 | How a ward aged 13+ declares attendance is configurable per club, group or activity type (immediate, guardian confirms, guardian only) | attendance | `[DOCUMENT]` D-006 | active (default values are a proposal) | after the parent interviews | superseding row approved by the owner | Władek Kuć | none |
| R04 | One `training` session in status `done` is one unit, owed to whoever ran it; a substitution moves the unit | coaches, treasurer | `[DOCUMENT]` D-007, spec Q-004 | active | unknown | superseding row approved by the owner | Władek Kuć | none |
| R05 | Orlik bookings use a 90-minute unit, free cancellation up to 24 h before, and payment to the municipality's account | Orlik bookings | `[DOCUMENT]` Orlik regulations, D-008 | proposal (hours, rates and payment deadline to be confirmed for the pilot club's facility; the Orlik rules are the reference) | before phase 5 | the pilot club's accountable person for the facility rules (open since D25, Q04) | pending (D25) | none |
| R06 | Staff of any section book any club facility immediately when the slot is free; an external request is valid only after administrator approval and holds the slot for at most 48 h | facility bookings | `[DOCUMENT]` spec Q-022, Q-023 | active | phase 5 exit gate (D-013) | superseding row approved by the owner | Władek Kuć | none |
| R07 | A coach or coordinator may accept cash for their groups' orders with a numbered receipt, and for membership fees when the club setting allows it (default: allowed); the treasurer confirms each handover | payments | `[DOCUMENT]` spec Q-029, Q-037, REQ-033 | active | phase 4 exit gate (D-013) | superseding row approved by the owner | Władek Kuć | none |
| R08 | Siblings: the oldest child pays the full rate and the others get the discount, on monthly fees only | membership fees | `[ASSUMPTION]` spec Q-006 default | superseded by R12 | before phase 4 | the treasurer and Władek | pending | none |
| R09 | The interface is multilingual; content entered by the club stays in one language per club | all texts | `[DOCUMENT]` spec Q-038 | active | unknown | superseding row approved by the owner | Władek Kuć | none |
| R10 | A ward under the club's age threshold has no account; from the threshold a ward gets a limited own login; consents and payments stay with the guardian; a minor never sees payments. The administrator sets the threshold; the default is 16 | guardians, participants | `[DOCUMENT]` research/decisions/D-022-club-configurable-rules.md | active | before the pilot rollout (club open, D25) | superseding row approved by the owner | Władek Kuć | R02 |
| R11 | For regular training, guardians report only absence; for friendlies, tournaments and matches, they confirm presence; actual attendance is always recorded. This is the default, and the club can change the model | attendance | `[DOCUMENT]` research/decisions/D-022-club-configurable-rules.md | active | at the spec revision that implements these settings (D22) | superseding row approved by the owner | Władek Kuć | none |
| R12 | The sibling discount (which child pays the full rate, which fees it covers) is set by the administrator; default: the oldest pays full, monthly fees only | membership fees | `[DOCUMENT]` research/decisions/D-022-club-configurable-rules.md | active | at the spec revision that implements these settings (D22) | superseding row approved by the owner | Władek Kuć | R08 |
| R13 | The online payment commission is either included in the price (the club pays) or passed on to the payer, as the club sets; default: the club pays | online payments | `[DOCUMENT]` research/decisions/D-022-club-configurable-rules.md | active | at the spec revision that implements these settings (D22) | superseding row approved by the owner | Władek Kuć | none |
| R14 | The coach settlement model is chosen per club: "base + units × rate + matches and trips per contract", or "fixed base minus a fixed amount per missed session passed to the substitute, plus a fixed amount per trip" | coach settlement | `[DOCUMENT]` research/decisions/D-022-club-configurable-rules.md | active | at the spec revision that implements these settings (D22) | superseding row approved by the owner | Władek Kuć | none |
| R15 | Whether guardians see which other children are called up or in the group is a club setting: not shown, or shown for children whose guardians consented | guardian calendar, attendance | `[DOCUMENT]` research/decisions/D-022-club-configurable-rules.md | active | at the spec revision that implements these settings (D22) | superseding row approved by the owner | Władek Kuć | none |
| R16 | The sales document for order campaigns is a club setting (none, receipt, invoice); 1.0 offers only "none" | order campaigns | `[DOCUMENT]` research/decisions/D-022-club-configurable-rules.md | active | at the spec revision that implements these settings (D22) | superseding row approved by the owner | Władek Kuć | none |

R10 in the examples: the default own-account age stays 16; the spec's example club, Dev Academy (D25), lowers it to 13 so that its 14-year-old participant Ola has an account in the journeys, the UX concept and the integration tests (owner decision of 2026-11-04, #135).

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | Coaching tools: training diagrams, exercise library, medical module, scouting and assessments, individual statistics | a small club would use a fraction; ProTrainUp is strong there; kept after the coordinator's wish for training plans, which is an intention tied to a possible certification (D16) | Władek Kuć | narrowed 2026-11-23 by D38: training outlines, the shared outline library and the medical certificate expiry date are in scope; drawing tools, scouting, assessments, individual statistics and medical results stay out | at the brief refresh after the administrator interview and the second coordinator conversation (D16); change if the club commits to the certification and coaches confirm the need | superseding row approved by the owner | `[DOCUMENT]` D-011, business case, D-016 | none |
| N02 | Push notifications in 1.0 | no web push for a PWA in the platform; returns with a native app | Władek Kuć | active | with the native app | superseding row approved by the owner | `[DOCUMENT]` D-009, spec Q-002 | none |
| N03 | Messenger/WhatsApp integration | no official API for groups; a text with a link to paste replaces it | Władek Kuć | active | if a group API appears | superseding row approved by the owner | `[DOCUMENT]` D-009 | none |
| N04 | Payment gateways other than Stripe, including a custom Przelewy24/PayU adapter | Stripe is available in the platform | Władek Kuć, Kacper | active | after the treasurer interview | superseding row approved by both owners | `[DOCUMENT]` D-010, spec Q-003 | none |
| N05 | Online payment for renters and accounts for regular renters | requests without payment are in; payment stays a transfer to the municipality | Władek Kuć | active | phase 5 exit gate | superseding row approved by the owner | `[DOCUMENT]` D-013 | none |
| N06 | A page editor (CMS) | the public page is built from club data | Władek Kuć | active | unknown | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals, D-023 | none |
| N07 | Projects and grants; a shop (order campaigns are in) | not needed for the 1.0 thesis; kept after the coordinator named grant settlement as his biggest time sink, because it rests on one account and the administrator was not interviewed (D16); explored on its own track (D18) | Władek Kuć | active | at the brief refresh after the administrator interview and the second coordinator conversation (D16), and when the D18 evidence is collected | superseding row approved by the owner | `[DOCUMENT]` D-001, D-013, D-016, D-018 | none |
| N08 | Bookkeeping of coach payouts and payroll export | 1.0 only calculates units and exports CSV | Władek Kuć | active | unknown | superseding row approved by the owner | `[DOCUMENT]` D-007 | none |
| N09 | Multiple clubs on one instance in 1.0 (the architecture must not block it) | one instance per club; the hosting model is open | Władek Kuć | superseded 2026-11-22 by D34 (many clubs on one shared instance) | with the hosting decision (Q06) | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals, D-014 | none |
| N10 | A guardian's view across several clubs in 1.0 | the benefit needs other clubs on Vereino; the problem is unverified | Władek Kuć | active | after the parent interviews | superseding row approved by the owner | `[DOCUMENT]` D-014 | none |
| N11 | Translating club-entered content | one content language per club | Władek Kuć | active | unknown | superseding row approved by the owner | `[DOCUMENT]` spec Q-038 | none |
| N12 | A native app; PWA packaging | 1.0 is a responsive web site | Władek Kuć | narrowed 2026-11-26 by D45: an installable web app (manifest, icons, a minimal service worker) is in scope; a native app and push (N02) stay out | unknown | superseding row approved by the owner | `[DOCUMENT]` research/2026-10-20-moscow.md, spec Non-goals, D-023 | none |
| N13 | Integration with PZPN / Łączy nas piłka | not needed in 1.0 | Władek Kuć | superseded by D23: Should in 1.0 | unknown | superseding row approved by the owner | `[DOCUMENT]` research/2026-10-20-moscow.md, D-023 | none |
| N14 | Bulk import of people from a spreadsheet | open whether the pilot needs it (spec Q-018) | Władek Kuć | superseded by D23: Must in 1.0 | before the pilot | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals, D-023 | none |
| N15 | A guardians' contact list for coaches | data minimisation; coaches reach guardians through announcements and threads | Władek Kuć | superseded by D23: Must in 1.0, with a legal basis or consent in the spec | unknown | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals, D-023 | none |
| N16 | Volunteer duty sign-up in 1.0 | planned for 1.1 | Władek Kuć | active | 1.1 planning | superseding row approved by the owner | `[DOCUMENT]` spec Non-goals, D-023 | none |
| N17 | Sales documents (receipts, invoices) for kit orders | the system records orders and payments only | pending (board / accountant, spec Q-034) | superseded by D23: a setting with "none" in 1.0; receipts and invoices later | before the first order campaign | the board | `[DOCUMENT]` spec Q-034, D-023 | none |

## Decisions

| Id | Date | Decision | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| D01 | 2026-09-26 (extended 2026-10-20) | 1.0 = calendar core + payments + full facility module | the coordinator and administrator first need people, places, classes and a calendar; payments and the Orlik are the edge over ProTrainUp | Władek Kuć | active | after 5 conversations with target users | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-001-mvp-scope.md | none |
| D02 | 2026-09-26 | Classes and events are one Activity with a type and recurrence | one calendar, one attendance | Władek Kuć | active | after the camp is built | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-002-single-activity.md | none |
| D03 | 2026-09-26 | Team and class group are one Group with a kind | multi-section club, same mechanisms | Władek Kuć | active | after 1.0 | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-003-single-group.md | none |
| D04 | 2026-09-26 | Guardian account with child profiles; own login from 13 (adopts R02) | the parent sees all children; a teenager checks the schedule | Władek Kuć | superseded by D22: the age is a club setting, default 16 (R10) | before the pilot rollout (club open, D25) | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-004-child-account.md | none |
| D05 | 2026-09-29 | One person can combine roles (adopts R01) | that is how a small club works | Władek Kuć | active | not anticipated | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-005-multiple-roles.md | none |
| D06 | 2026-09-29 | Attendance declaration of a ward 13+ is configurable (adopts R03) | families and clubs differ | Władek Kuć | active | after the parent interviews | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-006-declaration-13plus.md | none |
| D07 | 2026-09-29 | Coach = base pay + units; a substitution moves the unit (adopts R04) | that is how Przykład settles; automation removes disputes | Władek Kuć | active | unknown | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-007-substitution-settlement.md | none |
| D08 | 2026-09-26 | Full facility module in 1.0 | ready rules in the regulations; the edge over ProTrainUp; Przykład administers the Orlik | Władek Kuć (scope); towards the municipality: open since D25 | active (scope) / proposal (detailed rules, R05) | at each phase exit gate (D23) and when the pilot club is chosen (D25: it must administer a facility) | superseding row approved by the owner; moves to Should if most academies do not administer a facility | `[DOCUMENT]` research/decisions/D-008-orlik-in-mvp.md | none |
| D09 | 2026-09-29 (confirmed 2026-10-20) | Announcements in the app with in-app notification and e-mail plus a "share to group" text; no messenger integration | no group API; the app is the source of truth, the chat stays alongside | Władek Kuć | active | after the magic link test in one group of the pilot club | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-009-announcements-without-messenger.md | none |
| D10 | 2026-10-19 (confirmed 2026-10-20) | Online membership payment in 1.0 through Stripe | fee collection is the first argument in the segment; commission model open (Q02) | Władek Kuć; Kacper for the gateway | active | after the treasurer interview | superseding row approved by the owners | `[DOCUMENT]` research/decisions/D-010-online-payments-in-mvp.md | none |
| D11 | 2026-10-19 (corrected 2026-10-20) | Segment: small multi-section clubs with a football academy as the main section | Władek knows the segment from the inside; ProTrainUp is heavy and paid there | Władek Kuć | active | after 5 conversations with coordinators or presidents of other clubs | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-011-segment.md | none |
| D12 | 2026-09-29 | Name Vereino, MIT license; domain on hold | name checks; license chosen with the repository | Władek Kuć | active for the name; the MIT license superseded 2026-11-22 by D35; the domain answered 2026-11-22 by D36 | before the first public commit (the repository already exists; the trigger is passed) | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-012-open-source-name.md | none |
| D13 | 2026-10-20 | Scope added to 1.0 after discovery (REQ-023…REQ-035); kit orders Could → Must | the pilot club does these by hand today | Władek Kuć | active | phase 4 and phase 5 exit gates | superseding row approved by the owner; candidates to move to Should in order: REQ-029, REQ-028, REQ-030 | `[DOCUMENT]` research/decisions/D-013-scope-added-after-discovery.md | none |
| D14 | 2026-10-23 | A guardian's view across several clubs is later; 1.0 must not block it (adopts N10) | 1.0 is one club per instance and the benefit needs other clubs on Vereino; placement was Claude's recommendation, accepted by Władek; a calendar subscription link was considered | Władek Kuć | active | after the parent interviews | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-014-cross-club-guardian-view-later.md | none |
| D15 | 2026-10-23 | Implementation planning of phase 1 waits for the requested interviews | phase 1 ends with guardians signing in, which is untested (A01, A07); planning now with the risk accepted was the alternative | Władek Kuć | superseded by D21 | when the interview notes are in and the brief is refreshed | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-015-phase-1-waits-for-interviews.md | none |
| D16 | 2026-10-23 | Grants (N07) and training plans (N01) stay out of 1.0 after the coordinator interview; the problem and the intention are recorded | each rests on one account; the administrator was not interviewed; the certification is not decided; Claude's recommendation, accepted by Władek | Władek Kuć | active for grants (N07); the training-plans part superseded 2026-11-23 by D38 | at the brief refresh after the administrator interview and the second coordinator conversation | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-016-keep-grants-and-coaching-tools-out.md | none |
| D17 | 2026-10-23 | Facility maintenance and inspections (REQ-022) move from Could to Must. Planned work occupies the facility calendar like a closure, and recurring tasks run by date and by hours of use | "it affects facility bookings" (Władek); the academy coordinator reports frequent collisions between matches and tournaments and pitch maintenance | Władek Kuć | active | phase 5 exit gate | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-017-maintenance-must.md; `[INTERVIEW]` coordinator interview note (not public) | none |
| D18 | 2026-10-23 | Grant settlement gets a separate discovery track, as a possible separate product that could also run as a Vereino module; the 1.0 scope and D16 stay meanwhile | the coordinator's account and Władek's view; Claude's proposal, accepted by Władek; whether to move the team's energy there is open (Q13) | Władek Kuć | parked until after 1.0 (D23) | after 1.0 (D23) | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-018-grant-settlement-discovery-track.md | none |
| D19 | 2026-10-23 | Maintenance work is planned by anyone holding the feature `facilities.maintenance.manage`, with no new role; a person holding only this feature works on assigned places and sees their calendar without other people's data | one capability for the person who maintains the pitch, without a new role; per-user features exist in the platform (spec V-13); a new maintainer role was considered and rejected (spec Q-041, Q-043) | Władek Kuć | active | phase 5 exit gate | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-019-maintenance-planner-by-permission.md | none |
| D20 | 2026-10-23 | The separately built club website overlaps Vereino's public page and Orlik booking; the 1.0 scope stays until the website's scope, booking, launch date, embedding and upkeep are known | the only source is the coordinator's short account; cutting scope now could remove something the website will not do, keeping both unchecked could make the club pay twice; Claude's recommendation, accepted by Władek | Władek Kuć | superseded by D23 | when the website's scope is collected | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-020-club-website-overlap-facts-first.md | none |
| D21 | 2026-10-23 | Plan without further interviews at this stage; the untested beliefs A01–A05, A07, A08 and A10 are accepted as risks. The board is accountable for the rollout (Q01), the administrator for the Orlik rules towards the municipality (Q04). The user outcome is chosen | Władek is close to everyone who works at the club and the academy and has spoken with them many times (informal, not recorded) | Władek Kuć | active; the Przykład-specific parts (Q01, Q04, the phase 2 pilot revisit) superseded by D25 | after the phase 2 pilot | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-021-proceed-without-further-interviews.md | D15 |
| D22 | 2026-10-23 | Rules the club configures, with defaults: age for an own account (16), online payment commission (the club pays), sibling discount, coach settlement model, attendance declaration model, visibility of other children called up, sales document (none) — adopted as R10–R16 | clubs and countries differ; the pilot club's practice is known for most rules | Władek Kuć | active | at the spec revision that implements them | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-022-club-configurable-rules.md | D04 (the own-login age) |
| D23 | 2026-10-23 | Scope changes when discovery closed: N06, N12, N16 confirmed; PZPN integration (Should), spreadsheet import (Must), guardians' contact list for coaches (Must), school-hall hours report (Should) added; receipts and invoices later; coaches' cash expenses (Q16) stay outside 1.0; the club website and Vereino's public page and Orlik booking both stay; D08 stays Must; the grant track is parked | no reason recorded beyond the owner's choices; the duplicated-work risk with the club website is accepted; supersedes D20 because no further facts are collected at this stage | Władek Kuć | active; the club-website duplication reasoning superseded by D25 | at the spec revision that adds them, and at each phase exit gate | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-023-scope-changes-after-discovery-close.md | D20 |
| D24 | 2026-10-23 | The spec review's open points: an own read-only lookup for sessionless routes if the platform has no contract (an approved exception, V-12 first); maintenance planned only on assigned places, administrator on all, section coordinators without the feature by default; the public request returns `maintenance_scheduled` | the owner's decisions on the spec consistency review | Władek Kuć | active | phase 1 exit gate (V-12) and phase 5 exit gate | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-024-spec-review-decisions.md | none |
| D25 | 2026-10-23 | KS Przykład will not use Vereino (its board chose another vendor's website and system) and supplies no further material; Vereino continues in the same segment; the pilot club is to be chosen and must administer a municipal facility; the spec uses an example club "Dev Academy" with Przykład's sections; the Przykład research tasks in the tracker stay as they are | the owner's knowledge of the board decision; he knew it from the start and it does not trouble him; the facility module stays Must (D08) | Władek Kuć | active | when the pilot club is chosen | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-025-pilot-club-chose-another-vendor.md | D21 (in part), D23 (in part) |
| D26 | 2026-10-24 | The second spec review's decision points: the bulk import commits people and guardianships in phase 1 and group memberships in phase 2 through an optional `groups` hook; the DD-35 lookup exception (D24) is written into `AGENTS.md`; the declaration kind is a club setting per activity type, and the group policy decides only who declares | the owner's decisions on the second spec consistency review | Władek Kuć | active | phase 2 exit gate | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-026-spec-review-2-decisions.md | none |
| D27 | 2026-10-27 | Sign-in with Google (first) and Facebook (later) for people who already hold an invited account, as a 1.0 Should: a Vereino slice on the `arctic` client inside the `foundation` module, linking only from a signed-in session or by the administrator, no account creation and no e-mail matching from a social sign-in; the identity lookup joins the DD-35 system-scope exception | the board asked for sign-in with the accounts people already have; the platform offers OAuth only in the commercial enterprise module, which stays disabled | Władek Kuć | active | phase 2 pilot review (share of account holders who connected a provider) | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-027-social-sign-in.md | none |
| D28 | 2026-10-27 | The club specification is split in three (phases 1–3 with the shared parts; phase 4 payments; phase 5 facilities), with global ids; the facility module no longer requires payments — the rental charge is optional through `payments.chargeService` | the architectural review of 2026-10-26 found a bundle whose differentiator was blocked by held-back payments work; the owner chose the recommended options | Władek Kuć | active | when phase 5 is planned | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-028-split-specification-and-optional-rental-charge.md | none |
| D29 | 2026-11-03 | Every role except the club administrator works from the phone: guardians, participants, coaches and instructors, coordinators, the treasurer and the attendant do every task on the member pages under `/club` at 375 px; a task of such a role that exists only in `/backend` is a gap | parents and coaches are at the pitch, not at a desk; the functional analyses of 2026-11-03 found coach tasks (cancel, announce, share text, one-off events) reachable only through the panel, which the coach role cannot fully open | Władek Kuć | active | at the phase 2 pilot review | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-029-phone-first-for-every-role-but-the-administrator.md | none |
| D30 | 2026-11-04 | Unblock held-back work: enable `dictionaries` (#92) and `payment_gateways` + `gateway_stripe` with their migrations; build phase 4 now with the club administrator doing the treasurer's work (the treasurer role REQ-034 and #118 stay held back, A02); lift the A05 hold for substitutions and the coach units report (#95, #96); build foundation I phase C (REQ-017) now, then #105; build phase 5 on the example club with Q18 and Q04 no longer blocking the build | the backlog of phases 1–3 is nearly built and the rest waited only on these decisions; the owner accepts the risks instead of waiting for interviews or the pilot | Władek Kuć | active; the treasurer hold superseded by D-037 (#245, 2026-11-19; the role built in #432) | at the phase 2 pilot review | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-030-unblock-held-back-work.md | D21 in part (the A05 hold; the A02 hold except the treasurer role) |
| D34 | 2026-11-22 | Many clubs on one shared instance, updated with one deploy; no instance per club by default (a dedicated instance only as an exception from the same image and pipeline); the design targets about 1,000 clubs per instance, then identical cells; the maintainers host (answers Q06) | four clubs met on 2026-11-22 are interested; per-club instances multiply upgrades and let versions drift; records are already scoped by tenant and organization | Władek Kuć | active | with the E22 spec (#627) | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-034-many-clubs-on-one-instance.md | N09 |
| D35 | 2026-11-22 | Open core: the core moves from MIT to AGPL-3.0-only from the next release; Vereino Enterprise is a separate commercial package switched on per tenant; contributions under a CLA (supersedes ADR-022's DCO-only); dependencies stay permissive; the name is registered as a trademark; implementation partners set up clubs on the shared cloud | under MIT a partner or competitor could host a closed fork; AGPL plus a commercial licence, the trademark and the CLA protect the hosted service and the partner network; one author today makes the change cheap | Władek Kuć | active | when the first partner signs | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-035-agpl-core-enterprise-and-partners.md | D12 (license part) |
| D36 | 2026-11-22 | Domain `vereino.org` (product page and docs at the root); each club on `{club}.vereino.org` by default or its own domain through domain mapping; the club part a–z, 0–9 and hyphens, about 15 characters at most, reserved names; e-mail from a `vereino.org` subdomain; `vereino.pl` redirects | the length is acceptable because parents open links, QR codes and the home-screen app; subdomains give each club its own origin; .com, .app and .club are taken | Władek Kuć | active (the owner buys the domains) | when `vereino.org` is registered | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-036-domain-vereino-org-and-club-subdomains.md | D12 (domain point) |
| D37 | 2026-11-19 | The treasurer role is no longer held back: the role `vereino_treasurer` with the payments features and the dashboard only, phone-first, menu with the dashboard and Finance; the club administrator may still do the treasurer's work | #118 gave the administrator Cash to settle and the owner chose to build the role now instead of checking A02 with a real treasurer first; built in #432 | Władek Kuć | active | at the phase 2 pilot review (A02 with a real treasurer) | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-037-treasurer-role-released.md | D30 in part (the treasurer hold) |
| D38 | 2026-11-23 | Training outlines on sessions in the PZPN template with a PDF export; a shared outline library visible to the club, to clubs on Vereino or to the public (a club setting; new clubs start at clubs on Vereino) with 1–5 ratings and a ranking by rating and use; only the expiry date of a player's sports medical certificate with a status for coaches and reminders; exports instead of an integration with PZPN's academy system; core, not Enterprise | coaches of two clubs holding a PZPN star asked for them; the certificate makes outlines and valid medical examinations a duty; PZPN's system has no public interface | Władek Kuć | active | with the E24 spec | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-038-training-outlines-shared-library-and-medical-expiry.md | N01 (in part), D16 (N01 part) |
| D39 | 2026-11-25 | Production starts on Railway Pro in EU West (supersedes the Hobby plan of ENG-Q-03); the owner signs Railway's DPA, turns on volume backups and PITR if Pro offers them and enforces two-factor sign-in before real club data; the nightly encrypted off-site dump stays; the app stays portable; production moves to Google Cloud in Warsaw when data must be in Poland, ISO 27001 or an SLA is required, health data beyond the D38 expiry date is needed, or the club count nears stage 3 of D34 | Railway has a DPA with SCCs or the Data Privacy Framework, an EU region, AES-256 at rest, TLS and WireGuard in transit, SOC 2 Type II, backups and PITR; the Railway setup and runbooks exist; Google Cloud costs several times more at a few clubs and needs a new pipeline | Władek Kuć | active (the owner upgrades the plan and signs the DPA) | when any trigger fires | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-039-railway-pro-first-google-cloud-on-triggers.md | ENG-Q-03 (plan part) |
| D40 | 2026-11-25 | One Day / Week / Month switch on every calendar a person browses (public facility calendar P-04, member calendar M-03, facility calendar B-23 with M-11, coordinator calendar B-15); a phone opens on Day, a wider screen on Week; the facility calendar gets a week (seven hour axes on a desktop, a list on a phone) and a month (a list), revising D-031 §4; the public schedule read gains optional `from`/`to`; one shared switch in `@vereino/ui` with the view and date in the address | Walking the demo sandbox the owner found each calendar fixed to a different range: a guest could not see one day of a pitch, staff could not see a place's week, and four controls for one idea | Władek Kuć | active | when the four views have shipped | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-040-calendar-range-switch-and-week-on-the-facility-calendar.md | D-031 §4 (facility calendar is a day axis only) |
| D41 | 2026-11-25 | A public sign-up form per section without an account: the section coordinator decides (accept into a group, trial session, waiting list, reject with a reason); age in full years on the club's reference day is checked against the groups' public age ranges as a hint and a warning, never a hard block; groups get an optional limit of places and a waiting list; a trial session on request; minimal data, e-mail confirmation, no health data; core, not Enterprise | parents apply by phone, Messenger and paper today; online enrolment is common among competitors; clubs recruit every season and already use waiting lists and trial sessions | Władek Kuć | active (data model, migrations and the legal text in the E26 spec) | after the first season of sign-ups with a pilot club | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-041-section-sign-up-form.md | Q-L06 of the people life-cycle spec; CM Q-027 (in part) |
| D42 | 2026-11-26 | The coach starts a cash handover from the phone (held KP payments preselected, can untick, can withdraw while pending); the treasurer or the club administrator (`payments.cash.settle`) confirms the whole handover on the phone or in the panel, or rejects it with a reason and the coach sends it again; no partial acceptance; the one-sided "Przyjmij rozliczenie" stays as a fallback and notifies the coach | the treasurer had no way to accept cash from a coach on the phone and the coach had no record of handing it over; cash changes hands at the pitch | Władek Kuć | active (data model and migration in the payments spec amendment) | after the first month of real cash handovers with a pilot club | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-042-coach-starts-cash-handover-treasurer-confirms.md | REQ-033 one-sided handover as the main path (kept as fallback) |
| D43 | 2026-11-26 | No edge proxy (WAF, rate limiting, layer-7 DDoS protection) in front of `vereino.org` now; it is set up when an attack outgrows the app's limits (#751) and Railway's edge rules and Under Attack Mode, or before the first club custom domain; the vendor then becomes a sub-processor (DPA, `processors.md` row, clubs told) before it carries traffic; the app's limits stay | a TLS-terminating proxy sees all club traffic, children's data included, and is a sub-processor; at a few clubs the app's limits and Railway's own edge tools cover the risk | Władek Kuć | active (no proxy; vendor chosen when a trigger fires) | when either trigger fires | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-043-edge-proxy-on-a-trigger.md | none |
| D44 | 2026-11-26 | The next scope is reaching guardians. Staff share a personal invitation link or QR code for a family, and a group QR code leads to the section sign-up form (D41); there is no self-registration. The public club page stays a simple club card (N06): it gets only photos and graphics on club events, next to the existing poster, with no news and no editor. A photo of a child is published only with the guardian's image consent recorded in Vereino (Q19) | the first prospective club reaches parents only in WhatsApp groups and chases them by phone; e-mail invitations may go unread (A07). An open group link, where parents claim their own child, was considered and rejected: a new account path and a risk to children's records. Claude's recommendation for the invitation path, accepted by Władek. Announcements as public news on the club page were proposed and rejected by Władek: the page is not meant to replace a website builder | Władek Kuć | active | after the next club conversations or the first pilot month | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-044-reach-guardians-invitation-links-and-club-page.md | none |
| D45 | 2026-11-26 | Vereino is an installable web app on phones and computers. Each club origin has a web app manifest with the club's name and logo; a minimal service worker shows an offline page; there is an install entry and an iPhone hint. Push and a native app stay out | the owner promised "an icon on the phone" at the first club presentation; the coach did not ask for it, so this rests on the owner's choice, not on an observed need; each club has its own origin (D36); browsers offer installation only with a manifest | Władek Kuć | active | when push or a native app is reconsidered | superseding row approved by the owner | `[DOCUMENT]` research/decisions/D-045-installable-web-app.md | N12 (in part) |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | Guardians will declare attendance in Vereino instead of the Messenger poll `[ASSUMPTION]` vision board ("biggest risk") | high | one guardian answers the coach's poll and keeps the chat for lifts; absences go to the chat or privately (interview 2026-10-23, co-founder). In another club's app, the outside guardian missed one confirmation deadline. He says parents often forget and the coach phones them. He thinks everyone installed the app because there is no choice, but he is not sure that all did (interview 2026-10-23, outside guardian). The coordinator needs the number beforehand and would want absence-only reporting for training and confirmation for matches (coordinator interview note (not public)) The first prospective club's coach expects parents will not use an app, and says the club chases them by phone (first-club meeting note, 2026-11-26 (not public)) | the primary metric and D09 fail; the guardian's side of 1.0 needs rethinking | at the first club that tries Vereino, invite the guardians of one group through the D44 links in their own chat, then record how many activated an account and how many declared for the next session in Vereino. REQ-017 is built (D30) and Przykład is gone (D25), so the earlier Przykład test no longer applies. No threshold is set | Władek Kuć | unknown | accepted untested (D21) |
| A02 | The treasurer's biggest pain is not knowing who is overdue, and online payment helps; Stripe commissions are acceptable `[ASSUMPTION]` protopersonas, D-010 | high | none about overdue amounts. A second guardian dislikes the commission that parents pay on in-app payments in his club; a friend of his pays by standing order. This is the parent's side; D10's trigger concerns the club's side. The visible unpaid status prompts him to pay (guardian interview note (not public)). One guardian's standing-order overpayment drew no contact from the club (interview 2026-10-23); online payment (D10) would not catch that, while bank import with matching (REQ-030, a D13 candidate for Should) would. There is no treasurer account. | the payments phase targets the wrong problem; D10 and the place of REQ-030 are revisited | interview with the treasurer/administrator, plus the baseline: number of families and overdue amounts at the end of the last month | Władek Kuć | unknown | accepted untested (D21) |
| A03 | A small club chooses Vereino over ProTrainUp because it is free, simple and handles the facility `[ASSUMPTION]` business case | high | benchmarks only: 13 products checked on 2026-10-23 show the multi-section edge is not unique (Vibeclass) and on 2026-10-23 ProTrainUp's pricing page lists a facilities module; no product found with the municipal-facility side (research/2026-10-23-benchmark-competitors.md) | no clubs beyond Przykład; the business goals fail | conversations with coordinators or presidents of other clubs (e.g. another multi-section academy): what they use, who decides, whether open source is an argument or a risk | Władek Kuć | unknown | accepted untested (D21) |
| A04 | Most academies in the segment administer a municipal facility `[ASSUMPTION]` D-008 | medium | Przykład only, and Przykład is no longer the pilot (D25); the pilot club must administer a facility by selection, which tests nothing about the segment | the facility module moves from Must to Should (D08) | the same conversations with other clubs | Władek Kuć | unknown | accepted untested (D21) |
| A05 | Coaches will use one club tool, and automatic unit settlement removes disputes `[ASSUMPTION]` protopersonas | medium | against the dispute part: the coordinator says substitutions are rare and settled among coaches and described no dispute (coordinator interview note (not public)); Władek recalls none in the last year (refresh session, 2026-10-23). No coach interviewed | substitutions and units (D07) lose their point; coaches stay on their own tools | interviews with several coaches; the coordinator's second conversation | Władek Kuć | unknown | accepted untested (D21) |
| A06 | Guardians with children in several organisations struggle to keep track `[ASSUMPTION]` D-014 | low for 1.0 | the owner's description of one family; its guardian was interviewed. The guardians split the organisations between them and have not tried combining calendars (guardian interview note (not public)) | D14 stays later or is dropped | the remaining parent interviews | Władek Kuć | unknown | untested |
| A07 | In-app notifications and e-mail reach guardians `[ASSUMPTION]` D-009 | high | one guardian mutes all messenger apps and checks the schedule the day before (interview 2026-10-23, co-founder). In another club, urgent changes go through WhatsApp because in the app "nobody will see it" (interview 2026-10-23, outside guardian). His app account showed 135 unread notifications (research/2026-10-23-benchmark-sportbm.md). At Przykład, urgent changes reach guardians only through the Messenger groups (coordinator interview note (not public)). In the first prospective club, contact with parents is only in WhatsApp groups (first-club meeting note, 2026-11-26 (not public)) | changes go unnoticed; a view the guardian checks themselves (or a calendar link) matters more than notifications | parent interviews: how they last found out about a change, and whether they read club e-mail | Władek Kuć | unknown | accepted untested (D21) |
| A08 | A club without an IT person can get an instance hosted and maintained `[ASSUMPTION]` D-012 | medium | none | rollout beyond the first club stalls | team decision plus the conversations with other clubs | Kacper | unknown | accepted untested (D21) |
| A09 | Guardians need to see which other children are called up or in their group, to arrange lifts `[ASSUMPTION]` from two guardian accounts | medium | two guardians describe arranging lifts with other families and one wants to see who is called up (both interviews 2026-10-23); at Przykład the coordinator and the groups he knows of call up all their players (coordinator interview note (not public)), so (interpretation) the list of who is called up there is the whole group | if false, guardians arrange lifts without seeing who is called up and the app need not show other children. If true and the app does not show them, the group chat stays the place where attendance is visible, and A01 gets harder. Showing them raises data-minimisation and consent questions. | ask the remaining guardians how they last arranged a lift, and ask coaches what they are willing to show | Władek Kuć | unknown | untested |
| A10 | Grant settlement is a frequent, costly and error-prone problem for associations beyond KS Przykład `[ASSUMPTION]` D-018 | high for the product direction (Q13), low for 1.0 | the coordinator's account (about 12 grants this year, his biggest time sink, risk of losing a grant; rules differ per agreement, allocations can be rejected, a substantive report is required; no hours known) and Władek's view; from other associations only the coordinator's second-hand report of the same fear (coordinator interview note (not public)) | a product for all associations loses its case; D18 chooses between a Vereino module and no product | the D18 track: the last settlement step by step at Przykład, two or three other associations, and a benchmark of grant-settlement tools | Władek Kuć | unknown | accepted untested (D21) |
| A11 | An attendance report helps poor clubs settle municipal grants `[ASSUMPTION]` the owner's reading of first-club meeting note, 2026-11-26 (not public) | low for the current scope | one small club lives on a small municipal grant and needs its own contribution for building works; nobody said an attendance report would help | nothing in scope changes; N07 stays | ask the next clubs how they settle the municipal grant, and whether attendance lists are part of it | Władek Kuć | the next club conversations | untested |

## Kill criteria

Not decided (Q05). Two revision triggers exist in the decisions, and neither will be reached at this stage because no further interviews are planned (D21):
- D08: if most of the other academies do not administer a facility, the facility module moves to Should.
- D01: if interviews show that another module drives adoption, the scope changes.

The nearest observable point is the 4-week pilot of phase 2 at the pilot club, once it is chosen (D25); D21 is revisited after it. No date for choosing the pilot club is set (Q05).

No observation has been agreed that would stop the project.

## Hypotheses to test

None. No synthetic walkthrough has been run.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Who is accountable for the rollout at the pilot club: the date, and who trains coordinators and coaches? (spec Q-039) | yes — blocks the 4-week pilot of phase 2, not the planning of phases 1–3 | the pilot club's board, once chosen | reopened 2026-10-23 (D25); it was closed with the Przykład board (D21) |
| Q02 | Whose Stripe account is it, and who approves the commission model? (spec Q-016) | closed | Przykład board / treasurer | closed 2026-10-23: the club's Stripe account; the commission is a club setting, default the club pays (R13, D22) |
| Q03 | Is the age threshold for an own account 13 or 16? (spec Q-007) | closed | Władek Kuć after a legal opinion | closed 2026-10-23: the administrator sets the threshold, default 16; the legal opinion is waived (R10, D22) |
| Q04 | Who is accountable for the facility rules towards the municipality at the pilot club (hours, zones, rates, payment deadline)? (spec Q-008) | yes — blocks phase 5 data | the pilot club, once chosen | reopened 2026-10-23 (D25); it was closed with the Przykład administrator (D21) |
| Q05 | What observation would make the team stop or substantially revise the project? | no — blocks a decision to commit beyond the pilot | Władek Kuć, Kacper | open |
| Q06 | Who hosts and maintains an instance for a club without an IT person? (D-012) | no — blocks rollout beyond the first club | Kacper | answered 2026-11-22 by D34: the maintainers host one shared instance for many clubs; who invoices clubs and signs their processing agreements stays open |
| Q07 | Do the 1.0 problems hold for guardians, coaches and the treasurer outside the team? | closed | the interviews in the Collection plan | closed 2026-10-23: not researched further at this stage; the beliefs are accepted untested (D21) |
| Q08 | Which conversations will the team treat as enough to revisit D01, D08 and D11? | closed | Władek Kuć | closed 2026-10-23: no further conversations at this stage (D21) |
| Q09 | Do guardians declare anything for regular training today, other than absences? | closed | guardians (Collection plan) | closed 2026-10-23: default model — absence-only for training, confirmation for matches (R11, D22) |
| Q10 | What answer from the guardian interviews would make the owner revisit D09 or the primary metric? | closed | Władek Kuć | closed 2026-10-23: no guardian interviews at this stage (D21); the phase 2 pilot at the pilot club is the next observation (D25) |
| Q12 | Should guardians see which other children are called up or in their group, given data minimisation and consent? | closed | Władek Kuć, after the coach interviews | closed 2026-10-23: a club setting (R15, D22) |
| Q13 | Should the team's energy go to a grant-settlement system for all associations rather than to Vereino? | closed | Władek Kuć | closed 2026-10-23: the grant track is parked until after 1.0 (D23) |
| Q14 | Does REQ-021 ("base + units × rate + matches and away trips per contract") match how the club pays coaches (a fixed base, minus a fixed amount per missed session passed to the substitute, plus a fixed amount per away trip)? | closed | Władek Kuć, the coordinator | closed 2026-10-23: both models, chosen per club (R14, D22) |
| Q15 | Should Vereino record the club's own rentals of other facilities (school halls: hours, bills)? | closed | Władek Kuć | closed 2026-10-23: in 1.0 as Should (D23) |
| Q16 | Should cash expenses paid by coaches (referees) be recorded in Vereino, or stay in the cash notebook and with the accountant? | closed | Władek Kuć, the treasurer | closed 2026-10-23: outside 1.0, stays in the cash notebook and with the accountant (D23) |
| Q17 | How do Vereino and the separately built club website divide the public club page, the Orlik schedule and booking, and sign-ups? | closed | Władek Kuć, after the website's scope is known (D20) | closed 2026-10-23: both stay in 1.0 (D23); moot for Przykład since D25 |
| Q18 | Which club is the pilot? It must administer a municipal facility (D25); a candidate club named by the owner, not contacted | yes — blocks the pilot and the phase 5 facility data; not the planning of phases 1–3 | Władek Kuć | open |
| Q19 | How are photos of children on club events handled? (a) The club confirms it holds image consents when it publishes. (b) Vereino collects each child's image consent from the guardian and blocks publishing without it. (c) For now, only photos without identifiable people. | closed | Władek Kuć | closed 2026-11-26: (b) — Vereino collects each child's image consent from the guardian and blocks publishing without it; the consent text goes to the lawyer with the D35 lawyer items before real club data |
| Q11 | Is phase 1 planned before the interviews, accepting that guardians' sign-in is untested? | closed | Władek Kuć | closed 2026-10-23: no, planning waits for the interviews (D15); D15 superseded by D21 |

## Definition of Ready addendum (own)

- Problems and Target group: guardians and the academy coordinator are supported by interview accounts (two guardians, one a co-founder; two coordinator conversations). The treasurer, the coaches as a group and other clubs have no account. The owner accepted those beliefs untested (D21); under the om-discover evidence rules that acceptance does not supply missing evidence about a problem or its users.
- Expected outcome and its check: chosen (D21); the primary metric's baseline is still unknown, and the phase 2 pilot at the pilot club is the first observation.
- Out of scope with an owner: every active non-goal has one (N06, N12 and N16 confirmed by D23).
- Blocking questions: Q18 (the pilot club), Q01 and Q04 block the pilot and the phase 5 facility data, not the planning of phases 1–3. Q05 (stop criteria) and Q06 (hosting beyond the first club) are open and do not block 1.0.
- Signed: Władek Kuć, product owner, with the D21 risks accepted.
- Decisions the scope relies on: active, except R05 (the Orlik's hours, zones and rates), which the administrator confirms before phase 5 data is entered.
- **Ready for:** phases 1–5, which are built (D30, D37); since 2026-11-26 also D44 (the event photos need a spec first: image consent from the guardian, Q19) and D45. The pilot club must still administer a facility (D25). Problems and Target group for D44 rest on the guardians' accounts and on one prospective club's coach. The adoption risk (A01, A07) stays accepted, not tested.
- **Held back from implementation planning:** nothing new. The image-consent text needs the lawyer before real club data (Q19). The October holds on the treasurer's work (A02) and on substitution and coach-settlement automation (A05) were released by D30 (2026-11-04) and D37 (2026-11-19), and that work is built.
- **Pilot-specific data is open:** the pilot club (Q18), its rollout owner (Q01) and its facility rules (Q04) — needed before the phase 2 pilot and phase 5 data, not before planning.
- **Carried as accepted risks on the tickets:** A01 and A07 (guardians declaring in the app and noticing changes) on the phase 1–2 tickets; A03, A04 and A08 on anything justified only by other clubs.

## Collection plan

One entry is active since 2026-11-26: the prospective clubs' own accounts. Przykład supplies no further material (D25). The other entries below are deferred and block nothing; the ones that named Przykład's people can only be done at the pilot club, once chosen. The research backlog (#10–#20) stays as it is in the tracker (D25).

### What do the interested clubs struggle with today, and who decides there?

- What decision or work needs it: D44's review, A01, A03, A07, A11; the choice of the pilot club (Q18)
- Who can answer it: the coaches, coordinators or boards of the four interested clubs (second meeting on 2026-11-27; the others postponed)
- How: in each meeting, ask about:
  - the last time the club had to reach parents quickly;
  - the last fee or attendance chase;
  - how the municipal grant is settled.

  Keep the note outside the public repository, as with the first one (first-club meeting note, 2026-11-26 (not public)).
- Owner and by when: Władek Kuć; 2026-11-27 for the second club, the others when they reschedule. The A01 test (invitations in one group) runs at the first club that tries Vereino.
- Template: `research/templates/interview-note.md`

### How do guardians learn about changes, declare attendance and pay today?

- What decision or work needs it: A01 and A07 (primary metric, D09), A02 (from the guardian's side), A06 (D14); blocks Q07
- Who can answer it: two more guardians with children in clubs. The first one, the guardian from D-014, is done (guardian interview note (not public)).
- How: interviews with `research/interviews/2026-10-20-script-parent.md`, asking about the last change, the last poll and the last fee paid
- Owner and by when: Władek Kuć; invitations sent 2026-10-23, first interview done 2026-10-23, the others' dates unknown
- Template: `research/templates/interview-note.md`

### How does the treasurer collect fees today, what does it cost, and what is the baseline? (at the pilot club, D25)

- What decision or work needs it: A02, D10 (commissions), the payments phase; the success-measure baseline
- Who can answer it: the club's treasurer/administrator
- How: interview with `research/interviews/2026-10-20-script-treasurer.md`; data: number of families and overdue amounts at the end of the last month
- Owner and by when: Władek Kuć; invitation sent, date unknown
- Template: `research/templates/interview-note.md`, `research/templates/data-request.md`

### How do the coordinator and coaches run attendance and substitutions? (coaches at the pilot club, D25)

- What decision or work needs it: A05, D07, R04; the coach side of phases 2–3
- Who can answer it: the academy coordinator, plus several different coaches
- How: interviews with `research/interviews/2026-10-20-script-coach.md`
- Owner and by when: Władek Kuć; both coordinator conversations are done (coordinator interview note (not public), coordinator interview note (not public)); still open with him: who decides the rollout (Q01), the coach pay formula (Q14) and the counting request; the coaches are not scheduled
- Template: `research/templates/interview-note.md`

### What do other clubs use, who decides, and do they administer a facility?

- What decision or work needs it: A03, A04, A08; D08 and D11 revisit points
- Who can answer it: a coordinator or president of another academy with several sections (e.g. another multi-section academy)
- How: an interview about the tools they use today, who chose them, and their facility
- Owner and by when: Władek Kuć; not yet contacted
- Template: `research/templates/interview-note.md`

### How does SportBM work beyond the four screens, and what does it cost the club?

- What decision or work needs it: the comparison in Product and how it stands out; A01, A07, A09
- Who can answer it: the guardian interviewed on 2026-10-23, and SportBM's public page
- How: four screenshots are in (research/2026-10-23-benchmark-sportbm.md). Still missing: a dated check of the public page and pricing, the call-up screen with its deadline, the payment screen, and what the "messages" tile does
- Owner and by when: Władek Kuć; unknown
- Template: `research/templates/benchmark-check.md`

### How does grant settlement work, and is it a problem beyond KS Przykład? (D18)

- What decision or work needs it: A10, Q13, the D18 decision (separate product, Vereino module, or none); N07
- Who can answer it: the administrator and the coordinator at Przykład; two or three other associations, not only sports clubs
- How: the last settlement of one grant step by step (who, how long, what had to be corrected); the sample agreement and settlement the coordinator offered to share, seen as a whole; the same in the other associations; a dated benchmark of grant-settlement tools
- Owner and by when: Władek Kuć; unknown
- Template: `research/templates/interview-note.md`, `research/templates/benchmark-check.md`

### What will the separately built club website do? (D20 — moot since D25: Przykład will not run Vereino)

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

### How many attendance declarations happen in Messenger today? (at the pilot club, D25)

- What decision or work needs it: the baseline for the primary metric
- Who can answer it: a coach or coordinator of one group
- How: count poll answers and absence messages in one group channel for 4 weeks (spec Overview)
- Owner and by when: unknown
- Template: `research/templates/data-request.md`
