# Run: refresh the ASVS 5.0 level 2 checklist (#742, E25-S08)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` for #742 (label `cezar`, 2026-11-25). Bring
  `docs/compliance/asvs-checklist.md` up to date and ready for the owner's approval.
- **Issue / epic / branch:** #742, epic #734, branch `docs/issue-742-refresh-asvs-5-level-2`.
- **Route:** `direct` (docs only, no spec); `spec-pr` delivery through `om-auto-create-pr` rules.

## Steps

1. Claimed #742 (assignee, `in-progress`, 🤖 claim comment naming the worktree and branch).
2. Read the checklist, the epic #734 and stories #735–#744, ENG-TEST-11 and `next.config.ts` (#463), the isolation
   guard (#628: `check-route-isolation.mjs`, `ISSUE-628-cross-club-isolation`), the social sign-in code (#566/#610),
   `retention.md`, `monitoring.md`, `deploy.md` and the D-039 PR (#725, open).
3. Downloaded the ASVS 5.0.0 CSV (345 requirements, 253 at level 1 or 2) and delegated a first draft of the
   requirement-level mapping (open item A-1) to four subagents, one per chapter group (V1–V5; V6, V7, V9; V8, V10–V12;
   V13–V17), each writing a fragment outside the repository under a shared brief (verified paths only, own-words
   topics, an owner issue for every open state).
4. Reviewed the fragments, spot-checked their key claims in the code (unkeyed lookup-hash fallback in the platform
   `aes.ts`, `JWT_SECRET` only required present, `TELEMETRY_BACKEND` set by the `monitoring.md` setup, the
   `mercato init` super-administrator defaults, the password-policy defaults), checked every cited test id exists, and
   assembled them into `docs/compliance/asvs-requirements.md` with a per-chapter summary (253 rows: met 47,
   partial 64, gap 20, to verify 59, n/a 63; every open row has an owner issue).
5. Filed #747 (bug, security, priority-high): `docs/ops/deploy.md`'s first-deploy step runs `yarn initialize` with only
   `OM_INIT_ADMIN_PASSWORD`, so `mercato init` seeds the default super-administrator with the password `secret`; plus
   the production password policy (platform defaults: 6 characters, composition rules, no breached-password check).
   Added the lesson `mercato-init-seeds-a-default-superadmin`.
6. Rewrote the section map of `asvs-checklist.md` with an Owner column: V3.4 partial (HSTS, `Permissions-Policy`, CSP
   without `'unsafe-eval'` met by ENG-TEST-11, A-4 closed; `'unsafe-inline'` left), V8.4 met by the #628 guard (A-2's
   cross-club part closed), V6.8/V7.6/V10 rewritten for Google sign-in (#610), V12.3/V13.3/V16.4 for Railway Pro
   (D-039), level 3-only sections marked outside level 2, new open items A-6 (ENG-Q-11) and A-7 (#747).
7. Updated the compliance pack index (`docs/compliance/README.md`).

## Decisions

- **Requirement text is not copied.** The ASVS is CC BY-SA 4.0; the mapping cites requirement ids with a short
  topic in our own words and links the source.
- **Approval date stays empty.** The acceptance criterion asks for the owner's approval date in the header; an agent
  cannot approve for the owner. The header names the approval as the owner's step on the PR.
- **D-039 is cited by PR (#725)**, not by file path: the decision record is not on `main` yet.
- **Default owner of a "to verify" row is #743** (internal security review, then external penetration test), unless an
  E25 story owns the topic.

## Files changed

- `docs/compliance/asvs-checklist.md`
- `docs/compliance/asvs-requirements.md` (new)
- `docs/compliance/README.md`
- `.ai/lessons/mercato-init-seeds-a-default-superadmin.md` (new)
- `.ai/runs/2026-11-25-issue-742-asvs-checklist-refresh.md`

## Commands and results

- `yarn format:check` — 0 unformatted; `yarn glossary:check`, `yarn spec-changelogs:check` — pass.
- `yarn lessons:check` — first failed: `areas contain a value outside the standalone router taxonomy` (used
  `security`, `operations`); fixed to `debugging`, `framework-context`; passes.
- `yarn secrets:check` — first failed: `docs/compliance/asvs-checklist.md:54 [email] supera***` (the platform's
  default super-administrator e-mail quoted literally); rephrased without the address; passes.
- `yarn verify` — all 22 steps passed (exit 0).
- `yarn guard` — no blocking findings.

## Open problems / next steps

- The owner reviews the mapping and records the approval date in the header of `asvs-checklist.md` (acceptance
  criterion of #742; an agent cannot approve for the owner).
- D-039 facts are cited from PR #725, which is still open; once it merges, a row may link the decision file.
- #747 is the most urgent finding: check staging and production for the default super-administrator.
