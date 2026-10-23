---
type: business-case
date: 2026-10-20
updated: 2026-10-23
author: Władek Kuć; 2026-10-23 revision (open-source lens, competitor costs) drafted by Claude, not yet confirmed by Władek
status: team assumptions (no answer has yet been confirmed by a conversation with a target user)
---

# Business case: Vereino

Status labels used in this file, so that no discussed possibility is read as an approved requirement:
**confirmed** — a recorded decision (D-xxx); **assumption** — a team belief to verify; **option** — one of several paths, not chosen; **vision** — direction beyond 1.0, not scope. Source tags as in `README.md`: [DOCUMENT], [DATA], [BENCHMARK], [INTERVIEW], [ASSUMPTION].

## 1. What do we want to build and for whom?

An open-source (MIT) system for managing a small multi-section club whose main section is a football academy (indicatively up to ~200 players; alongside it a swimming pool and extra classes), built on Open Mercato. [DOCUMENT: Władek's decision 2026-10-20, D-011; license D-012] — **confirmed**

Users: section coordinator, treasurer/club administrator, coaches (often on contract), legal guardians of children, participants 13+, facility attendant. — **confirmed** (roles), [ASSUMPTION] (their priorities)

Pilot: KS Gwiazda Ściejowice — exactly this kind of club: football academy, swimming pool, extra classes; it administers the Orlik 2024 (municipal sports pitch complex) on behalf of Gmina Liszki. [DOCUMENT: Orlik regulations, orlik-ustalenia note]

### Who gets value, who pays, who gives time

An open-source product has no license buyer, so the business case has to name three different parties. This is the open-source equivalent of a two-sided product: the club must want to use it, and someone must want to build and run it.

| Party | What they get | What they pay (money or time) | Status |
|---|---|---|---|
| The club (board, treasurer, coordinators) | the tool without a license fee; data stays with the club or its chosen host | hosting, payment-gateway fees (unless passed to parents), set-up and admin time | assumption |
| Guardians, participants, coaches | one calendar, attendance in two clicks, online payment | possibly the gateway fee, if the club passes it on (Q-016) | assumption |
| Maintainers (today: Władek, Kacper) | a tool for their own club; whatever else motivates them is **not recorded** — to be written down by them | development, upstream (Open Mercato) upgrades, security fixes, support for other clubs | to decide |
| Whoever runs the instance (club, maintainers, a municipality, a hosting partner) | depends on the hosting option chosen (section 5) | servers, backups, updates, GDPR obligations as processor | option (D-012 open) |
| Gmina Liszki (facility owner) | a public Orlik schedule and a report from the club | nothing in 1.0; possibly hosting or funding in the vision | vision |

## 2. What should the product help with and why would anyone use it?

Today (at Gwiazda): schedule and attendance via Messenger groups, membership fees tracked manually, coach substitutions arranged by phone, Orlik bookings by phoning the club, no record of difficult cases. [DOCUMENT: transcript of the meeting on 26.09.2026 — this is Władek's knowledge as vice-president, not a conversation with a user]

The product should: (a) give the parent one calendar for all their children and "attending/not attending" in two clicks, (b) give the coach an attendance list and substitutions from the phone, (c) give the treasurer fee generation and online payment, (d) give the coordinator a facility schedule without clashes and a public Orlik schedule with bookings, (e) give the board a case record as legal protection. [ASSUMPTION: which of these pains are the biggest — to verify in interviews]

### Why Vereino rather than what exists (three perspectives)

**Competition** — [BENCHMARK, `2026-10-23-benchmark-competitors.md`, not yet re-checked by a human]:

- 13 products were profiled. None states club management and municipal-facility administration (external rental requests with approval, public schedule without sign-in, owner report) in one product; the facility-side products (OPTeam's municipal booking system, LibreBooking) have no club side.
- Closest to Vereino's scope: ProTrainUp, Vibeclass, SportBM. Vibeclass is the only one that presents multi-section clubs (swimming, athletics, football under one roof) as a core case — the "multi-section" edge in D-011 is therefore **not unique**; the municipal-facility edge still is, as far as the pages show.
- Not found anywhere: coach substitution settlement, cash handed by coaches to the treasurer with receipt numbers, a text to paste into a Messenger group, a facility attendant log.

**License cost a club would avoid** — computed from the benchmark's page prices for a club of ~200 players (arithmetic, not a quote; VAT treatment as on each page):

| Product | Monthly for ~200 players | Yearly | Note |
|---|---|---|---|
| PlayTeam | 400 zł gross (2 zł × 200) | 4,800 zł (10% less annually) | max 500 zł/month |
| SportBM | 500 zł (2.50 zł × 200) | 6,000 zł | max 600 zł/month; gross/net not stated |
| ProTrainUp Silver / Gold | 245 / 495 zł gross | 2,940 / 5,940 zł | Club Pro (125 zł) is limited to 100 players; bank statement parsing from Gold |
| SportsManago | free up to 100 athletes; paid from 150 zł net | from 1,800 zł net | per-plan limits not readable |
| Vibeclass | cannot be computed | — | per-user price above 20 users not shown |

So "free" is worth roughly **3,000–6,000 zł a year** in license fees to a club of this size — but only if Vereino's own running costs (hosting, admin time, gateway fees) stay below that. [DATA: none yet on Vereino's hosting cost or admin time] — this is the central number the business case is missing.

**Stakeholders** — see `2026-10-20-stakeholders.md`; this revision adds the open-source parties in section 1 (maintainers, instance operator, outside contributors, the Open Mercato upstream).

**User experience** — see `2026-10-20-journey-current-state-parent.md` (assumption map: a parent scrolls through three Messenger groups to find the schedule). The cheapest competitor for a club is still Messenger + Excel at 0 zł; Vereino competes with that habit at least as much as with paid tools. [ASSUMPTION]

### Why open source helps or hurts (assumption — to verify with club presidents)

- Helps: no license fee; the club keeps its data and is not locked into a vendor; another club or a developer parent can fix or extend it; a municipality can see what the club runs on its facility.
- Hurts: someone has to host, back up and update it; "free" may read as "no support"; the club becomes responsible for children's personal data on its own instance (or must sign a processing agreement with whoever hosts it); the product depends on two maintainers and on Open Mercato upstream.

## 3. What do we already know, from where, and what do we need to find out?

We know:
- The club's entity structure and roles — from the founders' meeting [DOCUMENT].
- Orlik rules: hour zones, 90-min unit, fee paid to the municipality's account, 24 h to cancel, attendant, sanctions — from the regulations [DOCUMENT].
- Competitor scope and page prices for 13 products, including ProTrainUp re-checked on 2026-10-23 — [BENCHMARK, `2026-10-23-benchmark-competitors.md`].
- The coach settlement model at Gwiazda: base pay + training units — from Władek [DOCUMENT/board knowledge].
- License MIT, repository public, gateway Stripe in 1.0 — D-012, D-010 — **confirmed**.

We don't know (method):
- Whether coaches prefer one club tool, or PTU Coach for themselves + something for the club → conversations with 3 coaches (Mom Test).
- How the treasurer collects fees today and how much time it costs → conversation with Gwiazda's treasurer + 1–2 other clubs.
- Whether parents will move into the app instead of Messenger, and with what incentive → conversations with 5 parents; magic link test.
- How many academies with 100–200 players play on municipal facilities and administer them → PZPN/municipality data or 5 conversations with coordinators of other clubs.
- Who decides on the tool in other clubs and whether "open source" is an argument or a risk for them → conversations with the presidents of 3 clubs. Add to that conversation: what they pay today for any club tool, and who would run a server for them.
- What one Vereino instance costs per month (hosting, backups, e-mail sending) and how many admin hours a month it needs → measure on the Gwiazda pilot instance. [DATA: none]
- Who pays the Stripe fee — club or parent — and whether parents accept card payment without BLIK/P24 → treasurer and board (Q-016).
- Whether the municipality would host or fund an instance for its clubs → one conversation with Gmina Liszki (vision, not 1.0).

## 4. What does the first release cover, and what do we postpone?

1.0 scope: see `2026-10-20-moscow.md`, decisions D-001…D-013 and the spec `.ai/specs/2026-10-20-vereino-club-management.md`. In short: people and roles, groups, activities/sessions, calendars, attendance, announcements with push, membership fees with online payment, facility (Orlik) with a public schedule and bookings. — **confirmed**

Open-source specifics of 1.0 — **option, to decide** (section 5):
- one instance per club (DD-02: 1 tenant + 1 organization per instance) — **confirmed** in the spec;
- installation documented well enough that a club without an IT person can get an instance — **assumption** that this is needed in 1.0;
- the hosting model for such clubs — **open** (D-012).

Vision (beyond 1.0, to verify): many clubs on one instance for a municipality; projects and grants; shop; online booking for renters; player development history; a hosted Vereino service run by the maintainers or a partner.

We deliberately do not build: training diagrams, an exercise library, a medical module, scouting, individual statistics, Messenger/WhatsApp integration (no API for groups). — **confirmed**

## 5. How does an open-source Vereino stay alive? (options — none chosen)

| Option | Who runs the instance | Who pays | Fits the segment? | Main risk |
|---|---|---|---|---|
| A. Self-hosting by each club | the club (or a volunteer parent) | the club, hosting only | only clubs with an IT person | the segment usually has none (D-012 open question) |
| B. Maintainers host instances for clubs at cost | Władek/Kacper | clubs, a fee covering hosting | yes | turns the maintainers into a service provider with support and GDPR-processor duties |
| C. A municipality hosts one instance for its clubs | municipality (or its IT unit) | municipality | yes, where the municipality owns the facilities | needs multi-club on one instance (vision, not 1.0) and a public-sector decision |
| D. Volunteer project, own club only | Gwiazda | Gwiazda | the pilot only | no growth beyond Gwiazda; the "5 academies" goal fails |

Each option changes who is the "paying customer" in section 1 and which goals in the vision board are reachable. Choosing one is a decision for Władek (A) with Kacper consulted on technology and hosting (RACI), recorded as a new D-xxx.

## 6. Success measures and risks

Measures (from `2026-10-20-product-vision-board.md`, statuses unchanged — **assumption**): Gwiazda on Vereino for the 2027/28 season with ≥80% of attendance declarations in the app; 5 other academies by the end of 2027; fee collection from X% to Y% (X not measured yet); ≥3 outside contributors.

Added in this revision — **assumption**:
- Total monthly running cost of one instance below the cheapest comparable license for the same club (~250–500 zł/month, section 2).
- Admin time per month on the instance (updates, backups, user support) measured on the pilot.

Risks specific to open source:
- **Bus factor:** two maintainers; if they stop, clubs keep a working instance but no updates. Mitigation option: documentation, outside contributors (goal ≥3).
- **Upstream dependency:** Open Mercato upgrades may break Vereino modules; the repo already treats installed contracts and backward compatibility as rules (AGENTS.md).
- **Children's personal data:** each instance holds data of minors; the operator of each instance carries GDPR duties. Hosting option B or C needs a processing agreement.
- **Payments:** each club needs its own Stripe account; the fee model is undecided (Q-016).
- **"Free" ≠ "no cost":** if hosting plus admin time exceeds ~3,000–6,000 zł a year, paid tools are cheaper for the club (section 2).

## Decisions this business case is waiting for

| # | Decision | Owner (RACI) | Blocks |
|---|---|---|---|
| 1 | Hosting model for clubs without an IT person (section 5) | Władek (A), Kacper (C) | goal "5 other academies"; installation docs |
| 2 | Who pays the Stripe fee and whose account it is (Q-016) | unknown — board / treasurer | payments in production |
| 3 | Why the maintainers invest their time, and for how long | Władek, Kacper | realism of the vision; contributor strategy |
| 4 | Whether the municipality is a stakeholder to approach before 1.0 | Władek | option C; facility report format |

## Changelog

| Date | Change |
|---|---|
| 2026-10-20 | First version (Władek Kuć). |
| 2026-10-23 | Revision drafted by Claude: status labels; value/payer/time table for an open-source product; competition from the 13-product benchmark and license cost avoided for ~200 players; open-source pros and cons; new unknowns (instance cost, admin time, Stripe fee, municipality); hosting options A–D; open-source risks; decisions this case waits for. Original sections 1–4 kept. Not yet confirmed by Władek. |
