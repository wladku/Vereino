// The end of a social sign-in or link round trip (#566; DD-S07, #700), shared by the provider callback on `APP_URL` and
// the hand-off on a club's address: the 303 to an outcome, the sign-in with the identity's link and the link of the
// signed-in user. Not a route: the discovery reads only `route.ts` files.
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { buildSafeRedirectResponse } from '@open-mercato/core/modules/auth/lib/requestRedirect'
import { NextResponse } from 'next/server'
import type { IdentityCommandResult } from '../../commands/identity'
import {
  IdentityTimeoutError,
  loginOutcomePath,
  outcomeLocation,
  profileOutcomePath,
  type IdentityProvider,
  type ProviderIdentity,
  type StateClub,
  type StateMarker,
} from '../../lib/identity'
import { SECOND_FACTOR_USE_GOOGLE_PATH, providerCountsAsSecondFactor } from '../../lib/second-factor'
import { trustedScopeOf } from '../../services/authorize-scoped'
import { clearStateCookie, findLinkForSignIn, issueSession, reportIdentityFailure } from '../../services/identity'
import { commandContextForRequest } from '../../services/route-context'
import { reportSecondFactor } from '../../services/second-factor/challenge'
import { holdsSecondFactorRequirement } from '../../services/second-factor/requirement'

/** A 303 to `path`, on the club's address when the round trip started there; the state cookie is cleared. */
export function finish(request: Request, path: string, club?: StateClub): NextResponse {
  const response = club
    ? new NextResponse(null, { status: 303, headers: { Location: outcomeLocation(club, path) } })
    : buildSafeRedirectResponse(request, path, 303)
  response.headers.set('Cache-Control', 'no-store')
  clearStateCookie(response)
  return response
}

export function failureReason(error: unknown): string {
  if (error instanceof IdentityTimeoutError) return 'timeout'
  if (error instanceof Error) return error.name
  return 'unknown'
}

/** What the end of a round trip needs: its purpose, landing path and — after a hand-off — the club it started on. */
export type RoundTripEnd = Pick<StateMarker, 'purpose' | 'redirect' | 'club'>

/**
 * Signs in with the identity's link (DD-S03). After a hand-off the link must belong to the club whose address the round
 * trip started on, so no session is ever set on another club's host (`unlinked`, the generic outcome).
 */
export async function signIn(
  request: Request,
  provider: IdentityProvider,
  identity: ProviderIdentity,
  marker: RoundTripEnd,
) {
  const container = await createRequestContainer()
  const found = await findLinkForSignIn(container, provider, identity.subject)
  const link = found && (!marker.club || found.tenantId === marker.club.tenantId) ? found : null
  // Staff second factor (DD-2F06; #736): a user holding the requirement signs in only with Google.
  if (
    link &&
    !providerCountsAsSecondFactor(provider) &&
    (await holdsSecondFactorRequirement(container, link.userId, link))
  ) {
    reportSecondFactor('foundation.second_factor.provider_refused', { provider, userId: link.userId })
    return finish(request, SECOND_FACTOR_USE_GOOGLE_PATH, marker.club)
  }
  const response = link ? await issueSession(container, request, link, marker.redirect, marker.club?.origin) : null
  if (!response) {
    const reason = link ? 'user_unavailable' : found ? 'other_club' : 'no_link'
    reportIdentityFailure('foundation.identity.not_linked', { provider, reason })
    return finish(request, loginOutcomePath('unlinked'), marker.club)
  }
  response.headers.set('Cache-Control', 'no-store')
  clearStateCookie(response)
  return response
}

export async function link(
  request: Request,
  provider: IdentityProvider,
  identity: ProviderIdentity,
  marker: RoundTripEnd,
) {
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
    return finish(request, loginOutcomePath('invalid'), marker.club)
  }
  try {
    await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, IdentityCommandResult>('foundation.identity.link', {
        input: { provider, subject: identity.subject, email: identity.email },
        ctx,
      })
    return finish(request, profileOutcomePath('linked', provider), marker.club)
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'IdentitySubjectConflict') {
      reportIdentityFailure('foundation.identity.subject_conflict', { provider, userId: purpose.userId })
    } else {
      const reason = isCrudHttpError(error) ? String(error.body.code ?? error.status) : failureReason(error)
      reportIdentityFailure('foundation.identity.callback_failed', { provider, stage: 'link', reason })
    }
    return finish(request, profileOutcomePath('failed', provider), marker.club)
  }
}
