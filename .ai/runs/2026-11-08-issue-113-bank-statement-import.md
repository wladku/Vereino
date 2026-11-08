# Run — issue #113: bank statement import and matching (E07-S06)

- **Goal and trigger:** cezar task `om-auto-fix-issue 113`, unattended. It first stopped for approval, then resumed on the owner's instruction (2026-11-08): "continue autonomously, make reasonable assumptions, do not ask".
- **Issue:** #113 (feature, priority-medium, risk-high). **Spec:** `.ai/specs/2026-10-27-vereino-club-payments.md`, phase 4 step 7 (REQ-030, TEST-042, B-29).
- **Branch:** `feat/issue-113-bank-statement-import` (renamed from `feat/issue-113-task`).
- **Outcome:** step 7 is implemented. `yarn verify` passes. TEST-042 could not run locally, because Docker Desktop is not running and this run may not start it; CI runs it on the PR.

## Steps

1. **First pass.**
   - No claim, no assignee and no open PR; #109 is closed.
   - Classified as a feature: no statement-import code existed.
   - The story needs a new `payments` migration with no recorded approval, and Q1 (Restore) was open.
   - Stopped before claiming and posted the proposed defaults (issuecomment-6725218210). The stop record was committed as 4ac4d27.
2. **Resume.**
   - Posted the defaults as taken (issuecomment-6725224330).
   - Claimed the issue: assignee, `in-progress`, and the claim comment (issuecomment-6725225221).
3. **Pure rules** (100 % coverage):
   - `lib/bank-statement.ts` reads the statement. Text is decoded as UTF-8, falling back to Windows-1250.
   - CSV: the delimiter is detected, quoted fields are read, and the header is found after a preamble. Columns are recognised by Polish or English header names or by the column mapping. Amounts and dates are read in the usual Polish and international forms, and unreadable lines are reported by number.
   - MT940: `:61:` lines with their `:86:` details (`~20`…`~38`).
   - `lib/bank-matching.ts` holds the transfer fingerprint, the import plan (debits and duplicates), the payer codes in a text, whole-word surnames, the "whole charges oldest first" test, the allocation, the match, the action and status table and the import counts.
4. **Data.**
   - New entities `BankImport` and `BankTransaction`, plus `Payment.bankTransactionId`.
   - The sender, account and title are encrypted.
   - `Migration20261108183817_payments` was generated offline (`DATABASE_URL=postgres://u:p@127.0.0.1:1/none yarn db:generate`). Its SQL touches only the payments tables.
5. **Commands** (`commands/bank.ts`).
   - `payments.bank_imports.create` stores the file in the private attachments partition, then matches and stores the transfers in the attachment's `persistLink` transaction, under the club's statement advisory lock with the open charges row-locked.
   - `payments.bank_transactions.confirm|assign|ignore|restore|undo` check the lock token and the status.
   - Undo writes reversing entries.
6. **Routes:** `bank-imports` (POST multipart, GET history), `bank-transactions` (queue with counts), `bank-transactions/[id]/<action>` and `bank-payers`.
   - The cash payer select's read moved into `services/cash.payersWithDue`, which now serves both routes.
7. **UI:** B-29 `/backend/payments/bank`, with:
   - the import panel: file, format, column mapping, the auto-recording switch and the summary;
   - the perspectives with counts, the DataTable and its row actions;
   - the Assign and Skip dialogs and the import history;
   - en and pl catalogs.
8. **Tests:**
   - unit tests for both libraries; `payments-rules.test.ts` extended with the new error codes;
   - integration test `TEST-042-bank-statement-import.spec.ts` (API and browser) and fixtures in `_fixtures/payments.ts`.
9. **Docs:** the step 7 note in the spec, a changelog file and the module README.

## Decisions

- **Undo by reversing entries** (S10.4), not deleting payments. The ledger stays append-only, as in #109.
- **Debits and duplicates are not stored**, only counted (data minimisation: the club's outgoing payments name suppliers). So the Skipped perspective holds only manual skips, and Restore applies to them alone (Q1).
- **"Whole charges"** means the amount equals the remaining total of the oldest one or more open charges. Anything else with a code is an over- or underpayment.
- **Surname matching needs the amount too.** It applies only to exactly one payer with charges to pay, whose surname or a ward's appears as a whole word (folded, without diacritics).
- **One club advisory lock** serialises imports and money-moving decisions, so two of them cannot spread one charge's remaining amount twice.
- **The CSV reader is a small one in `payments/lib`.** `people/lib/import-csv.ts` is module-internal, and moving it to `@vereino/core` would widen this risk-high PR.
- **Deferred:** the `ProgressJob` path (imports are synchronous, capped at 2 MB and 2000 lines), the administrator notification of `payments.bank_import.completed` (the event is emitted) and deleting an import.

## Commands and results

- `npx jest src/modules/payments/lib` (bank files): 100 % statements, branches, functions and lines.
- `yarn generate`, `yarn typecheck`, `yarn typecheck:qa`, `yarn lint`, `yarn ds:check`, `yarn i18n:check-hardcoded --strict` and `yarn contracts:check`: pass.
- `yarn verify`: all 14 steps passed (generate, typecheck ×3, lint, format, ds, i18n, contracts, lessons, spec-changelogs, test, test:scripts, build).
- `yarn test:integration:vereino --filter TEST-042` failed to start:

  ```
  [ephemeral] starting PostgreSQL (pgvector/pgvector:pg17-trixie)
  Could not find a working container runtime strategy
  ```

  `docker info` answers `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`. The run's rules forbid touching Docker Desktop, so the integration test is left to CI's integration shards.

## Open problems and next steps

- Watch TEST-042 and the other payments tests in CI, and fix any failure on this branch.
- The owner confirms the defaults listed on the PR.
