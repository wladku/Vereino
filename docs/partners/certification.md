# Certification (draft)

Certification is how a person learns to set clubs up on Vereino and how Vereino checks that they can. Under D-035
point 5 it is also the licence to use the name: only an organisation with certified people may call itself a Vereino
Partner ([`trademark.md`](trademark.md)). Open numbers are **owner decisions** (`PD-…`, listed in
[`README.md`](README.md)).

The curriculum follows what a club actually goes through: the onboarding runbook
([`docs/ops/clubs.md`](../ops/clubs.md), E22-S04, #630) and the spreadsheet import (D23; club management spec REQ-036;
#28). When either changes, the curriculum and the exam questions change with it in the same pull request.

## Certificates

| Certificate | For | Required by tier | Builds on |
|---|---|---|---|
| **Vereino Implementer** | the person who sets a club up, imports its data, trains it and gives first-line support | Registered (one person), Certified and Gold (two people) | — |
| **Vereino Consultant** | the person who configures clubs beyond the defaults and builds modules | Certified (one person) | Implementer |
| **Vereino Gold track** | the person who runs dedicated instances and sells Enterprise | Gold (one person) | Consultant |

A certificate belongs to a person, not to the partner; when the person leaves, the partner has *PD-06* months to
certify someone else before its tier is reviewed ([`tiers.md`](tiers.md)).

## Curriculum — Vereino Implementer

| Module | Content | Source |
|---|---|---|
| I-1 What Vereino is | the product and who it serves; the core and Enterprise (D-035); the shared Vereino Cloud and one tenant per club (D-034); club addresses `{club}.vereino.org` and own domains (D-036) | product brief; D-034; D-035; D-036 |
| I-2 Before the club is created | the club's agreements (service agreement and GDPR art. 28 data processing agreement) and that nothing runs before they are signed; collecting the club's data safely (name, slug, first administrator, time zone, language — by e-mail, never in a ticket or chat); choosing a slug: allowed characters, length, reserved names | runbook, *Before you start* |
| I-3 Creating the club | what `club_core create-club` does and what it prints, the dry run, the results table (`created`, `exists`, `incomplete`, `refused`), a run that stopped halfway, the 48-hour invitation and how to have it re-sent. Partners do not run the command themselves; they request it from Vereino and read the result ([`working-rules.md`](working-rules.md)) | runbook, steps 1–3 and *A run that stopped halfway* |
| I-4 Hand-over and first steps | the administrator's first steps in order: password, club settings, structure (sections, places, institutions, season, age categories), groups **before** the import, fees and discounts, coaches and their accounts, publishing the club page, the first coach signing in | runbook, steps 4–5 |
| I-5 Importing the club's spreadsheet | the file (CSV or XLSX, at most 5 MB and 1,000 rows, one row per participant with up to two guardians); preparing a club's real sheet; column mapping; the preview statuses `new`, `matched`, `review`, `error` and what to do with each; commit and undo; re-importing with the identifier column; the 30-day purge of staged rows | runbook, step 5; D23; REQ-036 |
| I-6 Training the club | a model training session for administrators and one for coaches (attendance on the phone, declarations, messages); the member and parent view | the app; product brief key flows |
| I-7 Data protection in practice | the partner's role as processor; least access; never exporting personal data to the partner's own tools; data-subject requests go to the club and Vereino's procedure; reporting a suspected breach to Vereino at once | [`docs/compliance/`](../compliance/README.md) |
| I-8 First-line support | what the partner answers and what it escalates; how to escalate to Vereino with a reproducible report and without personal data; the release window | [`working-rules.md`](working-rules.md); [`docs/ops/incident.md`](../ops/incident.md); [`docs/ops/deploy.md`](../ops/deploy.md) |
| I-9 The name and the licence | AGPL in one page; the trademark guidelines; what the partner may and may not say | [`trademark.md`](trademark.md) |

## Curriculum — Vereino Consultant (adds to Implementer)

| Module | Content |
|---|---|
| C-1 Configuration | roles and features (`vereino_*` roles), dictionaries, custom fields, fees and discount rules, notification settings, club page blocks |
| C-2 The platform underneath | Open Mercato modules, extension points (UMES), what may be changed without a fork |
| C-3 Building a module | module layout, commands, events, i18n in Polish and English, tests; the contribution rules and the CLA ([`working-rules.md`](working-rules.md)) |
| C-4 Upgrades | how releases reach the cloud; keeping a partner module compatible; backward-compatibility rules |

## Curriculum — Gold track (adds to Consultant)

| Module | Content |
|---|---|
| G-1 Dedicated instances | how a dedicated instance is provisioned and who operates what ([`working-rules.md`](working-rules.md)); backups, monitoring, incident duties, SLA |
| G-2 Vereino Enterprise | what Enterprise contains (D-035 point 2); licence keys per tenant; selling to municipalities and sports centres |
| G-3 Public-sector buyers | procurement basics, data processing agreements with a municipality, reference projects |

## Exam

| | Implementer | Consultant | Gold track |
|---|---|---|---|
| **Theory** | online test on modules I-1 to I-9, with questions taken from the runbook's tables (results, statuses, limits) | online test on C-1 to C-4 | interview with Vereino |
| **Practical** | on a training tenant: request a club with a correct dry run, complete the first steps, import a prepared sheet that contains `matched`, `review` and `error` rows and resolve every row, add a coach who signs in | configure a club for a given brief and build a small module with tests, reviewed by Vereino | a written plan for one municipality: instances, support, Enterprise, data protection |
| **Pass mark** | *PD-07* | *PD-07* | *PD-07* |
| **Attempts and retake** | *PD-07* | *PD-07* | *PD-07* |
| **Fee** | *PD-04* | *PD-04* | *PD-04* |

The practical part runs on a training tenant of the Vereino Cloud, never on a real club, with the demo data only.

## Validity and renewal

- A certificate is valid for *PD-07* (for example one year) and lapses unless renewed.
- Renewal is a short test on what changed in the runbook, the import and the product since the last certificate.
- A certificate is withdrawn for misuse of the trademark or a serious breach of the working rules ([`tiers.md`](tiers.md),
  *Out*).

## To build later (not in this story)

- the course material itself (slides, videos, the training tenant and its prepared import sheets);
- the question bank;
- where the exam runs (no partner portal in this story).
