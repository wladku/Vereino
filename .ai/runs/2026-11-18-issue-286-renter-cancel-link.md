# Run: issue #286 — the renter's e-mails and cancellation link (E11-S12, facilities parity spec phase 12)

- **Trigger:** cezar `om-auto-fix-issue 286` (label `cezar` added); resumed once after a cezar restart.
- **Issue / PR / branch:** #286 / (opened by this run) / `feat/issue-286-renter-cancel-link`
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-facilities.md` (Ready for implementation; the `facilities_rental_links` migration and the sessionless routes approved on #253, Ask First items 1 and 2)
- **Date:** 2026-11-18

## Goal

REQ-R17 / J-R06: a renter with an e-mail address gets a summary when staff enter the rental, a "moved" e-mail with a fresh link, a "cancelled" e-mail with its outcome, and can cancel through a single-use link — free before the deadline, with the forfeit stated after it.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` comment). Feature route: the spec exists and is Ready, dependencies #279 and #284 are merged, no open PR references the issue.
2. Entity `RentalLink` (`facilities_rental_links`, `tokenLinkColumns({ use: 'single' })`, `purpose`) and `yarn db:generate` → `Migration20261118151254_facilities.ts` (reviewed: one create table, unique hash, unique `(organization_id, rental_id, purpose)`, tenant/org index; nothing else). Not applied.
3. Pure rules in `lib/rental-links.ts` (expiry, cancellable, free, outcome, dispatch keys, page path) with a unit test at 100 % coverage.
4. `services/rental-links.ts`: the link service, `sendTermsMail` (summary / approval / moved), `sendCancelledMail`, `rentalOfLink` (the DD-35 lookup) and `cancelPreview`. Templates `facilities.rental_summary`, `facilities.rental_moved`, `facilities.rental_cancelled`; the approval template gains the link, the rules and the phone. Subscribers on `facilities.rental.requested|moved|cancelled`; the approval subscriber now sends the terms e-mail.
5. Command `facilities.rentals.cancel_by_link`, routes `POST /api/facilities/public/rentals/cancel/preview` and `/cancel`, page `/p/[clubSlug]/rentals/cancel/[token]` (`RentalCancelView`) with the `no-referrer`/`no-store` header rule; the rental page notes a live rental without an address; en/pl catalogs; the `AGENTS.md` exception line names rental cancellation links.
6. TEST-R17 (integration + UI) and its fixture `_fixtures/rental-links.ts`.
7. Self-review: the link cancellation locks the rental row and re-reads its status, so it cannot race a staff action.
8. `yarn verify`: lint failed (the page set state synchronously inside its effect; three void-returning arrow shorthands) → fixed; format:check failed → `yarn format` (9 own files) → green.

## Decisions

- **The approval e-mail is the online renter's summary** (the issue: "the approval e-mail gains the link"), so an approved request gets one e-mail, not two; the summary goes to staff entries only.
- **Link and e-mail in one transaction, rolled back when the dispatch key is taken** — a redelivered event must not replace the link of the e-mail already sent (lesson `token-link-mail-issue-and-enqueue-in-one-transaction`).
- **Re-issue = delete the old row + issue a new one** in the same transaction: the unique `(organization_id, rental_id, purpose)` index holds soft-deleted rows too, and the foundation service only creates rows.
- **`facilities.rental.moved` gains `moveId`** (an id, additive) to key one "moved" e-mail per move.
- **A separate command `facilities.rentals.cancel_by_link`** instead of a renter branch in `facilities.rentals.cancel`: the staff command authorizes through the place scope; the sessionless one through the token, with no payload kept. Same outcome rule and charge handling (`cancelCharge`, shared).
- **No link without the club's public slug** (the page lives under `/p/<slug>`) or for a rental more than two years ahead (the service's TTL): the e-mail then names the club's phone.
- **The preview also answers `timeZone`, `currency` and `club`** (the page needs them for the slot, the amount and the public header); still no contact data.
- **429 not integration-tested**: `OM_INTEGRATION_TEST` disables the dispatcher's rate limits (as TEST-024, TEST-036); both routes declare `metadata.POST.rateLimit`.

## Files changed

- `AGENTS.md` (the sessionless-lookup exception)
- `packages/app/next.config.ts`
- `packages/app/src/modules/facilities/`: `data/entities.ts`, `data/validators.ts`, `migrations/Migration20261118151254_facilities.ts`, `migrations/.snapshot-open-mercato.json`, `lib/rental-links.ts`, `lib/__tests__/rental-links.test.ts`, `services/rental-links.ts`, `services/requests.ts`, `services/request-mail-subscriber.ts`, `services/request-queue.ts`, `services/directory.ts`, `emails/templates.ts`, `subscribers/request-approved-email.ts`, `subscribers/rental-summary-email.ts`, `subscribers/rental-moved-email.ts`, `subscribers/rental-cancelled-email.ts`, `commands/rentals.ts`, `api/public/rentals/cancel/route.ts`, `api/public/rentals/cancel/preview/route.ts`, `components/public/RentalCancelView.tsx`, `components/public/public-client.ts`, `components/RentalRecord.tsx`, `frontend/p/[clubSlug]/rentals/cancel/[token]/page.tsx|page.meta.ts`, `di.ts`, `i18n/en.json`, `i18n/pl.json`
- `packages/app/.ai/qa/tests/_fixtures/rental-links.ts`, `packages/app/.ai/qa/tests/facilities/TEST-R17-renter-emails-and-cancel-link.spec.ts`
- `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-18-issue-286-phase-12.md`, `.ai/lessons/token-link-mail-issue-and-enqueue-in-one-transaction.md`, this log

## Commands and results

- `yarn generate` — completed.
- `yarn db:generate` — `facilities: generated Migration20261118151254_facilities.ts`, every other module "no changes".
- `yarn typecheck`, `yarn typecheck:qa` — exit 0.
- `npx jest src/modules/facilities/lib/__tests__/rental-links.test.ts` — 7 passed, 100 % statements/branches/functions/lines.
- `yarn spec-changelogs:check`, `yarn lessons:check` — valid.
- `yarn test:integration:vereino --filter TEST-R17` (with build, before the row-lock change) — 1 passed (2.3m).
- `yarn verify` — failed at `lint` (4 errors in `RentalCancelView.tsx`: `react-hooks/set-state-in-effect`, `no-confusing-void-expression`); after the fix `yarn verify --from lint` failed at `format:check`; after `yarn format`, `yarn verify --from format:check` — all remaining 12 steps passed (generate, typecheck ×3 and lint passed in the earlier runs).
- `yarn test:integration:vereino --filter TEST-R17 --no-build` on the final build — 1 passed (2.4m).
- After PR #386 opened, `main` gained #385 (phase 11) and the merge train marked a conflict: merged `origin/main` into the branch (conflicts in `commands/rentals.ts` imports and the two catalogs, both sides additive, kept both). `yarn verify` — all 17 steps passed; TEST-R17 `--no-build` — 1 passed (2.2m).

## Open problems / next steps

- The owner applies the migration (`yarn db:migrate`) after reviewing its SQL in the PR.
