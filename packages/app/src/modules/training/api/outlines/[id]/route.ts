// `GET /api/training/outlines/{id}` — one outline as the member pages read it (training outlines spec M-O5, M-O6,
// M-O7; #683): the content with the planned minutes, its session (date, time, place, coach, activity), its group's and
// author's names, whether it is locked (BR-O3) and the PDF's file name. For callers with `training.outlines.write`
// whose grants cover it (403 `scope_denied` otherwise); 404 for an unknown or removed outline.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { OUTLINE_LANGUAGES, outlinePartsSchema } from '../../../lib/outline'
import { readOutline } from '../../../services/outline-view'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const found = await readOutline(ctx.container, scope, await scopeContract.resolve(ctx), params.data.id)
    if (!found) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(found.view, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'training.outlines.read')
  }
}

const minutesSchema = z.object({
  warm_up: z.number().int(),
  main: z.number().int(),
  cool_down: z.number().int(),
  total: z.number().int(),
})

const viewSchema = z.object({
  id: z.uuid(),
  authorPersonId: z.uuid(),
  authorName: z.string().nullable(),
  sectionId: z.uuid().nullable(),
  groupId: z.uuid().nullable(),
  groupName: z.string().nullable(),
  activityId: z.uuid().nullable(),
  occurrenceId: z.uuid().nullable(),
  sourceOutlineId: z.uuid().nullable(),
  language: z.enum(OUTLINE_LANGUAGES),
  topic: z.string(),
  goal: z.string(),
  specificGoals: z.string(),
  ageCategory: z.string(),
  durationMinutes: z.number().int(),
  playersCount: z.number().int().nullable(),
  equipment: z.string(),
  parts: outlinePartsSchema,
  minutes: minutesSchema,
  session: z
    .object({
      id: z.uuid(),
      activityId: z.uuid(),
      activityName: z.string().nullable(),
      type: z.string(),
      status: z.string(),
      occurrenceDate: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      placeLabel: z.string().nullable(),
      coachName: z.string().nullable(),
    })
    .nullable(),
  locked: z.boolean().describe('Read-only: 72 hours after the session’s end (BR-O3)'),
  fileName: z.string().describe('The PDF’s file name without the extension'),
  clubName: z.string().nullable().describe('The club’s name for the print header'),
  publication: z
    .object({ entryId: z.uuid(), visibility: z.string() })
    .nullable()
    .describe('The library entry the outline is shared as (#685)'),
  origin: z
    .object({ entryId: z.string().nullable(), clubName: z.string(), authorName: z.string().nullable() })
    .nullable()
    .describe('The first author of an outline copied from the library'),
  library: z
    .object({
      enabled: z.boolean(),
      maxVisibility: z.enum(['club', 'clubs', 'public']),
      termsAccepted: z.boolean(),
    })
    .describe('Whether the library is on, the club’s widest level and whether the caller accepted the terms'),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Training outline',
  methods: {
    GET: {
      summary: 'Read one training outline',
      description:
        'The outline with its session, names, planned minutes, lock state and PDF file name, for its author, a coach of its group, a coordinator of its section and the club administrator.',
      responses: [{ status: 200, description: 'The outline', schema: viewSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown outline', schema: errorSchema },
      ],
    },
  },
}
