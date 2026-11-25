// `GET /api/foundation/identity/{provider}/start` (social sign-in spec API table; REQ-S01, REQ-S02, REQ-S04; #566):
// starts an authorization round trip. Without a session the purpose is `sign_in`; a session that holds
// `foundation.identity.self` links the signed-in user (DD-S02); a session without it is refused (403). A random
// state, the PKCE verifier (S256), the purpose and the sanitized landing path go into a ten-minute single-use marker in
// the platform cache; the state also goes into an `HttpOnly` cookie, so only this browser can finish the round trip
// (DD-S04). An unreachable state store answers 503 `identity_unavailable` (fail closed). On a club's address
// (`<slug>.<VEREINO_CLUB_DOMAIN>`) the marker also records that address and the club's tenant, read through the approved
// public slug lookup of `clubCorePublicSite` (D-024); the provider still returns to `APP_URL`, whose callback hands the
// round trip back to the club's address (DD-S07, #700). A label that names no club records nothing.
import type { AwilixContainer } from 'awilix'
import { NextResponse } from 'next/server'
import { clubOrigin } from '@vereino/core'
import { resolveTrustedRedirectBase } from '@open-mercato/core/modules/auth/lib/requestRedirect'
import { sanitizeRedirectPath } from '@open-mercato/core/modules/auth/lib/safeRedirect'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { foundationErrors } from '../../../errors'
import { PROFILE_PATH, clubLabelOfHost, type StateClub, type StatePurpose } from '../../../../lib/identity'
import { trustedScopeOf } from '../../../../services/authorize-scoped'
import { newState, setStateCookie, storeStateMarker } from '../../../../services/identity'
import { authorizationRequest, providerConfig } from '../../../../services/identity-providers'
import { commandContextForRequest, errorResponse } from '../../../../services/route-context'
import { NO_STORE, identityErrorSchema, providerParamsSchema, sessionHasFeatures } from '../../shared'

export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 20, duration: 60, keyPrefix: 'foundation_identity_start' },
  },
}

const SIGN_IN_LANDING = '/club'

/** The club host lookup `club_core` registers (optional DI: foundation never imports another module). */
type ClubForHost = {
  clubForHost(clubSlug: string): Promise<{ tenantId: string; organizationId: string } | null>
}

/** The club whose address the request came to (DD-S07), or undefined on any other host or for a label of no club. */
async function startClub(request: Request, container: AwilixContainer): Promise<StateClub | undefined> {
  const label = clubLabelOfHost(request.headers.get('host'), process.env)
  if (!label || !container.hasRegistration('clubCorePublicSite')) return undefined
  const club = await container.resolve<ClubForHost>('clubCorePublicSite').clubForHost(label)
  const origin = club ? clubOrigin(label, process.env) : null
  return club && origin ? { origin, tenantId: club.tenantId } : undefined
}

async function purposeOf(
  request: Request,
  club: StateClub | undefined,
): Promise<{ purpose: StatePurpose; redirect: string } | 'forbidden'> {
  const url = new URL(request.url)
  if (!(await getAuthFromRequest(request))) {
    const base = club?.origin ?? resolveTrustedRedirectBase(request) ?? url.origin
    return {
      purpose: { kind: 'sign_in' },
      redirect: sanitizeRedirectPath(url.searchParams.get('redirect'), base, SIGN_IN_LANDING),
    }
  }
  const ctx = await commandContextForRequest(request)
  const scope = ctx ? trustedScopeOf(ctx) : null
  if (!ctx?.auth || !scope || !(await sessionHasFeatures(ctx, ['foundation.identity.self']))) return 'forbidden'
  return { purpose: { kind: 'link', userId: ctx.auth.sub, ...scope }, redirect: PROFILE_PATH }
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  try {
    const params = providerParamsSchema.safeParse(await context.params)
    const config = params.success ? providerConfig(params.data.provider) : null
    if (!params.success || !config) throw await foundationErrors.create('identity_provider_disabled')
    const container = await createRequestContainer()
    const club = await startClub(request, container)
    const intent = await purposeOf(request, club)
    if (intent === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
    const state = newState()
    const { url, verifier } = authorizationRequest(config, state)
    await storeStateMarker(container, state, { provider: config.id, verifier, ...intent, ...(club ? { club } : {}) })
    const response = NextResponse.redirect(url, 302)
    response.headers.set('Cache-Control', 'no-store')
    setStateCookie(response, state)
    return response
  } catch (error: unknown) {
    const response = errorResponse(error, 'foundation.identity.start')
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Start a social sign-in or link round trip',
  methods: {
    GET: {
      summary: 'Redirect to the provider',
      description:
        "Sessionless sign-in, or — with a session holding `foundation.identity.self` — linking the signed-in user. Redirects to the provider with PKCE (S256) and a single-use state bound to an HttpOnly cookie. `redirect` is a same-origin path to land on after a sign-in (default `/club`). On a club's address the round trip returns there through the central callback's hand-off (DD-S07). Rate-limited per client IP.",
      responses: [{ status: 302, description: 'Redirect to the provider', mediaType: 'text/html' }],
      errors: [
        { status: 403, description: 'Signed in without `foundation.identity.self`', schema: identityErrorSchema },
        { status: 404, description: '`identity_provider_disabled`', schema: identityErrorSchema },
        { status: 429, description: 'Too many requests', schema: identityErrorSchema },
        {
          status: 503,
          description: '`identity_unavailable` (the state store is unreachable)',
          schema: identityErrorSchema,
        },
      ],
    },
  },
}
