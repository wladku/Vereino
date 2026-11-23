---
number: D-037
date: 2026-11-19
owner: Władek Kuć
source: the owner's two comments on issue #245 of 2026-11-19 (https://github.com/wladku/Vereino/issues/245#issuecomment-7019135920 and https://github.com/wladku/Vereino/issues/245#issuecomment-7022978608), recorded from Claude Code sessions; written down as a record by issue #604 (2026-11-23)
status: confirmed
supersedes: D-030 point 2 (the treasurer hold) and its "Still held back" line, as far as they concern the treasurer
---
# D-037 The treasurer role is no longer held back

**Decision:**
- The hold that D-030 point 2 put on the separate treasurer role and its screens (REQ-034, DD-33 of `.ai/specs/2026-10-27-vereino-club-payments.md`, phase 4 step 10, #245) is lifted. The owner wrote on #245: "the hold A02/D21 is lifted for this story. Build it after #118 closes (B-33 for the administrator, PR #421)."
- The Ask First of that story is approved: "Build the treasurer role exactly as DD-33 … (features, scope, menu with only the dashboard and Finance, phone-first)."
- The rest of D-030 is unchanged: the club administrator may still do the treasurer's work, and every other module, dependency or migration stays Ask First.

**What was built:** PR #432 (merged 2026-11-20) added the role `treasurer` (`vereino_treasurer`) with the payments features and `dashboards.view` only, no access to person records, groups, activities, club settings, facilities or communication. In the panel the treasurer sees the dashboard with the payments widgets and the Finance group, B-33 "Cash to settle" included (built for the administrator by #118, PR #421). After sign-in a treasurer with no member side lands on `/backend`; the member pages offer the treasurer "Admin panel" in More.

**Why:** #118 gave the administrator B-33, and the owner chose to build the role now rather than wait for A02 to be checked with a real treasurer. A02 stays an accepted, untested risk (D-021).

**Applied in:** `docs/ux-concept/README.md` §1 and §3.1; *Menu structure* of `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`; notes in D-030 and D-031.

**To change:** a superseding record approved by the owner.

**Revisit:** at the phase 2 pilot review (A02 with a real treasurer).
