# Partner agreement — outline for the lawyer (draft)

The headings of the partner agreement, with what each must say and where in this folder the business terms come
from. The lawyer writes the text; this outline is not an agreement. Open numbers are **owner decisions** (`PD-…`,
listed in [`README.md`](README.md)).

| # | Heading | Contents | Source |
|---|---|---|---|
| 1 | Parties | the Vereino legal entity (*PD-14*; shared with the CLA and Enterprise, #626, #648) and the partner | — |
| 2 | Definitions | Vereino, Vereino Cloud, club, tenant, core, Vereino Enterprise, dedicated instance, fork, lead, region, certified person, tier, service fees, subscription share | [`README.md`](README.md) |
| 3 | Appointment and tier | non-exclusive appointment as a partner of a named tier; no agency, no right to act in Vereino's name; how a tier changes | [`tiers.md`](tiers.md) |
| 4 | Partner duties | certified people kept valid; clubs set up only on the Vereino Cloud (or a Vereino-operated dedicated instance); club requests through Vereino's process; first-line support; release window | [`working-rules.md`](working-rules.md) §1, §3, §5 |
| 5 | Vereino duties | the cloud, releases, backups, security, second- and third-line support, certification and training material, partner directory, leads | [`working-rules.md`](working-rules.md) §1–§3 |
| 6 | Leads | routing by region, acceptance times, outcome reporting, no exclusivity of a region unless agreed | [`working-rules.md`](working-rules.md) §2; *PD-08*, *PD-09* |
| 7 | Clubs and billing | the club contracts with Vereino for the subscription and the DPA, and with the partner for services; attribution of a club to a partner; a club moving to another partner; reselling only if *PD-11* allows it | [`tiers.md`](tiers.md), *Common rules* |
| 8 | Fees, shares and payment | programme and exam fees (*PD-04*); subscription share per tier (*PD-01*, *PD-02*); Enterprise margin and price floor (*PD-03*); basis (received, net of VAT and refunds), duration and payout (*PD-05*); invoices, taxes, currency | [`tiers.md`](tiers.md) |
| 9 | Service levels | partner first-line times; Vereino second- and third-line times (*PD-10*); SLA of dedicated instances for Gold | [`working-rules.md`](working-rules.md) §3 |
| 10 | Data protection | the partner's role per processing (sub-processor of Vereino or processor of the club) and the art. 28 terms; access only through the club's panel; breach notification to Vereino without delay; entry in the processor register | [`working-rules.md`](working-rules.md) §5; [`docs/compliance/processors.md`](../compliance/processors.md) |
| 11 | Confidentiality and security | confidential information, vulnerability reporting, no disclosure before a fix | [`working-rules.md`](working-rules.md) §3 |
| 12 | Intellectual property and licences | the core under AGPL-3.0-only; contributions under the CLA and the DCO; partner modules (*PD-12*); Enterprise licences resold by Gold partners under Vereino's EULA | [`working-rules.md`](working-rules.md) §4; D-035 points 1–3 |
| 13 | Trademark licence | a non-exclusive, non-transferable licence to the partner titles and logo for the term; the guidelines as an annex; correcting misuse | [`trademark.md`](trademark.md) |
| 14 | Non-compete on forks | no fork offered as Vereino or competing with the cloud for the partner's clubs during the term (scope and duration for the lawyer to judge against competition law) | D-035 point 6 |
| 15 | Liability and warranties | caps; no warranties given in Vereino's name; each party liable for its own services | — |
| 16 | Term and termination | term and renewal; termination for convenience with notice; termination for breach (see [`tiers.md`](tiers.md), *Out*); what happens to the clubs, the share and the titles after termination | [`tiers.md`](tiers.md); *PD-05* |
| 17 | Changes to the programme | how Vereino changes tiers, fees and guidelines with notice | — |
| 18 | Governing law and disputes | Polish law and courts (to confirm), language of the agreement | — |
| Annex A | Tiers and fees | the tiers table and the decided *PD-…* numbers | [`tiers.md`](tiers.md) |
| Annex B | Certification | certificates, exam, renewal | [`certification.md`](certification.md) |
| Annex C | Working rules | leads, support, contributions | [`working-rules.md`](working-rules.md) |
| Annex D | Trademark guidelines | | [`trademark.md`](trademark.md) |
| Annex E | Data processing agreement | | lawyer |

## Questions for the lawyer

1. The partner's data protection role (heading 10): sub-processor of Vereino, processor of the club, or both
   depending on the task.
2. Whether a non-compete on forks (heading 14) is enforceable, given that the code is AGPL and anyone may fork it.
3. Whether the trademark licence may be granted before the registration is complete, and how.
4. How the subscription share is best structured for tax (commission against an invoice, or a reseller discount if
   *PD-11* allows reselling).
5. The lawyer's opinion on copyright in agent-written code (D-035 "Not decided here"), as it affects what Vereino
   licenses to partners.
