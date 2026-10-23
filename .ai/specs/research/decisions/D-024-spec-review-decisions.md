---
number: D-024
date: 2026-10-23
owner: Władek Kuć
source: om-discover session 2026-10-23 — Władek's answers to the three open decisions of the spec consistency review (`.ai/runs/2026-10-23-spec-consistency-review.md`)
status: confirmed
---
# D-024 The three open decisions of the spec consistency review

1. **Sessionless lookup (DD-35, V-12).** If Open Mercato has no installed contract to find a club by its public slug or a link token before the tenant is known, Vereino uses its own narrow lookup: read-only, one index-backed query on a single globally unique key, as described in DD-35.
   - Władek approves this as a deliberate exception to the AGENTS.md rule that only an installed contract may use system scope.
   - V-12 is still checked first; an installed contract, when found, replaces the exception.
2. **Who plans maintenance work (REQ-022).**
   - Everyone, a section coordinator included, plans only on the places they are assigned to. The administrator plans on all places.
   - The facility role is kept apart from the section coordinator: section coordinators do **not** get `facilities.maintenance.manage` by default.
   - Whoever plans maintenance is granted the feature per person, with place assignments (D-019); there is no new role.
3. **The public booking request on a maintenance window** returns `maintenance_scheduled`, which tells the outsider that the slot is taken by facility work.

**Consequences in the spec:**
- DD-35 and the Security section record the owner's approval.
- In the roles table and `setup.ts`, coordinators lose `facilities.maintenance.manage` by default. The administrator has a club-wide maintenance scope. Everyone else is scoped to `facilities_place_maintainers`. TEST-049 is adapted to an assigned coordinator.
- The public request route lists `maintenance_scheduled` among its errors.

**To change:** a superseding record approved by the owner.

**Revisit:** at the exit gate of phase 1 (V-12) and of phase 5.
