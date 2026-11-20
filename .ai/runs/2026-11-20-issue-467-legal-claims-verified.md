# Run log — E19-S01 (#467): legal claims checked against primary texts

- **Goal and trigger**: Cezar run of `om-auto-fix-issue` on #467 (label `cezar`, 2026-11-20). Verify research C Appendix B claims B1, B2, B3, B10, B12 from primary texts (S9.10, ENG-Q-06) and record the owner's answers to ENG-Q-06 and ENG-Q-07.
- **Spec / issue / branch**: `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S9.3, S9.5, S9.9, S9.10, phase E5); issue #467, epic #461; branch `docs/issue-467-legal-claims-checked-primary`.
- **Route**: `direct` (docs); no code, no migration, no contract surface.

## Steps

1. Claimed #467 (assignee, `in-progress`, `🤖` comment naming the worktree and branch).
2. Dispatched five web-fetch subagents in parallel, one per claim, with the official URLs to read and the rule "quote only what loaded".
3. B12 came back with quotes from docs.stripe.com; re-fetched the page with `curl` and confirmed the MCC row, the "Restricted MCCs" sentence, the website requirements and the P24 prohibited categories.
4. B1, B2, B3 and B10 came back partly unverified: ISAP answered with a human-verification page, EUR-Lex with HTTP 202 and no body, uodo.gov.pl with a TLS error, and PDFs were binary to the fetch tool. Closed the gaps myself:
   - B2: read the Monitor Polski PDF (5 pages) and the WP 248 rev.01 PDF with the Read tool.
   - B1, B3, B10: downloaded the ELI PDFs (`api.sejm.gov.pl/eli/acts/DU/…/text.pdf`) and extracted text with `pdfjs-dist` from the app's `node_modules` (script outside the repository); GDPR and ePrivacy from `publications.europa.eu/resource/celex/…`.
   - Read the acts amending each consolidated text (data protection act: Dz.U. 2026 poz. 252, 548, 1003; Accounting Act: 2026 poz. 640, 644; PKE: 2025 poz. 637, 820, 2026 poz. 252, 815, 1296; public benefit act: 2026 poz. 1040) to check that none changes the quoted articles.
5. Wrote `docs/compliance/legal-verification.md`; filed follow-up #475 (B3: claims in proceedings); updated the ENG-Q-06 and ENG-Q-07 rows; added a spec changelog entry and a lesson.

## Decisions

- **B2 is "corrected", not "confirmed"**: the UODO list's twelve criteria contain no children or vulnerable-persons criterion; that is WP 248 criterion 7. The DPIA conclusion stands (WP 248 criteria 4 and 7), so no follow-up issue; the DPIA story (#468) cites the right source.
- **B3 is "corrected" in one detail**: the "from the year the operations concluded" trigger applies only to art. 74 ust. 2 pkt 4. The 6-year default is confirmed by Ordynacja podatkowa art. 70 § 1 and art. 86 § 1. This adds a requirement to the retention sweep, so a follow-up issue (#475) was filed per the issue's scope.
- **B10 is "corrected"**: the cookie rule is art. 399 alone (398 is direct marketing, 400 points consent to GDPR).
- **B1 confirmed** only for the data protection act and its amendments; other Polish acts were not searched, which the document states.
- The research C file (a read-only discovery input) is not edited; the verification document supersedes its Appendix B status for these five rows.
- Open Questions rows are table rows outside the frozen Changelog table, so they are edited in place; the change is recorded as a changelog entry file.

## Files changed

- `docs/compliance/legal-verification.md` (new)
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (ENG-Q-06, ENG-Q-07 rows)
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-20-issue-467-legal-claims-verified.md` (new)
- `.ai/lessons/legal-primary-texts-from-eli-and-publications-office.md` (new)
- `.ai/runs/2026-11-20-issue-467-legal-claims-verified.md` (this log)

## Commands and results

- `yarn verify` → `[verify] all 18 step(s) passed`, exit 0 (also `yarn lessons:check` and `yarn spec-changelogs:check` passed on their own).
- No integration tests: the change adds or edits no test and no code.

## Open problems / next steps

- The owner fills in the acceptance date at the end of `docs/compliance/legal-verification.md` (ENG-Q-06: "the owner accepts").
- #468 (DPIA, retention schedule), #469 (privacy notices) and #470 (club spec amendment B) cite this document; #475 carries the B3 requirement.
