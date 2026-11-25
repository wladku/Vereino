---
number: D-039
date: 2026-11-25
owner: Władek Kuć
source: the owner's choice of 2026-11-25 in a Claude Code session ("Tak, zapisz"), after a comparison of Railway and Google Cloud for personal data of clubs, prompted by a note claiming Railway has no security features; Railway facts read by Claude from Railway's security, compliance, backup and pricing pages and its DPA the same day, then checked again the same day for the PITR window, the DPA's Exhibit A (read in full: end users' data are covered) and the reach of workspace roles
status: confirmed (direction) / open (plan upgrade, DPA signature and backup settings, done by the owner)
---
# D-039 Production starts on Railway Pro in EU West; Google Cloud in Warsaw on named triggers

D34 puts many clubs on one shared instance, and ENG-Q-03 runs that instance on Railway Hobby without point-in-time recovery. Clubs will store data of children and parents there, so the owner asked whether to start on Railway or on Google Cloud, which a note presented as the only one with ready security features. The owner chose:

1. **Production starts on Railway, plan Pro, region EU West.** This supersedes the plan part of ENG-Q-03 (Hobby). The Hobby plan's 5 GB volume limit and 7-day logs do not fit many clubs.
2. **Before the first real club data** the owner:
   - signs Railway's DPA (it is signed through DocuSign, not accepted with the terms) and links it in [`processors.md`](../../../../docs/compliance/processors.md) (P-1b);
   - records the transfer mechanism from that DPA (P-1a);
   - signs the standard DPA without changes: its Exhibit A covers the personal data a customer collects from its end users, so the members of the clubs, minors included, need no exception; a written confirmation from Railway is optional and does not hold anything up (P-1a);
   - turns on volume backups, and point-in-time recovery as soon as the production database exists: the PITR window starts with the first base backup after it is turned on, and Railway's documentation names no plan for it, so the owner confirms it in the dashboard;
   - requires two-factor sign-in for every member of the Railway workspace (Pro and above).
3. **The nightly encrypted off-site dump stays** (`docs/ops/backups.md`, ENG-Q-04). It does not depend on Railway and remains the floor for recovery. The RPO and restore drill in the runbooks change only after a PITR restore has been drilled once.
4. **The application stays portable.** It ships as one Docker image with PostgreSQL and Redis and keeps no Railway-only feature in the code path. A move to another host is a deploy and a database restore, not a rewrite.
5. **Production moves to Google Cloud in Warsaw (`europe-central2`) when any trigger fires:**
   - a club, municipality or tender requires data stored in Poland, ISO 27001 of the host, or a contractual SLA;
   - Vereino has to store health data beyond the medical certificate expiry date of D38;
   - the database outgrows what one Railway Postgres service handles comfortably, or the club count nears stage 3 of D34 (about 300 clubs), where a managed database with a standby was planned anyway.

**What Railway provides, from its pages on 2026-11-25:**

| Need | Railway |
|---|---|
| Processing agreement under GDPR art. 28 | published DPA with EU SCCs or the EU–US Data Privacy Framework for transfers; signed self-service |
| Data in the EU | services and volumes run in the chosen region; EU West is Amsterdam |
| Encryption at rest | AES-256 in every region, including volumes, volume backups, PITR archives and variables |
| Encryption in transit | TLS 1.2 or 1.3 on public endpoints, WireGuard on the private network |
| Audits | SOC 2 Type II and SOC 3; quarterly penetration tests; reports in the Trust Center |
| Backups | volume backups on daily, weekly and monthly schedules; PITR with about four weeks of WAL through pgBackRest, restored into a new sibling service; no plan is named for PITR |
| Access | two-factor sign-in on every account; enforceable for a workspace on Pro and above, though project and workspace tokens keep working without it; roles (Admin, Member, Deployer) reach every project of the workspace, and restricting an environment or project to chosen members (Environment RBAC, access groups) is Enterprise only |
| Logs | 30 days on Pro |

**Why not Google Cloud first:**

- the Railway configuration (`railway.toml`, `railway.worker.toml`, `railway.backup.toml`) and the runbooks in `docs/ops/` exist; Google Cloud would need IAM, a private network, Cloud SQL, a scheduler for the jobs and a new deploy pipeline before the first club;
- a minimal production on Google Cloud (Cloud SQL with a standby, Memorystore, the app and the worker always on) costs several times more per month than Railway Pro at a few clubs (Claude's estimate, not a pricing-calculator quote);
- what the note named as Google's advantages is either also on Railway (DPA, EU region, encryption, backups) or not needed at this scale: customer-managed keys (Cloud KMS) and automatic discovery of personal data (Cloud DLP) solve problems Vereino does not have, because it knows every field it stores and keeps only fields a requirement needs (S9.4).

**Risks the owner accepts:**

- Railway's primary processing and staff access happen in the United States; the DPA covers this with the SCCs or the Data Privacy Framework, recorded as P-1a;
- Railway's DPA is a fixed self-service text: its Exhibit A lists "Customers and Customer employees" as data subjects, but its categories of personal data include "any Personal Data Customer collects from its end users", and its definition of personal data (section 1.10) covers anything provided in connection with the services. The detailed description of the club's data subjects, minors included, belongs in the club's processing agreement (P-0), which names Railway as a sub-processor;
- the same Exhibit A lists no special categories of data (GDPR art. 9) — a description, not a prohibition. Children's data are not a special category; whether the medical certificate expiry date of D38 is health data is a question for the lawyer before that field holds real data;
- on Pro every member of the Railway workspace, whatever the role, reaches every project and environment in it, production included; who is a member of the workspace that holds production is therefore an access decision for club data;
- Railway has no ISO 27001 and no contractual SLA below its Enterprise plan;
- the security of club data rests mostly on the application: isolation between clubs (E22-S02, #628), access control and the compliance pack in `docs/compliance/`. The choice of host does not change that.

**Not decided here:**

| Topic | Where it is settled |
|---|---|
| Who signs the processing agreement with each club | open DPA signer (ENG-Q-03, P-0) |
| Whether Pro offers PITR (Railway's documentation names no plan) | the owner checks in the Railway dashboard after the upgrade |
| Whether production gets a Railway workspace of its own, apart from staging and testers | owner decision before the first real club data |
| RPO, ENG-AC-09 and ENG-TEST-09 with PITR | a follow-up after the first PITR restore drill |
| Backup bucket provider and uptime monitor | P-4 and P-5 in `processors.md` |

**Applied in:**

- ENG-Q-03: the plan part answered by this record;
- D-034: the Railway plan row of "Not decided here" is answered;
- product brief: a D39 row;
- `docs/compliance/processors.md`: P-1 on the Pro plan with the open items above;
- `docs/ops/backups.md`: the plan note.

**Sources:** [Railway security](https://docs.railway.com/enterprise/security), [Railway compliance](https://docs.railway.com/enterprise/compliance), [Railway DPA](https://railway.com/legal/dpa), [Railway Postgres backups and PITR](https://railway.com/guides/postgres-backups-restores), [Railway point-in-time recovery](https://docs.railway.com/volumes/point-in-time-recovery), [Railway two-factor enforcement](https://docs.railway.com/access/two-factor-enforcement), [Railway workspace roles](https://docs.railway.com/reference/teams), [Railway environment RBAC](https://docs.railway.com/enterprise/environment-rbac), [Railway pricing](https://railway.com/pricing), [Railway regions](https://docs.railway.com/reference/regions).

**To change:** a superseding record approved by the owner.
