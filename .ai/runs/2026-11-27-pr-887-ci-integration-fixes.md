# Run log — PR #887: integration failures of the Open Mercato 0.10.1 upgrade

- **Goal and trigger:** cezar task `om-auto-fix-pr 887` (issue #498): the required `gate` check failed on the latest commit. Bring the PR to merge-ready, merging `main`; no force-push, no merge.
- **Branch:** `chore/upgrade-open-mercato-0.10.1`, worked on a detached HEAD at `origin/chore/upgrade-open-mercato-0.10.1`, pushed with `git push origin HEAD:chore/upgrade-open-mercato-0.10.1`.
- **Spec:** none changed beyond a changelog file for the navigation spec (REQ-N03 bridge removed).

## Steps

1. Triaged run 45908667980 (head 55b85758). `gate`: `yarn verify` passed all 23 steps; only `yarn guard` failed, on 5 dependency findings (`react-is` ×2, `big.js`, `@types/big.js`, `minisearch`) that need the owner's `guard-approved`. A comment on the PR said so.
2. Waited for the integration shards: 1, 2, 4 and 5 failed and 3 was cancelled after nine facilities failures. Every failure traced back to the upgrade:
   - **TEST-N04**: two count chips per sidebar item. 0.10.1 renders `setNavBadge` on main items itself, and the `SidebarNavBadges` bridge of #413 drew a second one. The bridge is removed, as its own comment and the lesson asked.
   - **E20-S07**: `page.addStyleTag` is blocked by the nonce CSP. The toast is now hidden through the CSSOM.
   - **E08-S02, E08-S03, E08-S06, TEST-039, TEST-R02, TEST-R07, TEST-R11, TEST-R15**: a console CSP violation. A local run with a `securitypolicyviolation` listener found Radix `Select.Viewport`'s fixed `<style>`, which the platform `SelectContent` renders without a nonce. `src/proxy.ts` now adds that stylesheet's sha256 to `style-src` through `withStyleHashes` (`@vereino/core`, unit test recomputes the hash). Development keeps `'unsafe-inline'`, so no hash is added there. ENG-TEST-11 asserts the new `style-src`.
   - **TEST-L22, TEST-R04**: axe `label-content-name-mismatch` on 0.10.1 `LookupSelect`'s selection button (`aria-label="Change"`, visible text = the item). `PlatformA11yRepairs` now drops that label (`nameSelectionByContent`), so the name comes from the content. Two earlier attempts each failed one layout: prefixing the glued text failed on a phone (the subtitle is hidden), and prefixing the space-joined spans failed from `sm` up (axe glues the spans).
   - **TEST-R04** (after the axe fix): `GET /api/facilities/renters?search=` → 400. 0.10.1 `LookupSelect` calls `fetchItems('')` once a value is set. `searchRenters` now returns nothing below `RENTER_SEARCH_MIN`. Every other Vereino fetcher already skipped an empty `search`.
   - **ISSUE-483**: 0.10.1 translates its access-denied toast itself (`ui.auth.accessDenied.*`), so the English matcher of `PlatformFlashTranslator` no longer fired. The app catalogs (en, pl, de, es, ko) now set `ui.auth.accessDenied.*` and `ui.auth.sessionExpired` to the `vereino.flash.*` wording.
   - **ISSUE-629**: 0.10 platform modules (`integrations`, `communication_channels`, `payment_gateways`) add per-organization schedules of their own. The test now reads only Vereino modules' schedules. Vereino code always filters schedules by worker name.
   - **TEST-A08**: read the column headers before the table rendered (`[]`). It now waits for the header.
3. Merged `main` (89f6929a, CI runners). The same commit also reached the remote branch as a3d9d73f, which was merged in before the push.

## Decisions

- **CSP hash instead of `'unsafe-inline'` or a test filter:** the hash admits exactly one fixed stylesheet that hides a scrollbar, so the policy stays strict for everything else. Filtering the console error in the tests would hide a real production violation. This is narrowly scoped and does not weaken S8.4, so I did not raise it as an Ask First item. It is explained in the PR comment for the owner.
- **Catalog override for the auth toasts instead of more matcher code:** the platform now asks the catalogs, so the key is the seam. The translator stays for the English text shown before a translator registers.
- **No `guard-approved`:** only the owner adds it. The 5 findings are still open.

## Files changed

`packages/app/src/proxy.ts`; `packages/core/src/content-security-policy.ts` (+ test, `index.ts`); `packages/ui/src/admin/platform-a11y.ts` (+ test); `packages/app/src/components/SidebarNavBadges.tsx` (deleted) and `app/(backend)/backend/layout.tsx`; `packages/app/src/modules/facilities/components/slot/slot-client.ts`; `packages/app/src/i18n/{en,pl,de,es,ko}.json`; `packages/app/src/lib/platform-flash.ts` (comment); integration tests E20-S07, TEST-A08, ISSUE-629, ENG-TEST-11; CONTRIBUTING; navigation spec text and changelog file; lesson `platform-nav-badges-not-on-main-sidebar` (updated); new lessons `nonce-csp-blocks-unnonced-inline-styles` and `lookupselect-0-10-selection-button-and-empty-search`.

## Commands and results

- `yarn verify` → first `typecheck:packages` failed (`content-security-policy.ts(23,19): error TS2532: Object is possibly 'undefined'`). Then `lint` failed twice: once on the ignored local `packages/app/.ai/qa/test-results` HTML report (deleted), once on 2 × `@typescript-eslint/no-confusing-void-expression` in E20-S07 (fixed). The final resume passed every step through `build`, and a full `yarn verify` on the final code passed all 24 steps.
- `@vereino/core` tests: pass, 100 % coverage (`content-security-policy.ts` 100/100/100). `@vereino/ui` tests: 283 pass, 0 fail, 100 % coverage.
- Integration, local (Testcontainers PostgreSQL 17, production build), one id per run: E08-S02, E08-S03, E08-S06, TEST-039, TEST-R02, TEST-R07, TEST-R11 and E20-S07 1 passed each; TEST-R15 1 passed; ISSUE-483 1 passed; ISSUE-629 2 passed; ENG-TEST-11 5 passed; TEST-N04 2 passed; TEST-A08 1 passed; TEST-L22 1 passed (after the name-by-content repair); TEST-R04 1 passed (after the empty-query guard); E20-S18 1 passed on the final code.

## Open problems and next steps

- `yarn guard` still blocks on the 5 release-required dependencies until the owner adds `guard-approved`.
- Upstream reports to file (owner decision 7 of #479): `SelectContent` passes no nonce to the Radix viewport; `LookupSelect`'s "Change" label on the selection button; `LookupSelect` searching with an empty query once a value is set; per-organization interval schedules of `integrations` (15 min), `communication_channels`, `payment_gateways` and Gmail for every club (worth a look against the many-clubs sweep design, DD-M07).
- The full integration suite runs in CI on the push.
