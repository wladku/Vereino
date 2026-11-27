// `POST /api/foundation/second-factor/resend` (staff second factor spec *API, Command, and Error Contracts*; REQ-2F01,
// REQ-2F05; #736): a new code for the challenge, at most three, 60 s apart. Registered with the platform's MFA-pending
// gate like `verify`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resendSecondFactor } from '../../../services/second-factor/complete'

export const metadata = {
  POST: { requireAuth: true, rateLimit: { points: 5, duration: 60, keyPrefix: 'foundation_second_factor_resend' } },
}

export function POST(request: Request): Promise<Response> {
  return resendSecondFactor(request)
}

const errorSchema = z.object({ error: z.string(), code: z.string(), nextResendAt: z.string().optional() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Send a new second-factor code',
  methods: {
    POST: {
      summary: 'Send a new code',
      description:
        'Accepts only the provisional token of a challenged sign-in. Replaces the code; attempts carry over and the challenge keeps its expiry. Rate-limited per client IP.',
      responses: [
        {
          status: 200,
          description: 'Code sent',
          schema: z.object({ ok: z.literal(true), expiresAt: z.string(), nextResendAt: z.string() }),
        },
      ],
      errors: [
        { status: 401, description: 'second_factor_challenge_expired', schema: errorSchema },
        { status: 429, description: 'second_factor_resend_limited', schema: errorSchema },
        { status: 503, description: 'second_factor_unavailable', schema: errorSchema },
      ],
    },
  },
}
