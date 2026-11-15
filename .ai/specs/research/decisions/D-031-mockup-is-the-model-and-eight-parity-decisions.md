---
number: D-031
date: 2026-11-14
owner: Władek Kuć
source: the owner's answers of 2026-11-14 to eight questions asked after the full audit of the application (`main` at `a312199`) against the clickable mockup, the specifications and `docs/ux-concept/README.md`
status: confirmed
---
# D-031 The mockup is the model for layout and names; eight decisions that close the parity audit

The audit of 2026-11-14 found places where the mockup, the specifications and the code say three different things. The owner settled them:

1. **Panel layout follows the mockup.** Where the mockup shows one page with tabs and the specifications list separate routes, the page with tabs wins: Institutions and contracts (B-07), Threads and cases (B-18), Zones and rates (B-26), Log and incidents (B-27). The sidebar has the mockup's groups in the mockup's order — Club, People, Classes (Polish "Zajęcia"), Communication, Finance, Facility — and the facility group has the mockup's six items, not twelve. Existing routes stay valid as the addresses of the tabs.
2. **Names follow the mockup.** One word names one thing: an *activity* (Polish "Aktywność") is the recurring series, a *session* ("Termin") is one meeting, the person running it is "Prowadzący", a *place* in the club's register is "Miejsce", an online booking request is "Zgłoszenie", an incident is "Incydent"; the groups are "Komunikacja" and "Finanse"; the price list is "Cennik wynajmu". The application's texts change, not the mockup's. The mockup itself keeps "Zajęcia" for the menu group and the class type and "Obiekt" for the facility pages; the full table is the navigation spec's "Glossary (D-031 §2)".
3. **The coordinator's day-to-day work moves to the phone (D-029 applied).** On the member pages: the section's sessions, assigning a substitute, cancelling and moving a session, marking a thread as a case, and the group roster. Configuration stays in the panel: the activity wizard, declaration policies, the coach units report and the section's public page.
4. **The facility calendar (B-23) is the mockup's day axis.** One day from 08:00 to 22:00 with every entry (sessions, club bookings, rentals, requests, closures), seven days to pick from, and a click on a free hour opens the booking dialog. The week grid of the facilities specification is dropped.
5. **A declaration deadline is added.** A match or event carries a "confirm by" time; after it a guardian sees "deadline passed" and the coach sees who has not answered. The new column (a migration) is approved in principle; the migration itself is shown to the owner before it is applied. This reverses the autonomous default taken in #98.
6. **A coach creates a sparring or an away match from the phone** for their own group, with the venue typed in as a name and an address (it is not added to the club's places) and with a gathering time.
7. **A moved session is always announced.** Every change of the time, the place or the gathering time of a future session posts a message the group reads, raises a notification and sends an e-mail — the same channels, and the same thread, as a cancellation.
8. **Four life-cycle situations are part of 1.0**, not manual procedures: sending an invitation again; a person or a coach leaving the club (ending membership and guardianship, closing the account, anonymising the data; for a coach also reassigning sessions, settling held cash and ending the contract); a ward turning 18; and the move to a new season.

**Why:** the owner designed the mockup as the picture of the product and found the running application short of it "in every area, especially facilities, groups and activities"; the earlier parity epics (E06–E08) covered single screens and never the navigation, the facility calendar or the coordinator's phone path.

**Already decided elsewhere and unchanged:** D-029 (phone-first), D-030 (the administrator does the treasurer's work; the treasurer role stays held back, #245), #118 (B-33 for the administrator only), #124 Q1 (the public schedule shows a calendar month), #126 Q1 (the attendant may mark a no-show), #195 (the club owns its rules and privacy links).

**Applied in:** the five specifications of 2026-11-14, all `Draft` until the owner reviews them:

| Specification (`.ai/specs/`) | Id letter | Build order |
|---|---|---|
| `2026-11-14-vereino-parity-navigation-and-naming.md` | N | first: its phases 1–3 (sidebar, tabbed pages, glossary) come before the other four build UI |
| `2026-11-14-vereino-parity-groups-and-activities.md` | A | its coordinator phone pages need N's staff context |
| `2026-11-14-vereino-parity-facilities.md` | R | its rental charge needs C's phase 1 |
| `2026-11-14-vereino-parity-payments.md` | C | phase 1 (the charge service) before R's charge phases |
| `2026-11-14-vereino-people-life-cycle-and-data-entry.md` | L | a coach's departure needs the cash handover of issue #118 |

Each lists its migrations and contract changes under "Rollout, Migration, and Rollback"; none of them is approved by this record except the declaration-deadline column of point 5.

**To change:** a superseding record approved by the owner.

**Revisit:** at the phase 2 pilot review.
