# Run: issue #480 — record the owner's UX decisions (D-033), close `tokens.md` C1–C4, statuses with icons in the mockup

- **Goal and trigger:** cezar task (om-auto-fix-issue) on #480 (E20-S01, epic #479), queued by the `cezar` label.
- **Branch:** `docs/issue-480-owner-ux-decisions-recorded`, worktree of the cezar run, base `main` at `643a1544`.
- **Spec:** none (documentation only; the design authority is `docs/ux-concept/tokens.md` and the mockup, D-031).

## Steps

1. Claimed #480 (assignee, `in-progress`, `🤖` claim comment naming this run). No open PR referenced the issue.
2. Wrote `.ai/specs/research/decisions/D-033-ux-audit-decisions.md` with the seven owner decisions of 2026-11-20 from epic #479, the owner and the date.
3. Recomputed the contrast values from `packages/app/src/app/globals.css` (oklch to sRGB, alpha composited in sRGB over the surface): the earlier C1 values were confirmed (field border 3.36 light, 4.25 / 3.85 dark; ring 3.36; focus 19.79 / 18.96), and the C2 sidebar group heading (`text-muted-foreground/70` on `--background` — the AppShell aside is `bg-background`) measures 2.78 light and 4.20 dark, fixed by full-opacity `--muted-foreground` (4.96 / 7.63). Checkbox on `--primary`: 17.91 / 17.16 light, 15.72 / 14.22 dark.
4. `tokens.md` 0.2: C1–C4 resolved, each naming D-033; `--input`, `--ring`, `--focus-ring-outer` overrides; `--accent-indigo` no longer for checkbox and radio; `--focus-indicator` as the one indicator; `--club-accent*` marked *to be built* in `vereino-tokens.css`; a "Status icons" map with a default icon per kind.
5. Mockup: `badge()` in `app.ts` renders the kind's default icon (`CircleCheck`, `Clock`, `CircleAlert`, `CircleDashed`, `Info`) or the status's own (`CircleX` cancelled/rejected, `X` not attending/absent, `CalendarX` deadline passed); the one hand-written `.badge` (session type on M-04) now goes through `badge()`; `styles.css` got the `--status-*-icon` colours of `tokens.md` (light and dark). Rebuilt `app.js` with `node docs/ux-concept/mockups/build.mjs`.
6. Browser check with Playwright on the file-served mockup: M-05 (coach Wojtek), M-08 (guardian Kasia), B-21 (administrator Aneta) × pl/en × light/dark × 1440/375 px — 24 screenshots.
7. `yarn verify`.

## Decisions

- **`Info` as the default icon of the info kind.** `tokens.md` named only `Users` + "Called up"; most info badges in the mockup are labels (session type, role, "Primary payer", "Unread"), for which `Users` would be wrong. Recorded in the new status icon map.
- **Every badge gets an icon**, including label-like ones, so the rule "a status is a word and an icon" has no exception list to maintain.
- **Badge colours unchanged.** "Not attending" is still an error-coloured badge in the mockup while `tokens.md` lists it as neutral; changing colours is outside this story — only its icon (`X`) follows the map.
- The fallback logo box mentioned in the issue's *Change* is not in its *Scope* and is left to the product-mark story (D-033 §5).

## Files changed

- `.ai/specs/research/decisions/D-033-ux-audit-decisions.md` (new)
- `docs/ux-concept/tokens.md`
- `docs/ux-concept/mockups/app.ts`, `app.js` (generated), `styles.css`
- `.ai/runs/2026-11-20-issue-480-owner-ux-decisions-recorded.md` (this log)

## Results

- Mockup build: `i18n.js: en (English) 2072 keys, pl (Polski) 2072 keys`, `app.js: 421650 chars`.
- Browser: every `.badge` has its icon — M-05 7/7, M-08 7/7, B-21 33/33 in all 8 variants each; no console or page errors.
- `yarn verify`: `[verify] all 18 step(s) passed`.

## Open problems / next steps

- The application changes of D-033 are the other stories of epic #479 (#481–#497).

## Follow-up run — merge main after #481 (om-auto-fix-pr, 2026-11-20)

- **Trigger:** PR #499 was `CONFLICTING` with `main` after #502 (E20-S02, #481) landed; worked on a detached HEAD at `origin/docs/issue-480-owner-ux-decisions-recorded`, merged `origin/main` (9c811e6c) without rewriting history.
- **Conflict:** `docs/ux-concept/tokens.md` only — #481 recorded C1 and C2 as built, C3 and C4 open; this PR records C1–C4 resolved by D-033.
- **Resolution:** kept the D-033 resolutions and the status icon map; took #481's facts that are now true on `main` (the `--input`, `--ring`, `--focus-ring-outer` overrides and `--focus-indicator` are built in `globals.css`, with `focus-indicator-inset`; tables show the overridden values with the platform value as "was …"); marked the checkbox on `--primary` (D-033 §6) as still *to be built* (`main` keeps `accent-color: var(--accent-indigo)`); C4 notes that the #481 overrides sit in a marked Vereino block in `globals.css` today.
- **Decision — sidebar heading surface:** #481 measured the C2 heading on `--sidebar` (4.75 / 6.91), but the AppShell aside is `bg-background` (`asideClassesBase = 'border-r bg-background py-4'` in `@open-mercato/ui/src/backend/AppShell.tsx`), so `tokens.md` keeps this PR's values on `--background`: 2.78 → 4.96 light, 4.20 → 7.63 dark. Both pass 4.5:1, so the built rule stays correct.
