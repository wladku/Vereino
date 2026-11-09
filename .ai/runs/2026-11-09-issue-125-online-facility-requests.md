# Run — issue #125: online facility requests (E08-S05)

- **Goal and trigger:** cezar task 7e3a3515 (`om-auto-fix-issue 125`), unattended. Build facilities spec phase 5 step 6 — the public request form (P-04), the e-mail confirmation (P-05), the 48-hour hold, the approval queue (B-25) with approval, rejection, expiry and supersession e-mails, and the B-01 widget (REQ-024, TEST-035, TEST-036, TEST-039).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (Ready for implementation, phase 5 in progress); #125 (epic #119); `feat/issue-125-online-facility-requests`.
- **Approval:** the owner's E08 approval on #119 (2026-11-05) covers `facilities_*` migrations; the issue's open questions are answered in the spec (DD-44 for the request-link e-mails, #167; the public categories `municipal_club`/`external_commercial` in the `RentalRate` row).

## Steps

1. Checked the prerequisites (#157, #71, #122, #124 closed; the #167 review findings resolved), claimed #125 (assignee, `in-progress`, claim comment), renamed the task branch.
2. Foundation `dispatch`: bare-address recipients (`addresses`, secrets keyed by `bareAddressKey`), the foundation messaging spec's *Recipient* glossary row ("or, for phase 5 requesters, a bare address") and P-30 `recipientKey`.
