# Partner tiers (draft)

Three tiers, from D-035 point 6. Open numbers are **owner decisions** (`PD-…`, listed in [`README.md`](README.md)).
A partner is an organisation (a company or a sole trader); the people who work for it are certified one by one
([`certification.md`](certification.md)).

## The tiers

| | Registered | Certified | Gold |
|---|---|---|---|
| **Entry requirements** | signed partner agreement; at least one person who passed the Vereino Implementer exam; accepts the working rules and the trademark guidelines | Registered for at least *PD-06* months; at least *PD-06* clubs live on the cloud and served by the partner; at least two certified people, one of them a Vereino Consultant (configuration and modules exam); no open breach of the working rules | Certified for at least *PD-06* months; at least *PD-06* clubs served; a dedicated-instance operator who passed the Gold track; agreed support capacity in writing; at least one municipality or sports-centre reference |
| **May do** | set clubs up on the shared Vereino Cloud with the onboarding runbook; import the club's data; train the club's administrators and coaches; first-line support for the clubs it serves; call itself "Vereino Partner" | all of Registered, plus: configure clubs beyond the defaults (roles, fees, dictionaries, custom fields, settings); build its own Vereino modules within [`working-rules.md`](working-rules.md); call itself "Vereino Certified Partner" | all of Certified, plus: set up and run dedicated instances for municipalities and sports centres (with Vereino operating the platform underneath, see [`working-rules.md`](working-rules.md)); resell Vereino Enterprise; call itself "Vereino Gold Partner" |
| **May not do** | run Vereino for clubs outside the Vereino Cloud; sell or host a fork; change the club's subscription terms | the same; publish a module as part of Vereino or under the Vereino name | the same; sell Enterprise below the price floor Vereino sets (with *PD-03*) |
| **Earns** | 100 % of its own service fees (set-up, import, training, support it sells); a recurring share of the subscriptions of the clubs it serves: *PD-01* | 100 % of its service fees; a higher recurring share: *PD-02*; leads from the Vereino site for its region ([`working-rules.md`](working-rules.md)) | 100 % of its service fees; the Certified share on cloud clubs; a margin on Enterprise licences it sells: *PD-03* |
| **Pays** | programme fee *PD-04* (or none); exam fee *PD-04* | programme fee *PD-04* | programme fee *PD-04* |
| **Listed on the Vereino site** | yes, in the partner directory | yes, marked Certified, and in the lead routing of its region | yes, marked Gold, also on the municipality page |

## Common rules for every tier

- **Who is the club's customer.** The club signs the Vereino Cloud service agreement and the data processing agreement
  with Vereino (onboarding runbook, [`docs/ops/clubs.md`](../ops/clubs.md), *Before you start*). The partner signs its
  own service contract with the club for its services. Whether a partner may instead bill the subscription to the club
  and pay Vereino (a reseller model) is **owner decision PD-11**; until it is decided, the club pays Vereino directly
  and Vereino pays the partner its share.
- **Which clubs count as the partner's.** A club is attributed to the partner that set it up, recorded in the club's
  onboarding issue when the club is created. A club may move to another partner or to Vereino on its own request; the
  share follows the club from the next billing period.
- **How long the share lasts.** *PD-05*: for the life of the subscription, or a fixed number of years; and whether it
  continues after the partner leaves the programme.
- **Paid on what.** The share is calculated on subscription payments Vereino actually received from the club, net of
  VAT and refunds, and paid out *PD-05* (monthly or quarterly) against the partner's invoice.
- **Data protection.** A partner who accesses a club's data acts as a sub-processor of Vereino or as the club's own
  processor; the agreement and the processor register ([`docs/compliance/processors.md`](../compliance/processors.md))
  must say which, before the partner's first club (question for the lawyer, see
  [`agreement-outline.md`](agreement-outline.md)).

## Moving up, staying, moving down

- **Up.** The partner applies; Vereino checks the requirements of the next tier and decides within a stated time. No
  tier is skipped.
- **Review.** Once a year Vereino checks each partner against its tier: certified people still valid
  ([`certification.md`](certification.md)), clubs served, support complaints, trademark use.
- **Down.** A partner that no longer meets its tier's requirements keeps its tier for a grace period, then moves one
  tier down (the grace period is part of *PD-06*). Clubs already served keep their partner.
- **Out.** A serious breach (selling a fork as Vereino, a data breach the partner caused and did not report, repeated
  misuse of the trademark) ends the partnership under the agreement's termination clause. The clubs are offered
  support directly from Vereino or from another partner.
