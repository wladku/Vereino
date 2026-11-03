---
number: D-029
date: 2026-11-03
owner: Władek Kuć
source: the owner's statement in the gap-analysis session of 2026-11-03 ("parents, and really everyone except the administrator, must be able to use the app from the phone — it is mega, mega important"), after the guardian-side and coach-side functional analyses of the specifications
status: confirmed
---
# D-029 Every role except the club administrator works from the phone

1. **Rule.** Guardians, participants with an account, coaches and instructors, section coordinators, the treasurer and the facility attendant can do every task their role has from a phone, on the member pages under `/club` at 375 px. The club administrator is the only role whose work may live in the `/backend` panel alone.
2. **What it means for specifications and tickets.**
   - Every function of a non-administrator role names its member-page surface (an M- screen) and carries an acceptance criterion at 375 px, in both locales and in light and dark mode.
   - A function that exists only in `/backend` for such a role is a gap, not a design choice. A desk layout in the panel may exist alongside the phone path, never instead of it.
   - The section coordinator's panel screens (sessions list, section calendar, threads) stay; the coordinator's daily tasks — substitutes, cancellations, announcements — also get a phone path.
3. **Not changed:** the look and the tokens stay Open Mercato's (owner decision of 2026-10-27); the panel keeps its screens; native apps and push notifications stay non-goals (N02, N12) — "phone" means the responsive web app.

**Why:** the functional analyses of 2026-11-03 found that a coach can reach several of their tasks only through the panel — cancelling a session, announcements and the share text for the group chat, one-off events — and that the coach role cannot even open the panel's sessions list. Parents and coaches are at the pitch, not at a desk; the product's value (D21: a guardian knows in time where and when; the coach knows who will come) depends on the phone path.

**Already applied:** issues #95, #96, #97, #139 and #140 carry the rule as a decision in play (2026-11-03).

**To change:** a superseding record approved by the owner.

**Revisit:** at the phase 2 pilot review — which panel-only tasks coordinators still do at a desk.
