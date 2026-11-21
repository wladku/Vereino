# Processor and recipient register

> **Status: draft — not approved.** Approved by the product owner on: _(date)_. Next review: _(approval date + 12
> months, or earlier when a processor, region or plan changes)_.

Engineering standards S9.1 and S9.7; GDPR art. 28 (processors) and art. 30(1)(d)–(e) (recipients, transfers). Hosting
facts come from the owner decisions ENG-Q-03, ENG-Q-04 and ENG-Q-05 (epics #460 and #461) and the runbooks in
[`docs/ops/`](../ops/). It is not legal advice.

## Roles

| Who | Role | For what |
|---|---|---|
| The club (the pilot club's association) | **controller** (S9.1) | its members', guardians', staff's and renters' data |
| The host — the product owner, who runs and pays for the Railway project (ENG-Q-03) | **processor** of the club | runs the instance, the backups and the monitoring; the processors below are the host's **sub-processors** |
| Stripe | **independent controller** for payment data (S9.7, ADR-010) | the club's own Stripe account; Vereino stores no card data (S10.8) |

**Open item P-0 (blocks the pilot data gate):** who signs the data processing agreement with the club is not decided
(ENG-Q-03, epic #461). Until it is signed, the club must not enter real people. The DPA itself is out of scope of this
register (#468). The DPA must list the sub-processors below and the club's right to object to a new one (GDPR art.
28(2), (4)).

## Register

"Confirmed" means the fact comes from an owner decision or a file in this repository; anything taken from a vendor's
public pages and not yet checked against the signed terms is marked **to confirm**. A processor whose region is not
known is an **open item**, never assumed (#468 negative case).

| # | Recipient | Role | Data it can see | Region | Transfer outside the EEA and mechanism | DPA | Review date |
|---|---|---|---|---|---|---|---|
| P-1 | **Railway** (Railway Corporation) — app, worker, PostgreSQL 17, Redis; Hobby plan, no PITR | sub-processor | everything Vereino stores ([`ropa.md`](ropa.md)); application logs (7 days on Hobby, [`monitoring.md`](../ops/monitoring.md)) | **EU West** (ENG-Q-03, [`deploy.md`](../ops/deploy.md)); the physical location of the region is **to confirm** in the project settings | the vendor is a US company, so its staff or support access is a transfer: **open item P-1a** — confirm the mechanism (EU–US Data Privacy Framework certification or the standard contractual clauses) from Railway's DPA | **open item P-1b** — accept Railway's DPA for the account and link it here | _(on approval)_ |
| P-2 | **Resend** — outbound e-mail (`SYSTEM_EMAIL_PROVIDER`, `RESEND_API_KEY`, [`deploy.md`](../ops/deploy.md)) | sub-processor | recipient address, name in the greeting, subject and body of each message (links, receipts, announcements); delivery status | sending region **`eu-west-1`** (S12.1); where the vendor stores logs and account data is **to confirm** | the vendor is a US company: **open item P-2a** — confirm the mechanism from Resend's DPA | **open item P-2b** — accept Resend's DPA and link it here | _(on approval)_ |
| P-3 | **Stripe** — online payments of charges and orders (`gateway_stripe`, S10.8) | **independent controller** (not a processor) | payer name and e-mail, amount, the charge or order id in `metadata`; card or Przelewy24/BLIK data are entered on Stripe's side only | the contracting entity for a Polish account is **to confirm** when the club's account is opened (Stripe's terms name an EEA entity for EEA accounts) | Stripe's own terms and privacy policy, as controller: **to confirm** at account opening | not applicable (independent controller); the club accepts Stripe's services agreement | at account opening |
| P-4 | **Off-site backup storage** — S3-compatible bucket at a second EU provider ([`backups.md`](../ops/backups.md), ENG-Q-04) | sub-processor | the nightly `pg_dump`, encrypted with `age` before upload; the private key is held only by the owner and a second person, never by the provider | **open item P-4** — the provider is **not chosen yet**; the decision requires an EU region | **open item P-4** — not known until the provider is chosen | **open item P-4** | when chosen |
| P-5 | **Uptime monitor** — HTTP checks and heartbeats ([`monitoring.md`](../ops/monitoring.md), ENG-Q-05) | recipient; a sub-processor only if it sees personal data | the URLs of `/api/healthz`, `/login` and `/p/<club-slug>` and their responses (no personal data on these pages, S8.6); heartbeat pings carry no payload; alert e-mails and phone numbers of the two maintainers | **open item P-5** — the vendor is **not chosen yet** (candidates in [`monitoring.md`](../ops/monitoring.md)); prefer an EU data region | **open item P-5** | **open item P-5** — needed only if it can see personal data | when chosen |

### Recipients that are not processors of the host

| Recipient | Basis | What they receive |
|---|---|---|
| The club's accountant or bookkeeping office | the club's own engagement (club spec Q-034) | exports of payments, cash receipts and handovers, as the club decides |
| The club's bank | the club's own account | nothing from Vereino; the treasurer imports the bank's statement file into Vereino (`payments_bank_imports`) |
| Public authorities (UODO, tax office, courts) | legal obligation, on request | only what the request requires; entered in the data-subject or breach register when it concerns a person |

### Not recipients

- **GitHub** holds the source code, issues and CI logs. Staging uses synthetic data only (S15.10) and runbooks forbid
  copying production data there; no personal data of club members goes to GitHub.
- **Open Mercato** is installed software running inside Railway; its vendor receives no data.
- No analytics, error-tracking, tracing or log vendor is used in 1.0 (ENG-Q-05, S15.3, S9.9). Adding one is a spec
  change and a new row here before it receives data.
- Social sign-in (`.ai/specs/2026-10-27-vereino-social-sign-in.md`) is not enabled in 1.0; each identity provider
  becomes a row here when it is.

## Open items

| Id | What | Who | Blocks |
|---|---|---|---|
| P-0 | Decide who signs the DPA with the club and sign it | product owner, club board | pilot data gate |
| P-1a, P-1b | Railway: confirm the region's location, the transfer mechanism, accept the DPA | product owner | pilot data gate |
| P-2a, P-2b | Resend: confirm storage location, the transfer mechanism, accept the DPA | product owner | pilot data gate |
| P-3 | Stripe: record the contracting entity and terms when the club's account is opened | club treasurer, product owner | online payments |
| P-4 | Choose the backup provider (EU region), record region and DPA | product owner | first production backup |
| P-5 | Choose the uptime monitor, record region; decide whether it is a processor | product owner | production monitoring |

## How to change this register

A new processor, a new region or a plan change is a pull request that edits this file before the change goes live,
updates the review date, and informs the club (art. 28(2)).
