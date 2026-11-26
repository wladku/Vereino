# Run — issue #567, social sign-in with Facebook (phase 2)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #567 (label `cezar`, 2026-11-26): build phase 2 (Facebook) of `.ai/specs/2026-10-27-vereino-social-sign-in.md` on the slice #566 built (PR #610).
- **Spec / issue / branch:** spec above; issue #567 (epic #565); branch `feat/issue-567-facebook-sign-in`.
- **Route:** feature route; the spec exists and the owner approved it, `arctic` and the spec's migrations on #566/#567 (2026-11-22). Phase 2 needs no migration (the `provider` column already allows `facebook`) and no new dependency. Real Facebook app credentials, App Review, the privacy policy URL and the registered deletion callback stay the owner's tasks; the build uses the provider fake, as #566 did.

## Steps

1. Read the issue, the spec, the skill override and the #566 slice (`foundation/lib/identity.ts`, `services/identity*.ts`, the identity routes, the login and profile widgets, the fake and TEST-S01/S02/S04). The UI was already generic over providers (`PROVIDER_NAMES`, `ProviderMark` with a Facebook mark); `identityProviderConfig` returned null for Facebook. DD-S07 (central callback host, #631) is not built and stays out of scope. Claimed #567 (assignee, `in-progress`, claim comment naming this worktree and branch).
2. `lib/identity.ts`: the provider configuration became a table of `oidc` (Google) and `graph` (Facebook) providers read from `VEREINO_OAUTH_<PROVIDER>_*`; Facebook's endpoints pinned to Graph `v21.0`; pure helpers `accessTokenOf`, `graphIdentity`, `isConfirmationCode`, `deletionStatusUrl`, `IdentityProviderError`. The `node:crypto` helpers (`appSecretProof`, `graphMeUrl`, `signedRequestUserId`) went to a new `lib/facebook.ts`, because the profile widget imports `lib/identity.ts` on the client.
3. `services/identity-providers.ts`: `exchangeCode` branches on the protocol; Facebook posts the code with the client credentials in the form body and the PKCE verifier, then reads Graph `/me?fields=id,email` with the bearer token and `appsecret_proof`; the whole exchange keeps the 5 s limit and aborts its fetches.
4. `services/identity.ts` `deleteLinkBySubject` and the route `api/identity/[provider]/deletion/route.ts` (POST, sessionless, 10/min/IP): verifies the `signed_request`, deletes the link of that subject through the D-027 lookup narrowed to the link's scope, emits `foundation.identity.unlinked`, answers `{ url, confirmation_code }`; a bad signature → 400 and the fingerprint `foundation.identity.deletion_bad_signature`; any provider but Facebook → 404. Status page `frontend/identity/deletion/page.tsx` (sessionless, server-rendered, en + pl).
5. Test runner and tests: `oauthFakeEnv` enables a test-only Facebook client on the fake's port; the fake (`google-fake.ts`, its name kept so `yarn guard` sees an edited, not a deleted, test file) serves Facebook under `/facebook/` and signs deletion requests; TEST-S03 added; TEST-S01/S04 expect Facebook enabled; the isolation inventory exempts the deletion route with a reason.
6. Docs: spec changelog file, `BACKWARD_COMPATIBILITY.md` (Facebook variables and registered URLs), `.env.example`, the foundation `README.md`, the D-027 sentence of `AGENTS.md` (the deletion callback uses the same read).

## Decisions and reasons

- **Own token request for Facebook, `OAuth2Client` only for the authorization URL** — `OAuth2Client.validateAuthorizationCode` sends the secret as HTTP Basic, which Facebook does not document; arctic's own `Facebook` class has no PKCE and hard-codes its endpoints (no fake).
- **PKCE on Facebook** — the spec's *OAuth hygiene* asks for PKCE S256 on every provider and Facebook's login dialog accepts `code_challenge`; the real-user exit gate on staging confirms it with the owner's app.
- **`appsecret_proof` on `/me`** — lets the owner turn on "Require App Secret", so a leaked access token alone cannot call Graph for the app.
- **Deletion route under `[provider]`** — a static `facebook/` folder beside `[provider]` would make the route resolver choose between two patterns for `/facebook/start`; one dynamic folder with a provider check keeps the URL the spec names.
- **The deletion callback ignores the last-method rule** — the person asked Facebook to remove the connection; an account left without a method is recovered by the administrator's reset or re-invite (spec *Risks*).
- **No storage for confirmation codes** — the link is deleted before the answer, so every well-formed code means "done"; the page looks nothing up and reveals nothing.
- **Both providers enabled in every test run** — the app's environment is fixed per run, so the "provider disabled" case moved to unit tests (`identityProviderConfig`) and to TEST-S01's unknown-provider 404.

## Files changed

`packages/app/src/modules/foundation/{lib/identity.ts,lib/facebook.ts,lib/__tests__/*,services/identity.ts,services/identity-providers.ts,api/identity/[provider]/callback/route.ts,api/identity/[provider]/deletion/route.ts,frontend/identity/deletion/*,i18n/{en,pl}.json,README.md}`, `packages/app/scripts/vereino-ephemeral.mjs` (+ test), `packages/app/.ai/qa/tests/foundation/identity/**`, `packages/app/.ai/qa/tests/_fixtures/isolation/inventory/foundation.json`, `packages/app/.env.example`, `BACKWARD_COMPATIBILITY.md`, `AGENTS.md`, the spec changelog file, this log.

## Commands and results

- `yarn workspace @vereino/app jest src/modules/foundation/lib/__tests__/{identity,facebook}.test.ts --coverage` — 35 tests passed; `identity.ts` and `facebook.ts` at 100 % lines, branches and functions.
- `yarn generate` — completed; the deletion route and the status page are in the generated registries.
- `yarn typecheck` — passed.

## Open problems

- None in the code. Before real users: the owner creates the Facebook app, sets `VEREINO_OAUTH_FACEBOOK_CLIENT_ID` / `_CLIENT_SECRET`, registers the callback and deletion URLs, turns on "Require App Secret", publishes the privacy policy URL and passes App Review (`email`, `public_profile`); then the phase 2 exit gate with a real Facebook test user.

## Next steps

- DD-S07 (central callback host) is the remaining design of the spec; the spec stays `In progress` until it is built.
