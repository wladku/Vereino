# Run — issue #595: the payer and cash pages tests in the second locale

- **Goal and trigger:** cezar run (`om-auto-fix-issue`), queued by the `cezar` label on #595. AC-C10 and AC-C12 of the payments parity spec say "in Polish and English"; `TEST-C11-payer-page-m08` and `TEST-C13-cash-and-coach-pages` ran one locale only.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-payments.md` (AC-C10, AC-C12); #595 (epic #565); branch `test/issue-595-payer-cash-pages-locale`.

## Steps

1. Claimed #595 (assignee, `in-progress`, claim comment naming this worktree and branch).
2. Read both tests and the existing two-locale pattern of `TEST-C12-guardian-orders-on-the-phone` (the `locale` cookie, `uiText()` patterns that hold both catalogs' texts).
3. TEST-C11: Kasia's M-08 checks (all ticked, total, pay button, fee line, discount rule, campaign hint, no other payer, light/dark axe scans, no overflow) and Basia's checks (M-08 "Jaś: paid by Kasia", Today tile `other_pays`) run once per locale. Untick, `?pay=`, `payer_pays` and the online payment stay single-pass: they assert amounts and API state, which are locale-independent (`formatZloty` writes złoty the same way in every locale).
4. TEST-C13: M-18 from the Today tile (URL state, mode line, handed-over badge, scans), the mode line for `view` and `none`, the 403 state, the coordinator's chips, M-15 "Received by" before saving and the "Received today" list after it (scans) run once per locale. The cash payment is saved once.
5. Each pass opens the page through `openIn()`, which sets the club's `defaultLocale` and the `locale` cookie and asserts `<html lang>`, so a locale switch that silently does not happen fails the test (the `uiText()` patterns alone would match either locale). A first version set the cookie only, as TEST-C12 does; TEST-C13 failed on it (below) because the member shell rewrites the cookie to the member's resolved locale. Lesson `member-pages-locale-follows-the-member-not-the-cookie`.
6. Both criteria were the spec's last open ones: ticked with evidence, `Status: Implemented`, moved to `implemented/`, path references in run logs updated (bare file-name mentions in other specs stay valid); changelog file `2026-11-22-issue-595-second-locale.md`.

## Decisions

- A loop over `['en', 'pl']` inside the existing test, not a second test: the setup (club, guardians, charges, campaign, staff) is the expensive part and identical for both locales.
- `uiText()` for every text, with the locale as the assertion message; `<html lang>` proves which locale rendered.

## Files changed

- `packages/app/.ai/qa/tests/payments/TEST-C11-payer-page-m08.spec.ts`
- `packages/app/.ai/qa/tests/payments/TEST-C13-cash-and-coach-pages.spec.ts`
- `.ai/specs/implemented/2026-11-14-vereino-parity-payments.md` (moved), its changelog file, path references in `.ai/runs/*`
- this log

## Commands and results

- `yarn install` — ok (fresh worktree).
- `npx tsc --noEmit -p .ai/qa/tests/tsconfig.json`, `npx prettier --check` on both specs — clean.
- `yarn test:integration:vereino --filter TEST-C11` (cookie-only version) — 1 passed; not trusted, since `uiText()` matches either locale.
- `yarn test:integration:vereino --filter TEST-C13` (cookie-only version) — failed, both attempts:
  ```
  Error: expect(locator).toHaveAttribute(expected) failed
  Locator:  locator('html')
  Expected: "en"
  Received: "pl"
  ```
  at the `<html lang>` check after reloading `/club/coach/payments`.
- `yarn test:integration:vereino --filter TEST-C13` (club default locale + cookie) — failed: `Expected: 200 Received: 401` on the settings call after the administrator's browser sign-in had ended the old token; fixed by switching to the fresh token.
- `yarn test:integration:vereino --filter TEST-C11` (final) — `1 passed (56.1s)`.
- `yarn test:integration:vereino --filter TEST-C13` (final) — `1 passed (52.2s)`.
- `yarn verify` — see the PR.

## Open problems / next steps

- `TEST-C12-guardian-orders-on-the-phone` switches locale with the cookie only; its `pl` passes probably render English. Follow-up issue suggested in the PR.
