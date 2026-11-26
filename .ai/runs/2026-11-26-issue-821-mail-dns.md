# Run: E28-S01 — sending-subdomain runbook and DNS check (#821)

- **Trigger:** Cezar queue (`cezar` label), skill `om-auto-fix-issue`, 2026-11-26.
- **Issue:** #821 (epic #817); no per-story spec (ready under `om-backlog`; design authority: product brief D36,
  D-036 point 6, S12.1, ADR-011, many clubs spec REQ-M03).
- **Branch:** `feat/issue-821-mail-dns-runbook`.

## Goal

A runbook for the owner's provider and DNS steps for `mail.vereino.org`, and a check command that names every missing or
wrong record and every from-address outside the verified domain, with unit tests on stubbed DNS answers.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment). The run was interrupted by a provider usage limit
   after the claim and resumed in the same conversation.
2. Wrote `scripts/check-mail-dns.mjs` next to `check-secrets.mjs`: Node `dns/promises` only, injected resolver, checks
   DKIM (TXT at `<selector>._domainkey`), SPF (one `v=spf1` at the Return-Path host, `include:amazonses.com`,
   `~all`/`-all`), the Return-Path MX (`feedback-smtp.<region>.amazonses.com`), DMARC (subdomain, else organizational
   domain; valid `p=`, `rua=mailto:`, optional `--policy`), and the from-addresses (`--from`, else
   `NOTIFICATIONS_EMAIL_FROM`/`EMAIL_FROM`). Exit 0 / 1 (problems) / 2 (usage or lookup failure).
3. Unit tests `packages/app/scripts/__tests__/check-mail-dns.test.mjs` (16 tests, 100 % line/branch/function coverage).
   Root script `yarn ops:mail-dns`.
4. Runbook `docs/ops/email.md`: provider setup in `eu-west-1`, tracking off, the DNS table, the app variables, the
   check, the staging header check (run log without addresses), the move to `p=quarantine` with a date table, the
   `vereino.pl` 301 redirect and its `curl -I` check, rollback. Linked from `docs/ops/deploy.md` and
   `packages/app/.env.example`.

## Decisions

- **Resend defaults** (selector `resend`, Return-Path label `send`, region `eu-west-1`) are the defaults of the command,
  each overridable, so a later provider-side change needs no code change.
- **DMARC fallback** to the organizational domain (last two labels) as receivers do (RFC 7489 6.6.3); no public-suffix
  list, enough for `.org` and `.pl`.
- **Exit code 2** for a usage error or a failed DNS lookup, so a network fault is not reported as a wrong record.
- **The role address** of the sending subdomain appears in the runbook; `scripts/secrets-allowlist.json` gets one narrow
  entry (`match` on that address, this file only) instead of spelling it around the scanner.
- The staging header check and the DNS, provider and registrar steps are owner actions (issue: "Owner actions"); this run
  does not perform them. The acceptance criteria on headers, the policy move and the redirect are met once the owner
  follows the runbook.

## Commands and results

- `node --test --experimental-test-coverage … check-mail-dns.test.mjs`: 16 pass, `check-mail-dns.mjs` 100 / 100 / 100.
- `yarn ops:mail-dns mail.vereino.org --from "Vereino <noreply@…>"` against live DNS (before the owner's steps):
  exit 1 with four problems — no DKIM record, no SPF record and no MX at `send.mail.vereino.org`, and
  `_dmarc.vereino.org` (the fallback) has no `rua=mailto:`. `yarn ops:mail-dns` without a domain: exit 2 with the usage.
- `yarn secrets:check`: clean.
- `yarn verify`: first run failed at `format:check` (`check-mail-dns.test.mjs is not formatted`); after `yarn format`,
  `yarn verify --from format:check` passed, then one full `yarn verify` run passed (exit 0, every step `pass`).
- `yarn guard`: no blocking findings.
- Integration tests: none; the change adds no route, command, subscriber, page or QA spec.

## Open problems / next steps

- Owner: sections 1–3 and 7 of `docs/ops/email.md`; then a maintainer runs section 5 on staging and records it.
- Finding for the owner: `vereino.org` already publishes a DMARC record without a report address; section 2 gives the
  subdomain its own record, and the bare domain's record may want a `rua=` too.
