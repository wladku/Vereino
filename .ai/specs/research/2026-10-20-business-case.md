---
type: business-case
date: 2026-10-20
author: Władek Kuć
status: team assumptions (no answer has yet been confirmed by a conversation with a target user)
---

# Business case: Vereino

## 1. What do we want to build and for whom?
An open-source system for managing a small multi-section club whose main section is a football academy (indicatively up to ~200 players; alongside it a swimming pool and extra classes), built on Open Mercato. [DOCUMENT: Władek's decision 2026-10-20, D-011] Users: section coordinator, treasurer/club administrator, coaches (often on contract), legal guardians of children, participants 13+, facility attendant. Paying customer: the club board (association), eventually also the municipality as the facility owner. [ASSUMPTION]

Pilot: KS Gwiazda Ściejowice — exactly this kind of club: football academy, swimming pool, extra classes; it administers the Orlik 2024 (municipal sports pitch complex) on behalf of Gmina Liszki. [DOCUMENT: Orlik regulations, orlik-ustalenia note]

## 2. What should the product help with and why would anyone use it?
Today (at Gwiazda): schedule and attendance via Messenger groups, membership fees tracked manually, coach substitutions arranged by phone, Orlik bookings by phoning the club, no record of difficult cases. [DOCUMENT: transcript of the meeting on 26.09.2026 — this is Władek's knowledge as vice-president, not a conversation with a user]

The product should: (a) give the parent one calendar for all their children and "attending/not attending" in two clicks, (b) give the coach an attendance list and substitutions from the phone, (c) give the treasurer fee generation and online payment, (d) give the coordinator a facility schedule without clashes and a public Orlik schedule with bookings, (e) give the board a case record as legal protection. [ASSUMPTION: which of these pains are the biggest — to verify in interviews]

Why not ProTrainUp (PLN 125–245/month): [BENCHMARK] PTU is built out for large clubs and coaches (diagrams, medical, scouting); it has no municipal facility management and no non-sports sections; it is SaaS with data held by the vendor. Vereino is meant to be simple, free (open source), serve the club as a whole (many sections, one parent with children in different sections) and have the municipal facility as a central feature. [ASSUMPTION: that "free + simple + Orlik" is enough for a small academy to choose us over PTU]

## 3. What do we already know, from where, and what do we need to find out?
We know:
- The club's entity structure and roles — from the founders' meeting [DOCUMENT].
- Orlik rules: hour zones, 90-min unit, fee paid to the municipality's account, 24 h to cancel, attendant, sanctions — from the regulations [DOCUMENT].
- PTU pricing and scope — from the website, checked 30.09.2026 [BENCHMARK].
- The coach settlement model at Gwiazda: base pay + training units — from Władek [DOCUMENT/board knowledge].

We don't know (method):
- Whether coaches prefer one club tool, or PTU Coach for themselves + something for the club → conversations with 3 coaches (Mom Test).
- How the treasurer collects fees today and how much time it costs → conversation with Gwiazda's treasurer + 1–2 other clubs.
- Whether parents will move into the app instead of Messenger, and with what incentive → conversations with 5 parents; magic link test.
- How many academies with 100–200 players play on municipal facilities and administer them → PZPN/municipality data or 5 conversations with coordinators of other clubs.
- Who decides on the tool in other clubs and whether "open source" is an argument or a risk for them → conversations with the presidents of 3 clubs.
- Hosting: who will maintain the instance for a club without an IT person → team decision + conversations.

## 4. What does the first release cover, and what do we postpone?
1.0 scope: see `2026-10-20-moscow.md` and decisions D-001…D-012. In short: people and roles, groups, activities/sessions, calendars, attendance, announcements with push, membership fees with online payment, facility (Orlik) with a public schedule and bookings.

Vision (beyond 1.0, to verify): many clubs on one instance for a municipality; projects and grants; shop; online booking for renters; player development history.

We deliberately do not build: training diagrams, an exercise library, a medical module, scouting, individual statistics, Messenger/WhatsApp integration (no API for groups).
