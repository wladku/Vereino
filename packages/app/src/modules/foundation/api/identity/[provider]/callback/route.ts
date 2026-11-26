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
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { buildSafeRedirectResponse } from '@open-mercato/core/modules/auth/lib/requestRedirect'
import type { NextResponse } from 'next/server'
import type { IdentityCommandResult } from '../../../../commands/identity'
import {
  IdentityTimeoutError,
  isWellFormedState,
  loginOutcomePath,
  markerAccepted,
  profileOutcomePath,
  type IdentityProvider,
  type ProviderIdentity,
  type StateMarker,
} from '../../../../lib/identity'
import { trustedScopeOf } from '../../../../services/authorize-scoped'
import {
  clearStateCookie,
  consumeStateMarker,
  findLinkForSignIn,
  issueSession,
  reportIdentityFailure,
  stateCookieOf,
  stateMatchesCookie,
} from '../../../../services/identity'
import { exchangeCode, providerConfig } from '../../../../services/identity-providers'
import { SECOND_FACTOR_USE_GOOGLE_PATH, providerCountsAsSecondFactor } from '../../../../lib/second-factor'
import { reportSecondFactor } from '../../../../second-factor/challenge'
import { holdsSecondFactorRequirement } from '../../../../second-factor/gate'
import { commandContextForRequest } from '../../../../services/route-context'
import { providerParamsSchema } from '../../shared'

export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 20, duration: 60, keyPrefix: 'foundation_identity_callback' },
  },
}

function finish(request: Request, path: string): NextResponse {
  const response = buildSafeRedirectResponse(request, path, 303)
  response.headers.set('Cache-Control', 'no-store')
  clearStateCookie(response)
  return response
}

function failureReason(error: unknown): string {
  if (error instanceof IdentityTimeoutError) return 'timeout'
  if (error instanceof Error) return error.name
  return 'unknown'
}

/** The consumed marker of this browser's round trip, or null (reported as `state_invalid`). */
async function consumedMarker(request: Request, provider: IdentityProvider): Promise<StateMarker | null> {
  const state = new URL(request.url).searchParams.get('state')
  if (!isWellFormedState(state) || !stateMatchesCookie(state, stateCookieOf(request))) {
    reportIdentityFailure('foundation.identity.state_invalid', { provider, reason: 'cookie_mismatch' })
    return null
  }
  const marker = await consumeStateMarker(await createRequestContainer(), state)
  if (!marker || !markerAccepted(marker, provider, Date.now())) {
    reportIdentityFailure('foundation.identity.state_invalid', {
      provider,
      reason: marker ? 'foreign_or_expired' : 'missing_or_used',
    })
    return null
  }
  return marker
}

async function signIn(request: Request, provider: IdentityProvider, identity: ProviderIdentity, marker: StateMarker) {
  const container = await createRequestContainer()
  const link = await findLinkForSignIn(container, provider, identity.subject)
  // Staff second factor (DD-2F06; #736): a user holding the requirement signs in only with Google.
  if (
    link &&
    !providerCountsAsSecondFactor(provider) &&
    (await holdsSecondFactorRequirement(container, link.userId, link))
  ) {
    reportSecondFactor('foundation.second_factor.provider_refused', { provider, userId: link.userId })
    return finish(request, SECOND_FACTOR_USE_GOOGLE_PATH)
  }
  const response = link ? await issueSession(container, request, link, marker.redirect) : null
  if (!response) {
    reportIdentityFailure('foundation.identity.not_linked', { provider, reason: link ? 'user_unavailable' : 'no_link' })
    return finish(request, loginOutcomePath('unlinked'))
  }
  response.headers.set('Cache-Control', 'no-store')
  clearStateCookie(response)
  return response
}

async function link(request: Request, provider: IdentityProvider, identity: ProviderIdentity, marker: StateMarker) {
  const purpose = marker.purpose
  const ctx = await commandContextForRequest(request)
  const scope = ctx ? trustedScopeOf(ctx) : null
  if (
    purpose.kind !== 'link' ||
    !ctx?.auth ||
    !scope ||
    ctx.auth.sub !== purpose.userId ||
    scope.tenantId !== purpose.tenantId ||
    scope.organizationId !== purpose.organizationId
  ) {
    reportIdentityFailure('foundation.identity.state_invalid', { provider, reason: 'session_changed' })
    return finish(request, loginOutcomePath('invalid'))
  }
  try {
    await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, IdentityCommandResult>('foundation.identity.link', {
        input: { provider, subject: identity.subject, email: identity.email },
        ctx,
      })
    return finish(request, profileOutcomePath('linked', provider))
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'IdentitySubjectConflict') {
      reportIdentityFailure('foundation.identity.subject_conflict', { provider, userId: purpose.userId })
    } else {
      const reason = isCrudHttpError(error) ? String(error.body.code ?? error.status) : failureReason(error)
      reportIdentityFailure('foundation.identity.callback_failed', { provider, stage: 'link', reason })
    }
    return finish(request, profileOutcomePath('failed', provider))
  }
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  const params = providerParamsSchema.safeParse(await context.params)
  if (!params.success) return finish(request, loginOutcomePath('invalid'))
  const provider = params.data.provider
  const marker = await consumedMarker(request, provider)
  if (!marker) return finish(request, loginOutcomePath('invalid'))
  const failed = marker.purpose.kind === 'link' ? profileOutcomePath('failed', provider) : loginOutcomePath('failed')

  const config = providerConfig(provider)
  const code = new URL(request.url).searchParams.get('code')
  if (!config || !code) {
    reportIdentityFailure('foundation.identity.callback_failed', {
      provider,
      stage: 'authorize',
      reason: config ? 'no_code' : 'disabled',
    })
    return finish(request, failed)
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
    return finish(request, failed)
  }
  if (!identity) {
    reportIdentityFailure('foundation.identity.callback_failed', { provider, stage: 'token', reason: 'claims' })
    return finish(request, failed)
  }
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
        'Consumes the single-use state (it must match the HttpOnly cookie), exchanges the code with the PKCE verifier and checks the id token. A sign-in with a linked identity sets the platform session cookies and redirects to the landing path; every other sign-in outcome redirects to `/login?identity=unlinked|invalid|failed`, which all render one sentence. A link round trip redirects to `/club/profile?identity=linked|failed`. Never creates an account. Rate-limited per client IP.',
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
