// `POST /api/foundation/identity/facebook/deletion` (social sign-in spec API table; REQ-S03, AC-S03; #567): Facebook's
// data-deletion callback. Facebook posts a `signed_request` (form field) when a person removes the Vereino app from
// their Facebook settings; its signature is HMAC-SHA256 with the app secret. A valid request deletes the link of that
// app-scoped user id — found by the same (`provider`, `subject`) lookup as the sign-in (DD-S03, the D-027 entry of the
// DD-35 list) and narrowed at once to the link's tenant and organization — and answers the status URL and a
// confirmation code, as Facebook requires. Idempotent: an unknown or already deleted subject gets a code too, so the
// answer reveals nothing. A bad signature answers 400 without detail and leaves every link in place. Only Facebook has
// this callback: another provider answers 404 `identity_provider_disabled`, as does Facebook while it is disabled.
import { randomBytes } from 'node:crypto'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { foundationErrors } from '../../../errors'
import { signedRequestUserId } from '../../../../lib/facebook'
import { deletionStatusUrl } from '../../../../lib/identity'
import { deleteLinkBySubject, reportIdentityFailure } from '../../../../services/identity'
import { providerConfig } from '../../../../services/identity-providers'
import { errorResponse } from '../../../../services/route-context'
import { NO_STORE, identityErrorSchema, providerParamsSchema } from '../../shared'

export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: { points: 10, duration: 60, keyPrefix: 'foundation_identity_deletion' },
  },
}

/** The `signed_request` of a form-encoded body (Facebook's shape), or null. */
async function signedRequestOf(request: Request): Promise<string | null> {
  try {
    const value = new URLSearchParams(await request.text()).get('signed_request')
    return value && value.length <= 8192 ? value : null
  } catch {
    return null
  }
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  try {
    const params = providerParamsSchema.safeParse(await context.params)
    const config = params.success && params.data.provider === 'facebook' ? providerConfig('facebook') : null
    if (!config) throw await foundationErrors.create('identity_provider_disabled')
    const subject = signedRequestUserId(await signedRequestOf(request), config.clientSecret)
    if (!subject) {
      reportIdentityFailure('foundation.identity.deletion_bad_signature', { provider: config.id })
      return Response.json({ error: 'Bad request' }, { status: 400, headers: NO_STORE })
    }
    await deleteLinkBySubject(await createRequestContainer(), config.id, subject)
    const code = randomBytes(8).toString('hex')
    return Response.json(
      { url: deletionStatusUrl(config.redirectUri, code), confirmation_code: code },
      { headers: NO_STORE },
    )
  } catch (error: unknown) {
    const response = errorResponse(error, 'foundation.identity.deletion')
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

const deletionResponseSchema = z.object({
  url: z.string().describe('Public page where the person checks the request by its confirmation code'),
  confirmation_code: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: "Facebook's data-deletion callback",
  methods: {
    POST: {
      summary: 'Delete the Facebook link of a signed request',
      description:
        "Sessionless; called by Facebook with a form-encoded `signed_request` (HMAC-SHA256 with the app secret). Deletes the link of the request's app-scoped user id and answers the status URL and a confirmation code; an unknown user id gets a code too. Only `facebook` has this callback. Rate-limited per client IP.",
      requestBody: {
        contentType: 'application/x-www-form-urlencoded',
        schema: z.object({ signed_request: z.string() }),
      },
      responses: [{ status: 200, description: 'Deletion confirmed', schema: deletionResponseSchema }],
      errors: [
        { status: 400, description: 'Missing or badly signed `signed_request`', schema: identityErrorSchema },
        { status: 404, description: '`identity_provider_disabled`', schema: identityErrorSchema },
        { status: 429, description: 'Too many requests', schema: identityErrorSchema },
      ],
    },
  },
}
