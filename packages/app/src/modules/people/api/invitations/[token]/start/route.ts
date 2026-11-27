// `POST /api/people/invitations/{token}/start` — the guardian's **Set your password** on `/club/i/[token]` (personal
// invitation link spec REQ-IL03, REQ-IL04; Q-IL04, Q-IL05 approved 2026-11-26; #868). Sessionless; the token in the
// path is the only credential, found by the one system-scope lookup of `people_invitation_links.token_hash`
// (`services/invitation-links.ts`) and narrowed at once to its club. A valid link counts the use and answers 200
// `{ url }`, a fresh password-setup link of the platform on the club's address (earlier ones of the user stop
// working); every invalid cause — unknown, expired, replaced, the account already activated, the person gone —
// answers the same 410 `invitation_link_invalid`. Rate-limited per client IP and per token. Never cached.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceSessionlessLimits, errorResponse, tokenLimit } from '@/modules/foundation'
import { startInvitationLink } from '../../../../services/invitation-links'
import { peopleErrors } from '../../../errors'
import { errorSchema } from '../../../shared'

/** Per client IP (S8.6, V-10); disabled under integration tests. */
export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 10, duration: 60, keyPrefix: 'people_invitation_start' } },
}

function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function POST(request: Request, context: { params: Promise<{ token?: string }> }): Promise<Response> {
  try {
    const { token } = await context.params
    const limited = await enforceSessionlessLimits(request, [
      tokenLimit('people_invitation_token_start', token ?? '', 'write'),
    ])
    if (limited) return noStore(limited)
    const container = await createRequestContainer()
    const started = await startInvitationLink(container, token ?? '')
    if (!started) {
      const error = await peopleErrors.create('invitation_link_invalid')
      return noStore(Response.json(error.body, { status: error.status }))
    }
    return noStore(Response.json(started))
  } catch (error: unknown) {
    return noStore(errorResponse(error, 'people.invitations.start'))
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Start the activation from a personal invitation link',
  methods: {
    POST: {
      summary: 'Start the activation from a personal invitation link',
      description:
        "Sessionless. While the link is valid (not expired, not replaced by a newer one, the account still invited), returns the platform's password-setup page for the account on the club's address; the guardian sets the password there. Every invalid cause answers the same 410 `invitation_link_invalid`, and nothing about the person. Rate-limited per client IP and per token (429).",
      responses: [
        {
          status: 200,
          description: 'The password-setup page to open',
          schema: z.object({ url: z.string() }),
        },
      ],
      errors: [
        { status: 410, description: '`invitation_link_invalid` — ask the club for a new link', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
