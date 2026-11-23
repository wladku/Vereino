# Vereino partner programme (draft)

The implementation partner programme of decision D-035, point 6
([`D-035`](../../.ai/specs/research/decisions/D-035-agpl-core-enterprise-and-partners.md); epic E23, #646; story
E23-S04, #650). Implementation partners set up and train sports clubs on the shared Vereino Cloud (D-034) instead of
running their own forks of Vereino.

**Status: draft.** This folder is the input for the owner and the lawyer, who turn it into the partner agreement and
the published programme terms. Nothing here binds anyone until the owner approves and dates it in this status line.
D-035 fixes the direction, not the terms: every number that is still open is marked **owner decision** with an id
(`PD-…`), and all of them are listed in [Open owner decisions](#open-owner-decisions) below.

## Documents

| Document | Holds |
|---|---|
| [`tiers.md`](tiers.md) | Registered, Certified and Gold: entry requirements, what each may do, what each earns, how a partner moves up or down |
| [`certification.md`](certification.md) | the curriculum and the exam, built on the club onboarding runbook and the spreadsheet import |
| [`working-rules.md`](working-rules.md) | lead handling by region, shared cloud only, the support split between partner and Vereino, contributing upstream |
| [`trademark.md`](trademark.md) | what "Vereino" and "Vereino Partner" may and may not be used for; forks are not sold as Vereino |
| [`agreement-outline.md`](agreement-outline.md) | the headings of the partner agreement, for the lawyer |

## The programme in one paragraph

A company or a freelancer that wants to sell set-up, data import, training and first-line support to clubs takes the
Vereino training and passes the exam. It then becomes a **Registered** partner: it may call itself a "Vereino Partner",
it sets clubs up on the shared Vereino Cloud, keeps all of its own service fees and earns a recurring share of the
subscriptions of the clubs it serves. A partner with a track record becomes **Certified**: it may also configure clubs
more deeply and build its own modules, and it receives leads from the Vereino site for its region. A **Gold** partner
also runs dedicated instances for municipalities and resells Vereino Enterprise. The Vereino company keeps the core,
the cloud, second- and third-line support, security and certification.

## Fixed by D-035 (not open here)

- The core is AGPL-3.0-only; Vereino Enterprise is a separate commercial package switched on per tenant
  (D-035 points 1–2).
- Outside contributions, partners' included, go under a CLA in addition to the DCO sign-off (D-035 point 3, #648).
- "Vereino" is a registered trademark; partner certification is a licence to use the name; forks may not be sold as
  Vereino (D-035 point 5).
- Partners work on the shared Vereino Cloud, not on their own forks (D-035 point 6; D-034).
- The three tiers and their direction (D-035 point 6 table).
- The order: the full partner programme comes after the price list, the founding clubs and a pilot with one or two
  partners at about 15–20 clubs or the first municipality (D-035, "The order").

## Open owner decisions

Every open number or choice in this folder, in one list. The owner decides them later; the lawyer needs the ones
marked *agreement* before the agreement can be signed.

| Id | Decision | Where | Needed for |
|---|---|---|---|
| PD-01 | Recurring share of the club subscription for a Registered partner (D-035 direction: about 20–25 %) | [`tiers.md`](tiers.md) | agreement |
| PD-02 | Recurring share for a Certified partner ("a higher share") | [`tiers.md`](tiers.md) | agreement |
| PD-03 | Gold margin on Enterprise licences, and its share of the subscriptions of clubs on dedicated instances | [`tiers.md`](tiers.md) | agreement |
| PD-04 | Partner fees: a programme fee per tier (yearly, or none) and the certification and exam fee | [`tiers.md`](tiers.md), [`certification.md`](certification.md) | agreement |
| PD-05 | How long the recurring share lasts per club (for the life of the subscription, or a fixed number of years) what happens to it when the partner leaves, and how often it is paid out (monthly or quarterly) | [`tiers.md`](tiers.md) | agreement |
| PD-06 | Entry thresholds for Certified and Gold (clubs served, months as a partner, certified people) and the grace period before a partner moves down | [`tiers.md`](tiers.md) | programme terms |
| PD-07 | Exam pass mark, number of attempts, and how often certification is renewed | [`certification.md`](certification.md) | programme terms |
| PD-08 | The regions leads are routed by (voivodeships, groups of them, or countries) and how many Certified partners one region takes | [`working-rules.md`](working-rules.md) | programme terms |
| PD-09 | Lead response and acceptance times, and what happens to a lead that is not taken up | [`working-rules.md`](working-rules.md) | programme terms |
| PD-10 | Support response times of the partner (first line) and of Vereino (second and third line) | [`working-rules.md`](working-rules.md) | agreement |
| PD-11 | Whether a partner may bill the club for the subscription itself (reseller) or the club always pays Vereino directly | [`tiers.md`](tiers.md), [`working-rules.md`](working-rules.md) | agreement |
| PD-12 | Whether a partner's own modules may be closed (an Enterprise-style commercial licence from Vereino) or must be published under AGPL | [`working-rules.md`](working-rules.md) | agreement |
| PD-13 | Partner logo: its artwork, and whether the tier is shown on it | [`trademark.md`](trademark.md) | programme terms |
| PD-14 | The legal entity that signs the partner agreement (shared with the CLA and Enterprise, #626, #648) | [`agreement-outline.md`](agreement-outline.md) | agreement |

## Out of scope

The legal agreement itself (the lawyer writes it from [`agreement-outline.md`](agreement-outline.md)); a partner portal;
prices of the Vereino Cloud subscription and of Enterprise (owner decisions of their own, D-035 "Not decided here").
