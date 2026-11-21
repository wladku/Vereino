# Personal-data breach register

> **Status: draft — not approved.** Approved by the product owner on: _(date)_.

Engineering standards S9.8; GDPR art. 33(5) ("The controller shall document any personal data breaches"); the breach
path in [`docs/ops/incident.md`](../ops/incident.md#personal-data-breach-path-s98). It is not legal advice.

## Rules

- **Every** incident that touched personal data is entered — notified to UODO or not, and whether the people affected
  were informed or not (S9.8).
- **No personal data in this file.** Describe categories and counts ("about 40 guardians' e-mail addresses"), never
  names, addresses, ids that point to one person, or log excerpts. Evidence (exported log lines, screenshots) is kept
  in the team password manager's secure notes or an encrypted file outside the repository, and the entry names only
  where it is.
- The entry is opened as soon as a breach is suspected (SEV1 in `incident.md`) and updated as the facts settle; the
  **72 hours** for notifying UODO count from awareness (art. 33(1)).
- Until the data processing agreement is signed (ENG-Q-03, [`processors.md`](processors.md) P-0), the host follows
  both the processor's and the controller's column of the breach path and tells the club without undue delay
  (art. 33(2)); the club keeps this register as controller and the host enters what it knows.
- An entry is closed with the post-incident review of `incident.md`.

## Fields

| Field | What to write |
|---|---|
| Id | `BR-YYYY-NN` |
| Became aware | date and time (UTC) and how (alert, user report, provider notice) |
| Occurred | date and time (UTC), or the window, if known |
| Nature | confidentiality, integrity or availability breach; what happened, in a sentence |
| Data and people | categories of data and of people; approximate number of people and of records |
| Likely consequences | for the people affected |
| Measures | taken and proposed, to address it and to mitigate the effects |
| Risk assessment | none / risk / high risk, with the reason |
| UODO notified | when and the reference, or why not (art. 33(1)) |
| People informed | when and how, or why not (art. 34(1), (3)) |
| Decided by | role (club board member, host), not a name if the decision record holds it |
| Closed | date and the link to the post-incident review |

## Entries

| Id | Became aware | Occurred | Nature | Data and people | Likely consequences | Measures | Risk | UODO notified | People informed | Decided by | Closed |
|---|---|---|---|---|---|---|---|---|---|---|---|

_No entries. The register starts empty: no real person's data has been entered yet (pilot data gate, ENG-09)._
