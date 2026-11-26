// `PUT /api/foundation/profile/email` (S8.5, ENG-Q-12 answered 2026-11-26; #737): the signed-in user changes their own
// login e-mail after confirming the current password (`changeOwnEmail`). The platform's `PUT /api/auth/profile` changed
// the e-mail without it; the command interceptor `foundation.email-change-confirmation` now refuses every own e-mail
// change that does not come through here (403 `email_change_confirmation_required`). After the change the
// `auth_token` cookie is signed again with the new e-mail for the same session, as the platform's profile route does.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { changeOwnEmail } from '../../../services/own-email'
import { errorResponse } from '../../../services/route-context'

// The password check is a guessing target for a stolen session: 10 tries per 15 minutes per client address.
export const metadata = {
  PUT: { requireAuth: true, rateLimit: { points: 10, duration: 900, keyPrefix: 'foundation_email_change' } },
}

const emailChangeSchema = z.object({
  email: z.string().trim().pipe(z.email().max(320)),
  currentPassword: z.string().min(1).max(512),
})

const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 8

export async function PUT(request: Request): Promise<Response> {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth?.sub || auth.isApiKey) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const input = emailChangeSchema.parse(await request.json().catch(() => ({})))
    const result = await changeOwnEmail(request, auth, input)
    if (!result) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const response = NextResponse.json({ ok: true, email: result.email })
    if (result.token) {
      response.cookies.set('auth_token', result.token, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
      })
    }
    return response
  } catch (error: unknown) {
    return errorResponse(error, 'foundation.profile.email')
  }
}

const errorSchema = z.object({ error: z.string(), code: z.string().optional() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Own login e-mail',
  methods: {
    PUT: {
      summary: 'Change the own login e-mail',
      description:
        'Changes the login e-mail of the signed-in user after checking the current password, and signs the session token again.',
      requestBody: { contentType: 'application/json', schema: emailChangeSchema },
      responses: [
        { status: 200, description: 'E-mail changed', schema: z.object({ ok: z.literal(true), email: z.string() }) },
      ],
      errors: [
        { status: 400, description: 'Invalid input or the current password is wrong', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 409, description: 'The e-mail is taken', schema: errorSchema },
        { status: 429, description: 'Too many tries', schema: errorSchema },
      ],
    },
  },
}
