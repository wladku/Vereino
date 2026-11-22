# Run — issue #566, social sign-in with Google (stopped at V-S04)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #566 (label `cezar`, 2026-11-22): build phase 1 (Google) of `.ai/specs/2026-10-27-vereino-social-sign-in.md`.
- **Spec / issue / branch:** spec above; issue #566 (epic #565); branch `feat/issue-566-social-sign-in-google`.
- **Route:** feature route; the spec exists and the owner approved it on the issue (2026-11-22), together with the `arctic` dependency, on the condition that V-S04 is checked first and that a failure stops the run before the fallback `openid-client` is added.

## Steps

1. Read the issue, the spec and the skill override; checked that nothing is built yet (no `identity` code in `packages/app/src/modules/foundation`, no PR referencing #566).
2. Claimed #566 (assignee, `in-progress`, claim comment).
3. V-S04: downloaded `arctic@3.7.0` (latest; MIT; dependencies `@oslojs/jwt` 0.2.0, `@oslojs/crypto` 1.0.1, `@oslojs/encoding` 1.1.0) with `npm pack` and read `dist/`.

## V-S04 result — fails on one criterion

| Criterion | Result | Evidence |
|---|---|---|
| Google as OIDC with PKCE S256 | pass | `dist/providers/google.js`: `createAuthorizationURLWithPKCE(..., CodeChallengeMethod.S256, ...)` |
| Facebook OAuth 2.0 | pass | `dist/providers/facebook.js` |
| Endpoints configurable for a test fake | pass, through the generic client | the `Google` and `Facebook` classes hard-code their endpoints, but `OAuth2Client` (`dist/client.js`) takes the authorization and token endpoint on every call, so a provider wrapper can point it at the fake |
| Verifies the id token's signature, issuer and audience | **fail** | `dist/oidc.js`: `decodeIdToken` only calls `jwt.decodeJWT`; no signature, issuer, audience or expiry check exists anywhere in the package |

## Decision

Stopped before writing code, as the owner's approval requires. Released the claim with a comment on #566 naming the three ways forward:

1. `arctic` + the OIDC Core 3.1.3.7 rule: the id token comes straight from Google's token endpoint over TLS, so TLS server validation replaces the signature check; the code checks `iss`, `aud`, `exp` and `sub` itself. No further dependency; the spec's V-S04 and "OAuth hygiene" lines are amended. (Recommended.)
2. `arctic` + `jose` as a declared direct dependency (6.2.12 is already in `yarn.lock` through `@modelcontextprotocol/sdk`) to verify the signature against Google's JWKS. Needs a dependency approval.
3. The spec's fallback `openid-client` instead of `arctic`. Needs a dependency approval.

## Files changed

- `.ai/runs/2026-11-22-issue-566-social-sign-in-google.md` (this log).

## Commands and results

- `npm view arctic version license dependencies` → 3.7.0, MIT, three `@oslojs/*` dependencies.
- `npm pack arctic@3.7.0` + reading `dist/oidc.js`, `dist/client.js`, `dist/providers/{google,facebook}.js` → as in the table.
- `grep jose yarn.lock` → `jose@npm:^6.1.3` (6.2.12, from `@modelcontextprotocol/sdk`) and `jose@npm:^4.15.4` (from `jwks-rsa`); neither is a declared dependency of `@vereino/app`.

## Open problems / next steps

- The owner picks one of the three options on #566; the next run re-claims the issue and starts phase 1 step 1 with that choice recorded in the spec's V-S04 row.
