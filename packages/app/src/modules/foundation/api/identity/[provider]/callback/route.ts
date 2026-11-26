// `GET /api/foundation/identity/{provider}/callback` (social sign-in spec API table, *Architecture and Data Flow*;
// REQ-S01, REQ-S02, REQ-S04; #566). The provider returns here with `code` and `state`. The state must match this
// browser's cookie and its marker is consumed once (missing, used, expired or foreign → `/login?identity=invalid`).
// The code is exchanged with the PKCE verifier (5 s limit) and the id token's claims are checked (V-S04 option 1); a
// provider error, a timeout or a failed claim → `identity=failed`. Then:
// - `sign_in`: the one system-scope lookup of (`provider`, `subject`) (DD-S03, D-027); found → the platform session
//   cookies and a redirect to the marker's landing path; not found (or the user is gone or blocked) →
//   `/login?identity=unlinked`. The three `/login` outcomes render one sentence (no enumeration). A user holding
//   `foundation.second_factor.required` with a provider other than Google → `/login?second_factor=use_google`, no
//   session (staff second factor DD-2F06, #736).
// - `link`: the session must still be the user who started the round trip (else `/login?identity=invalid`); the
//   command `foundation.identity.link` inserts the link → `/club/profile?identity=linked`; any failure, including a
//   subject bound to another user, → `/club/profile?identity=failed` with a fingerprint and nothing revealed.
// No account is ever created and no e-mail is ever matched (DD-S02).
// A round trip started on a club's address (DD-S07, #700) comes back here too — the one redirect URI of every provider —
// but its state cookie lives on the club's host: the marker's recorded club stands in for the cookie check, the code is
// exchanged here, and the identity goes to the club's address through a one-minute single-use hand-off
// (`../handoff/route.ts`), which checks that host's cookie and sets the session there. Its failures land on the club's
// address too.
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { NextResponse } from 'next/server'
import {
  callbackBrowserAccepted,
  handoffPath,
  isWellFormedState,
  loginOutcomePath,
  markerAccepted,
  profileOutcomePath,
  type IdentityProvider,
  type ProviderIdentity,
  type StateClub,
  type StateMarker,
} from '../../../../lib/identity'
import {
  consumeStateMarker,
  reportIdentityFailure,
  stateCookieOf,
  stateMatchesCookie,
  storeHandoffMarker,
} from '../../../../services/identity'
import { exchangeCode, providerConfig } from '../../../../services/identity-providers'
import { failureReason, finish, link, signIn } from '../../round-trip'
import { providerParamsSchema } from '../../shared'

export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 20, duration: 60, keyPrefix: 'foundation_identity_callback' },
  },
}

/**
 * The consumed marker of this browser's round trip, with its state, or null (reported as `state_invalid`). Without a
 * matching cookie only a round trip started on a club's address passes; its browser check is the hand-off's.
 */
async function consumedMarker(
  request: Request,
  provider: IdentityProvider,
): Promise<{ marker: StateMarker; state: string } | null> {
  const state = new URL(request.url).searchParams.get('state')
  if (!isWellFormedState(state)) {
    reportIdentityFailure('foundation.identity.state_invalid', { provider, reason: 'cookie_mismatch' })
    return null
  }
  const cookieMatches = stateMatchesCookie(state, stateCookieOf(request))
  const marker = await consumeStateMarker(await createRequestContainer(), state)
  if (!marker || !markerAccepted(marker, provider, Date.now())) {
    reportIdentityFailure('foundation.identity.state_invalid', {
      provider,
      reason: marker ? 'foreign_or_expired' : cookieMatches ? 'missing_or_used' : 'cookie_mismatch',
    })
    return null
  }
  if (!callbackBrowserAccepted(cookieMatches, marker)) {
    reportIdentityFailure('foundation.identity.state_invalid', { provider, reason: 'cookie_mismatch' })
    return null
  }
  return { marker, state }
}

/** Hands a round trip started on a club's address back to it (DD-S07); a store failure ends there as `failed`. */
async function handOff(
  request: Request,
  provider: IdentityProvider,
  identity: ProviderIdentity,
  marker: StateMarker & { club: StateClub },
  state: string,
  failed: string,
): Promise<NextResponse> {
  const token = await storeHandoffMarker(await createRequestContainer(), {
    provider,
    purpose: marker.purpose,
    redirect: marker.redirect,
    club: marker.club,
    state,
    identity,
  })
  if (!token) return finish(request, failed, marker.club)
  return finish(request, handoffPath(provider, token), marker.club)
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  const params = providerParamsSchema.safeParse(await context.params)
  if (!params.success) return finish(request, loginOutcomePath('invalid'))
  const provider = params.data.provider
  const consumed = await consumedMarker(request, provider)
  if (!consumed) return finish(request, loginOutcomePath('invalid'))
  const { marker, state } = consumed
  const club = marker.club
  const failed = marker.purpose.kind === 'link' ? profileOutcomePath('failed', provider) : loginOutcomePath('failed')

  const config = providerConfig(provider)
  const code = new URL(request.url).searchParams.get('code')
  if (!config || !code) {
    reportIdentityFailure('foundation.identity.callback_failed', {
      provider,
      stage: 'authorize',
      reason: config ? 'no_code' : 'disabled',
    })
    return finish(request, failed, club)
  }
  let identity: ProviderIdentity | null
  try {
    identity = await exchangeCode(config, code, marker.verifier)
  } catch (error: unknown) {
    reportIdentityFailure('foundation.identity.callback_failed', {
      provider,
      stage: 'token',
      reason: failureReason(error),
    })
    return finish(request, failed, club)
  }
  if (!identity) {
    reportIdentityFailure('foundation.identity.callback_failed', { provider, stage: 'token', reason: 'claims' })
    return finish(request, failed, club)
  }
  if (club) return handOff(request, provider, identity, { ...marker, club }, state, failed)
  return marker.purpose.kind === 'sign_in'
    ? signIn(request, provider, identity, marker)
    : link(request, provider, identity, marker)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Finish a social sign-in or link round trip',
  methods: {
    GET: {
      summary: 'Provider callback',
      description:
        "Consumes the single-use state (it must match the HttpOnly cookie), exchanges the code with the PKCE verifier and checks the id token. A sign-in with a linked identity sets the platform session cookies and redirects to the landing path; every other sign-in outcome redirects to `/login?identity=unlinked|invalid|failed`, which all render one sentence. A link round trip redirects to `/club/profile?identity=linked|failed`. A round trip started on a club's address (DD-S07) redirects to that address's `handoff` route with a one-minute single-use token, and its failures land on that address. Never creates an account. Rate-limited per client IP.",
      responses: [
        {
          status: 303,
          description: 'Redirect to the landing path, `/login`, `/club/profile` or the club address hand-off',
          mediaType: 'text/html',
        },
      ],
    },
  },
}
