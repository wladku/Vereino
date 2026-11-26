// `GET /api/foundation/identity/{provider}/handoff` (social sign-in spec DD-S07; many clubs spec phase 3; #700): the
// second half of a round trip started on a club's address. The provider returned to the one central callback on
// `APP_URL`, which exchanged the code and stored the identity under a one-minute single-use token; this route, on the
// club's address, consumes it and finishes the round trip there, where the host-only session cookie belongs:
// - the request's host must be the club's address the round trip started on (a hand-off opened on any other host is
//   refused, and the token is spent);
// - this browser's state cookie — set by `start` on the club's host — must match the round trip's state, so a token
//   copied into another browser signs nobody in (no login CSRF);
// - `sign_in` sets the session only for a link of that club's tenant; `link` needs the session that started it.
// Every refusal ends in the generic outcome of `/login` (or `/club/profile` for a link), nothing revealed.
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { hostMatchesOrigin, isWellFormedState, loginOutcomePath, markerAccepted } from '../../../../lib/identity'
import {
  consumeHandoffMarker,
  reportIdentityFailure,
  stateCookieOf,
  stateMatchesCookie,
} from '../../../../services/identity'
import { finish, link, signIn } from '../../round-trip'
import { providerParamsSchema } from '../../shared'

export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 20, duration: 60, keyPrefix: 'foundation_identity_handoff' },
  },
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  const params = providerParamsSchema.safeParse(await context.params)
  if (!params.success) return finish(request, loginOutcomePath('invalid'))
  const provider = params.data.provider
  const token = new URL(request.url).searchParams.get('token')
  const marker = isWellFormedState(token) ? await consumeHandoffMarker(await createRequestContainer(), token) : null
  if (!marker || !markerAccepted(marker, provider, Date.now())) {
    reportIdentityFailure('foundation.identity.state_invalid', {
      provider,
      reason: marker ? 'handoff_foreign_or_expired' : 'handoff_missing_or_used',
    })
    return finish(request, loginOutcomePath('invalid'))
  }
  if (!hostMatchesOrigin(request.headers.get('host'), marker.club.origin)) {
    reportIdentityFailure('foundation.identity.state_invalid', { provider, reason: 'handoff_foreign_host' })
    return finish(request, loginOutcomePath('invalid'))
  }
  if (!stateMatchesCookie(marker.state, stateCookieOf(request))) {
    reportIdentityFailure('foundation.identity.state_invalid', { provider, reason: 'handoff_cookie_mismatch' })
    return finish(request, loginOutcomePath('invalid'), marker.club)
  }
  return marker.purpose.kind === 'sign_in'
    ? signIn(request, provider, marker.identity, marker)
    : link(request, provider, marker.identity, marker)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: "Finish a social sign-in or link round trip on a club's address",
  methods: {
    GET: {
      summary: 'Club address hand-off',
      description:
        "The provider callback on `APP_URL` redirects here for a round trip started on a club's address (DD-S07), with a one-minute single-use `token`. The request's host must be that club's address and the browser's state cookie must match the round trip; then a sign-in sets the platform session cookies on this host (only for a link of this club's tenant) and redirects to the landing path, and a link round trip links the signed-in user. Every refusal redirects to `/login?identity=invalid|unlinked` or `/club/profile?identity=failed`, which render one generic sentence. Rate-limited per client IP.",
      responses: [
        {
          status: 303,
          description: 'Redirect to the landing path, `/login` or `/club/profile`',
          mediaType: 'text/html',
        },
      ],
    },
  },
}
