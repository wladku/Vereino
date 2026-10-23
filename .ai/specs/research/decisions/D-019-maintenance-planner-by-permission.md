---
number: D-019
date: 2026-10-23
owner: Władek Kuć
source: om-spec-writing gate in the om-discover session of 2026-10-23 — Władek's answers to the spec's Q-041 ("Osobne uprawnienie") and Q-043 ("Zostańmy przy uprawnieniu")
status: confirmed
---
# D-019 The maintenance planner is a permission, not a new role

**Decision:** maintenance work on a facility (REQ-022, D-017) is planned by anyone holding the feature `facilities.maintenance.manage`. No new business role is created.
- By default the administrator and section coordinators hold the feature.
- It can be granted to any person, for example the one who maintains the pitch.
- A person holding only this feature is assigned to specific places. They see the facility calendar of those places without renters' or other people's data, and they plan, move, cancel and complete maintenance only there.

**Why:**
- The person who maintains the pitch needs one capability, not a new place in navigation, seeding and scope rules.
- Open Mercato already stores per-user features (`auth:user_acl`), per the spec's V-13.
- Hiding personal data keeps the new access to the minimum the task needs.

**Considered:**
- **Only the administrator plans, and the maintainer reports work outside the system.** Rejected: the collisions the coordinator described come from work planned without the club knowing.
- **A new "facility maintainer" role.** Rejected by Władek in Q-041 and again in Q-043.

**Consequences in the spec:** Q-041, Q-043, DD-36, the "Maintenance planner" row in the roles table, `facilities_place_maintainers`, and TEST-049 and TEST-050.

**Open in the spec, not decided here:** whether coordinators plan on every place or only on assigned ones. This is the 2026-10-23 consistency review's pending decision.

**To change:** a superseding record approved by the owner.

**Revisit:** at the exit gate of phase 5.
