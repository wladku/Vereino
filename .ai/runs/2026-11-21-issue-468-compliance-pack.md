# Compliance pack drafts (E19-S02)

- **Date:** 2026-11-21
- **Agent / tool:** Claude Code (Opus 5.5), om-auto-fix-issue, Cezar run bc6d9f69 (step 1 of 3: build, draft PR)
- **Trigger:** `cezar` label on #468
- **Spec / issue / branch:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` S9.1–S9.8, phase E5 slice (a); #468 (epic #461); branch `feat/issue-468-club-data-protection-records`
- **Status:** completed (draft PR for the independent reviewer)

## Goal

Write the S9.7 compliance documents in `docs/compliance/` describing the decided hosting, each marked draft until the owner approves it; every retention row names an enforcing job or "manual" with a reason; processors without a known region flagged as open items.

## Steps

1. Claimed #468 (assignee, `in-progress`, 🤖 comment). Dependency #467 closed (PR #477 merged).
2. Read S9, S8, S15, phase E4/E5, `docs/compliance/legal-verification.md`, `docs/ops/*`.
3. Subagent (Explore, read-only) inventoried personal-data columns, encryption maps, purge/anonymise jobs, the erasure flow, export and consent storage, with file references. Spot-checked: tables list, `people_persons` columns, consent use in `activities/services/guardian-contacts.ts`, CSP in `next.config.ts`.
4. Subagent (web-fetch) read the OWASP ASVS 5.0.0 chapter and section list from the official CSV.
5. Wrote `ropa.md`, `dpia.md`, `processors.md`, `breach-register.md`, `retention.md`, `data-subject-requests.md`, `asvs-checklist.md`, `README.md`.
6. Filed follow-ups #525, #526, #527, #528; spec changelog file added.

## Decisions

- DPIA triggers cited as WP 248 criteria 4 and 7 with the UODO two-criteria rule, not a UODO children criterion (B2 corrected). Structure follows art. 35(7), the content WP 248 Annex 2 and the UODO list rest on; UODO publishes no mandatory template.
- ASVS mapped per section, not per requirement; states "to verify" unless a test proves it; requirement-level mapping left as open item A-1 — claiming more would be unverified.
- Backup provider and uptime monitor: not chosen, so region and DPA are open items P-4, P-5 (issue's negative case). Railway/Resend transfer mechanisms marked "to confirm" rather than asserted.
- Retention gaps documented as "manual" with reasons and issues, not built: the story is documents only; the 12-month sweep is #471.
- Request and breach registers hold no personal data in the repository; the club's request register lives outside it.

## Files changed

- `docs/compliance/{README,ropa,dpia,processors,breach-register,retention,data-subject-requests,asvs-checklist}.md` (new)
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-21-issue-468-compliance-pack.md` (new)
- this run log

## Commands and results

`yarn verify` — all 18 steps passed (2026-11-21). No integration test: documentation only, no route, page or test file changed.

## Open problems

- Owner approval and dating of every document (ENG-TEST-14); DPA signer (P-0).
- Findings for the owner: backups keep erased data up to ~13 months (monthly copies) vs 30 days in S15.7; Railway logs 7 days vs 30 in S9.5; HSTS/Permissions-Policy missing and `'unsafe-eval'` in the CSP (E4 item).

## Next steps

Independent review of the draft PR; owner review of the open items.
