// `GET /api/foundation/identity/providers` (#566): which sign-in providers are enabled, for the `/login` buttons (a
// provider without a client id has no button — the spec's feature flag). Sessionless; answers provider ids and flags
// only, the same for every caller.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { IDENTITY_PROVIDERS } from '../../../lib/identity'
import { providerConfig } from '../../../services/identity-providers'

/** 120 per minute per client (S8.6 public JSON; #738). */
export const metadata = {
  GET: { requireAuth: false, rateLimit: { points: 120, duration: 60, keyPrefix: 'foundation_identity_providers' } },
}

const providersSchema = z.object({
  providers: z.array(z.object({ id: z.enum(IDENTITY_PROVIDERS), enabled: z.boolean() })),
})

export function GET(): Response {
  const providers = IDENTITY_PROVIDERS.map((id) => ({ id, enabled: providerConfig(id) !== null }))
  return Response.json({ providers }, { headers: { 'Cache-Control': 'no-store' } })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Enabled sign-in providers',
  methods: {
    GET: {
      summary: 'List the sign-in providers and whether each is enabled',
      description: 'Sessionless. A provider is enabled when its client id and secret are configured.',
      responses: [{ status: 200, description: 'Providers', schema: providersSchema }],
      errors: [
        { status: 429, description: 'Too many requests from this client', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
