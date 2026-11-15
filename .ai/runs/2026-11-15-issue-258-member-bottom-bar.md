# Run: #258 — E09-S04 the same member bottom bar on every page, every member page reachable from More

- **Goal and trigger:** unattended cezar run (task c0014a8b) of `om-auto-fix-issue` on #258, queued by the `cezar` label. Feature route: spec N phase 4 (REQ-N05, REQ-N06; TEST-N05, TEST-N06, TEST-N11).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (Ready for implementation; Ask First item 5 — the `@vereino/ui` API `memberNav` input, `MemberShellLabels`, `useMemberNavFeatures` — approved by the owner on 2026-11-15 on #251). **Issue:** #258, epic #251. **Branch:** `feat/issue-258-member-bottom-bar-nav`.

## Steps

1. Concurrency check (no assignee, no `in-progress`, no open PR) and claim: assignee, `in-progress`, `🤖` claim comment.
2. Confirmed the spec status and the owner approval; read the five frames, `member-nav.ts`, `member-shell.tsx`, the role grants (`packages/core/src/roles.ts`) and the installed `POST /api/auth/feature-check` (answers the requested ids it grants — no wildcard handling needed).
3. `@vereino/ui`: the destination table `MEMBER_MORE_DESTINATIONS` and `MEMBER_NAV_FEATURES` in `member-nav.ts`; `memberNav` takes `features` (null = degraded) and `paymentsVisible` instead of `extraTab`; nine new label keys; `member-nav-features.ts` with the session store, the focus effect and `useMemberNavFeatures(apiCall)`. TEST-N05 rewritten (`member-nav.test.mjs`), new `member-nav-features.test.mjs`; shell test updated.
4. The five frames pass `paymentsVisible` and the shared features and drop `extraTab`; `paymentsVisible` added to the three profile types that lacked it. Nine keys added to each of the five module catalogs in pl and en (payments also lacked `myUnits`, which rendered as a raw key behind More). TEST-N11 as `src/__tests__/ui/member-nav-catalogs.test.ts`.
5. TEST-N06 as `.ai/qa/tests/people/E09-S04-member-bottom-bar.spec.ts` (guardian in en and pl, the 16-year-old, the coach, the attendant, an administrator with a person; degraded check by failing the route); `signedInStaff` accepts `club_admin`; E06-S19's bar-target count is 5 now (the adult guardian gets Payments).
6. V-N04 recorded in the spec; changelog entry `2026-11-15-issue-258-member-bottom-bar.md`.

## Decisions

- **Groups** stays in the table with `available: false` (and out of the checked list) until spec A ships `/club/groups`: an entry now would lead to a 404 and break AC 5. This replaces the route-list fallback of V-N04.
- **Degraded bar keeps the admin panel**: it comes from the profile's contexts, not from the feature check; AC 4 (a guardian) is unaffected.
- **More current** follows the path whatever the grants (also while the check is pending), unless a tab claims it; Payments claims `/club/orders/**`, Facilities claims `/club/places/**` only when it is the fourth tab.
- **Failed refresh keeps the last known answer** (spec UI table: "offline (last known bar)"); a failed first check keeps nothing, so the next page asks again.
- **No sign-out clearing of the cache**: sign-out is a full-page form POST, so the in-memory store never outlives it.
- **The API client is injected** (`useMemberNavFeatures(apiCall)`): importing the platform `apiCall` into `@vereino/ui` pulled the platform sources into the package's strict typecheck (`typecheck:packages` failed with TS2322/TS18048 in `node_modules/@open-mercato/ui/src/backend/...`). `@tanstack/react-query` is not a dependency of `@vereino/ui`, so the store is a small `useSyncExternalStore` store instead of a new dependency.
- `contextCoachCoordinator` is added to the labels and catalogs only; its use belongs to REQ-N07.

## Commands and results

- `yarn workspace @vereino/ui test` → 0 failed, 100 % lines/branches/functions.
- `yarn workspace @vereino/app jest src/__tests__/ui` → 3 suites, all passed.
- `yarn verify` (first run) → failed at `typecheck:packages` (platform sources through `apiCall`, see Decisions).
- `yarn verify --from typecheck` → failed at `lint`: `@typescript-eslint/no-confusing-void-expression` ×4 in `member-nav-features.ts`; fixed with braces.
- `yarn verify` (full) → failed at `lint`: `91:46 error Unsafe member access .person on an any value` in the E09-S04 spec; typed the body.
- `yarn verify --from lint` → `[verify] all 11 step(s) passed` (generate, typecheck, typecheck:packages, typecheck:qa passed in the run before on the same code but one typed test line).
- `yarn test:integration:vereino --filter E09-S04` → first run failed: `getByRole('alert')` found the empty Next.js route announcer (`Expected: 0, Received: 1`); the check now ignores alerts without text. Rerun: `1 passed (3.1m)`.
- `yarn test:integration:vereino --filter E06-S19` → `1 passed (2.3m)`.
- `yarn spec-changelogs:check`, `yarn lessons:check` → valid.
- One commit instead of the issue's two slices: the `@vereino/ui` slice alone fails the app typecheck (`features` is required), and `AGENTS.md` forbids committing a failing typecheck.

## Open problems and next steps

- Spec N phase 4 exit gate is TEST-N06; the attendant's Admin panel entry and the landing are E09-S05.
