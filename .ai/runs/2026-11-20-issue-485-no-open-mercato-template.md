# Run — issue #485: no Open Mercato template is left (E20-S06)

- **Goal and trigger:** Cezar queued `om-auto-fix-issue 485` when the `cezar` label was added (2026-11-20). Scope from the issue and the owner decisions 4 and 5 of epic #479: `/` leads to the club's public page when published, otherwise `/login`; `/start` 404 in production; tab titles say Vereino in pl and en; a neutral Vereino mark in `--primary`; `ds:check` scans `public/*.svg`; `DEMO_MODE` defaults to off.
- **Issue / branch:** #485 / `fix/issue-485-remove-open-mercato-template` (Cezar worktree).
- **Spec:** none needed (bug route); the change is recorded against the navigation spec in `.ai/specs/changelog/2026-11-14-vereino-parity-navigation-and-naming/2026-11-20-issue-485-no-open-mercato-template.md`.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Confirmed every finding of the issue on `main` (`643a1544`): `src/app/page.tsx` redirected to `/start` until a cookie dismissed it; `/start` rendered the platform start page with database counters and the demo role cards; the root layout title and `app.metadata.*` said "Open Mercato"; `public/open-mercato.svg` was a blue-700 square with a yellow-400 dot; `DEMO_MODE` defaulted to `true` in the root layout, the backend layout and `docker-compose.fullapp*.yml`.
3. Implemented the change (files below), wrote the unit tests, the integration test `ISSUE-485`, the BC notes and the `CONTRIBUTING.md` local-patch rows.
4. Ran the gate and the integration test (results below).

## Decisions

- **Which club `/` leads to.** 1.0 runs one club per instance (product brief D14), but a sessionless request has no club, and AGENTS.md allows only one system-scope read on sessionless routes: the index-backed lookup of a public slug (D-024/D-026). Searching "the one published club" would be a new system-scope query (Ask First). So the instance names its club in a new additive variable `VEREINO_HOME_CLUB_SLUG`, and `/` reads it through `clubCorePublicSite.clubFrame` — the existing approved lookup. Unset or unpublished → `/login`. The most reversible choice: one variable, no new query, no schema.
- **Signed-in visitor at `/`.** Keeps going to `/backend` as before (the issue's rule is about a guest).
- **Club page titles "{club} — {page}".** Set in the frontend catch-all's `generateMetadata` from the same `clubFrame` lookup, so the title is right without JavaScript; other pages get "{page} — Vereino" from the root layout's title template, and pages without a title "Vereino".
- **The mark.** An SVG loaded as an image cannot read CSS variables, so `public/vereino-mark.svg` carries the literal `--primary` / `--primary-foreground` values from `globals.css` (light, and dark through `prefers-color-scheme`). The shell gets it explicitly when the club has no logo (`preserveAspectRatio`, no round crop). `open-mercato.svg` stays as a copy because the platform sign-in card hard-codes it (V-N05b).
- **`ds:check` for SVGs.** A new Vereino script `scripts/vereino-svg-tokens.mjs` (100 % covered by `test:scripts`) collects every token colour of `globals.css` and reports any SVG colour outside them; `ds-check.mjs` (platform-owned, local patch row added) calls it. The unused scaffold images `file.svg`, `globe.svg`, `window.svg` (`#666`) were removed instead of being baselined.

## Files changed

- `packages/app/src/app/page.tsx`, `src/app/start/page.tsx`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/(backend)/backend/layout.tsx`, `src/app/(frontend)/[...slug]/page.tsx`, `src/lib/metadata.ts`
- `packages/app/src/modules/club_core/lib/home-route.ts` + `lib/__tests__/home-route.test.ts`
- `packages/app/scripts/vereino-svg-tokens.mjs` + `scripts/__tests__/vereino-svg-tokens.test.mjs`, `scripts/ds-check.mjs`, `scripts/vereino-ephemeral.mjs` (`VEREINO_HOME_CLUB_SLUG=qa-home-club` for the tests)
- `packages/app/public/vereino-mark.svg` (new), `public/open-mercato.svg`; removed `public/{file,globe,window}.svg`
- `packages/app/src/i18n/{en,pl,de,es,ko}.json` (`app.metadata.*`), `packages/app/.env.example`, `docker-compose.fullapp.yml`, `docker-compose.fullapp.dev.yml`
- `packages/app/.ai/qa/tests/club_core/ISSUE-485-home-route-and-titles.spec.ts`
- `BACKWARD_COMPATIBILITY.md` (§8, §10), `CONTRIBUTING.md` (local patches), the spec changelog entry above

## Commands and results

- `yarn verify` (first run): failed at `typecheck` — `home-route.test.ts(3,1): error TS2593: Cannot find name 'describe'` (the new test lacked `import { describe, expect, it } from '@jest/globals'`); fixed.
- `yarn verify --from typecheck`: failed at `format:check` — `ISSUE-485-home-route-and-titles.spec.ts`, `vereino-svg-tokens.test.mjs`, `vereino-svg-tokens.mjs` "is not formatted"; `yarn format`, then `--from format:check`: all 13 steps passed.
- `yarn test:scripts`: 226 passed, `vereino-svg-tokens.mjs` 100 % lines/branches/functions.
- `ds:check` negative case by hand: an off-token colour in `public/open-mercato.svg` → `public/open-mercato.svg:4:18 [svg-colour-outside-tokens] …`, exit 1.
- `yarn test:integration:vereino --filter ISSUE-485`: first run failed — `expect(received).not.toContain("open-mercato.svg")`, received `"/open-mercato.svg"`: the platform sign-in card hard-codes that file (V-N05b), so the assertion was wrong; the test now checks that the file is byte-identical to `vereino-mark.svg`. Second run: 1 passed (9.8 s).
- `yarn test:integration:vereino --filter TEST-N09` (sign-in page never names the platform): 1 passed (53.9 s).
- Browser evidence: ephemeral app, pl/en × 375/1440 px × light/dark for `/` as a guest (lands on `/login`, title "Vereino") and `/backend/club/publication` (title "Publikacja strony klubu — Vereino" / "Club page publication — Vereino", sidebar shows the Vereino mark); `/start` → 404. The seeded admin could not publish the club page (`publication_forbidden`), so the published-club landing is evidenced by the integration test only.
- Final `yarn verify`: all 18 steps passed (generate, typecheck ×3, lint, format:check, ds:check, i18n, contracts, settings-prefixes, glossary, qa-texts, di-commands, lessons, spec-changelogs, test, test:scripts, build).

- PR #503 CI: `integration (shard 2/6)` failed — `E02-S05-public-pages.spec.ts:139` `expect(getByText('Klub Sportowy Delfin')).toHaveCount(0)`, received 1: the title of a missing section of a published club named the club. Fix: the frontend catch-all names the club only when the section (`sectionPage`) or club event (`publicClubEvent`) itself resolves; `ISSUE-485` now asserts it. Local: `yarn verify --from typecheck` all 17 passed; `--filter E02-S05-public-pages` 2 passed; `--filter ISSUE-485` 1 passed (a first attempt died on `EADDRINUSE :::5133`, a port taken by another run on the server; the re-run passed).

## Open problems / next steps

- Operators must set `VEREINO_HOME_CLUB_SLUG` on each instance for `/` to reach the club page (documented in `.env.example` and the PR).

- The SVG mark follows the operating system's colour scheme, not the app's own theme switch (an image cannot see the `.dark` class); with a mismatch the mark is the light variant on a dark sidebar, still legible.
