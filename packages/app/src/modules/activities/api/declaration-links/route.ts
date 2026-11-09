// `POST /api/activities/declaration-links` — the personal link request (club spec REQ-017, AC-017, TEST-017; UX concept
// M-13): an address and the session of the public page it came from. Sessionless and rate-limited per client IP; every
// well-formed request answers the same 202 after the same minimum time, whether the address belongs to the session's
// family, to somebody else or to nobody — the response never reveals an address (no enumeration). Only a malformed body
// answers 400. The work (finding the persons, issuing the links, enqueuing the e-mails) runs after the response is sent
// (`after`, #192), so its duration — longer for a known address — never shows in the response time.
// A namespace import: the OpenAPI generator bundles routes against a `next` stub without `after`, and a named import of
// a missing export fails its whole bundle (a namespace member is only a warning there).
import * as nextServer from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { declarationLinkRequestSchema } from '../../data/validators'
import { requestDeclarationLink, type DeclarationLinkRequest } from '../../services/declaration-links'
import { errorSchema } from '../shared'

const logger = createLogger('activities').child({ component: 'declaration-link-request' })

/** 10 requests per 15 minutes per client IP (S8.6, V-10); disabled under integration tests. */
export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 10, duration: 900, keyPrefix: 'activities_declaration_link' } },
}

/** Every accepted request answers no sooner than this: a steady floor on top of the work running after the response. */
const MIN_RESPONSE_MS = 1000

async function sendRequestedLinks(request: DeclarationLinkRequest): Promise<void> {
  try {
    const container = await createRequestContainer()
    await requestDeclarationLink(container, request)
  } catch (error: unknown) {
    // A failure must not answer differently from "no such address"; it is reported, never shown.
    getTelemetryRuntime()?.reportError(error, {
      module: 'activities',
      code: 'activities.declaration_link.request_failed',
    })
    logger.warn('A declaration link request failed', { err: error })
  }
}

export async function POST(request: Request): Promise<Response> {
  const started = Date.now()
  const body: unknown = await request.json().catch(() => null)
  const parsed = declarationLinkRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data
  nextServer.after(() => sendRequestedLinks(data))
  const wait = MIN_RESPONSE_MS - (Date.now() - started)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  return Response.json({ status: 'accepted' }, { status: 202 })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Request a personal declaration link',
  methods: {
    POST: {
      summary: 'Send a personal link for one session to an address',
      description:
        'Sessionless (REQ-017). The club comes from its public slug, the session from the public page it came from (`occurrencePublicRef` = the session id of the share-text link). When the address belongs to a participant of the session or to an active guardian of one, an e-mail with a personal link to `/club/d/{token}` is sent; otherwise nothing is sent. Always 202 with the same body and no sooner than one second; the links are issued and sent after the response, so neither the answer nor its timing tells whether an address is known. Rate-limited per client IP.',
      requestBody: { contentType: 'application/json', schema: declarationLinkRequestSchema },
      responses: [{ status: 202, description: 'Accepted', schema: z.object({ status: z.literal('accepted') }) }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
