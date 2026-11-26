// `POST /api/foundation/second-factor/verify` (staff second factor spec *API, Command, and Error Contracts*; REQ-2F01,
// REQ-2F05; #736): the code of a challenge. Registered with the platform's MFA-pending gate, so a provisional token
// with a live session reaches it; a full token or none answers 401 `second_factor_challenge_expired`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { verifySecondFactor } from '../../../services/second-factor/complete'

export const metadata = {
  POST: { requireAuth: true, rateLimit: { points: 10, duration: 60, keyPrefix: 'foundation_second_factor_verify' } },
}

export function POST(request: Request): Promise<Response> {
  return verifySecondFactor(request)
}

const errorSchema = z.object({
  error: z.string(),
  code: z.string(),
  attemptsLeft: z.number().int().optional(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Finish a second-factor sign-in',
  methods: {
    POST: {
      summary: 'Check the e-mailed code',
      description:
        'Accepts only the provisional token of a challenged sign-in. The right code ends the provisional session and issues a full one (cookies and `token`); a wrong one counts down `attemptsLeft`, and the fifth ends the challenge and its session. Rate-limited per client IP.',
      requestBody: {
        contentType: 'application/json',
        schema: z.object({ code: z.string().describe('Six digits; spaces are ignored') }),
      },
      responses: [
        {
          status: 200,
          description: 'Signed in',
          schema: z.object({ ok: z.literal(true), token: z.string(), redirect: z.string() }),
        },
      ],
      errors: [
        { status: 400, description: 'second_factor_code_invalid', schema: errorSchema },
        { status: 401, description: 'second_factor_challenge_expired', schema: errorSchema },
        { status: 503, description: 'second_factor_unavailable', schema: errorSchema },
      ],
    },
  },
}
