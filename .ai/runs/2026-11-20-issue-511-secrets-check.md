# Run — issue #511: `secrets:check` gate step

- **Goal:** `yarn verify` fails on hard-coded secrets and real e-mail addresses (#511, epic #442, ENG-AC-13, S8.10).
- **Trigger:** Cezar run 397bb637 (`om-auto-fix-issue`), issue labelled `cezar` on 2026-11-20.
- **Branch:** `fix/issue-511-secrets-check-failures` (worktree `.ai/cezar/worktrees/397bb637-…`).
- **Approval:** the issue records the owner's approval (2026-11-20) for the gate step and checklist line with no new dependency.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the run).
2. Wrote `scripts/check-secrets.mjs` (plain Node, `git ls-files -z`, skips `yarn.lock`, binary files and the allow-list itself) with rules `private-key`, `stripe-key`, `github-token`, `aws-access-key`, `slack-token`, `jwt`, `url-credentials`, `secret-assignment`, `email`.
3. Ran it over `main` (3907 tracked files): first pass 540 hits. Tuned the rules on the false positives, then allow-listed the 13 deliberate ones.
4. Wired it: root script `secrets:check`, step after `lint` in `scripts/verify.mjs`, coverage include in `test:scripts` and `coverage-scope.test.mjs`.
5. Unit tests `packages/app/scripts/__tests__/check-secrets.test.mjs`: each rule one hit and one passing placeholder, allow-list, main; 100 % lines/branches/functions.
6. Docs: review-checklist line, `docs/ops/github-settings.md` section 9 (security settings; section 8 before the release workflow section landed), S2.1 and S8.10 of the engineering standards spec, ENG-AC-13 ticked, `CODE_REVIEW.md` step list (it still said 13 steps), changelog entry.

## Decisions

- **False-positive tuning instead of a long allow-list.** First pass: 200 `email` hits were mostly widget injection-spot ids (`widget@sales.document.detail.order`) — an address now needs a real TLD (two-letter country code or a listed generic one). 306 `secret-assignment` hits were i18n labels of password fields, harness keys (`tokenApplicability`), DI token names (`EMAIL_SENDER_TOKEN = 'foundation.emailSender'`) and generated test passwords (`` `Vereino-${uniqueSuffix()}-Aa1!` ``) — the key must end with the secret word, i18n catalogs are skipped for this rule, values with `${` are computed, and for token/secret/key names a value must be 8+ characters, without spaces and not a letters-only identifier. Password names still report any literal that is not a placeholder. 32 `url-credentials` hits were local dev URLs (`postgres://u:p@localhost`) — only public host names are reported.
- **Placeholder domains.** Beyond the reserved domains in the issue (`example.com/org/net`, `*.test`, `*.example`, `*.invalid`, `localhost`), a domain with a label `example` or a localized equivalent (`przyklad`, `beispiel`, `ejemplo`, …) is allowed under any TLD: the fixtures use `example.pl` and the Spanish catalog `ejemplo.com`. `.local` (RFC 6762) is allowed too.
- **Allow-listed, not rewritten:** Open Mercato's seeded dev accounts at `acme.com` (5 files), the AWS documentation key and `POSTGRES_PASSWORD=postgres` in `.env.example`, the fake Stripe live key in the payments test, the throwaway Testcontainers password in `vereino-ephemeral.mjs`, and the pilot club's public contact address in the UX mockups (the fictional build already replaces it). Each entry carries `match` so it covers only that value; an unused entry fails the step.
- **Hits are masked** in the output (`passwo***`) so the gate log never repeats a leaked secret.
- No new dependency (gitleaks/secretlint would be Ask First).

## Commands and results

- `yarn secrets:check` → `No secrets or real e-mail addresses found` on the branch.
- `node --test --experimental-test-coverage … check-secrets.test.mjs` → 22 pass, `check-secrets.mjs` 100/100/100.
- `yarn verify` (first run) → generate, typecheck, typecheck:packages, typecheck:qa and lint passed; `secrets:check` FAILED on this PR's own files:
  `.ai/runs/2026-11-20-issue-511-secrets-check.md:19 [secret-assignment]`, `:21 [stripe-key]`, `check-secrets.test.mjs:152/153/253 [secret-assignment]`, `scripts/check-secrets.mjs:110 [secret-assignment]`.
  Fixed by assembling the test samples from parts and describing instead of quoting in docs (lesson `secrets-check-sample-values-are-assembled`).
- `yarn verify --from secrets:check` → `format:check` FAILED: `packages/app/scripts/__tests__/check-secrets.test.mjs is not formatted`; `yarn format` fixed it.
- `yarn verify --from format:check` → all 13 remaining steps passed (`build` 55s). `yarn lint` rerun after the last edits: exit 0.
- Acceptance demo: a tracked temp file with a `club.pl` address → `tmp-demo-511.ts:1 [email] ann@cl***`, exit 1; the `club.test` address and the `process.env.VEREINO_API_KEY` line passed.
- No integration test: the change adds no route, page or spec under `packages/app/.ai/qa/tests`.

## Open problems / next steps

- None known. Phones and PESEL numbers are in the review checklist line but not scanned (too many false positives for a regex on numbers); a later rule can add them.

## Second main merge (PR #514 conflict, merge-train-conflict)

- Merged `origin/main` at `93f4c329` (off-site backup #464, QA scenarios #453) into the PR head on a detached HEAD; history not rewritten.
- Conflict in `packages/app/package.json` `test:scripts`: kept main's `test:backup` script and `backup-*.mjs` coverage include together with this PR's `check-secrets.mjs` include.
- `node scripts/check-secrets.mjs` on the merged tree then FAILED on a file main added: `packages/app/scripts/__tests__/backup-drill.e2e.mjs:100 [secret-assignment] POSTGR***` — the throwaway Testcontainers database password of the backup drill. Allow-listed with `match` (same class as the `vereino-ephemeral.mjs` entry); 14 entries now. Rerun: `No secrets or real e-mail addresses found`.
- `yarn verify` on the merge result: all 19 steps passed.

## Fourth main merge (PR #514 conflict, merge-train-conflict, 2026-11-21)

- Merged `origin/main` at `8122c3fa` (release workflow #447, boot-time env check #478 and later) into the PR head; history not rewritten.
- Conflict in `docs/ops/github-settings.md`: main added section 7 "Release workflow" and renumbered Verify to 8, so this PR's security settings became section 9; the closing "Phase E2 settings (later)" line now names only the Renovate app and points to section 7 for the release workflow.
- `node scripts/check-secrets.mjs` on the merged tree then FAILED on test files main added (#478): `packages/app/scripts/__tests__/smoke.test.mjs` (10 × `[secret-assignment]`, fake passwords `'p'`, `'pw'`, `'secret-pw'`) and `packages/app/scripts/__tests__/vereino-boot-env.test.mjs:6,15 [url-credentials]` (fake `DATABASE_URL`/`REDIS_URL` with `.internal` hosts). All fake test values; allow-listed with narrow `match` entries (18 entries now). Rerun: `No secrets or real e-mail addresses found`.
- `yarn verify` on the merge result: all 19 steps passed.
