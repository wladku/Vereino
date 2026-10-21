---
number: D-002
date: 2026-09-26
owner: Władek Kuć
source: decision form
status: confirmed
---
# D-002 Classes and events = a single Activity entity with a type
**Decision:** activity.type ∈ {training, match, sparring, camp, other}; recurrence as an RRULE.
**Why:** one calendar, one attendance, less code.
**To change:** if matches and camps force too many conditional fields.
**Revisit:** after the camp is implemented.
