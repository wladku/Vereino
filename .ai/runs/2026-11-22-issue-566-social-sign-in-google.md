# Run — issue #566, social sign-in with Google (phase 1)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #566 (label `cezar`, 2026-11-22): build phase 1 (Google) of `.ai/specs/2026-10-27-vereino-social-sign-in.md` — the provider-neutral slice and Google; Facebook, enterprise `sso`, JIT accounts and e-mail matching are out of scope.
- **Spec / issue / branch:** spec above; issue #566 (epic #565); branch `feat/issue-566-social-sign-in-google`.
- **Route:** feature route; the spec exists and the owner approved it on the issue (2026-11-22), with the `arctic` dependency and the spec's migration, on the condition that V-S04 is checked first.

## Steps

1. Read the issue, the spec and the skill override; nothing was built yet (no `identity` code in `foundation`, no PR referencing #566). Claimed #566 (assignee, `in-progress`, claim comment).
2. V-S04: downloaded `arctic@3.7.0` (latest; MIT; dependencies `@oslojs/jwt` 0.2.0, `@oslojs/crypto` 1.0.1, `@oslojs/encoding` 1.1.0) with `npm pack` and read `dist/`.

   | Criterion | Result | Evidence |
   |---|---|---|
   | Google as OIDC with PKCE S256 | pass | `dist/providers/google.js` |
   | Facebook OAuth 2.0 | pass | `dist/providers/facebook.js` |
   | Endpoints configurable for a test fake | pass, through `OAuth2Client` | the provider classes hard-code their endpoints; `OAuth2Client` takes them per call |
   | Verifies the id token's signature, issuer and audience | **fail** | `dist/oidc.js` `decodeIdToken` only decodes |

   The run stopped, released the claim and asked on #566 (three options). The owner then told the run to continue on its own judgement; it took option 1 (`arctic` + OIDC Core §3.1.3.7: TLS back channel instead of the signature, `iss`/`aud`/`azp`/`exp`/`sub` checked in our code — no further dependency), recorded that on #566 and re-claimed the issue.
3. Backend (commit 1): `arctic@3.7.0` pinned in `@vereino/app`; `IdentityLink` in `foundation/data/entities.ts` and `Migration20261122100955_foundation` (one additive table, three indexes, hand-written `down()`); encryption of `email_at_link`; features `foundation.identity.self|manage` (`acl.ts`; seeded on `vereino_member`, `vereino_coach` and `vereino_club_admin` in `@vereino/core` `roleCatalogue`); four error codes; three events; `lib/identity.ts` (pure, 100 % coverage); services for the state marker, the D-027 lookup and session issuance (`login.ts` pattern), the link list and the provider registry; commands `foundation.identity.link` / `unlink`; routes `start`, `callback`, `me`, `link`, `[id]` (unlink), the admin list and `providers`; subscriber `foundation:identity-cleanup`.
4. UI (commit 2): the login widget on `auth.login:form` (buttons after the form via `order-last`, the generic sentence through the form's `setError`), "Connected accounts" on `/club/profile` and "Sign-in methods" on the person record, through two new `people` spots; en + pl keys.
5. Tests: the runner (`vereino-ephemeral.mjs`) gives `test` runs a test-only Google client pointed at an OS-assigned port (`oauthFakeEnv`, `findEphemeralPort`, unit tests at 100 %); the in-process Google fake and the identity probe under `.ai/qa/tests`; TEST-S01, TEST-S02, TEST-S04.
6. Docs: spec status `In progress`, V-S04 result and the *OAuth hygiene* line amended, changelog file; `BACKWARD_COMPATIBILITY.md` §8 (new variables and protected surfaces); `.env.example`; foundation `README.md`; `CONTRIBUTING.md` local-patch row for `ClientBootstrap.tsx`; lesson `club-routes-need-the-member-bootstrap-profile` updated and promoted to an `AGENTS.md` rule.

## Decisions and reasons

- **V-S04 option 1** — no new dependency beyond the approved `arctic`; the id token never passes through the browser, which is exactly the case OIDC Core §3.1.3.7 covers.
- **Module-level placement** instead of `foundation/identity/**`: Open Mercato discovers entities, migrations, commands, routes, subscribers and widgets only at module level; pure rules go to `foundation/lib/` so the 100 % coverage gate covers them.
- **The link command has no tenant-blind read of its own**: a subject bound to another user is detected by the unique (`provider`, `subject`) index refusing the insert, so the only system-scope read stays the callback's lookup (DD-S03).
- **`GET /api/foundation/identity/providers`** (additive, not in the spec): the login widget must know which buttons to show without a session.
- **The admin list resolves the person's account through `vereino.contactResolver`**, so `foundation` reads no `people` table.
- **`ClientBootstrap.tsx` `login` profile loads the injection registry**: without it the `auth.login:form` spot rendered nothing (found by TEST-S04's first run).
- **Commands are not undoable and their audit entries not replayable** (DD-S06; the input carries the subject and the e-mail).
- **Spec status `In progress`** rather than `Ready for implementation`: the issue asked for `Ready` in the first PR, but this PR also builds phase 1, and `AGENTS.md` lets the first phase PR set `In progress`.

## Files changed

See the PR diff: `packages/app/src/modules/foundation/**` (entity, migration, lib, services, commands, routes, subscriber, widgets, components, i18n, README), `packages/core/src/roles.ts`, `packages/app/src/modules/people/components/{PersonRecord,club/ClubProfilePage}.tsx`, `packages/app/src/components/ClientBootstrap.tsx`, `packages/app/scripts/vereino-ephemeral.mjs` (+ test), `packages/app/.ai/qa/tests/foundation/identity/**`, `packages/app/.ai/qa/tests/_fixtures/identity-probe/probe.mjs`, `packages/app/package.json`, `yarn.lock`, `packages/app/.env.example`, the spec and its changelog file, `BACKWARD_COMPATIBILITY.md`, `CONTRIBUTING.md`, `AGENTS.md`, the lesson, this log.

## Commands and results

- `npx jest src/modules/foundation/lib` → 100 % lines, branches, functions for `identity.ts` and `error-codes.ts`.
- `yarn workspace @vereino/app test:scripts` → 479 pass, 0 fail, `vereino-ephemeral.mjs` 100 %.
- `yarn typecheck`, `npx tsc -p .ai/qa/tests/tsconfig.json` → exit 0.
- First integration runs (failures verbatim):
  - TEST-S01: `Expected: "/club" Received: "/login?identity=invalid"` — the `request` fixture kept the `auth_token` of `signInAs`, so the "guest" round trip carried a session (fingerprint `state_invalid`, reason `session_changed`). Fixed by a fresh request context per call (`cleanHttp`).
  - TEST-S02: `expect(received).toMatchObject(expected)` on `{ items: [], canUnlink: false }` — wrong expectation (a user with a password may remove anything); fixed.
  - TEST-S04: `expect(locator).toBeVisible() failed … element(s) not found` for the Google button — the `login` bootstrap profile loaded no injection registry; fixed in `ClientBootstrap.tsx`.
- Final integration and gate results: see *Verification* below.

## Verification

- After the first-run fixes, a lint pass moved the remaining ORM reads of the routes and the subscriber into `services/identity-links.ts` (`ownLinkCount`, `linkOwner`, `deleteUserLinks`; REQ-F16 import rule), switched `IdentityLinks` to `useQuery`, and updated `packages/core` `roles.test.mjs` for the new member feature.
- `yarn test:integration:vereino --filter TEST-S02` (fresh build), then `--no-build --filter TEST-S01`, `TEST-S04`, `ENG-TEST-16` → each `1 passed`. `TEST-N09` (sign-in page header) → `1 passed` on the previous build.
- `yarn verify` → `all 20 step(s) passed`.
- `yarn guard` → blocking: `arctic` added to `packages/app/package.json` and the lockfile packages `arctic`, `@oslojs/asn1`, `@oslojs/binary`, `@oslojs/crypto`, `@oslojs/encoding`, `@oslojs/jwt` — the dependency the owner approved on #566; the PR explains it and asks the owner for `guard-approved`. Warning: `AGENTS.md` changed (the new bootstrap-profile rule).

## Open problems / next steps

- The state-store-down path (503 `identity_unavailable`) is not driven by an integration test: a running app's cache cannot be stopped from a test.
- Before the pilot: the owner creates the real Google OAuth client (consent screen) and sets `VEREINO_OAUTH_GOOGLE_CLIENT_ID` / `_SECRET` on Railway; existing tenants need `yarn mercato auth sync-role-acls` for the new features; the migration is applied by the owner.
- Phase 2 (Facebook) is a separate story.
