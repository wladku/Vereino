---
title: "A write scoped by a group loads the group as its authorizeScoped target"
modules: ["payments", "foundation"]
areas: ["module-data", "umes"]
topics: ["authorize-scoped", "coach-scope", "grants"]
---

# A write scoped by a group loads the group as its authorizeScoped target

**Context**: #117 (E07-S10) gave coaches and coordinators writes on the charges of their groups' children (cash, reminders, kit handover). The scope check needs the group's id for a coach grant and its section for a coordinator grant, but `authorizeScoped`'s `resolveTarget` is synchronous and the input carries only the group id.

**Problem**: Matching only `groupId` silently refuses every coordinator (their grants name sections), and reading the group's section before `authorizeScoped` reads outside the trusted, fail-closed path. Checking the child or the charge against the grant alone is not enough either: a coach could name their own group and a child or charge of another group.

**Rule**: Make the group the target: `loadTarget` reads it through the owning module's directory in the trusted tenant (null → 404), `lock: 'none'` (the group is not edited), and `resolveTarget` returns `{ id, groupId, sectionId }` so coach and coordinator grants both match and `club_admin` stays club-wide. After authorization, check the child against the group's roster on the club's today and every charge against the group's own charge list (`childGroupCharges`), answering 403 `charge_out_of_scope`. For a target that already has its own row (an order), load that row plus its parent (the campaign) as one composite target and take the group from the input only when the parent covers it.

**Applies to**: `packages/app/src/modules/payments/commands/group-charges.ts`, `commands/order-campaigns.ts` (`REMIND_KINDS`), and any future command acting on records of a coach's or coordinator's groups.
