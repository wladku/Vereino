# Social sign-in through one central callback host (DD-S07)

- **Date:** 2026-11-25
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` through a Cezar run (7fabc464)
- **Trigger:** label `cezar` added to #700
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-social-sign-in.md` (DD-S07), `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` (phase 3); #700; `feat/issue-700-social-signin-callback-host`
- **Status:** completed

## Goal

With `VEREINO_CLUB_DOMAIN` set, "Sign in with Google" started on `<slug>.<club domain>` must complete: the provider returns
to the one callback on `APP_URL`, which hands the round trip back to the club's address, where the session is set.

## Steps

1. Claimed #700 (assignee, `in-progress`, 🤖 comment naming this run).
2. Read DD-S04/DD-S07, the identity routes and services, `club_core/lib/club-host.ts`, TEST-S01 and TEST-M03.
3. Pure rules in `foundation/lib/identity.ts`: the recorded club in the state marker, `callbackBrowserAccepted`,
   `clubLabelOfHost`, `hostMatchesOrigin`, the hand-off marker (key, path, parser, one-minute TTL), `outcomeLocation`;
   unit tests at 100 %.
4. Services: `storeHandoffMarker` / `consumeHandoffMarker` (same read-then-delete as the state marker); `issueSession`
   takes the club origin for its redirect.
5. Routes: `start` records the club (origin + tenant via `clubCorePublicSite.clubForHost`, optional DI); `callback`
   accepts a club round trip without its own cookie and redirects to the new `handoff` route; the shared end of a round
   trip (`finish`, `signIn`, `link`) moved to `api/identity/round-trip.ts`; isolation inventory entry for `handoff`.
6. TEST-S05 (second app process with the club domain + the Google fake); spec glossary row and TEST-S05 row; changelog
   files for both specs.

## Decisions

- The browser binding of a club round trip is the state cookie on the club's host, checked by the hand-off (the
  callback on `APP_URL` never sees it). The callback therefore consumes the marker also without a matching cookie, but
  accepts it only when the marker records a club — the hand-off then refuses any browser whose cookie differs, so a
  hand-off URL copied into another browser signs nobody in (no login CSRF).
- The hand-off marker carries the provider subject and the verified e-mail for one minute (cache only, never logged), so
  the link purpose can also be finished on the club's host, where the session cookie of the linking user lives.
- A sign-in hand-off sets a session only for a link of the recorded club's tenant; otherwise the generic `unlinked`
  outcome on that address — no session is ever set on another club's host.
- Foundation reads the club through optional DI (`clubCorePublicSite`) and parses the host label itself
  (`clubLabelOfHost`): the module boundary forbids importing `club_core`'s `requestHost`; the slug lookup decides
  whether the label names a club (reserved labels never do).
- The `POST /link` route (redirect to `start` on `APP_URL`) is unchanged: the UI opens `start` directly on the current
  host.

## Files changed

- `packages/app/src/modules/foundation/lib/identity.ts`, `lib/__tests__/identity.test.ts`
- `packages/app/src/modules/foundation/services/identity.ts`
- `packages/app/src/modules/foundation/api/identity/[provider]/start/route.ts`, `callback/route.ts`, `handoff/route.ts` (new), `api/identity/round-trip.ts` (new)
- `packages/app/.ai/qa/tests/_fixtures/isolation/inventory/foundation.json`
- `packages/app/.ai/qa/tests/foundation/identity/TEST-S05-club-address-sign-in.spec.ts` (new)
- `.ai/specs/2026-10-27-vereino-social-sign-in.md`, two changelog files

## Commands and results

- `yarn generate` — ok; `yarn typecheck` — ok.
- `npx jest src/modules/foundation/lib/__tests__/identity.test.ts --coverage` — 34 passed; `identity.ts` 100 % lines, branches, functions.
- `yarn test:integration:vereino --filter TEST-S05` — first run failed twice (with retry) in the test itself:
  `Error: expect(received).not.toBeNull() … Timeout 20000ms exceeded while waiting on the predicate` at
  `stoppedAtHandoff` — a `page.route('**/api/foundation/identity/google/handoff?**')` handler never fired on the
  redirect hop (lesson `club-address-redirect-hops-need-host-header-requests`). The browser sign-in and the replay check
  had already passed. Rewrote the stopped round trips over `node:http` with a `Host` header; second run: 1 passed.
- `yarn test:integration:vereino --filter TEST-S01` — 1 passed (callback regression on the one-club path).
- `yarn verify` — first run failed at `format:check` (callback and start route not formatted); `yarn format`, then
  `yarn verify --from format:check` — all remaining steps passed (generate … secrets:check passed in the first run).
- `yarn guard` — no blocking findings.

## Open problems

- `POST /api/foundation/identity/{provider}/link` still answers 303 to `start` on `APP_URL`; the UI never uses it (it
  opens `start` on the current host), so a club-address link from an API client would start without the session. Left
  unchanged (out of the issue's scope).

## Next steps

- CI on the PR; the merge train merges it.
