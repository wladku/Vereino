---
number: D-034
date: 2026-11-22
owner: Władek Kuć
source: the owner's answers of 2026-11-22 in a Claude Code session, after four clubs met at a tournament showed interest in Vereino; recorded with epic E22 (#626)
status: confirmed
---
# D-034 Many clubs on one shared instance, updated once for all

On 2026-11-22 the owner spoke with at least five coaches at a tournament. Four clubs are interested in Vereino: they run their club on spreadsheets and WhatsApp, or are unhappy with the system they have. The owner wants each further club to start straight in production, and every club updated at once rather than one by one. Brief row N09 still said "one instance per club; the hosting model is open". The owner settled it:

1. **One production instance serves many clubs.** A club does not get its own instance by default. A release, a migration or a fix reaches every club with one deploy. This supersedes N09 and the spec's DD-02 wording "1 tenant + 1 organization per instance in 1.0". DD-02 itself is amended by the spec story E22-S01 (#627).
2. **Q06 is answered.** The maintainers host and maintain the shared instance for clubs without an IT person (business case section 5, option B, on one shared instance). A dedicated instance, for example for a municipality (option C), remains possible as an exception. It is built from the same image and released by the same pipeline.
3. **Capacity target.** The design must allow on the order of 1,000 clubs on one instance, about 150,000 participants and 300,000 accounts. Beyond that, the plan is several identical shared instances ("cells") updated by the same release pipeline, never one instance per club.

The owner's words: "Nie wyobrażam sobie zarządzania klubami, kiedy każdy ma własną instancję i każda instancja wymaga niezależnego upgrade'owania i zarządzania" ("I cannot imagine managing clubs when each has its own instance and each instance needs upgrading and managing on its own").

**Why:** per-club instances multiply upgrades, migrations, backups and monitoring by the number of clubs, and let clubs drift onto different versions. The data model already scopes every record by `tenant_id` and `organization_id`, so a shared instance is possible:

- per-club jobs take `--tenant/--org`;
- integration tests already run two clubs in one database (for example TEST-087);
- Open Mercato ships `customer_accounts:domain_mapping` for mapping a hostname to a club.

The price of this choice is a shared blast radius and the need to prove isolation between clubs. Epic E22 carries that work.

**Not decided here:**

| Topic | Where it is settled |
|---|---|
| One tenant or one organization per club | E22-S01 (#627) |
| The address scheme | E22-S01 (#627) |
| The Railway plan (Hobby → Pro before real club data is recommended) | ENG-Q-03 stands; the owner acts |
| The entity that invoices clubs and signs their processing agreements | open DPA signer |
| The price list and business model | its own decision later |

**Applied in:**

- product brief: N09 superseded, D34, Q06 answered;
- business case: section 5 and the 1.0 shape;
- epic E22 (#626) with stories #627–#634.

**To change:** a superseding record approved by the owner.
