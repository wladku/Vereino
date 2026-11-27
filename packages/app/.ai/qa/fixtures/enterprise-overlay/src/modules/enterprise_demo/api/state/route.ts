// `GET|POST /api/enterprise_demo/state` (enterprise package spec *API, Command, and Error Contracts*, ENT-TEST-03): the
// licence state of the demo feature for the caller's tenant. `GET` is the read (404 `enterprise_feature_disabled` when
// `off`, like an unknown route); `POST` is the demo write (also 409 `enterprise_feature_read_only` when `read_only`).
// The ACL decides who (`enterprise_demo.view`), the licence decides whether (DD-E08); the tenant comes only from the
// session, never from the payload.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, enterpriseFeatures, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { ENTERPRISE_DEMO_FEATURE } from '../../index'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['enterprise_demo.view'] },
  POST: { requireAuth: true, requireFeatures: ['enterprise_demo.view'] },
}

const NO_STORE = { 'cache-control': 'private, no-store' }

async function tenantScope(request: Request): Promise<{ tenantId: string } | null> {
  const ctx = await commandContextForRequest(request)
  const scope = ctx ? trustedScopeOf(ctx) : null
  return scope ? { tenantId: scope.tenantId } : null
}

export async function GET(request: Request): Promise<Response> {
  try {
    const scope = await tenantScope(request)
    if (!scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await enterpriseFeatures.assertAvailable(scope, ENTERPRISE_DEMO_FEATURE)
    const status = enterpriseFeatures.statusOf(scope, ENTERPRISE_DEMO_FEATURE)
    return Response.json({ state: status.state, renewalNotice: status.renewalNotice }, { headers: NO_STORE })
  } catch (error: unknown) {
    return errorResponse(error, 'enterprise_demo.state.read')
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const scope = await tenantScope(request)
    if (!scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await enterpriseFeatures.assertWritable(scope, ENTERPRISE_DEMO_FEATURE)
    return Response.json({ ok: true, state: 'on' }, { headers: NO_STORE })
  } catch (error: unknown) {
    return errorResponse(error, 'enterprise_demo.state.write')
  }
}

const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()
const stateSchema = z.object({
  state: z.enum(['on', 'read_only']).describe('`off` is never answered: the route is then 404'),
  renewalNotice: z.boolean().describe('True from `expiresAt` until the end of the grace period'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Enterprise demo',
  summary: 'Licence state of the Enterprise demo feature',
  methods: {
    GET: {
      summary: "Read the demo feature's licence state for the current club",
      responses: [{ status: 200, description: 'The state', schema: stateSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Without `enterprise_demo.view`', schema: errorSchema },
        { status: 404, description: '`enterprise_feature_disabled`: no licence key names this club', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'The demo write: refused unless the feature is on',
      responses: [
        { status: 200, description: 'Written', schema: z.object({ ok: z.literal(true), state: z.literal('on') }) },
      ],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Without `enterprise_demo.view`', schema: errorSchema },
        { status: 404, description: '`enterprise_feature_disabled`', schema: errorSchema },
        { status: 409, description: '`enterprise_feature_read_only`: the licence expired', schema: errorSchema },
      ],
    },
  },
}
