---
number: D-035
date: 2026-11-22
owner: Władek Kuć
source: the owner's choice of 2026-11-22 in a Claude Code session ("AGPL + Enterprise"), after comparing MIT, AGPL and open-core projects (GitLab, Odoo, Cal.com, Grafana, Open Mercato) for an open-core model with implementation partners; recorded with epic E23 (#646)
status: confirmed
---
# D-035 AGPLv3 core, a commercial Vereino Enterprise and a network of implementation partners

D12 chose the MIT licence with the repository. D-034 makes Vereino a hosted service for many clubs, which the owner wants to grow through implementation partners. Under MIT, a partner or competitor may take the code, rename it, host it cheaper and keep its changes closed. The owner chose open core:

1. **The core moves from MIT to AGPL-3.0-only** from the next release. The core is everything in this repository, and so everything a small club needs:
   - people, groups, calendar, attendance and declarations;
   - communication;
   - payments through Stripe;
   - the facility basics;
   - the public page and the spreadsheet import;
   - the GDPR tools (export, anonymisation).

   Anyone who serves a modified Vereino over a network must publish the changes. Releases already published under MIT stay MIT. All commits so far are the owner's, so no other author has to agree.
2. **Vereino Enterprise is commercial.** It is a separate private package (`@vereino/enterprise`), loaded as Open Mercato modules and switched on per tenant by a licence key, the same pattern as `@open-mercato/enterprise` (ADR-023). It holds what organisations with a budget need:
   - municipality and sports-centre views over many facilities and clubs;
   - grant settlement (N07 stays a 1.0 non-goal);
   - accounting and KSeF, bank statement matching, PZPN and SMS integrations;
   - SSO, audit log export and federation reports;
   - dedicated instances with an SLA.

   Nothing a small club needs to run, and no legal duty such as GDPR, moves into Enterprise.
3. **Contributions go under a contributor licence agreement (CLA)** that allows dual licensing, in addition to the DCO sign-off. This supersedes ADR-022's "DCO, not CLA". The CLA must be in place before the first outside contribution is merged; a lawyer writes its text.
4. **Third-party dependencies stay permissive.** The licence check keeps rejecting copyleft packages, so the owner can still license the code commercially.
5. **The name "Vereino" is registered as a trademark** (EUIPO or the Polish patent office). Partner certification is a licence to use the name. Forks may not be sold as Vereino.
6. **Implementation partners** set up and train clubs on the shared Vereino Cloud (D-034) instead of running their own forks. The direction, not final terms:

   | Tier | What the partner does | What the partner earns |
   |---|---|---|
   | Registered | after training and an exam: set-up, data import, training, first-line support | keeps 100% of its service fees, plus a recurring share of the subscriptions of the clubs it serves (about 20–25%) |
   | Certified | the same, plus configuration and own modules | a higher share and regional leads |
   | Gold | dedicated instances for municipalities, Enterprise resale | a margin on Enterprise licences |

   The Vereino company keeps the core, the cloud, second- and third-line support, security and certification.

The order is: licence, CLA and trademark now; the price list and founding clubs with the first four clubs; the first Enterprise module and a pilot with one or two partners at about 15–20 clubs or the first municipality; the full partner programme later.

**Why:** AGPL is the usual licence of open-core companies that run their own cloud (Cal.com, Grafana since 2021, Plausible, Nextcloud). It keeps a hosted fork from competing with closed changes, and it gives the owner a commercial licence to sell to anyone who wants to keep an extension closed. The trademark and the CLA protect the model more than the licence text alone. Changing now is cheap: there is a single author and no outside contributor yet.

**Not decided here:**
- partner commission and fees;
- Enterprise prices;
- the legal entity that signs the CLA, partner and Enterprise agreements;
- a lawyer's opinion on copyright in agent-written code. This affects any licence, MIT included.

**Applied in:**
- product brief: D12's licence part superseded, D35 added, the What-it-is line updated;
- business case: licence lines;
- epic E23 (#646) with stories #647 (relicensing), #648 (CLA), #649 (Enterprise package), #650 (partner programme).

**To change:** a superseding record approved by the owner.
