---
number: D-017
date: 2026-10-23
owner: Władek Kuć
source: om-discover session 2026-10-23 — Władek's decision after `interviews/2026-10-23-interview-coordinator.md`
status: confirmed
---
# D-017 Facility maintenance and inspections (REQ-022) move from Could to Must

**Decision:** REQ-022 of the spec `.ai/specs/2026-10-20-vereino-club-management.md` (facility maintenance and inspections with reminders, split between the club and the municipality) becomes **Must** in 1.0. Until now it was Could, per `2026-10-20-moscow.md` and the spec.

**Why (Władek):** "Wpływa to na rezerwację obiektów" — "it affects facility bookings". The academy coordinator reports collisions "very often" between matches and tournaments and maintenance work on the pitch, such as line painting, mowing, aeration and irrigation. Coaches do not know when they can book, and the maintenance person plans work without the coordinator knowing. He asked for one calendar that coaches and the maintenance person both use.

**Consequence for the spec (to be written there, not decided here):**
- Maintenance work is planned in the facility calendar.
- It takes part in the collision check with club sessions, internal bookings (REQ-023) and external requests (REQ-024), as the reason for the decision implies.
- The exact rules still have to be specified in the spec: who plans maintenance, whether it blocks or only warns, and the recurring brushing after a number of hours of use.

**Scope effect:** this adds to the Must set extended by D-013. D-013 says that if the Must set threatens the 1.0 date, the deadline moves rather than the thesis being cut; its candidates to move to Should are REQ-029, REQ-028 and REQ-030.

**To change:** a superseding record approved by the owner.

**Revisit:** at the exit gate of phase 5 (facilities) of the spec.
