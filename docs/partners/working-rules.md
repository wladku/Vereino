# Working rules (draft)

How partners and Vereino work together day to day. Open numbers are **owner decisions** (`PD-…`, listed in
[`README.md`](README.md)).

## 1. Shared Vereino Cloud, no forks

- A partner sets clubs up on the **shared Vereino Cloud**: one instance for many clubs, one tenant per club (D-034;
  the many clubs spec, DD-M01). It does not run Vereino for clubs on its own servers or a fork (D-035 point 6).
- **Creating the club.** The `club_core create-club` command runs on the production shell, which only Vereino's
  operators reach ([`docs/ops/clubs.md`](../ops/clubs.md), step 1). The partner collects the club's details
  (runbook, *Before you start*), checks that the club's agreements are signed and sends a club request to Vereino;
  Vereino runs the dry run and the command and returns the result and the club address. When a self-service or
  partner tool replaces this, the rule stays: clubs are created on the cloud, through Vereino's own process.
- **Everything after creation** (runbook steps 4–5: hand-over, settings, structure, groups, import, fees, coaches,
  publishing the page) the partner does together with the club's administrator, inside the club's own panel, with an
  account the club grants it. The partner never holds a superadmin account of the instance.
- **Dedicated instances (Gold only).** A municipality or a sports centre that needs its own instance gets one from
  Vereino's own deployment, on the same releases as the cloud. The Gold partner sells, configures and supports it;
  Vereino operates the platform, the releases, the backups and security. Running a modified Vereino elsewhere is a
  fork, not a dedicated instance.
- **Why.** One code line keeps every club on the same releases, security fixes and backups, keeps the data protection
  set-up in one place, and keeps the name meaning one product ([`trademark.md`](trademark.md)).

## 2. Lead handling by region

Leads are clubs that ask about Vereino on the Vereino site (`vereino.org`, D-036) and want help to start.

1. **The form.** The site's contact form asks the club's name, its town and voivodeship (or country), the number of
   members, the sport, and whether it wants a partner or to start on its own. It collects the contact person's name,
   e-mail and phone with a privacy notice; Vereino is the controller of the lead data.
2. **The region.** Each lead gets a region from its voivodeship. Regions are *PD-08* (each voivodeship, groups of
   voivodeships, or countries outside Poland), and so is the number of Certified partners one region takes.
3. **Routing.**
   - A Certified or Gold partner registered for the region gets the lead. With more than one, leads go round in turn;
     a club that names a partner gets that partner.
   - A municipality or sports-centre lead goes to a Gold partner of the region, or to Vereino when there is none.
   - With no partner in the region, the lead goes to Vereino, which serves the club itself or offers it to the nearest
     region's partner.
   - A club that wants to start on its own is never routed to a partner.
4. **Accepting.** The partner accepts or declines the lead within *PD-09* and contacts the club within *PD-09* after
   accepting. A lead not accepted in time goes to the next partner in turn, then to Vereino.
5. **Outcome.** The partner reports whether the club signed. A club that signs is attributed to the partner
   ([`tiers.md`](tiers.md), *Common rules*). Lead data is kept only as long as the lead is open plus the period in
   Vereino's retention schedule ([`docs/compliance/retention.md`](../compliance/retention.md), to be extended for leads).
6. **Until a partner portal exists** (out of scope), leads are sent by e-mail from the form's inbox and tracked by
   Vereino in a simple register.

Registered partners get no leads from the site; they bring their own clubs and appear in the public partner
directory, where a club may contact them directly.

## 3. Support split

| Line | Who | What |
|---|---|---|
| **First line** | the partner, for the clubs it serves | how-to questions from the club's administrators and coaches; configuration within the partner's tier; the import; checking whether a problem is the club's data, its settings or the product; collecting a reproducible report |
| **Second line** | Vereino | product defects, failures of the cloud, anything that needs access beyond the club's panel (for example re-sending an expired invitation with the finish command of the runbook), data protection requests that need the operator |
| **Third line** | Vereino (maintainers) | code fixes, security issues, incidents ([`docs/ops/incident.md`](../ops/incident.md)) |

- **Escalating.** The partner escalates through Vereino's support address (later the partner portal) with the club
  address, what happened, when, the steps to reproduce and screenshots without personal data. Never a password, a
  PESEL or a full export.
- **Response times.** The partner's first-line times towards its clubs and Vereino's second- and third-line times
  towards the partner are *PD-10*. Until they are set, Vereino's pilot objective applies: best effort in Polish
  working hours, a response within one working day ([`docs/ops/incident.md`](../ops/incident.md), *Service level
  objectives*).
- **Clubs without a partner** get first-line support from Vereino.
- **Security and incidents** are always Vereino's: a partner that suspects a breach or a vulnerability reports it to
  Vereino at once and does not disclose it.

## 4. Contributing upstream

- A partner that fixes a defect or improves the core sends it as a pull request to the Vereino repository, signed off
  (DCO, `git commit -s`) and under the CLA (D-035 point 3, #648). It does not keep core changes in a private copy.
- **Partner modules.** A Certified or Gold partner may build modules for its clubs. On the shared cloud every module
  is reviewed and deployed by Vereino. Whether a partner module may stay closed under a commercial licence from
  Vereino or must be published under AGPL is *PD-12*; until it is decided, a partner module that runs on the cloud is
  contributed upstream under the CLA.
- Contributions follow the repository's own rules (`AGENTS.md`, `SDLC.md`): English in code and docs, Polish and
  English catalogs for every text, tests.
- Contributions count towards the annual tier review ([`tiers.md`](tiers.md)).

## 5. Other duties

- **Billing.** The club pays its subscription to Vereino and the partner's services to the partner, unless the owner
  allows partners to resell the subscription (*PD-11*). A partner never changes the club's subscription terms.
- The partner treats the club's data as a processor under the agreement and the data protection rules taught in
  certification module I-7; it keeps the club's data only inside Vereino.
- The partner follows the release window of the cloud ([`docs/ops/deploy.md`](../ops/deploy.md)) when it plans
  training or imports.
- The partner uses the name and the logo only under [`trademark.md`](trademark.md).
