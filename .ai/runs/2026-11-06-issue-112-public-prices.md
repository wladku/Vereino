# Run — issue #112 (E07-S05): a guest sees each group's membership fee and discount on the section page

- **Trigger:** cezar task "112" (`om-auto-fix-issue`, unattended).
- **Issue:** #112, epic #106; depends on #108 (closed) and #91 (closed).
- **Spec:** `.ai/specs/2026-10-27-vereino-club-payments.md`, phase 4 step 6 (REQ-026, TEST-038); club spec DD-28, Q-024; UX concept P-02, flow F-11.
- **Branch:** `feat/issue-112-public-prices`.

## Steps

1. Classified the issue as a feature (label `feature`). FR triage: no `payments.publicPrices` registration existed, no open PR referenced #112, and the payments spec covers the step, so no new spec was needed. Claimed the issue (assignee, `in-progress`, claim comment).
2. Read the DD-28 provider contract (`club_core/services/public-blocks.ts`), the `groups.publicCatalog` provider, the mockup's `screenSectionPage` ("Membership fee: {amount} / month · siblings −30%") and the payments data model.
3. Pure logic `payments/lib/public-prices.ts` (`siblingPercentFor`, `publicPricesBlock`) with unit tests at 100 % coverage.
4. `payments/services/public-prices.ts` (the provider) and the new `payments/di.ts` that registers `payments.publicPrices`. The public groups come from `groups.directory.publicGroups` through `payments/services/directory.ts`.
5. `club_core` P-02: `PublicGroupPrices` type and `formatPublicAmount` in `public-client.ts`, a fee line on each group card in `PublicClasses.tsx`, en and pl strings.
6. Integration test `.ai/qa/tests/payments/TEST-038-public-prices.spec.ts`.
7. Spec step 6 note, changelog entry, payments README and module description.

## Decisions

- **Only the percent of a sibling rule is published, never its name.** A rule name is staff text; the card builds its own wording ("siblings −30%"). Custom rules name persons, so they are never read.
- **The most favorable sibling rule valid today that covers the fee's period** gives the percent. This matches the generator, which also picks the largest discount.
- **Only group fees valid today.** Activity fees (e.g. a camp) are not shown because the card is per group. A fee that starts next month is not shown yet.
- **The prices are drawn on the group cards.** Cards exist only with `description_schedule`. With "Prices" on and "Description and schedule" off, the API still sends `prices` but the page has no card to draw them on. This follows the mockup, where the fee belongs to the card.
- **Third AC (payments disabled):** `club_core` resolves a provider only when `hasRegistration` finds its token (`club_core/services/public-site.ts`, `providers`). Until this change no `payments.publicPrices` was registered, so every public page test so far ran the "no provider" path. With `payments` disabled, its `di.ts` does not run and the block is absent. One integration environment cannot run with a module both on and off, so no separate test was added.
- **No migration, no new route, no new dependency.** The response gains an additive `blocks.prices` key that the DD-28 contract already reserved.

## Files changed

- `packages/app/src/modules/payments/{di.ts, index.ts, README.md}`
- `packages/app/src/modules/payments/lib/public-prices.ts`, `lib/__tests__/public-prices.test.ts`
- `packages/app/src/modules/payments/services/{public-prices.ts, directory.ts}`
- `packages/app/src/modules/club_core/components/public/{public-client.ts, PublicClasses.tsx, PublicSectionView.tsx}`
- `packages/app/src/modules/club_core/i18n/{en,pl}.json`
- `packages/app/.ai/qa/tests/payments/TEST-038-public-prices.spec.ts`
- `.ai/specs/2026-10-27-vereino-club-payments.md`, `.ai/specs/changelog/2026-10-27-vereino-club-payments/2026-11-06-issue-112-public-prices.md`

## Commands and results

- `yarn generate`: completed; `payments/di.ts` is registered in `di.generated.ts`.
- `npx jest src/modules/payments/lib/__tests__/public-prices.test.ts --coverage`: 5 tests passed, 100 % coverage of `public-prices.ts`.
- `yarn test:integration:vereino --filter TEST-038`: 1 passed (2.1 min). The log also shows the usual `QueryIndexScopeError` lines from the club cleanup; they do not fail the test.
- `yarn verify`: generate, typecheck, typecheck:packages, typecheck:qa and lint passed; it then stopped at `format:check` with "2 unformatted" (`PublicClasses.tsx`, `public-prices.test.ts`). After `yarn format`, `yarn verify --from format:check` passed format:check, ds:check, i18n:check-hardcoded, contracts:check, lessons:check, spec-changelogs:check, test, test:scripts and build ("all 9 step(s) passed").

## Open problems / next steps

- None known.
